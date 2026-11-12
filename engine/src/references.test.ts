/** Reference apps: what may be saved, what an agent is told, which files are refused, and which references are here to read. */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, repo, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { cleanReferences, referenceHolding, referencePrompt, referencesOf, refusal, type Reference } from './references.js'

const backend: Reference = { appId: 'app_b', name: 'Shop API', path: '/code/shop-api', note: 'the backend this app calls' }

describe('reference apps', () => {
  it('keeps other apps, each once, never the app itself, with a trimmed note', () => {
    expect(cleanReferences([{ appId: 'app_b', note: '  the backend  ' }, { appId: 'app_b' }, { appId: 'app_a' }, { appId: 'app_c', note: '' }, null, { note: 'no app' }], 'app_a'))
      .toEqual([{ appId: 'app_b', note: 'the backend' }, { appId: 'app_c' }])
    expect(cleanReferences('nonsense', 'app_a')).toEqual([])
  })

  it('tells the agent where each one is and that it is read, never changed; says nothing when there are none', () => {
    expect(referencePrompt([])).toBe('')
    const said = referencePrompt([backend, { ...backend, name: 'Design tokens', path: '/code/tokens', note: null }])
    expect(said).toContain('never change it')
    expect(said).toContain('- Shop API: /code/shop-api (the backend this app calls)')
    expect(said).toContain('- Design tokens: /code/tokens')
  })

  it('finds the reference a file is in, by full path or from the agent\'s folder, and not a folder that only starts the same', () => {
    const cwd = '/code/shop-web-worktrees/talk-a'
    expect(referenceHolding([backend], cwd, '/code/shop-api/src/orders.ts')).toBe(backend)
    expect(referenceHolding([backend], cwd, '../../shop-api/README.md')).toBe(backend)
    expect(referenceHolding([backend], cwd, '/code/shop-api')).toBe(backend)
    expect(referenceHolding([backend], cwd, '/code/shop-api-v2/src/orders.ts')).toBeNull()
    expect(referenceHolding([backend], cwd, 'src/cart.ts')).toBeNull()
    expect(referenceHolding([backend], cwd, undefined)).toBeNull()
    expect(refusal(backend)).toBe('Shop API is a reference: read it, never change it. A change there is a task for Shop API.')
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('an app\'s references on this computer', () => {
  const wsId = newId('workspace'), web = newId('app'), api = newId('app'), gone = newId('app')
  let apiPath = ''
  beforeAll(async () => {
    apiPath = await mkdtemp(join(tmpdir(), 'se-ref-'))
    await db.insert(workspace).values({ id: wsId, name: 'references test' })
    await db.insert(app).values([
      { id: api, workspaceId: wsId, name: 'Shop API', key: api.slice(-6).toUpperCase() },
      { id: gone, workspaceId: wsId, name: 'Not cloned here', key: gone.slice(-6).toUpperCase() },
      { id: web, workspaceId: wsId, name: 'Shop Web', key: web.slice(-6).toUpperCase(), setup: { references: [{ appId: api, note: 'the backend' }, { appId: gone }, { appId: 'app_deleted' }] } },
    ])
    await db.insert(repo).values([{ id: newId('repo'), appId: api, fullName: 'made-up/shop-api', localPath: apiPath }, { id: newId('repo'), appId: gone, fullName: 'made-up/gone', localPath: join(apiPath, 'not-here') }])
  })
  afterAll(async () => { await pool.end() })

  it('are the ones whose checkout is here; an app without one, or deleted, is left out', async () => {
    expect(await referencesOf(web)).toEqual([{ appId: api, name: 'Shop API', path: apiPath, note: 'the backend' }])
    expect(await referencesOf(api)).toEqual([])
    expect(await referencesOf(null)).toEqual([])
  })
})
