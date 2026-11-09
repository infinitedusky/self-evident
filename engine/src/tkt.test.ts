/**
 * tkt as an integration switched on per app: the switch decides who a new task goes to, the check says in tkt's words
 * what is wrong and nothing else, and the tracker guide comes out filled for the app.
 */
import { describe, expect, it } from 'vitest'
import { checkIntegration, integrationStatus, INTEGRATIONS, setupIntegration, statuses } from './integrations.js'
import { checkTkt, defaultDelegate, GUIDE_PATH, section, setupTkt, tktOn, trackerGuide, type Run, type TktContext } from './tkt.js'

const tkt = INTEGRATIONS.find((i) => i.key === 'tkt')!
const ctx: TktContext = { app: { id: 'app_x1', key: 'SCR', name: 'tkt scratch' }, repoPath: '/code/scratch', engineUrl: 'http://localhost:4000/api', uiUrl: 'http://localhost:5180' }
const goodGuide = `<!-- rogs-skills config v1: issue-tracker -->\n# Issue tracker\n\n## Tracker\n\n- Kind: Self Evident\n- Scope: the app \`tkt scratch\`, id \`app_x1\`, key \`SCR\`.\n- Ticket ids: \`SCR-<number>\`\n`
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
    expect(r).toEqual({ ok: true, detail: 'tkt v0.21.0; doctor passes in /code/scratch; the tracker guide points at SCR here.' })
  })
  it('says tkt is missing, and where to get it, before anything else', async () => {
    const r = await checkTkt(ctx, { run: async () => { throw enoent() }, read: files({}) })
    expect(r.ok).toBe(false)
    expect(r.detail).toBe("tkt isn't on the engine's PATH. Get tkt working: https://gitlab.com/rogs/tkt")
  })
  it('wants a local checkout', async () => {
    expect((await checkTkt({ ...ctx, repoPath: null }, { run: fakeTkt(), read: files({}) })).detail).toMatch(/No local checkout under Repo/)
  })
  it('wants the tracker guide in the repo, pointing at Self Evident and at this app', async () => {
    const read = (guide?: string) => files(guide === undefined ? {} : { [`/code/scratch/${GUIDE_PATH}`]: guide })
    expect((await checkTkt(ctx, { run: fakeTkt(), read: read() })).detail).toBe(`${GUIDE_PATH} isn't in the repo. Copy the tracker guide below into it.`)
    expect((await checkTkt(ctx, { run: fakeTkt(), read: read('## Tracker\n- Kind: Linear\n- Team: SHOP') })).detail).toMatch(/points at another tracker \(Linear\), not Self Evident/)
    expect((await checkTkt(ctx, { run: fakeTkt(), read: read(goodGuide.replace('app_x1', 'app_other')) })).detail).toMatch(/names another app, not SCR \(app_x1\)/)
    expect((await checkTkt(ctx, { run: fakeTkt(), read: read(goodGuide.replace(/SCR/g, 'HG')) })).detail).toMatch(/names another app/)
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
    expect(g).toContain('`http://localhost:4000/api`')
    expect(g).toContain('`http://localhost:5180`')
    expect(g).toContain('the app `tkt scratch`, id `app_x1`, key `SCR`')
    expect(g).toContain('`SCR-<number>`, matched by `^SCR-[1-9][0-9]*$`')
    expect(g).toContain('Kind: Self Evident')
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
  /** A checkout's files, readable and writable, so what setup writes the check then sees. */
  const fakeFs = (map: Record<string, string>) => {
    const w: Record<string, string> = { ...map }
    return { w, read: async (p: string) => { if (p in w) return w[p]; throw Object.assign(new Error(`ENOENT ${p}`), { code: 'ENOENT' }) }, write: async (p: string, t: string) => { w[p] = t } }
  }
  const guidePath = `/code/scratch/${GUIDE_PATH}`

  it('writes the tracker guide when that is what is wrong, checks again, and is done', async () => {
    const fs = fakeFs({})
    const r = await setupTkt(ctx, { run: fakeTkt(), ...fs })
    expect(r.done).toBe(true); expect(r.ask).toBeNull()
    expect(r.did).toEqual([`Wrote ${GUIDE_PATH} in the checkout, pointing at SCR here; not committed, so look at it and commit it.`])
    expect(r.detail).toMatch(/doctor passes in \/code\/scratch/)
    expect(fs.w[guidePath]).toContain('Kind: Self Evident'); expect(fs.w[guidePath]).toContain('app_x1')
  })

  it('replaces a guide pointing elsewhere, and hands tkt itself to the agent when it is missing', async () => {
    const fs = fakeFs({ [guidePath]: '# Issue tracker\n\n## Tracker\n\n- Kind: Linear\n' })
    const r = await setupTkt(ctx, { run: async () => { throw enoent() }, ...fs })
    expect(r.done).toBe(false)
    expect(r.did[0]).toMatch(/^Wrote docs\/agents\/issue-tracker\.md in the checkout \(it pointed at another tracker\)/)
    expect(r.ask).toContain("says: tkt isn't on the engine's PATH")
    expect(r.ask).toContain('install.sh'); expect(r.ask).toContain('each following its own hint.')
    expect(fs.w[guidePath]).toContain('Kind: Self Evident')
  })

  it("hands tkt doctor's findings to the agent with their hints, leaving the pane warning out", async () => {
    const doctor = 'ok    git    git version 2.50\nfail  herdr            herdr is not installed\n                       hint: brew install herdr\nwarn  pi               this tkt has no bundled pi\n                       hint: install a release build of tkt (install.sh)\nwarn  herdr_env        not inside a herdr pane\n                       hint: open a herdr pane and run tkt there\nskip  services         tkt watch runs when a command starts it\n                       hint: tkt watch --install runs it as a service\nok    gh               gh version 2.92.0\n'
    const fs = fakeFs({ [guidePath]: goodGuide })
    const r = await setupTkt(ctx, { run: fakeTkt(doctor), ...fs })
    expect(r.did).toEqual([]); expect(r.done).toBe(false)
    expect(r.ask).toContain('    fail herdr: herdr is not installed (hint: brew install herdr)\n')
    expect(r.ask).toContain('    warn pi: this tkt has no bundled pi (hint: install a release build of tkt (install.sh))\n') // the pane's and the service's hints stay with their own lines, which are left out
    expect(r.ask).not.toContain('herdr_env'); expect(r.ask).not.toContain('tkt watch'); expect(r.ask).toContain('today:')
    expect(r.ask).toContain(`${ctx.engineUrl}/apps/app_x1/tracker-guide`)
  })

  it('stops at a missing checkout: nothing to write, nothing for the agent', async () => {
    const r = await setupTkt({ ...ctx, repoPath: null }, { run: fakeTkt(), read: files({}), write: async () => { throw new Error('must not write') } })
    expect(r).toMatchObject({ done: false, did: [], ask: null }); expect(r.detail).toMatch(/Settings › Repo/)
  })

  it('is reached through the integration, which refuses it off or without an app', async () => {
    const fs = fakeFs({ [guidePath]: goodGuide })
    expect((await setupIntegration('tkt', { on: 'false' }, {}, { tkt: { ctx, deps: { run: fakeTkt(), ...fs } } })).detail).toMatch(/off for this app/)
    expect((await setupIntegration('tkt', { on: 'true' }, {}, { tkt: { ctx, deps: { run: fakeTkt(), ...fs } } })).done).toBe(true)
    await expect(setupIntegration('tkt', { on: 'true' })).rejects.toThrow(/per app/)
    await expect(setupIntegration('linear', { team: 'X', key_env: 'K' }, { K: 'k' })).rejects.toThrow(/nothing to set up/)
  })
})
