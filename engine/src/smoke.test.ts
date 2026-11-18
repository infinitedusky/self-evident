/** The smoke test: the app's setting, the checks a person has from a task's criteria, and their marks. Pure, with one stored test of marking. */
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyAcceptance, setAcceptance, type Criterion } from './acceptance.js'
import { stagesOf } from './checklist.js'
import { db, pool } from './db/client.js'
import { app, event, issue, pr as prTable, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createProject } from './projects.js'
import { oneGoBrief } from './planner.js'
import { byHand, markSmoke, previewUrl, runStop, setSmokeSetup, smokeChecks, smokeEnv, smokeOwed, smokeReady, smokeSetup, smokeSetupOf, smokeSetups, smokeView, startSmoke, whenOf, forPerson } from './smoke.js'
import { checkTaskBrief, readVerdicts, verdictChange } from './verify.js'

const at = '2026-11-17T00:00:00.000Z'
const criteria: Criterion[] = [
  { id: 'ac_1', text: 'The file has every order (sample)', check: 'export.test.ts', built: true, builtEvidence: 'export.test.ts passes', by: 'engine', at },
  { id: 'ac_2', text: 'The tunnel reads as a tunnel (sample)', check: 'look at the Tunnel story', by: 'user', at },
  { id: 'ac_3', text: 'Portals keep 40 frames a second (sample)', by: 'user', at },
]

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe('where an app is smoke tested', () => {
  it('is local unless it says otherwise, and keeps only what it knows', () => {
    expect(smokeSetup({})).toEqual({ where: 'local' }); expect(smokeSetup(null)).toEqual({ where: 'local' })
    expect(smokeSetup({ smoke: { where: 'staging', url: ' https://staging.example.test ', account: 'the test parent (sample)', password: 'never kept' } })).toEqual({ where: 'staging', url: 'https://staging.example.test', account: 'the test parent (sample)' })
    expect(smokeSetup({ smoke: { where: 'flag', flag: 'new-checkout (sample)', url: 'https://app.example.test' } })).toMatchObject({ where: 'flag', flag: 'new-checkout (sample)' })
    expect(smokeSetup({ smoke: { where: 'the moon' } })).toEqual({ where: 'local' })
    // A preview per pull request: the app gives the pattern, and each pull request's number goes in it.
    expect(smokeSetup({ smoke: { where: 'preview', url: 'https://pkg.pr.new/sample@{pr}' } })).toEqual({ where: 'preview', url: 'https://pkg.pr.new/sample@{pr}' })
    expect(previewUrl('https://pkg.pr.new/sample@{pr}', 12)).toBe('https://pkg.pr.new/sample@12')
    expect(previewUrl('https://pr-{pr}.sample.test/app/{pr}', 7)).toBe('https://pr-7.sample.test/app/7')
    expect(previewUrl('https://pkg.pr.new/sample@{pr}', null)).toBeNull(); expect(previewUrl(undefined, 12)).toBeNull() // no pull request yet, or no pattern: nowhere to send them
  })
})

describe('the checks a person has', () => {
  it('are the criteria the check left to them, with where to go and what to look for', () => {
    expect(checkTaskBrief(criteria)).toContain('add "where", the path of the app or the story\'s id to open')
    const v = readVerdicts('```acceptance\n[{"id":"ac_2","met":null,"where":"edges-tunnel--default","evidence":"Open the story: the edge should dip under the lip, not sit on top of it"},{"id":"ac_3","met":null,"evidence":"needs a person: watch the fps counter with portals on"},{"id":"ac_1","met":true,"where":"/ignored","evidence":"export.test.ts"}]\n```', criteria.map((c) => c.id))
    expect(v.map((x) => x.where)).toEqual(['edges-tunnel--default', undefined, undefined]) // only one left to a person says where
    const { list } = applyAcceptance(criteria, verdictChange(v), 'engine')
    expect(list.map(byHand)).toEqual([false, true, true])
    expect(smokeChecks(list)).toEqual([
      { id: 'ac_2', text: 'The tunnel reads as a tunnel (sample)', when: 'here', where: 'edges-tunnel--default', how: 'Open the story: the edge should dip under the lip, not sit on top of it', mark: 'todo' },
      { id: 'ac_3', text: 'Portals keep 40 frames a second (sample)', when: 'here', how: 'watch the fps counter with portals on', mark: 'todo' },
    ])
    expect(smokeOwed(list)).toBe(2); expect(smokeOwed(criteria)).toBe(0) // nothing is theirs until the check says so
  })
  it('on a staged task, with no check after the build, are every criterion no agent marked, with how we will know as what to look for', () => {
    const at = '2026-11-17T00:00:00.000Z'
    const list = [
      { id: 'ac_1', text: 'The page loads (sample)', check: 'open /employees', by: 'agent', at },
      { id: 'ac_2', text: 'An agent checked this one (sample)', built: true, builtEvidence: 'employees.test.ts passes', by: 'agent', at },
      { id: 'ac_3', text: 'The person passed this one (sample)', built: true, builtEvidence: 'looked right', byHand: { pass: true, note: 'looked right', sha: 'abc', at, by: 'user' }, by: 'agent', at },
    ] as Parameters<typeof smokeChecks>[0]
    expect(smokeChecks(list)).toMatchObject([{ id: 'ac_3', mark: 'pass' }]) // a checklist task: only what was left to them
    expect(smokeChecks(list, null, true)).toMatchObject([{ id: 'ac_1', mark: 'todo', how: 'open /employees' }, { id: 'ac_3', mark: 'pass' }])
    expect(forPerson(list[1], true)).toBe(false) // an agent's mark is not theirs to overwrite from here
  })

  it('each says when it can be done: here, on the pull request, or after the merge; only the first two hold the task', () => {
    expect(checkTaskBrief(criteria)).toContain('"pr" if it needs the pull request to exist')
    const v = readVerdicts('```acceptance\n[{"id":"ac_1","met":null,"when":"here","where":"/export","evidence":"open it"},{"id":"ac_2","met":null,"when":"pr","evidence":"the bot\'s comment has an install line that works"},{"id":"ac_3","met":null,"when":"after","evidence":"the release notes name it"}]\n```', criteria.map((c) => c.id))
    expect(v.map((x) => x.when)).toEqual(['here', 'pr', 'after'])
    const { list } = applyAcceptance(criteria.map(({ built: _b, builtEvidence: _e, ...c }) => c), verdictChange(v), 'engine')
    expect(smokeChecks(list).map((c) => c.when)).toEqual(['here', 'pr', 'after'])
    expect(smokeOwed(list)).toBe(2) // the one for after the merge holds nothing
    expect([smokeReady(list, false), smokeReady(list, true)]).toEqual([1, 2]) // the one on the pull request waits for there to be one
    // One written before checks said when: read from its own words.
    const old: Criterion = { id: 'ac_9', text: 'The preview comment works (sample)', builtEvidence: 'needs a person: try the install line', builtWhere: 'the first pull request on GitHub (sample)', by: 'engine', at }
    expect(whenOf(old)).toBe('pr'); expect(whenOf({ ...old, builtWhere: 'edges-tunnel--default' })).toBe('here'); expect(whenOf({ ...old, builtWhen: 'after' })).toBe('after')
  })
  it('a mark is theirs, with their note; it is stale once the code has moved; and it comes back to them after a fix', () => {
    const left = applyAcceptance(criteria, { update: [{ id: 'ac_2', built: null, builtEvidence: 'for a person: open the Tunnel story', builtWhere: 'edges-tunnel--default' }, { id: 'ac_3', built: null, builtEvidence: 'watch the counter' }] }, 'engine').list
    const marked = applyAcceptance(left, { update: [{ id: 'ac_2', built: true, builtEvidence: 'trough visible, lip outline faint', byHand: { pass: true, note: 'trough visible, lip outline faint', sha: 'aaa111', at, by: 'user' } }, { id: 'ac_3', built: false, builtEvidence: 'portal 22 fps vs 45 none', byHand: { pass: false, note: 'portal 22 fps vs 45 none', sha: 'aaa111', at, by: 'user' } }] }, 'user').list
    expect(smokeChecks(marked, 'aaa111').map((c) => [c.id, c.mark, c.note, c.stale])).toEqual([['ac_2', 'pass', 'trough visible, lip outline faint', undefined], ['ac_3', 'fail', 'portal 22 fps vs 45 none', undefined]])
    expect(smokeChecks(marked, 'bbb222').map((c) => c.stale)).toEqual([true, true]) // the branch moved on: marked on an earlier commit
    expect(smokeOwed(marked)).toBe(0)
    // Fixed and checked again: the agent leaves it to the person once more, and what they said last time is beside it.
    const again = applyAcceptance(marked, { update: [{ id: 'ac_3', built: null, builtEvidence: 'watch the counter again: portals now batch their draws' }] }, 'engine').list
    expect(smokeChecks(again).find((c) => c.id === 'ac_3')).toMatchObject({ mark: 'todo', how: 'watch the counter again: portals now batch their draws', before: { pass: false, note: 'portal 22 fps vs 45 none' } })
    expect(smokeOwed(again)).toBe(1)
  })
  it('is a stage of the task once there is one: theirs when nothing is building, done when each is marked, failed when one was', () => {
    const subs = [{ title: 'Build it', status: 'done' }, { title: 'Check it against its acceptance criteria', status: 'done' }, { title: 'Try to break it, and clean up', status: 'done' }]
    const stage = (byHandCount: { todo: number; failed: number; total: number }, s = subs) => stagesOf({ subs: s, build: 'one', unmet: 0, met: 3, total: 5, hasTests: false, tested: null, byHand: byHandCount }).find((x) => x.key === 'smoke')
    expect(stage({ todo: 0, failed: 0, total: 0 })).toBeUndefined() // nothing for a person: no such stage
    expect(stage({ todo: 2, failed: 0, total: 2 })).toMatchObject({ state: 'doing', detail: '2 for you to check by hand' })
    expect(stage({ todo: 2, failed: 0, total: 2 }, [...subs.slice(0, 2), { title: 'Try to break it, and clean up', status: 'running' }])).toMatchObject({ state: 'todo', detail: '2 for you, once it is built and checked' })
    expect(stage({ todo: 0, failed: 1, total: 2 })).toMatchObject({ state: 'failed', detail: '1 failed by hand, sent back' })
    expect(stage({ todo: 0, failed: 0, total: 2 })).toMatchObject({ state: 'done', detail: '2 checked by hand' })
  })
})

describe('how an app is brought up for one', () => {
  const script = 'docker compose -p smoke-$PORT up -d db\npnpm install && pnpm dev --port $PORT'
  it('is a script, a stop script and a seed of Self Evident\'s own, kept whole in the app\'s settings', () => {
    expect(smokeSetup({ smoke: { cmd: `${script}\n`, stop: ' docker compose -p smoke-$PORT down -v ', seed: 'insert into parent (id) values (1);' } }))
      .toEqual({ where: 'local', cmd: script, stop: 'docker compose -p smoke-$PORT down -v', seed: 'insert into parent (id) values (1);' })
  })
  it('an app can have several, each with a name; one that lists none has the one it always had', () => {
    expect(smokeSetups({})).toEqual([{ key: 'main', name: 'Smoke test', where: 'local' }])
    expect(smokeSetups({ smoke: { where: 'staging', url: 'https://staging.example.test' } })).toEqual([{ key: 'main', name: 'Smoke test', where: 'staging', url: 'https://staging.example.test' }])
    const two = { smoke: { where: 'staging', setups: [{ name: 'Docs site (sample)', what: ' the documentation (sample) ', cmd: 'pnpm docs:dev' }, { key: 'playground', name: 'Playground (sample)', cmd: script, stop: 'x' }, { name: 'Docs site (sample)' }, { name: '' }, null] } }
    expect(smokeSetups(two)).toEqual([
      { key: 'docs-site-sample', name: 'Docs site (sample)', what: 'the documentation (sample)', where: 'local', cmd: 'pnpm docs:dev' },
      { key: 'playground', name: 'Playground (sample)', where: 'local', cmd: script, stop: 'x' },
    ]) // a second of the same name, one with no name and the settings from before the list are not set-ups
    expect(smokeSetup(two, 'playground')).toEqual({ where: 'local', cmd: script, stop: 'x' })
    expect(smokeSetup(two, 'nope')).toEqual({ where: 'local', cmd: 'pnpm docs:dev' }) // one it does not have: its first
  })
  it('the check is told the set-ups when there is more than one, and says which each check needs', () => {
    const list = [{ key: 'docs', name: 'Docs site (sample)', what: 'the documentation (sample)' }, { key: 'playground', name: 'Playground (sample)' }]
    expect(checkTaskBrief(criteria, [], undefined, list)).toContain('add "setup": the key of the one they need. Give items that need the same thing the same one, so it is brought up once. They are: "docs" (Docs site (sample): the documentation (sample)); "playground" (Playground (sample)).')
    expect(checkTaskBrief(criteria, [], undefined, list.slice(0, 1))).not.toContain('"setup"') // one set-up: nothing to choose
    const v = readVerdicts('```acceptance\n[{"id":"ac_1","met":true,"setup":"docs","evidence":"ran it"},{"id":"ac_2","met":null,"setup":"playground","evidence":"drag a node"},{"id":"ac_3","met":null,"evidence":"watch the counter"}]\n```', criteria.map((c) => c.id))
    expect(v.map((x) => x.setup)).toEqual([undefined, 'playground', undefined]) // only one left to a person has one
    const { list: after } = applyAcceptance(criteria.map(({ built: _b, builtEvidence: _e, ...c }) => c), verdictChange(v), 'engine')
    expect(smokeChecks(after).map((c) => [c.id, c.setup])).toEqual([['ac_2', 'playground'], ['ac_3', undefined]])
  })
  it('the seed is put in a file outside every repository when it runs, and the script is told where; none, and the file is gone', async () => {
    const home = await mkdtemp(join(tmpdir(), 'smoke-home-'))
    process.env.SMOKE_HOME = home
    try {
      const env = await smokeEnv('app_sample', { where: 'local', seed: 'insert into parent (id) values (1);' }, { port: 6511, db: { DATABASE_URL: 'postgres://sample.test/smoke' }, clean: true })
      expect(env).toEqual({ DATABASE_URL: 'postgres://sample.test/smoke', PORT: '6511', BROWSER: 'none', CI: '1', SMOKE_SEED: join(home, 'app_sample', 'seed.sql'), SMOKE_CLEAN: '1' })
      expect(await readFile(env.SMOKE_SEED!, 'utf8')).toBe('insert into parent (id) values (1);\n')
      const bare = await smokeEnv('app_sample', { where: 'local' }, { port: 6511 })
      expect(bare).toEqual({ PORT: '6511', BROWSER: 'none', CI: '1' })
      expect(existsSync(join(home, 'app_sample', 'seed.sql'))).toBe(false)
      // The stop script runs where the start one did, with what it had; one that fails is not an error.
      expect((await smokeEnv('app_sample', { where: 'local', seed: 'select 1;' }, { port: 6512, key: 'playground' })).SMOKE_SEED).toBe(join(home, 'app_sample', 'seed-playground.sql')) // a seed per set-up
      expect(await runStop('echo "down $PORT"; exit 3', home, { PORT: '6511' })).toEqual(['down 6511'])
      expect(await runStop('echo never', join(home, 'gone'), {})).toEqual([]) // its checkout was removed: nothing to run it in
    } finally { delete process.env.SMOKE_HOME; await rm(home, { recursive: true, force: true }) }
  })
  it('a build is told the set-up is not the repository\'s, and to change it here', () => {
    const brief = oneGoBrief({ criteria: [], required: [], prototype: null, base: 'main' })
    expect(brief).toContain('set_smoke_setup')
    expect(brief).toContain('Never add smoke test scripts, seed data or test environment files to the branch')
  })
})

describe.skipIf(!reachable)('a person marks a check', () => {
  const wsId = newId('workspace'), appId = newId('app')
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'smoke test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop (sample)', key: appId.slice(-6).toUpperCase(), setup: { smoke: { where: 'staging', url: 'https://staging.example.test', account: 'the test parent (sample)' } } })
  })
  afterAll(async () => { await pool.end() })

  it('an agent reads the set-up and changes only what it gives; empty clears; too long is refused', async () => {
    const own = newId('app')
    await db.insert(app).values({ id: own, workspaceId: wsId, name: 'Set-up (sample)', key: own.slice(-6).toUpperCase(), setup: { prototype_cmd: 'pnpm dev --port $PORT', smoke: { where: 'local', account: 'the test parent (sample)' } } })
    expect(await smokeSetupOf(own)).toEqual({ setups: [{ key: 'main', name: 'Smoke test', what: null, where: 'local', url: null, script: null, stop: null, seed: null, falls_back_to: 'pnpm dev --port $PORT' }], database: false })
    expect(await setSmokeSetup(own, { script: 'pnpm install\npnpm dev --port $PORT', seed: 'insert into parent (id) values (1);' })).toMatchObject({ setups: [{ key: 'main', script: 'pnpm install\npnpm dev --port $PORT', stop: null, seed: 'insert into parent (id) values (1);', falls_back_to: null }] })
    expect(await setSmokeSetup(own, { stop: 'docker compose down', seed: '' })).toMatchObject({ setups: [{ script: 'pnpm install\npnpm dev --port $PORT', stop: 'docker compose down', seed: null }] })
    const [a] = await db.select().from(app).where(eq(app.id, own))
    expect(a.setup).toMatchObject({ prototype_cmd: 'pnpm dev --port $PORT', smoke: { where: 'local', account: 'the test parent (sample)', cmd: 'pnpm install\npnpm dev --port $PORT', stop: 'docker compose down' } }) // the rest of its settings as they were
    await expect(setSmokeSetup(own, { script: 'x'.repeat(20_001) })).rejects.toThrow(/20000 characters at most/)
    // What is checked there, on the one set-up an app always had: it is kept and comes back (it was written and never read, 2026-11-17).
    expect((await setSmokeSetup(own, { what: 'The dashboard, signed in as the test admin (sample)' })).setups[0]).toMatchObject({ key: 'main', name: 'Smoke test', what: 'The dashboard, signed in as the test admin (sample)', script: 'pnpm install\npnpm dev --port $PORT' })
    expect((await smokeSetupOf(own)).setups[0].what).toBe('The dashboard, signed in as the test admin (sample)')
    // A second set-up: it needs a name; the one the app had becomes the first of a list, as it was.
    await expect(setSmokeSetup(own, { setup: 'docs', script: 'pnpm docs:dev --port $PORT' })).rejects.toThrow(/no set-up "docs" \(main\): give a name to add it/)
    const two = await setSmokeSetup(own, { setup: 'Docs site', name: 'Docs site (sample)', what: 'the documentation, to see it is accurate (sample)', script: 'pnpm docs:dev --port $PORT' })
    expect(two.setups.map((x) => [x.key, x.name, x.script])).toEqual([['main', 'Smoke test', 'pnpm install\npnpm dev --port $PORT'], ['docs-site', 'Docs site (sample)', 'pnpm docs:dev --port $PORT']])
    expect((await setSmokeSetup(own, { setup: 'docs-site', stop: 'pkill -f docs' })).setups[1]).toMatchObject({ script: 'pnpm docs:dev --port $PORT', stop: 'pkill -f docs' })
    const [b] = await db.select().from(app).where(eq(app.id, own))
    expect(smokeSetup(b.setup, 'docs-site')).toEqual({ where: 'local', cmd: 'pnpm docs:dev --port $PORT', stop: 'pkill -f docs' })
    expect(smokeSetup(b.setup)).toMatchObject({ account: 'the test parent (sample)', stop: 'docker compose down' }) // the first, as before
    // A task's view has both; a check goes to the one it named, and to the first when it named none or one that is gone.
    const { issues: [t] } = await createProject({ appId: own, name: 'Two set-ups (sample)', issues: [{ title: 'Edges (sample)', brief: 'Build it.' }] })
    const { acceptance } = await setAcceptance(t.id, { add: [{ text: 'The docs name the new prop (sample)' }, { text: 'The tunnel reads as a tunnel (sample)' }, { text: 'Portals keep 40 frames a second (sample)' }] })
    await setAcceptance(t.id, { update: [{ id: acceptance[0].id, built: null, builtEvidence: 'open the Edges page', builtSetup: 'docs-site' }, { id: acceptance[1].id, built: null, builtEvidence: 'drag a node', builtSetup: 'gone' }, { id: acceptance[2].id, built: null, builtEvidence: 'watch the counter' }] }, 'engine')
    const view = await smokeView(t.id)
    expect(view.setups.map((x) => [x.key, x.name, x.canRun, x.owed])).toEqual([['main', 'Smoke test', true, 2], ['docs-site', 'Docs site (sample)', true, 1]])
    expect(view.checks.map((c) => c.setup)).toEqual(['docs-site', 'main', 'main'])
    expect(view).toMatchObject({ where: 'local', canRun: true, owed: 3 }) // the first set-up's, where the view had one
    await expect(startSmoke(t.id, 'user', { setup: 'nope' })).rejects.toThrow(/no smoke test set-up "nope" \(main, docs-site\)/)
  })

  it('their word is the build\'s mark on that criterion, with the note; a fail needs one; what is not theirs is refused', async () => {
    const { issues: [t] } = await createProject({ appId, name: 'Smoke (sample)', issues: [{ title: 'Edges (sample)', brief: 'Build it.' }] })
    const { acceptance } = await setAcceptance(t.id, { add: criteria.map((c) => ({ text: c.text, check: c.check })) })
    const [done, look, speed] = acceptance.map((c) => c.id)
    await setAcceptance(t.id, { update: [{ id: done, built: true, builtEvidence: 'export.test.ts' }, { id: look, built: null, builtEvidence: 'open the Tunnel story', builtWhere: 'edges-tunnel--default' }, { id: speed, built: null, builtEvidence: 'watch the counter' }] }, 'engine')
    const view = await smokeView(t.id)
    expect(view).toMatchObject({ where: 'staging', url: 'https://staging.example.test', account: 'the test parent (sample)', owed: 2, failed: 0, canRun: false, up: true })
    await expect(startSmoke(t.id)).rejects.toThrow(/smoke tested on staging: there is nothing to start here/)
    await expect(markSmoke(t.id, done, { pass: true })).rejects.toThrow(/not one for a person/)
    await expect(markSmoke(t.id, speed, { pass: false })).rejects.toThrow(/say what you saw/)
    // The same app tried on a preview of each pull request: nowhere to go until there is one, then that one's address.
    const [was] = await db.select().from(app).where(eq(app.id, appId))
    await db.update(app).set({ setup: { smoke: { where: 'preview', url: 'https://pkg.pr.new/sample@{pr}' } } }).where(eq(app.id, appId))
    expect(await smokeView(t.id)).toMatchObject({ where: 'preview', url: null, up: false, pr: null })
    await db.insert(prTable).values({ id: newId('pr'), appId, projectId: t.projectId!, issueId: t.id, number: 12, url: 'https://github.test/sample/pull/12', status: 'open' })
    expect(await smokeView(t.id)).toMatchObject({ where: 'preview', url: 'https://pkg.pr.new/sample@12', up: true, pr: { number: 12 } })
    await db.update(app).set({ setup: was.setup }).where(eq(app.id, appId))
    const one = await markSmoke(t.id, look, { pass: true, note: 'trough visible, lip outline faint' })
    expect(one).toMatchObject({ owed: 1, failed: 0, marked: { id: look, pass: true } })
    const two = await markSmoke(t.id, speed, { pass: false, note: 'portal 22 fps vs 45 none' })
    expect(two.checks.map((c) => [c.mark, c.note])).toEqual([['pass', 'trough visible, lip outline faint'], ['fail', 'portal 22 fps vs 45 none']])
    const [after] = await db.select().from(issue).where(eq(issue.id, t.id))
    const stored = after.acceptance as Criterion[]
    expect(stored.find((c) => c.id === speed)).toMatchObject({ built: false, builtEvidence: 'portal 22 fps vs 45 none', byHand: { pass: false, by: 'user' }, by: 'user' })
    expect(after.briefApprovedBy ?? null).toBeNull()
    expect((await db.select().from(event).where(eq(event.issueId, t.id))).filter((e) => e.type === 'smoke.marked').sort((a, b) => a.seq - b.seq).map((e) => (e.payload as { pass: boolean }).pass)).toEqual([true, false])
  })
})
