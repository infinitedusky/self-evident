/**
 * tkt as an integration switched on per app: the switch decides who a new task goes to, the check says in tkt's words
 * what is wrong and nothing else, and the tracker guide comes out filled for the app.
 */
import { describe, expect, it } from 'vitest'
import { checkIntegration, integrationStatus, INTEGRATIONS, setupIntegration, statuses } from './integrations.js'
import { checkTkt, defaultDelegate, GUIDE_PATH, section, setupTkt, tktOn, trackerGuide, type Run, type TktContext } from './tkt.js'

const tkt = INTEGRATIONS.find((i) => i.key === 'tkt')!
const ctx: TktContext = { app: { id: 'app_x1', key: 'SCR', name: 'tkt scratch' }, repoPath: '/code/scratch', engineUrl: 'http://localhost:4000/api', uiUrl: 'http://localhost:5180', linear: { server: 'linear', workspace: 'Sample Co', slug: 'sample-co', team: { name: 'Scratch', key: 'SCR', id: 'team-scr' }, states: [{ name: 'Backlog', type: 'backlog' }, { name: 'Todo', type: 'unstarted' }, { name: 'In Progress', type: 'started' }, { name: 'In Review', type: 'started' }, { name: 'Done', type: 'completed' }, { name: 'Canceled', type: 'canceled' }], automation: [] } }
const goodGuide = `<!-- rogs-skills config v1: issue-tracker -->\n# Issue tracker\n\n## Tracker\n\n- Kind: Linear\n- Team: Scratch, key \`SCR\`, id \`team-scr\`\n- Ticket ids: \`SCR-<number>\`\n`
const enoent = () => Object.assign(new Error('spawn tkt ENOENT'), { code: 'ENOENT' })
/** A tkt that answers --version and doctor as told; anything else is a surprise. */
const fakeTkt = (doctor: 'ok' | string = 'ok'): Run => async (file, args) => {
  expect(file).toBe('tkt')
  if (args[0] === '--version') return { stdout: 'tkt version v0.21.0\n', stderr: '' }
  if (args[0] === 'doctor') {
    if (doctor === 'ok') return { stdout: 'ok    git    git version 2.50\n', stderr: '' }
    throw Object.assign(new Error('exit 1'), { code: 1, stdout: doctor, stderr: '' })
  }
  throw new Error(`unexpected ${args.join(' ')}`)
}
const files = (map: Record<string, string>) => async (p: string) => { if (p in map) return map[p]; throw Object.assign(new Error(`ENOENT ${p}`), { code: 'ENOENT' }) }

describe('the switch', () => {
  it('is on only when the app says so, in words', () => {
    expect(tktOn({ integrations: { tkt: { on: 'true' } } })).toBe(true)
    expect(tktOn({ integrations: { tkt: { on: ' true ' } } })).toBe(true)
    expect(tktOn({ integrations: { tkt: { on: 'false' } } })).toBe(false)
    expect(tktOn({ integrations: { tkt: {} } })).toBe(false)
    expect(tktOn({})).toBe(false)
    expect(tktOn(null)).toBe(false)
  })
  it('decides who a new task is handed to: nobody under tkt, else the planner', () => {
    expect(defaultDelegate({ integrations: { tkt: { on: 'true' } } })).toBeNull()
    expect(defaultDelegate({})).toBe('planner')
  })
  it('reads as on or off in Settings, never incomplete', () => {
    expect(integrationStatus(tkt, { on: 'true' })).toEqual({ state: 'ready', missing: [], keyVar: null })
    expect(integrationStatus(tkt, { on: 'false' })).toEqual({ state: 'off', missing: [], keyVar: null })
    expect(integrationStatus(tkt, {})).toEqual({ state: 'off', missing: [], keyVar: null })
    expect(statuses({ tkt: { on: { value: 'true', from: 'app' } } }).tkt.state).toBe('ready')
    expect(tkt.perApp).toBe(true)
  })
})

describe('the check', () => {
  it('passes when tkt is there, the guide points at this app, and doctor is happy', async () => {
    const r = await checkTkt(ctx, { run: fakeTkt(), read: files({ [`/code/scratch/${GUIDE_PATH}`]: goodGuide }) })
    expect(r).toEqual({ ok: true, detail: 'tkt v0.21.0; doctor passes in /code/scratch; the tracker guide points at SCR in Linear.' })
  })
  it('says tkt is missing, and where to get it, before anything else', async () => {
    const r = await checkTkt(ctx, { run: async () => { throw enoent() }, read: files({}) })
    expect(r.ok).toBe(false)
    expect(r.detail).toBe("tkt isn't on the engine's PATH. Get tkt working: https://gitlab.com/rogs/tkt")
  })
  it('wants a local checkout', async () => {
    expect((await checkTkt({ ...ctx, repoPath: null }, { run: fakeTkt(), read: files({}) })).detail).toMatch(/No local checkout under Repo/)
  })
  it('wants the tracker guide in the repo, pointing at Linear and at the team, and wants a Linear team at all', async () => {
    const read = (guide?: string) => files(guide === undefined ? {} : { [`/code/scratch/${GUIDE_PATH}`]: guide })
    expect((await checkTkt(ctx, { run: fakeTkt(), read: read() })).detail).toBe(`${GUIDE_PATH} isn't in the repo. Copy the tracker guide below into it.`)
    expect((await checkTkt(ctx, { run: fakeTkt(), read: read('## Tracker\n- Kind: Self Evident\n- Scope: the app') })).detail).toMatch(/points at another tracker \(Self Evident\), not Linear/)
    expect((await checkTkt(ctx, { run: fakeTkt(), read: read(goodGuide.replace('team-scr', 'team-other')) })).detail).toMatch(/names another Linear team, not SCR \(Scratch\)/)
    expect((await checkTkt(ctx, { run: fakeTkt(), read: read(goodGuide.replace(/SCR/g, 'HG')) })).detail).toMatch(/names another Linear team/)
    expect((await checkTkt({ ...ctx, linear: undefined }, { run: fakeTkt(), read: read(goodGuide) })).detail).toMatch(/tkt reads this app's tickets from Linear, and no Linear team is set for it/) // never from Self Evident
  })
  it('repeats what tkt doctor said when it fails, then says get tkt working', async () => {
    const out = 'ok    git       git version 2.50\nfail  herdr     herdr is not installed\n                hint: brew install herdr\nok    gh        gh 2.92\n'
    const r = await checkTkt(ctx, { run: fakeTkt(out), read: files({ [`/code/scratch/${GUIDE_PATH}`]: goodGuide }) })
    expect(r).toEqual({ ok: false, detail: 'tkt doctor: fail  herdr     herdr is not installed. Get tkt working: https://gitlab.com/rogs/tkt' })
  })
  it('is reached through checkIntegration with the app\'s context, and refused without one', async () => {
    const deps = { run: fakeTkt(), read: files({ [`/code/scratch/${GUIDE_PATH}`]: goodGuide }) }
    expect((await checkIntegration('tkt', { on: 'true' }, {}, fetch, { tkt: { ctx, deps } })).ok).toBe(true)
    expect((await checkIntegration('tkt', { on: 'false' }, {}, fetch, { tkt: { ctx, deps } })).detail).toMatch(/off for this app/)
    await expect(checkIntegration('tkt', { on: 'true' })).rejects.toThrow(/per app/)
  })
})

describe('the tracker guide', () => {
  it('comes out filled for the app, with the marker and the sections the skills check', async () => {
    const g = await trackerGuide(ctx)
    expect(g.startsWith('<!-- rogs-skills config v1: issue-tracker -->\n# Issue tracker\n')).toBe(true)
    for (const h of ['## Tracker', '## Operating rules', '## Operations', '## States', '## Labels and priority', '## Ticket conventions']) expect(g).toContain(`\n${h}\n`)
    expect(g).not.toMatch(/\{\{FILL:/)
    expect(g).toContain('- Kind: Linear')
    expect(g).toContain('- Team: Scratch, key `SCR`, id `team-scr`')
    expect(g).toContain('`SCR-<number>`, matched by `^SCR-[1-9][0-9]*$`')
    expect(g).not.toMatch(/Self Evident's HTTP|localhost:4000/) // tkt never reads its tickets from Self Evident
    for (const op of ['resolve', 'load', 'search', 'list-in-flight', 'list-ready', 'metadata', 'create', 'update', 'relate', 'comment', 'transition', 'attach']) expect(g).toContain(`### ${op}\n`)
    expect(g.match(/^Capability: /gm)?.length).toBe(12)
  })
  it('takes a section out of a guide by its heading', () => {
    expect(section('# T\n\n## A\n\none\n\n## B\n\ntwo\n', 'A')).toBe('one')
    expect(section('## A\none\n## B\ntwo', 'B')).toBe('two')
    expect(section('## A\none', 'C')).toBe('')
  })
})

describe('set up what\'s missing', () => {
  const root = '/code/scratch'
  const guidePath = `${root}/${GUIDE_PATH}`
  const rel = (p: string) => (p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p)
  interface M { files: Record<string, string>; cmds: string[]; dirty: Set<string>; hooks: boolean; plugin: boolean; branch: string; remote: string | null; tkt: boolean }
  /** A machine: a checkout (files by absolute path), git, gh and a tkt whose doctor answers from the machine's state. */
  const machine = (o: { files?: Record<string, string>; branch?: string; remote?: string | null; tkt?: boolean; doctor?: (m: M) => string | null; pushFails?: boolean } = {}) => {
    const m: M = { files: { ...(o.files ?? {}) }, cmds: [], dirty: new Set<string>(), hooks: false, plugin: false, branch: o.branch ?? 'main', remote: o.remote === undefined ? 'https://github.com/infinitedusky/scratch.git' : o.remote, tkt: o.tkt ?? true }
    const ok = (stdout = '') => ({ stdout, stderr: '' })
    const run: Run = async (file, args) => {
      m.cmds.push([file, ...args].join(' '))
      const a = args.join(' ')
      if (file === 'tkt') {
        if (!m.tkt) throw enoent()
        if (a === '--version') return ok('tkt version v0.21.0\n')
        if (a === 'doctor') { const bad = o.doctor ? o.doctor(m) : null; if (bad === null) return ok('ok    git    git version 2.50\n'); throw Object.assign(new Error('exit 1'), { code: 1, stdout: bad, stderr: '' }) }
        if (a === 'hook claude --install --shared') { m.files[`${root}/.claude/settings.json`] = '{"hooks":{}}'; m.dirty.add('.claude/settings.json'); m.hooks = true; return ok() }
        if (a === 'hook tmp --install') { m.plugin = true; return ok() }
      }
      if (file === 'git') {
        if (a === 'ls-files --cached --others --exclude-standard') return ok(Object.keys(m.files).map(rel).join('\n'))
        if (a === 'remote') return ok(m.remote ? 'origin' : '')
        if (a === 'remote get-url origin' && m.remote) return ok(m.remote)
        if (a.startsWith('symbolic-ref')) return ok('origin/main')
        if (a === 'rev-parse --abbrev-ref HEAD') return ok(m.branch)
        if (a.startsWith('status --porcelain -- ')) return ok(args.slice(3).filter((p) => m.dirty.has(p)).map((p) => `?? ${p}`).join('\n'))
        if (a.startsWith('add -- ')) return ok()
        if (a.startsWith('commit ')) { m.dirty.clear(); return ok() }
        if (a === 'rev-parse --short HEAD') return ok('abc1234')
        if (a === 'push origin main') { if (o.pushFails) throw Object.assign(new Error('exit 1'), { code: 1, stdout: '', stderr: 'remote: protected branch hook declined\n' }); return ok() }
      }
      if (file === 'gh') return ok(JSON.stringify({ defaultBranchRef: { name: 'main' }, mergeCommitAllowed: true, squashMergeAllowed: true, pullRequestTemplates: [] }))
      throw new Error(`unexpected ${file} ${a}`)
    }
    const read = async (p: string) => { if (p in m.files) return m.files[p]; throw Object.assign(new Error(`ENOENT ${p}`), { code: 'ENOENT' }) }
    const write = async (p: string, t: string) => { m.files[p] = t; m.dirty.add(rel(p)) }
    return { ...m, m, run, read, write }
  }
  /** A doctor that fails until the files are there and warns until the hooks are in. */
  const doctor = (m: M) => {
    const bad = [
      ...(m.files[`${root}/docs/agents/forge.md`] && m.files[guidePath] ? [] : ['fail  lifecycle        /code/scratch/docs/agents has no lifecycle configuration; run /setup-rogs', '                       hint: run /setup-rogs in this project']),
      ...(m.hooks ? [] : ['warn  claude_hooks     tkt reads Claude Code agents\' status lines only from their transcripts', '                       hint: tkt hook claude --install, or --shared']),
      ...(m.plugin ? [] : ['warn  opencode_plugin  OpenCode agents share the service\'s TMPDIR', '                       hint: tkt hook tmp --install']),
      'warn  pi               this tkt has no bundled pi, so tkt agent cannot start', '                       hint: install a release build of tkt (install.sh)',
    ]
    return bad.length > 2 ? bad.join('\n') : null // the pi warning alone is no failure
  }

  it('writes the whole configuration, installs the hooks doctor misses, commits on main and pushes, and is done', async () => {
    const mc = machine({ files: { [`${root}/package.json`]: JSON.stringify({ scripts: { dev: 'vite', test: 'vitest run' }, devDependencies: { vitest: '1' } }), [`${root}/package-lock.json`]: '' }, doctor })
    const r = await setupTkt(ctx, mc)
    expect(r.done).toBe(true); expect(r.ask).toBeNull()
    expect(r.did).toEqual([
      `Wrote ${GUIDE_PATH}, pointing at SCR in Linear. The agents reach Linear through the MCP server \`linear\`: sign in to it once in the harness (/mcp in Claude Code).`,
      'Wrote docs/agents/forge.md, docs/agents/workflow.md, docs/agents/domain.md, docs/agents/pull-request.md and the Ticket lifecycle block in CLAUDE.md, from the app, the repo and the house profile.',
      'Installed tkt\'s Claude Code hooks in .claude/settings.json (the shared file, so they are committed and Self Evident\'s agents get them).',
      'Installed tkt\'s OpenCode plugin (tkt\'s own file under ~/.config/opencode).',
      'Committed to main and pushed (abc1234).',
    ])
    expect(mc.files[guidePath]).toContain('Kind: Linear'); expect(mc.files[guidePath]).toContain('team-scr')
    expect(mc.files[`${root}/docs/agents/forge.md`]).toContain('- Repository: infinitedusky/scratch\n- Remote: origin\n')
    expect(mc.files[`${root}/docs/agents/workflow.md`]).toContain('| Full check | npm run test |'); expect(mc.files[`${root}/docs/agents/workflow.md`]).toContain('one test: `npx vitest run <file>`')
    expect(mc.files[`${root}/CLAUDE.md`]).toContain('## Ticket lifecycle'); expect(mc.files[`${root}/CLAUDE.md`]).toContain('`forge.md` (GitHub, infinitedusky/scratch)')
    for (const t of Object.values(mc.files)) expect(t).not.toContain('{{FILL')
    const commit = mc.cmds.findIndex((c) => c.startsWith('git commit'))
    expect(mc.cmds[commit - 1]).toBe(`git add -- ${GUIDE_PATH} docs/agents/forge.md docs/agents/workflow.md docs/agents/domain.md docs/agents/pull-request.md CLAUDE.md .claude/settings.json`)
    expect(mc.cmds[commit]).toContain('Set up the ticket lifecycle for tkt scratch (SCR)'); expect(mc.cmds).toContain('git push origin main')
    expect(mc.cmds.filter((c) => c === 'tkt doctor')).toHaveLength(2) // once to see what is missing, once as the check
  })

  it('does not fight the person: a file without the ownership line stays, an old block is replaced in place, and a checkout off main is not committed', async () => {
    const mine = '<!-- rogs-skills config v1: workflow -->\n# Workflow\n\nHand-written.\n'
    const mc = machine({ files: { [guidePath]: goodGuide, [`${root}/docs/agents/workflow.md`]: mine, [`${root}/CLAUDE.md`]: `# Scratch\n\n<!-- rogs-skills:begin config v1 -->\nold\n<!-- rogs-skills:end -->\n` }, branch: 'feature', doctor })
    const r = await setupTkt(ctx, mc)
    expect(mc.files[`${root}/docs/agents/workflow.md`]).toBe(mine)
    expect(mc.files[`${root}/CLAUDE.md`]).toMatch(/^# Scratch\n\n<!-- rogs-skills:begin config v1 -->\n## Ticket lifecycle/); expect(mc.files[`${root}/CLAUDE.md`]).not.toContain('\nold\n')
    expect(r.did).toContain('Left docs/agents/workflow.md alone: it isn\'t Self Evident\'s (no "Self Evident wrote it" line).')
    expect(r.did.at(-1)).toMatch(/^Written in the checkout, which is on feature, not main: it needs to land on main/)
    expect(mc.cmds.some((c) => c.startsWith('git commit') || c.startsWith('git push'))).toBe(false)
    expect(r.done).toBe(true) // the files are there, so doctor passes; landing them on main is the one thing left
  })

  it('says when the push is refused, and when there is nothing new to commit', async () => {
    const refused = machine({ doctor, pushFails: true })
    expect((await setupTkt(ctx, refused)).did.at(-1)).toBe('Committed abc1234 on main; the push to origin was refused: remote: protected branch hook declined. Push it for worktrees cut from origin to have it.')
    const again = machine({ files: { ...refused.m.files }, doctor })
    again.m.hooks = true; again.m.plugin = true
    const r = await setupTkt(ctx, again)
    expect(r.did).toEqual(['Nothing new to commit: main has it already.']); expect(r.done).toBe(true)
  })

  it('skips the forge without a remote and says so; the rest is still written', async () => {
    const mc = machine({ remote: null })
    const r = await setupTkt(ctx, mc)
    expect(mc.files[`${root}/docs/agents/forge.md`]).toBeUndefined(); expect(mc.files[`${root}/docs/agents/workflow.md`]).toBeDefined()
    expect(r.did).toContain('Skipped docs/agents/forge.md: the checkout has no git remote, and tkt opens pull requests on a forge; push the repo to GitHub first.')
  })

  it('hands tkt itself to the agent when it is missing, after writing what it can', async () => {
    const mc = machine({ tkt: false })
    const r = await setupTkt(ctx, mc)
    expect(r.done).toBe(false)
    expect(r.did[0]).toBe(`Wrote ${GUIDE_PATH}, pointing at SCR in Linear. The agents reach Linear through the MCP server \`linear\`: sign in to it once in the harness (/mcp in Claude Code).`); expect(r.did[1]).toMatch(/^Wrote docs\/agents\/forge\.md/)
    expect(r.ask).toContain("says: tkt isn't on the engine's PATH"); expect(r.ask).toContain('install.sh'); expect(r.ask).toContain('each following its own hint.')
    expect(r.ask).toContain('Self Evident has written the agent docs already')
    expect(mc.cmds.some((c) => c.startsWith('tkt hook'))).toBe(false)
  })

  it("hands tkt doctor's findings to the agent with their hints, leaving the pane and pi warnings out", async () => {
    const out = 'ok    git    git version 2.50\nfail  herdr            herdr is not installed\n                       hint: brew install herdr\nwarn  pi               this tkt has no bundled pi\n                       hint: install a release build of tkt (install.sh)\nwarn  herdr_env        not in a herdr pane\n                       hint: tkt watch --install\nskip  services         no services\n                       hint: none\n'
    const mc = machine({ files: { [guidePath]: goodGuide }, doctor: () => out })
    const r = await setupTkt(ctx, mc)
    expect(r.done).toBe(false)
    expect(r.ask).toContain('    fail herdr: herdr is not installed (hint: brew install herdr)\n')
    expect(r.ask).not.toContain('pi:'); expect(r.ask).not.toContain('herdr_env'); expect(r.ask).not.toContain('tkt watch'); expect(r.ask).toContain('today:')
    expect(r.ask).toContain('Finish when `tkt doctor` passes there')
  })

  it('stops at a missing checkout: nothing to write, nothing for the agent', async () => {
    const r = await setupTkt({ ...ctx, repoPath: null }, { run: fakeTkt(), read: files({}), write: async () => { throw new Error('must not write') } })
    expect(r).toMatchObject({ done: false, did: [], ask: null }); expect(r.detail).toMatch(/Settings › Repo/)
  })

  it('is reached through the integration, which refuses it off or without an app', async () => {
    const mc = machine({ files: { [guidePath]: goodGuide }, doctor })
    expect((await setupIntegration('tkt', { on: 'false' }, {}, { tkt: { ctx, deps: mc } })).detail).toMatch(/off for this app/)
    expect((await setupIntegration('tkt', { on: 'true' }, {}, { tkt: { ctx, deps: mc } })).done).toBe(true)
    await expect(setupIntegration('tkt', { on: 'true' })).rejects.toThrow(/per app/)
    await expect(setupIntegration('linear', { team: 'X', key_env: 'K' }, { K: 'k' })).rejects.toThrow(/nothing to set up/)
  })
})
