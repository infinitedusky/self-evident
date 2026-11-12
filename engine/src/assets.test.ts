/** Assets: an app's and a project's, what may be saved, and what a conversation is told. Made-up names and links. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { addAsset, assetPrompt, assetsFor, listAssets, removeAsset, updateAsset } from './assets.js'
import { newId } from './ids.js'
import { createProject } from './projects.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('assets', () => {
  const wsId = newId('workspace'), appId = newId('app'), other = newId('app')
  let projectId = ''
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'assets test' })
    await db.insert(app).values([{ id: appId, workspaceId: wsId, name: 'Shop', key: `A${appId.slice(-5).toUpperCase()}` }, { id: other, workspaceId: wsId, name: 'Blog', key: `B${other.slice(-5).toUpperCase()}` }])
    projectId = (await createProject({ appId, name: 'checkout', issues: [{ title: 'Cart' }] })).project.id
  })
  afterAll(async () => { await pool.end() })

  it('keeps an app\'s and a project\'s apart, in the order added; a conversation about the project is told both', async () => {
    const designs = await addAsset({ appId, name: '  Designs ', location: 'https://example.com/design/shop', note: ' the whole app ' })
    await addAsset({ appId, name: 'Architecture', location: '/code/shop/docs/architecture.md' })
    const prd = await addAsset({ appId, projectId, name: 'Checkout PRD', location: 'https://example.com/docs/checkout', note: 'what it must do' })
    expect(designs).toMatchObject({ name: 'Designs', note: 'the whole app', projectId: null })
    expect((await listAssets(appId)).map((a) => a.name)).toEqual(['Designs', 'Architecture'])
    expect((await listAssets(appId, projectId)).map((a) => a.name)).toEqual(['Checkout PRD'])
    expect((await assetsFor(appId)).map((a) => a.name)).toEqual(['Designs', 'Architecture'])
    expect((await assetsFor(appId, projectId)).map((a) => a.name)).toEqual(['Designs', 'Architecture', 'Checkout PRD'])
    expect(await assetsFor(other)).toEqual([])
    expect(await assetsFor(null)).toEqual([])

    const said = assetPrompt(await assetsFor(appId, projectId))
    expect(said).toContain("The app's:\n- Designs: https://example.com/design/shop (the whole app)\n- Architecture: /code/shop/docs/architecture.md")
    expect(said).toContain("This project's:\n- Checkout PRD: https://example.com/docs/checkout (what it must do)")
    expect(assetPrompt([])).toBe('')

    expect(await updateAsset(prd.id, { note: '' })).toMatchObject({ name: 'Checkout PRD', note: null })
    expect(await removeAsset(designs.id)).toEqual({ removed: designs.id })
    expect((await listAssets(appId)).map((a) => a.name)).toEqual(['Architecture'])
  })

  it('refuses one with no name or no place, a project of another app, and one that isn\'t there', async () => {
    await expect(addAsset({ appId, name: ' ', location: 'https://example.com' })).rejects.toThrow('needs a name')
    await expect(addAsset({ appId, name: 'Designs' })).rejects.toThrow('a link or a path')
    await expect(addAsset({ appId: other, projectId, name: 'x', location: 'y' })).rejects.toThrow('no project')
    await expect(updateAsset('asset_gone', { name: 'x' })).rejects.toThrow('no asset')
    await expect(removeAsset('asset_gone')).rejects.toThrow('no asset')
  })
})
