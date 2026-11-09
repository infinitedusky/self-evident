/**
 * tkt as an integration switched on per app: the switch decides who a new task goes to, the check says in tkt's words
 * what is wrong and nothing else, and the tracker guide comes out filled for the app.
 */
import { describe, expect, it } from 'vitest'
import { checkIntegration, integrationStatus, INTEGRATIONS, statuses } from './integrations.js'
import { checkTkt, defaultDelegate, GUIDE_PATH, section, tktOn, trackerGuide, type Run, type TktContext } from './tkt.js'

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
