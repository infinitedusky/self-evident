/**
 * Linear as the home of an app's tickets: what is asked of Linear and how its answer becomes the tracker guide tkt's
 * skills read. Linear itself is a fake here (made-up team "Shop", key SHOP).
 */
import { describe, expect, it } from 'vitest'
import { linearFor, stateRoles, ticketKey, ticketUrl, trackerWords, type FetchLinear, type LinearHome } from './linear-home.js'
import { checkTkt, GUIDE_PATH, section, setupTkt, trackerGuide, type TktContext } from './tkt.js'

const states = [
  { name: 'Triage', type: 'triage' }, { name: 'Backlog', type: 'backlog' }, { name: 'Todo', type: 'unstarted' },
  { name: 'In Progress', type: 'started' }, { name: 'In Review', type: 'started' }, { name: 'Done', type: 'completed' },
  { name: 'Canceled', type: 'canceled' }, { name: 'Duplicate', type: 'canceled' },
]
const shop: LinearHome = { server: 'linear', workspace: 'Sample Co', slug: 'sample-co', team: { name: 'Shop', key: 'SHOP', id: 'team-uuid-1' }, states, automation: ['when a pull request opens, the issue moves to In Progress'] }
const ctx: TktContext = { app: { id: 'app_x1', key: 'SCR', name: 'tkt scratch' }, repoPath: '/code/scratch', engineUrl: 'http://localhost:4000/api', uiUrl: 'http://localhost:5180', linear: shop }
const fetchShop: FetchLinear = async (key, team) => { expect(key).toBe('k'); return team === 'SHOP' ? { workspace: shop.workspace, slug: shop.slug, team: shop.team, states, automation: [] } : null }

describe('finding the team', () => {
  it('reads it with the key Integrations › Linear names', async () => {
    expect(await linearFor({ team: 'shop', key_env: 'LINEAR_API_KEY' }, { LINEAR_API_KEY: 'k' }, fetchShop)).toEqual({ linear: { ...shop, automation: [] } })
  })
  it('says in words what is missing, and never guesses', async () => {
    const problem = async (...a: Parameters<typeof linearFor>) => ((await linearFor(...a)) as { trackerProblem: string }).trackerProblem
    expect(await problem({}, {}, fetchShop)).toMatch(/Linear isn't set for this app/)
    expect(await problem({ team: 'SHOP', key_env: 'LINEAR_API_KEY' }, {}, fetchShop)).toMatch(/LINEAR_API_KEY isn't set in the engine's environment/)
    expect(await problem({ team: 'NOPE', key_env: 'K' }, { K: 'k' }, fetchShop)).toMatch(/sees no team with key NOPE/)
    expect(await problem({ team: 'SHOP', key_env: 'K' }, { K: 'k' }, async () => { throw new Error('Authentication required\nmore') })).toBe('Linear refused the lookup of team SHOP: Authentication required')
  })
})

describe('the states', () => {
  it('takes each role from the team\'s own states, by their type', () => {
    expect(stateRoles(states)).toEqual({
      rows: [['new', 'Triage'], ['ready', 'Backlog and Todo'], ['in-progress', 'In Progress'], ['in-review', 'In Review'], ['done', 'Done'], ['canceled', 'Canceled'], ['blocked', 'none']],
      terminal: ['Done', 'Canceled', 'Duplicate'],
    })
  })
  it('makes do with a small team: no triage, one started state, a Blocked one', () => {
    const small = [{ name: 'Backlog', type: 'backlog' }, { name: 'Todo', type: 'unstarted' }, { name: 'Doing', type: 'started' }, { name: 'Blocked', type: 'started' }, { name: 'Shipped', type: 'completed' }, { name: 'Dropped', type: 'canceled' }]
    expect(stateRoles(small).rows).toEqual([['new', 'Backlog'], ['ready', 'Todo'], ['in-progress', 'Doing'], ['in-review', 'Doing'], ['done', 'Shipped'], ['canceled', 'Dropped'], ['blocked', 'Blocked']])
  })
})

describe('the words about a ticket', () => {
  it('use the team\'s key and Linear\'s address when the tickets live there, else the app\'s', () => {
    expect([ticketKey(ctx), ticketUrl(ctx, 'SHOP-12'), trackerWords(ctx)]).toEqual(['SHOP', 'https://linear.app/sample-co/issue/SHOP-12', 'Linear, the team Shop (SHOP)'])
    const here = { ...ctx, linear: undefined }
    expect([ticketKey(here), ticketUrl(here, 'SCR-12'), trackerWords(here)]).toEqual(['SCR', 'http://localhost:5180/tasks/SCR-12', 'Self Evident, the app tkt scratch (SCR)'])
  })
})

describe('the tracker guide, for Linear', () => {
  it('comes out filled for the team, with every section the skills check and no blank left', async () => {
    const g = await trackerGuide(ctx)
    expect(g.split('\n')[0]).toBe('<!-- rogs-skills config v1: issue-tracker -->')
    expect(g).not.toMatch(/\{\{FILL/)
    expect(g).not.toMatch(/Setup notes/)
    const t = section(g, 'Tracker')
    expect(t).toMatch(/- Kind: Linear/)
    expect(t).toMatch(/the MCP server `linear`/)
    expect(t).toMatch(/- Workspace: Sample Co, URL slug `sample-co`/)
    expect(t).toMatch(/- Team: Shop, key `SHOP`, id `team-uuid-1`/)
    expect(t).toContain('matched by `^SHOP-[1-9][0-9]*$`')
    expect(section(g, 'Operations')).toMatch(/### resolve[\s\S]*### load/)
    expect(section(g, 'States')).toMatch(/\| in-review \| In Review \|[\s\S]*Terminal states: Done, Canceled, Duplicate\.[\s\S]*Automation: when a pull request opens, the issue moves to In Progress\./)
    expect(section(g, 'Labels and priority')).toMatch(/\| P0 \| 1 \(Urgent\) \|/)
    expect(section(g, 'Ticket conventions')).toMatch(/New tickets are assigned to: nobody/)
  })
  it('says so when the automation could not be read', async () => {
    expect(section(await trackerGuide({ ...ctx, linear: { ...shop, automation: null } }), 'States')).toMatch(/Automation: not read from Linear/)
  })
})

describe('the check and the set-up, for Linear', () => {
  const tkt = async (file: string, args: string[]) => { if (file === 'tkt' && args[0] === '--version') return { stdout: 'tkt version v0.21.2\n', stderr: '' }; if (file === 'tkt' && args[0] === 'doctor') return { stdout: 'ok\n', stderr: '' }; throw new Error(`unexpected ${file} ${args.join(' ')}`) }
  const files = (map: Record<string, string>) => async (p: string) => { if (p in map) return map[p]; throw Object.assign(new Error(`ENOENT ${p}`), { code: 'ENOENT' }) }
  it('passes on a guide that names the team, and names what a guide for Self Evident or another team is', async () => {
    const at = `/code/scratch/${GUIDE_PATH}`
    const good = await trackerGuide(ctx)
    expect(await checkTkt(ctx, { run: tkt, read: files({ [at]: good }) })).toEqual({ ok: true, detail: 'tkt v0.21.2; doctor passes in /code/scratch; the tracker guide points at SHOP in Linear.' })
    expect((await checkTkt(ctx, { run: tkt, read: files({ [at]: await trackerGuide({ ...ctx, linear: undefined }) }) })).detail).toMatch(/points at another tracker \(Self Evident\), not Linear/)
    expect((await checkTkt(ctx, { run: tkt, read: files({ [at]: good.replace(/team-uuid-1/g, 'team-uuid-2') }) })).detail).toMatch(/names another Linear team, not SHOP \(Shop\)/)
  })
  it('stops, writing nothing, while Linear cannot be reached as set', async () => {
    const stuck: TktContext = { ...ctx, linear: undefined, trackerProblem: 'Tickets are set to live in Linear, but LINEAR_API_KEY isn\'t set in the engine\'s environment. Add it there and restart the engine.' }
    expect((await checkTkt(stuck, { run: tkt, read: files({}) })).detail).toBe(stuck.trackerProblem)
    const wrote: string[] = []
    const r = await setupTkt(stuck, { run: tkt, read: files({}), write: async (p) => { wrote.push(p) } })
    expect(r).toMatchObject({ done: false, ask: null })
    expect(r.detail).toMatch(/LINEAR_API_KEY isn't set[\s\S]*Nothing was written\./)
    expect(wrote).toEqual([])
  })
})
