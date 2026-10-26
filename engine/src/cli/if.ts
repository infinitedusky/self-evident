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

const program = new Command('se').description('Self Evident engine: idea → project (tasks in order) → task → phase → step')

program.command('migrate').description('apply database migrations').action(async () => { await import('../db/migrate.js') })

program.command('workspace').argument('<name>').description('create a workspace').action(async (name: string) => {
  console.log(JSON.stringify(await api('POST', '/workspaces', { name })))
})

program.command('app').argument('<name>').requiredOption('-w, --workspace <id>').option('-b, --branch <name>', 'default branch', 'main')
  .option('--test-cmd <cmd>', 'how to run the tests in a worktree').option('--model <model>', 'model for phase runs')
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

const project = program.command('project').description('projects are tasks in order; tasks are made of phases')

project.command('create').requiredOption('-a, --app <id>').requiredOption('-t, --title <title>').option('-s, --spec <text>', 'why: the idea behind it')
  .requiredOption('-f, --tasks <file>', 'JSON: [{title, brief?, phases?: [{key, title, brief?, dependsOn?, files?}]}]')
  .action(async (o: { app: string; title: string; spec?: string; tasks: string }) => {
    const tasks = JSON.parse(await readFile(o.tasks, 'utf8'))
    const out = await api<{ project: { id: string }; tasks: { id: string; number: number; title: string }[]; phases: { id: string; number: number; title: string; taskId: string }[] }>('POST', '/projects', { appId: o.app, title: o.title, spec: o.spec, tasks })
    console.log(`project ${out.project.id}`)
    for (const t of out.tasks) {
      console.log(`  task ${t.id}  #${t.number}  ${t.title}`)
      for (const x of out.phases.filter((q) => q.taskId === t.id)) console.log(`    phase ${x.id}  #${x.number}  ${x.title}`)
    }
  })

project.command('graph').argument('<projectId>').action(async (projectId: string) => {
  const g = await api<{ project: { title: string; status: string; integrationBranch: string }; pr: { number: number; url: string } | null; tasks: any[]; phases: any[] }>('GET', `/projects/${projectId}/graph`)
  console.log(`${g.project.title}  [${g.project.status}]  (${g.project.integrationBranch})${g.pr ? `  PR #${g.pr.number}` : ''}`)
  for (const t of g.tasks) {
    console.log(`  task #${t.number} ${t.title}`)
    for (const x of g.phases.filter((q) => q.taskId === t.id)) {
      const num = (d: string) => '#' + (g.phases.find((q) => q.id === d)?.number ?? d)
      const deps = x.dependsOn.length ? `  ← ${x.dependsOn.map(num).join(', ')}` : ''
      const after = x.orderedAfter?.length ? `  ⇐ ${x.orderedAfter.map(num).join(', ')} (task order)` : ''
      const held = x.heldReason ? `  [held: ${x.heldReason}]` : ''
      console.log(`    ${x.status.padEnd(15)} ${x.id}  #${x.number} ${x.title}${deps}${after}${held}`)
      for (const s of x.steps ?? []) console.log(`      ${s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '●' : '○'} ${s.text}`)
    }
  }
})

project.command('start').argument('<projectId>').description('run the project: worktrees, agent runs, landing, PR')
  .action(async (projectId: string) => { console.log(JSON.stringify(await api('POST', `/projects/${projectId}/start`))) })

project.command('tick').argument('<projectId>').option('-r, --room <n>', 'free session slots').description('one dispatch pass (drafts)')
  .action(async (projectId: string, o: { room?: string }) => {
    console.log(JSON.stringify(await api('POST', `/projects/${projectId}/tick${o.room ? `?room=${o.room}` : ''}`), null, 2))
  })

const task = program.command('task').description('tasks are authored; the planner (or you) adds their phases')
task.command('phases').argument('<taskId>').requiredOption('-f, --file <file>', 'JSON: [{key, title, brief?, dependsOn?, files?}]')
  .description('add phases to a task').action(async (taskId: string, o: { file: string }) => {
    const rows = await api<any[]>('POST', `/tasks/${taskId}/phases`, JSON.parse(await readFile(o.file, 'utf8')))
    for (const x of rows) console.log(`  phase ${x.id}  #${x.number}  ${x.title}`)
  })
task.command('plan').argument('<taskId>').description("the planner: the task's brief → phases, decisions and questions (one read-only agent run; minutes)")
  .action(async (taskId: string) => {
    const out = await api<any>('POST', `/tasks/${taskId}/plan?wait=1`)
    for (const x of out.phases) console.log(`  phase ${x.id}  #${x.number}  ${x.title}`)
    for (const d of out.decisions) console.log(`  decided  ${d.question} → ${d.options[0]?.text}  (${d.rationale})`)
    for (const q of out.questions) console.log(`  question ${q.id} [${q.cost}]  ${q.text}  (recommends ${q.options.find((o: any) => o.recommended)?.label})`)
    console.log(`  run ${out.runId}  $${Number(out.costUsd ?? 0).toFixed(2)} est.`)
  })
program.command('question').command('answer').argument('<questionId>').argument('<answer>')
  .action(async (questionId: string, answer: string) => { console.log(JSON.stringify(await api('POST', `/questions/${questionId}/answer`, { answer }))) })

program.command('phase').command('status').argument('<phaseId>').argument('<status>').description('by hand, for drafts')
  .action(async (phaseId: string, status: string) => { console.log(JSON.stringify(await api('POST', `/phases/${phaseId}/status`, { status }))) })

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
        const who = e.phaseId ?? e.taskId ?? e.projectId ?? e.appId ?? ''
        console.log(`${String(e.seq).padStart(6)}  ${e.ts.slice(11, 19)}  ${e.type.padEnd(16)} ${who}  ${JSON.stringify(e.payload)}`)
      }
    }
  })

await program.parseAsync()
