/** Task branches and save points: saving marks every worktree of the task, going back starts a new task branch there, nothing is lost. */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, pool } from './db/client.js'
import { app, issue, prototype, session, workspace } from './db/schema.js'
import { setAcceptance } from './acceptance.js'
import { branchExists, commitAll, git, hasUncommitted } from './git.js'
import { newId } from './ids.js'
import { commentOnIssue, createIssue, listComments, updateIssue } from './issues.js'
import { autoSave, clearTaskBranches, deleteSavePoint, deleteTaskBranch, goBack, saveHere, slugOf, switchTo, taskBranches } from './task-branches.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

it('names git branches after what the person called the save point', () => {
  expect(slugOf('Proto before review')).toBe('proto-before-review')
  expect(slugOf('  ?? ')).toBe('save')
})

describe.skipIf(!reachable)('task branches and save points (sample data)', () => {
  const wsId = newId('workspace')
  const appId = newId('app')
  const protoId = newId('prototype')
  const talkId = newId('session')
  let repoPath: string, proto: string, talk: string, taskId: string
  const on = async (path: string) => (await git(path, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-task-branches-'))
    await git(dir, ['init', '-q', '-b', 'main', 'repo'])
    repoPath = join(dir, 'repo')
    await writeFile(join(repoPath, 'page.txt'), 'first\n')
    await commitAll(repoPath, 'init')
    proto = join(dir, 'repo-worktrees', 'prototype--sample-ab12'); talk = join(dir, 'repo-worktrees', 'talk-ab12')
    await git(repoPath, ['worktree', 'add', '-q', '-b', 'prototype/sample-ab12', proto, 'main'])
    await git(repoPath, ['worktree', 'add', '-q', '-b', 'talk/ab12', talk, 'main'])
    await db.insert(workspace).values({ id: wsId, name: 'task branches test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    taskId = (await createIssue(appId, { title: 'Export (sample)', kind: 'code', brief: 'The first brief (sample).' })).id
    await db.insert(prototype).values({ id: protoId, appId, issueId: taskId, title: 'Sample', branch: 'prototype/sample-ab12', path: proto, status: 'stopped', guide: { steps: [{ title: 'Open it (sample)' }] } })
    await db.insert(session).values({ id: talkId, appId, cwd: talk, worktreePath: talk, branch: 'talk/ab12', subjectRef: { issueId: taskId } })
  })
  afterAll(async () => { await pool.end() })

  it('saving commits what is uncommitted, marks every worktree with a git branch of that name, and leaves the work where it was', async () => {
    await writeFile(join(proto, 'page.txt'), 'first\nbefore review\n') // not committed
    const s = await saveHere(taskId, 'Proto before review')
    expect(s.worktrees.map((w) => w.branch).sort()).toEqual(['prototype/sample-ab12--proto-before-review', 'talk/ab12--proto-before-review'])
    expect(await hasUncommitted(proto)).toBe(false)
    expect(await on(proto)).toBe('prototype/sample-ab12') // still on its own branch
    expect(await branchExists(repoPath, 'prototype/sample-ab12--proto-before-review')).toBe(true)
    const v = await taskBranches(taskId)
    expect(v.branches).toMatchObject([{ name: 'Main', current: true }])
    expect(v.saves).toMatchObject([{ name: 'Proto before review', onCurrent: true, changesSince: 0, branchName: 'Main' }])
  })

  it('going back starts a new task branch at the save point: code, brief, criteria, comments and the guide as they were; what came after is set aside', async () => {
    await writeFile(join(proto, 'page.txt'), 'first\nbefore review\nafter review\n'); await commitAll(proto, 'after review')
    await writeFile(join(proto, 'loose.txt'), 'not committed\n')
    await updateIssue(taskId, { brief: 'The second brief (sample).' })
    await setAcceptance(taskId, { add: [{ text: 'Exports a file (sample)' }] })
    await commentOnIssue(taskId, { body: 'Review\n\nThe export button does nothing (sample).' }, 'user')
    await db.update(prototype).set({ guide: { steps: [{ title: 'Later (sample)' }] } }).where(eq(prototype.id, protoId))
    expect((await taskBranches(taskId)).saves[0].changesSince).toBe(2) // one commit, and work not committed

    const saveId = (await taskBranches(taskId)).saves[0].id
    const r = await goBack(saveId)
    expect(r.now.name).toBe('From Proto before review'); expect(r.setAside).toMatchObject({ name: 'Main', commits: 2 })
    expect(r.sessions).toContain(talkId)
    expect(await on(proto)).toBe('prototype/sample-ab12--from-proto-before-review'); expect(await on(talk)).toBe('talk/ab12--from-proto-before-review')
    expect(await readFile(join(proto, 'page.txt'), 'utf8')).toBe('first\nbefore review\n'); expect(existsSync(join(proto, 'loose.txt'))).toBe(false)
    const [t] = await db.select().from(issue).where(eq(issue.id, taskId))
    expect(t.brief).toBe('The first brief (sample).'); expect(t.acceptance).toEqual([])
    expect(await listComments(db, taskId)).toHaveLength(0)
    const [p] = await db.select().from(prototype).where(eq(prototype.id, protoId))
    expect(p.branch).toBe('prototype/sample-ab12--from-proto-before-review'); expect(p.guide).toEqual({ steps: [{ title: 'Open it (sample)' }] })
    expect((await db.select().from(session).where(eq(session.id, talkId)))[0].branch).toBe('talk/ab12--from-proto-before-review')
    const v = await taskBranches(taskId)
    expect(v.branches).toMatchObject([{ name: 'Main', current: false, work: { commits: 2, comments: 1 } }, { name: 'From Proto before review', current: true, fromSave: 'Proto before review' }])
    expect(await branchExists(repoPath, 'prototype/sample-ab12')).toBe(true) // set aside, untouched
  })

  it('a set-aside task branch can be made current again, with everything it had, the loose work too', async () => {
    const main = (await taskBranches(taskId)).branches.find((b) => b.name === 'Main')!
    const r = await switchTo(main.id)
    expect(r.now.name).toBe('Main')
    expect(await on(proto)).toBe('prototype/sample-ab12')
    expect(await readFile(join(proto, 'page.txt'), 'utf8')).toBe('first\nbefore review\nafter review\n'); expect(existsSync(join(proto, 'loose.txt'))).toBe(true)
    const [t] = await db.select().from(issue).where(eq(issue.id, taskId))
    expect(t.brief).toBe('The second brief (sample).'); expect(t.acceptance).toHaveLength(1)
    expect((await listComments(db, taskId)).map((c) => c.heading)).toEqual(['Review'])
    await expect(switchTo(main.id)).rejects.toThrow(/already the one being worked on/)
  })

  it('keeps only the latest of each automatic save point', async () => {
    await autoSave(taskId, 'brief_approved'); await autoSave(taskId, 'brief_approved')
    const autos = (await taskBranches(taskId)).saves.filter((s) => s.auto === 'brief_approved')
    expect(autos).toHaveLength(1); expect(autos[0].name).toBe('Brief approved')
  })

  it('deletes a save point or a set-aside task branch with its git branches, never the one being worked on, and clears the rest when asked', async () => {
    const v = await taskBranches(taskId)
    await expect(deleteTaskBranch(v.branches.find((b) => b.current)!.id)).rejects.toThrow(/being worked on/)
    await deleteTaskBranch(v.branches.find((b) => !b.current)!.id)
    expect(await branchExists(repoPath, 'prototype/sample-ab12--from-proto-before-review')).toBe(false)
    await deleteSavePoint(v.saves.find((s) => s.name === 'Proto before review')!.id)
    expect(await branchExists(repoPath, 'prototype/sample-ab12--proto-before-review')).toBe(false)
    await saveHere(taskId, 'Another (sample)')
    await clearTaskBranches(taskId)
    const after = await taskBranches(taskId)
    expect(after.saves).toHaveLength(0); expect(after.branches).toMatchObject([{ name: 'Main', current: true }])
    expect(await on(proto)).toBe('prototype/sample-ab12'); expect(await readFile(join(proto, 'page.txt'), 'utf8')).toContain('after review')
  })
})
