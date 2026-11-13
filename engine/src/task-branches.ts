/**
 * Task branches and save points (Sandy, 2026-11-13: "I get to a point and I don't know if it's right to move forward
 * yet … but I also don't want to stop"; "essentially we're talking about allowing for task branches").
 *
 * A task owns a fixed set of worktrees: its own conversation's (and that worktree's companions in the app's other
 * repositories) and its prototype's. Only one version of a task is worked on at a time, so a version is not more
 * worktrees: it is a git branch in each of them, with a shared suffix, and a copy of the task itself.
 *
 * - A **save point** is a name. Saving commits what is uncommitted in each worktree, puts a git branch
 *   `<its branch>--<name>` at that commit, and keeps a copy of the task: its brief, acceptance criteria and their
 *   marks, approvals, steps, comments, sub-tasks and its prototype's guide. Work carries on where it was.
 * - A **task branch** is a version of the task. Going back to a save point starts a new one there: each worktree
 *   switches to a new git branch cut from the save point, the task is put back as it was saved, and the task branch
 *   that was current is set aside whole (its git branches as they are, its copy of the task with it). Nothing is
 *   reset, renamed or moved, so a git branch that was pushed never disagrees with its remote copy.
 * - Any task branch can be made current again, and any save point or set-aside task branch deleted.
 *
 * The prototype's database is one per prototype, not per task branch: it is left as it is on a move unless asked.
 * After git's own branches (a name on a commit, cheap to make and to delete) and a game's save points.
 */
import { existsSync } from 'node:fs'
import { and, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, build, issue, issueComment, pr, prototype, savePoint, session, stepWork, taskBranch } from './db/schema.js'
import { appendEvent } from './events.js'
import { git, hasUncommitted, headSha } from './git.js'
import { newId } from './ids.js'
import { getIssue, PlanError, setState } from './issues.js'
import { prototypeStatus, resetPrototypeData, runPrototype } from './prototype.js'
import { homeRepo, matesOf } from './workbench.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Branch = typeof taskBranch.$inferSelect
type Save = typeof savePoint.$inferSelect
interface BranchRef { key: string; path: string; branch: string; from?: string }
interface SaveRef { key: string; path: string; branch: string; sha: string }
/** One worktree of the task: where it is, the git branch it is on, and how the engine's own record of that is changed. */
interface Tree { key: string; label: string; path: string; branch: string; prototypeId?: string; record: (tx: Tx, branch: string) => Promise<unknown> }

export const AUTO = { prototype_approved: 'Prototype approved', brief_approved: 'Brief approved' } as const
export type AutoKind = keyof typeof AUTO
const BUILDING = ['running', 'awaiting_answer', 'merging', 'testing']
const line = (s: unknown, n = 80) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
export const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'save'

async function topLevel(issueId: string) {
  const i = await getIssue(db, issueId)
  if (i.parentId) throw new PlanError('save points belong to the task, not to one of its sub-tasks')
  return i
}

/** The task's worktrees that are there: its prototype's, its own conversation's, and that one's companions. */
async function treesOf(i: { id: string; appId: string }): Promise<Tree[]> {
  const out: Omit<Tree, 'branch'>[] = []
  for (const p of await db.select().from(prototype).where(and(eq(prototype.issueId, i.id), ne(prototype.status, 'discarded')))) {
    out.push({ key: `prototype:${p.id}`, label: `the prototype "${p.title}"`, path: p.path, prototypeId: p.id, record: async (tx, branch) => { await tx.update(prototype).set({ branch, updatedAt: new Date() }).where(eq(prototype.id, p.id)); if (p.sessionId) await tx.update(session).set({ branch }).where(eq(session.id, p.sessionId)) } }) // its builder's conversation is told the branch it is on
  }
  const talks = await db.select().from(session).where(and(eq(session.appId, i.appId), isNotNull(session.worktreePath), sql`${session.subjectRef}->>'issueId' = ${i.id}`, sql`${session.subjectRef}->>'app' is null`))
  for (const s of talks) {
    out.push({ key: `talk:${s.id}`, label: 'the task\'s own worktree', path: s.worktreePath!, record: (tx, branch) => tx.update(session).set({ branch }).where(eq(session.id, s.id)) })
    for (const m of await matesOf(s.appId, s.worktreePath)) out.push({ key: `mate:${s.id}:${m.repoId}`, label: `the task's worktree in ${m.name}`, path: m.path, record: async () => {} }) // it follows the conversation's branch name
  }
  const trees: Tree[] = []
  for (const t of out) {
    if (!existsSync(t.path)) continue
    const b = await git(t.path, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true })
    if (b.code === 0 && b.stdout && b.stdout !== 'HEAD') trees.push({ ...t, branch: b.stdout }) // on no branch (mid-rebase, detached): left alone
  }
  return trees
}

async function rowsOf(issueId: string) {
  const branches = await db.select().from(taskBranch).where(eq(taskBranch.issueId, issueId)).orderBy(taskBranch.createdAt)
  const saves = await db.select().from(savePoint).where(eq(savePoint.issueId, issueId)).orderBy(savePoint.createdAt)
  return { branches, saves }
}

/** The task branch being worked on. A task has one from its first save point: called Main, its git branches as they are. */
async function ensureCurrent(i: { id: string; appId: string }, by: string): Promise<Branch> {
  const [cur] = await db.select().from(taskBranch).where(and(eq(taskBranch.issueId, i.id), eq(taskBranch.current, true)))
  if (cur) return cur
  const [row] = await db.insert(taskBranch).values({ id: newId('taskBranch'), appId: i.appId, issueId: i.id, name: 'Main', slug: '', current: true, createdBy: by }).returning()
  return row
}

/** A git branch's name without the suffix a save point or task branch of this task gave it. */
const plain = (branch: string, slugs: string[]) => {
  let b = branch
  for (let again = true; again;) { again = false; for (const s of slugs) if (s && b.endsWith(`--${s}`)) { b = b.slice(0, -s.length - 2); again = true } }
  return b
}
const unique = (want: string, taken: string[]) => { if (!taken.includes(want)) return want; for (let n = 2; ; n++) if (!taken.includes(`${want}-${n}`)) return `${want}-${n}` }

/** Commit everything in a worktree, as whoever git is set up as there (else as Self Evident). Hooks are not run: this is a save, not a change to review. */
async function commitTree(path: string, message: string) {
  if (!(await hasUncommitted(path))) return
  await git(path, ['add', '-A'])
  const who = (await git(path, ['config', 'user.email'], { allowFail: true })).stdout ? [] : ['-c', 'user.name=Self Evident', '-c', 'user.email=self-evident@localhost']
  await git(path, [...who, 'commit', '-q', '--no-verify', '-m', message])
}

const iso = (v: unknown) => (v ? new Date(v as string) : null)
interface TaskState {
  issue: { title: string; description: string | null; brief: string | null; briefApprovedBy: string | null; briefApprovedAt: string | null; acceptance: unknown }
  steps: (typeof stepWork.$inferSelect)[]
  comments: (typeof issueComment.$inferSelect)[]
  subs: { id: string; state: string; title: string; description: string | null; brief: string | null; build: string | null }[]
  prototypes: { id: string; guide: unknown; shown: unknown }[]
  work?: { commits: number }
}

/** The task as it is: what a move to another task branch could change. */
async function snapshot(tx: Tx | typeof db, issueId: string): Promise<TaskState> {
  const i = await getIssue(tx, issueId)
  const subs = await tx.select().from(issue).where(eq(issue.parentId, issueId))
  const builds = subs.length ? await tx.select().from(build).where(inArray(build.issueId, subs.map((s) => s.id))) : []
  const protos = await tx.select().from(prototype).where(eq(prototype.issueId, issueId))
  return JSON.parse(JSON.stringify({
    issue: { title: i.title, description: i.description, brief: i.brief, briefApprovedBy: i.briefApprovedBy, briefApprovedAt: i.briefApprovedAt, acceptance: i.acceptance },
    steps: await tx.select().from(stepWork).where(eq(stepWork.issueId, issueId)),
    comments: await tx.select().from(issueComment).where(eq(issueComment.issueId, issueId)),
    subs: subs.map((s) => ({ id: s.id, state: s.state, title: s.title, description: s.description, brief: s.brief, build: builds.find((b) => b.issueId === s.id)?.status ?? null })),
    prototypes: protos.map((p) => ({ id: p.id, guide: p.guide, shown: p.shown })),
  }))
}

/** Put the task back as a copy has it. Sub-tasks made since are canceled, never deleted, so the way back to them stays. */
async function restore(tx: Tx, issueId: string, s: TaskState, actor: string) {
  await tx.update(issue).set({ title: s.issue.title, description: s.issue.description, brief: s.issue.brief, briefApprovedBy: s.issue.briefApprovedBy, briefApprovedAt: iso(s.issue.briefApprovedAt), acceptance: s.issue.acceptance, updatedAt: new Date() }).where(eq(issue.id, issueId))
  await tx.delete(stepWork).where(eq(stepWork.issueId, issueId))
  if (s.steps.length) await tx.insert(stepWork).values(s.steps.map((w) => ({ ...w, createdAt: iso(w.createdAt)!, updatedAt: iso(w.updatedAt), approvedAt: iso(w.approvedAt) })))
  await tx.delete(issueComment).where(eq(issueComment.issueId, issueId))
  if (s.comments.length) await tx.insert(issueComment).values(s.comments.map((c) => ({ ...c, createdAt: iso(c.createdAt)!, updatedAt: iso(c.updatedAt)! })))
  const now = await tx.select().from(issue).where(eq(issue.parentId, issueId))
  for (const sub of now) {
    const was = s.subs.find((x) => x.id === sub.id)
    if (!was) { // made since: not part of this task branch
      if (!['done', 'canceled', 'duplicate'].includes(sub.state)) {
        await setState(tx, sub, 'canceled', { actor, reason: 'not on this task branch' })
        await tx.update(build).set({ status: 'cancelled', heldReason: 'not on this task branch', updatedAt: new Date() }).where(and(eq(build.issueId, sub.id), ne(build.status, 'done')))
      }
      continue
    }
    await tx.update(issue).set({ title: was.title, description: was.description, brief: was.brief, updatedAt: new Date() }).where(eq(issue.id, sub.id))
    if (was.state !== sub.state) await setState(tx, sub, was.state as never, { actor, reason: sub.reason })
    if (was.build) await tx.update(build).set({ status: BUILDING.includes(was.build) ? 'queued' : was.build, heldReason: null, updatedAt: new Date() }).where(and(eq(build.issueId, sub.id), eq(build.status, 'cancelled')))
  }
  for (const p of s.prototypes) await tx.update(prototype).set({ guide: p.guide, shown: p.shown ?? [] }).where(and(eq(prototype.id, p.id), eq(prototype.issueId, issueId)))
}

async function emit(tx: Tx | typeof db, i: { id: string; appId: string; projectId: string | null; title: string }, actor: string, type: string, payload: Record<string, unknown>) {
  const [a] = await tx.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, i.appId))
  const write = (t: Tx) => appendEvent(t, { workspaceId: a?.workspaceId ?? 'ws_none', appId: i.appId, projectId: i.projectId, issueId: i.id, actor, type, payload: { title: i.title, ...payload } })
  if (tx === db) await db.transaction(write); else await write(tx as Tx)
}

const count = async (path: string, range: string) => { const r = await git(path, ['rev-list', '--count', range], { allowFail: true }); return r.code === 0 ? Number(r.stdout) || 0 : 0 }
/** Delete git branches the task made, wherever their worktree still is (else in the app's own checkout). Never the one checked out. */
async function dropGit(appId: string, refs: { path: string; branch: string }[]) {
  const home = (await homeRepo(appId))?.localPath
  for (const r of refs) { const cwd = existsSync(r.path) ? r.path : home; if (cwd) await git(cwd, ['branch', '-D', r.branch], { allowFail: true }) }
}

/** What the task page shows: the task branches (which is current, what was done on the others) and the save points. */
export async function taskBranches(issueId: string) {
  const i = await topLevel(issueId)
  const { branches, saves } = await rowsOf(issueId)
  const trees = await treesOf(i)
  const cur = branches.find((b) => b.current) ?? null
  const comments = new Set((await db.select({ id: issueComment.id }).from(issueComment).where(eq(issueComment.issueId, issueId))).map((c) => c.id))
  return {
    issueId,
    worktrees: trees.map((t) => ({ key: t.key, label: t.label, branch: t.branch })),
    branches: branches.map((b) => {
      const st = b.state as TaskState | null
      return { id: b.id, name: b.name, current: b.current, fromSave: b.fromSave, createdAt: b.createdAt, gitBranches: (b.current ? trees.map((t) => t.branch) : (b.refs as BranchRef[]).map((r) => r.branch)),
        work: b.current || !st ? null : { commits: st.work?.commits ?? 0, comments: st.comments.filter((c) => !comments.has(c.id)).length } }
    }),
    saves: await Promise.all(saves.map(async (s) => {
      const onCurrent = s.branchId === cur?.id
      let since: number | null = null
      if (onCurrent) { since = 0; for (const r of s.refs as SaveRef[]) { const t = trees.find((x) => x.key === r.key); if (t) since += await count(t.path, `${r.sha}..HEAD`) + ((await hasUncommitted(t.path)) ? 1 : 0) } }
      return { id: s.id, name: s.name, auto: s.auto, branchId: s.branchId, branchName: branches.find((b) => b.id === s.branchId)?.name ?? null, onCurrent, changesSince: since, createdBy: s.createdBy, createdAt: s.createdAt, gitBranches: (s.refs as SaveRef[]).map((r) => r.branch) }
    })),
  }
}

/**
 * A save point here: what is uncommitted in each of the task's worktrees is committed, a git branch named after the
 * save point marks each, and the task is copied. The work carries on where it was.
 */
export async function saveHere(issueId: string, name: string, by = 'user', auto?: AutoKind) {
  const i = await topLevel(issueId)
  const cur = await ensureCurrent(i, by)
  const { branches, saves } = await rowsOf(issueId)
  const slugs = [...branches.map((b) => b.slug), ...saves.map((s) => s.slug)]
  const label = line(name) || `Saved ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const slug = unique(slugOf(label), slugs)
  const trees = await treesOf(i)
  const refs: SaveRef[] = []
  for (const t of trees) {
    await commitTree(t.path, `Save point: ${label}`)
    const sha = await headSha(t.path)
    const branch = `${plain(t.branch, slugs)}--${slug}`
    await git(t.path, ['branch', '-f', branch, sha])
    refs.push({ key: t.key, path: t.path, branch, sha })
  }
  const old = auto ? saves.filter((s) => s.auto === auto && s.branchId === cur.id) : [] // only the latest of each automatic one is kept
  const row = await db.transaction(async (tx) => {
    const state = await snapshot(tx, issueId)
    if (old.length) await tx.delete(savePoint).where(inArray(savePoint.id, old.map((s) => s.id)))
    await tx.update(taskBranch).set({ refs: trees.map((t) => ({ key: t.key, path: t.path, branch: t.branch, from: (cur.refs as BranchRef[]).find((r) => r.key === t.key)?.from })) }).where(eq(taskBranch.id, cur.id))
    const [s] = await tx.insert(savePoint).values({ id: newId('savePoint'), appId: i.appId, issueId, branchId: cur.id, name: label, slug, auto: auto ?? null, refs, state, createdBy: by }).returning()
    await emit(tx, i, by, 'task.saved', { savePointId: s.id, name: label, worktrees: refs.length, ...(auto ? { auto } : {}) })
    return s
  })
  for (const s of old) await dropGit(i.appId, s.refs as SaveRef[])
  return { id: row.id, name: row.name, worktrees: refs.map((r) => ({ branch: r.branch, sha: r.sha.slice(0, 9) })) }
}

/** The engine's own save point at a transition. Never stops the transition: a failure is logged. */
export async function autoSave(issueId: string, kind: AutoKind) {
  try { const i = await getIssue(db, issueId); if (!i.parentId) await saveHere(issueId, AUTO[kind], 'engine', kind) } catch (err) { console.error(`save point (${kind}) on ${issueId}: could not be made`, err) }
}

/** What stops a move: a sub-task being built right now, or work that has already merged since the point moved to. */
async function guard(issueId: string, since: Date) {
  const subs = await db.select({ id: issue.id }).from(issue).where(eq(issue.parentId, issueId))
  const ids = [issueId, ...subs.map((s) => s.id)]
  const busy = subs.length ? await db.select().from(build).where(and(inArray(build.issueId, subs.map((s) => s.id)), inArray(build.status, BUILDING))) : []
  if (busy.length) throw new PlanError(`${busy.length === 1 ? 'a sub-task is' : `${busy.length} sub-tasks are`} being built right now: stop the build first, then move`)
  const merged = (await db.select().from(pr).where(and(inArray(pr.issueId, ids), isNotNull(pr.mergedAt)))).filter((p) => p.mergedAt! > since)
  if (merged.length) throw new PlanError('a pull request of this task has merged since then, and a merge cannot be taken back from here')
}

interface Target { row: Branch | null; name: string; slug: string; fromSave: string | null; refs: { key: string; branch: string; sha?: string }[]; state: TaskState }
async function moveTo(i: Awaited<ReturnType<typeof topLevel>>, target: Target, opts: { by: string; resetData?: boolean }) {
  const cur = await ensureCurrent(i, opts.by)
  const trees = await treesOf(i)
  const wasRunning: string[] = []
  for (const t of trees) if (t.prototypeId && (await prototypeStatus(t.prototypeId)).status === 'running') wasRunning.push(t.prototypeId)
  for (const t of trees) await commitTree(t.path, `Set aside: ${cur.name}`)
  let commits = 0
  const done: { t: Tree; made: string | null }[] = []
  const nowRefs: BranchRef[] = []
  try {
    for (const t of trees) {
      const to = target.refs.find((r) => r.key === t.key)
      if (!to) continue // a worktree the task did not have then: left as it is
      const sha = to.sha ?? await headSha(t.path, to.branch)
      commits += await count(t.path, `${sha}..HEAD`)
      if (to.sha) await git(t.path, ['branch', to.branch, to.sha])
      done.push({ t, made: to.sha ? to.branch : null })
      await git(t.path, ['switch', '-q', to.branch])
      nowRefs.push({ key: t.key, path: t.path, branch: to.branch, from: to.sha ?? (target.row?.refs as BranchRef[] | undefined)?.find((r) => r.key === t.key)?.from })
    }
  } catch (err) { // nothing half-moved: what was switched goes back, what was made is removed
    for (const d of done) { await git(d.t.path, ['switch', '-q', d.t.branch], { allowFail: true }); if (d.made) await git(d.t.path, ['branch', '-D', d.made], { allowFail: true }) }
    throw new PlanError(`could not move: ${String((err as Error)?.message ?? err).split('\n')[0].slice(0, 300)}. Nothing was changed.`)
  }
  const row = await db.transaction(async (tx) => {
    const left = { ...(await snapshot(tx, i.id)), work: { commits } }
    await tx.update(taskBranch).set({ current: false, state: left, refs: trees.map((t) => ({ key: t.key, path: t.path, branch: t.branch, from: (cur.refs as BranchRef[]).find((r) => r.key === t.key)?.from })) }).where(eq(taskBranch.id, cur.id))
    const [to] = target.row
      ? await tx.update(taskBranch).set({ current: true, state: null, refs: nowRefs }).where(eq(taskBranch.id, target.row.id)).returning()
      : await tx.insert(taskBranch).values({ id: newId('taskBranch'), appId: i.appId, issueId: i.id, name: target.name, slug: target.slug, current: true, fromSave: target.fromSave, refs: nowRefs, createdBy: opts.by }).returning()
    await restore(tx, i.id, target.state, opts.by)
    for (const d of done) await d.t.record(tx, nowRefs.find((r) => r.key === d.t.key)!.branch)
    await emit(tx, i, opts.by, 'task.branch', { from: cur.name, to: to.name, ...(target.fromSave ? { savePoint: target.fromSave } : {}), setAside: { commits } })
    return to
  })
  const problems: string[] = []
  for (const id of wasRunning) { // the server is still serving the code it was started on
    try { if (opts.resetData) { const p = await prototypeStatus(id); await resetPrototypeData(id, p.scenario, opts.by) } else await runPrototype(id, opts.by, { restart: true }) } catch (err) { problems.push(`the prototype did not start again: ${String((err as Error)?.message ?? err).slice(0, 200)}`) }
  }
  const talks = await db.select({ id: session.id }).from(session).where(and(eq(session.appId, i.appId), eq(session.status, 'open'), sql`${session.closedAt} is null`,
    sql`(${session.subjectRef}->>'issueId' = ${i.id} or ${session.id} in (select session_id from prototype where issue_id = ${i.id} and session_id is not null))`))
  return {
    now: { id: row.id, name: row.name }, setAside: { id: cur.id, name: cur.name, commits },
    switched: done.map((d) => ({ worktree: d.t.label, branch: nowRefs.find((r) => r.key === d.t.key)!.branch })),
    leftAlone: trees.filter((t) => !target.refs.some((r) => r.key === t.key)).map((t) => t.label),
    restarted: wasRunning.length - problems.length, problems, sessions: talks.map((s) => s.id),
    note: `This task moved from the task branch "${cur.name}" to "${row.name}"${target.fromSave ? `, started from the save point "${target.fromSave}"` : ''}. Its brief, acceptance criteria, approvals, steps, comments and sub-tasks are now that task branch's, and its worktrees are on that task branch's git branches. What was done on "${cur.name}" is set aside, not lost, and is not in effect: read the task again before relying on anything from before this message.`,
  }
}

/** Go back to a save point: a new task branch starts there and becomes the current one; the one worked on is set aside. */
export async function goBack(savePointId: string, opts: { name?: string; resetData?: boolean; by?: string } = {}) {
  const [s] = await db.select().from(savePoint).where(eq(savePoint.id, savePointId))
  if (!s) throw new PlanError('no such save point')
  const i = await topLevel(s.issueId)
  await guard(i.id, s.createdAt)
  const { branches, saves } = await rowsOf(i.id)
  const slugs = [...branches.map((b) => b.slug), ...saves.map((x) => x.slug)]
  const name = line(opts.name) || unique(`From ${s.name}`, branches.map((b) => b.name))
  const slug = unique(slugOf(name), slugs)
  const refs = (s.refs as SaveRef[]).map((r) => ({ key: r.key, branch: `${plain(r.branch, slugs)}--${slug}`, sha: r.sha }))
  return moveTo(i, { row: null, name, slug, fromSave: s.name, refs, state: s.state as TaskState }, { by: opts.by ?? 'user', resetData: opts.resetData })
}

/** Make a set-aside task branch the current one again. */
export async function switchTo(branchId: string, opts: { resetData?: boolean; by?: string } = {}) {
  const [b] = await db.select().from(taskBranch).where(eq(taskBranch.id, branchId))
  if (!b) throw new PlanError('no such task branch')
  if (b.current) throw new PlanError(`"${b.name}" is already the one being worked on`)
  const i = await topLevel(b.issueId)
  await guard(i.id, b.createdAt)
  return moveTo(i, { row: b, name: b.name, slug: b.slug, fromSave: null, refs: (b.refs as BranchRef[]).map((r) => ({ key: r.key, branch: r.branch })), state: b.state as TaskState }, { by: opts.by ?? 'user', resetData: opts.resetData })
}

/** Remove a save point: its git branches and its copy of the task. The work itself is untouched. */
export async function deleteSavePoint(savePointId: string, by = 'user') {
  const [s] = await db.select().from(savePoint).where(eq(savePoint.id, savePointId))
  if (!s) throw new PlanError('no such save point')
  const i = await getIssue(db, s.issueId)
  await dropGit(i.appId, s.refs as SaveRef[])
  await db.transaction(async (tx) => { await tx.delete(savePoint).where(eq(savePoint.id, s.id)); await emit(tx, i, by, 'task.save_deleted', { name: s.name }) })
  return { deleted: s.name }
}

/** Remove a set-aside task branch: its git branches, its copy of the task (its comments with it) and its save points. */
export async function deleteTaskBranch(branchId: string, by = 'user') {
  const [b] = await db.select().from(taskBranch).where(eq(taskBranch.id, branchId))
  if (!b) throw new PlanError('no such task branch')
  if (b.current) throw new PlanError(`"${b.name}" is the one being worked on: move to another first`)
  const i = await getIssue(db, b.issueId)
  const saves = await db.select().from(savePoint).where(eq(savePoint.branchId, b.id))
  await dropGit(i.appId, [...(b.refs as BranchRef[]), ...saves.flatMap((s) => s.refs as SaveRef[])])
  await db.transaction(async (tx) => {
    await tx.delete(savePoint).where(eq(savePoint.branchId, b.id))
    await tx.delete(taskBranch).where(eq(taskBranch.id, b.id))
    await emit(tx, i, by, 'task.branch_deleted', { name: b.name, commits: (b.state as TaskState | null)?.work?.commits ?? 0, savePoints: saves.length })
  })
  return { deleted: b.name, savePoints: saves.length }
}

/** Everything but the task branch being worked on: every save point and every set-aside task branch. Run when the task is done. */
export async function clearTaskBranches(issueId: string, by = 'user') {
  const { branches, saves } = await rowsOf(issueId)
  let n = 0
  for (const b of branches.filter((x) => !x.current)) { await deleteTaskBranch(b.id, by); n++ }
  const rest = saves.filter((s) => branches.find((b) => b.id === s.branchId)?.current)
  for (const s of rest) await deleteSavePoint(s.id, by)
  return { taskBranches: n, savePoints: saves.length }
}
