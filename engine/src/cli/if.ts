/**
 * `if`: the engine's CLI. A client like any other: it talks to the server over HTTP and watches /events.
 * Only `migrate` touches the database directly.
 */
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Command } from 'commander'

const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:4000/api'

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(ENGINE_URL + path, {
    method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`)
  return JSON.parse(text) as T
}

const program = new Command('se').description('Self Evident engine, shaped like Linear: initiative → project (tasks in order) → task → sub-task → step')

program.command('migrate').description('apply database migrations').action(async () => { await import('../db/migrate.js') })

program.command('workspace').argument('<name>').description('create a workspace').action(async (name: string) => {
  console.log(JSON.stringify(await api('POST', '/workspaces', { name })))
})

program.command('app').argument('<name>').requiredOption('-w, --workspace <id>').option('-b, --branch <name>', 'default branch', 'main')
  .option('--test-cmd <cmd>', 'how to run the tests in a worktree').option('--model <model>', 'model for agent runs')
  .option('--max-budget-usd <n>').option('--max-turns <n>')
  .description('register an app (a stack of repos)').action(async (name: string, o: { workspace: string; branch: string; testCmd?: string; model?: string; maxBudgetUsd?: string; maxTurns?: string }) => {
    const setup: Record<string, unknown> = {}
    if (o.testCmd) setup.test_cmd = o.testCmd
    if (o.model) setup.model = o.model
    if (o.maxBudgetUsd) setup.max_budget_usd = Number(o.maxBudgetUsd)
    if (o.maxTurns) setup.max_turns = Number(o.maxTurns)
    console.log(JSON.stringify(await api('POST', '/apps', { workspaceId: o.workspace, name, defaultBranch: o.branch, setup })))
  })

program.command('repo').argument('<fullName>', 'owner/name on GitHub').requiredOption('-a, --app <id>').requiredOption('-p, --path <dir>', 'local main checkout; worktrees go in <dir>-worktrees/')
  .description("register an app's repo").action(async (fullName: string, o: { app: string; path: string }) => {
    console.log(JSON.stringify(await api('POST', '/repos', { appId: o.app, fullName, localPath: o.path })))
  })

program.command('connect').argument('[dir]', 'a checkout of the app\'s repo (a worktree is fine)', '.')
  .description('print the command that connects Claude Code (VS Code or terminal) to this app\'s engine tools over MCP')
  .action(async (dir: string) => {
    const from = resolve(process.env.INIT_CWD ?? process.cwd(), dir) // pnpm --dir runs us in engine/; INIT_CWD is where you were
    const git = (...args: string[]) => execFileSync('git', args, { cwd: from, encoding: 'utf8' }).trim()
    const top = git('rev-parse', '--show-toplevel')
    const main = dirname(resolve(top, git('rev-parse', '--git-common-dir'))) // a worktree resolves to its main checkout
    const apps = await api<{ id: string; name: string; repos: { localPath: string | null }[] }[]>('GET', '/apps')
    const a = apps.find((x) => x.repos.some((r) => r.localPath && [top, main].includes(resolve(r.localPath))))
    if (!a) { console.error(`No app has ${main} as its repo. Add it in Settings, or: pnpm se repo <owner/name> -a <appId> -p ${main}`); process.exitCode = 1; return }
    const url = `${ENGINE_URL.replace(/\/api$/, '')}/api/mcp/${a.id}`
    console.log(`${a.name} (${a.id}). In ${top}, run once:\n\n  claude mcp add --scope local --transport http self-evident ${url}\n`)
    console.log('Local scope: only you, only in this repo; nothing is written into the repo. Then ask Claude Code "what needs me?"')
  })

/** The app whose repo holds this folder (a worktree resolves to its main checkout). */
async function appFor(from: string) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: from, encoding: 'utf8' }).trim()
  const top = git('rev-parse', '--show-toplevel')
  const main = dirname(resolve(top, git('rev-parse', '--git-common-dir')))
  const apps = await api<{ id: string; name: string; repos: { localPath: string | null }[] }[]>('GET', '/apps')
  return apps.find((x) => x.repos.some((r) => r.localPath && [top, main].includes(resolve(r.localPath))))
}

const talk = program.command('talk').description('the same conversation in the terminal and in the UI')
talk.command('share').argument('[dir]', 'the folder the Claude Code session runs in', '.').option('-s, --session <id>', 'its session id (default: the one last written there)')
  .option('-a, --app <id>', 'the app (default: the one whose repo holds the folder)')
  .description('bring a Claude Code session started in a terminal or an editor into the UI\'s agent column')
  .action(async (dir: string, opts: { session?: string; app?: string }) => {
    const cwd = resolve(process.env.INIT_CWD ?? process.cwd(), dir)
    const appId = opts.app ?? (await appFor(cwd))?.id
    if (!appId) { console.error(`No app has ${cwd} in its repo; pass --app <id>.`); process.exitCode = 1; return }
    const s = await api<{ id: string; subject: string | null }>('POST', '/talks/adopt', { appId, cwd, agentSessionId: opts.session })
    console.log(`In Self Evident now: ${s.subject ?? s.id}. What's said in either place shows in the other; whoever speaks next has it.`)
  })
talk.command('resume').argument('<sessionId>', 'the conversation (sess_…), from the UI').description('print the command that continues a UI conversation in this terminal')
  .action(async (id: string) => { const r = await api<{ command: string }>('POST', `/talks/${id}/handoff`); console.log(r.command) })

const project = program.command('project').description('projects are tasks in order; a code task is built in sub-tasks')

project.command('create').requiredOption('-a, --app <id>').requiredOption('-n, --name <name>').option('-c, --content <text>', 'why: the idea behind it')
  .requiredOption('-f, --issues <file>', 'JSON: [{title, brief?, subIssues?: [{key, title, brief?, dependsOn?, files?}]}]')
  .action(async (o: { app: string; name: string; content?: string; issues: string }) => {
    const issues = JSON.parse(await readFile(o.issues, 'utf8'))
    const out = await api<{ project: { id: string }; issues: { id: string; number: number; title: string }[]; subIssues: { id: string; number: number; title: string; parentId: string }[] }>('POST', '/projects', { appId: o.app, name: o.name, content: o.content, issues })
    console.log(`project ${out.project.id}`)
    for (const t of out.issues) {
      console.log(`  task ${t.id}  #${t.number}  ${t.title}`)
      for (const x of out.subIssues.filter((q) => q.parentId === t.id)) console.log(`    sub-task ${x.id}  #${x.number}  ${x.title}`)
    }
  })

project.command('graph').argument('<projectId>').action(async (projectId: string) => {
  const g = await api<{ project: { name: string; status: string; integrationBranch: string }; pr: { number: number; url: string } | null; issues: any[]; subIssues: any[]; backlog: any[] }>('GET', `/projects/${projectId}/graph`)
  console.log(`${g.project.name}  [${g.project.status}]  (${g.project.integrationBranch})${g.pr ? `  PR #${g.pr.number}` : ''}`)
  for (const t of g.issues) {
    console.log(`  ${t.identifier} ${t.title}  [${t.state}]`)
    for (const x of g.subIssues.filter((q) => q.parentId === t.id)) {
      const name = (d: string) => g.subIssues.find((q) => q.id === d)?.identifier ?? d
      const deps = x.dependsOn.length ? `  ← ${x.dependsOn.map(name).join(', ')}` : ''
      const after = x.orderedAfter?.length ? `  ⇐ ${x.orderedAfter.map(name).join(', ')} (task order)` : ''
      const held = x.heldReason ? `  [held: ${x.heldReason}]` : ''
      console.log(`    ${x.status.padEnd(15)} ${x.id}  ${x.identifier} ${x.title}${deps}${after}${held}`)
      for (const s of x.steps ?? []) console.log(`      ${s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '●' : '○'} ${s.text}`)
    }
  }
  const open = g.backlog.filter((i) => i.state === 'backlog')
  if (open.length) console.log(`  backlog: ${open.map((i) => `${i.identifier} ${i.title}`).join('; ')}`)
})

project.command('start').argument('<projectId>').description('run the project: worktrees, agent runs, landing, PR')
  .action(async (projectId: string) => { console.log(JSON.stringify(await api('POST', `/projects/${projectId}/start`))) })

project.command('tick').argument('<projectId>').option('-r, --room <n>', 'free session slots').description('one dispatch pass (drafts)')
  .action(async (projectId: string, o: { room?: string }) => {
    console.log(JSON.stringify(await api('POST', `/projects/${projectId}/tick${o.room ? `?room=${o.room}` : ''}`), null, 2))
  })

const issue = program.command('issue').description('tasks (Linear calls them issues) are authored; the planner (or you) adds a code task\'s sub-tasks')
issue.command('sub-issues').argument('<issueId>').requiredOption('-f, --file <file>', 'JSON: [{key, title, brief?, dependsOn?, files?}]')
  .description('add sub-tasks to a code task').action(async (issueId: string, o: { file: string }) => {
    const rows = await api<any[]>('POST', `/issues/${issueId}/sub-issues`, JSON.parse(await readFile(o.file, 'utf8')))
    for (const x of rows) console.log(`  sub-task ${x.id}  #${x.number}  ${x.title}`)
  })
issue.command('plan').argument('<issueId>').description("the planner: the task's brief → sub-tasks, decisions and questions (one read-only agent run; minutes)")
  .action(async (issueId: string) => {
    const out = await api<any>('POST', `/issues/${issueId}/plan?wait=1`)
    for (const x of out.subIssues) console.log(`  sub-task ${x.id}  #${x.number}  ${x.title}`)
    for (const d of out.decisions) console.log(`  decided  ${d.question} → ${d.options[0]?.text}  (${d.rationale})`)
    for (const q of out.questions) console.log(`  question ${q.id} [${q.cost}]  ${q.text}  (recommends ${q.options.find((o: any) => o.recommended)?.label})`)
    console.log(`  run ${out.runId}  $${Number(out.costUsd ?? 0).toFixed(2)} est.`)
  })
issue.command('build').argument('<issueId>').argument('<status>').description('set a sub-task\'s build status by hand, for drafts')
  .action(async (issueId: string, status: string) => { console.log(JSON.stringify(await api('POST', `/issues/${issueId}/build`, { status }))) })
program.command('question').command('answer').argument('<questionId>').argument('<answer>')
  .action(async (questionId: string, answer: string) => { console.log(JSON.stringify(await api('POST', `/questions/${questionId}/answer`, { answer }))) })

program.command('watch').option('-s, --since <seq>', 'replay from this sequence number', '0').option('-p, --project <id>').option('-a, --app <id>').option('-w, --workspace <id>')
  .description('follow the event log').action(async (o: { since: string; project?: string; app?: string; workspace?: string }) => {
    const q = new URLSearchParams({ since: o.since })
    if (o.project) q.set('project', o.project)
    if (o.app) q.set('app', o.app)
    if (o.workspace) q.set('workspace', o.workspace)
    const res = await fetch(`${ENGINE_URL}/events?${q}`)
    if (!res.ok || !res.body) throw new Error(`watch: ${res.status}`)
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += value
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2)
        const data = frame.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim()
        const type = frame.split('\n').find((l) => l.startsWith('event:'))?.slice(6).trim()
        if (type === 'ping' || !data) continue
        const e = JSON.parse(data)
        const who = e.issueId ?? e.projectId ?? e.appId ?? ''
        console.log(`${String(e.seq).padStart(6)}  ${e.ts.slice(11, 19)}  ${e.type.padEnd(16)} ${who}  ${JSON.stringify(e.payload)}`)
      }
    }
  })

await program.parseAsync()
