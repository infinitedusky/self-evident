/** An app's docs site: what a workbench folder has of one, and what the Docs page is told. Everything here is made up. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { docsPort, docsSite, siteIn, startDocsSite } from './docs-site.js'
import { newId } from './ids.js'
import { frameUrl } from './storybook.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const bench = () => mkdtempSync(join(tmpdir(), 'bench-docs-'))

describe('a workbench folder\'s docs site', () => {
  it('is docs/.vitepress in the folder, run by the folder\'s own VitePress', () => {
    const dir = bench()
    try {
      expect(siteIn(null)).toEqual({ found: false, has: false, bin: null })
      expect(siteIn(join(dir, 'nowhere'))).toEqual({ found: false, has: false, bin: null })
      expect(siteIn(dir)).toEqual({ found: true, has: false, bin: null })
      mkdirSync(join(dir, 'docs', '.vitepress'), { recursive: true })
      expect(siteIn(dir)).toEqual({ found: true, has: true, bin: null }) // a site, with nothing installed to run it
      mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true }); writeFileSync(join(dir, 'node_modules', '.bin', 'vitepress'), '')
      expect(siteIn(dir).bin).toBe(join(dir, 'node_modules', '.bin', 'vitepress'))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('has a port of its folder\'s own, the same every time, clear of the Storybooks\'', () => {
    expect(docsPort('/a/bench')).toBe(docsPort('/a/bench'))
    for (const d of ['/a/bench', '/another/one', '/x']) { expect(docsPort(d)).toBeGreaterThanOrEqual(6900); expect(docsPort(d)).toBeLessThan(6990) }
  })
})

describe.skipIf(!reachable)('what the Docs page is told', () => {
  const wsId = newId('workspace')
  const dirs: string[] = []
  const anApp = async (dir: string | null) => {
    const id = newId('app')
    await db.insert(app).values({ id, workspaceId: wsId, name: 'Shop (sample)', key: id.slice(-6).toUpperCase(), setup: dir ? { workbench: { dir } } : {} })
    return id
  }
  beforeAll(async () => { await db.insert(workspace).values({ id: wsId, name: 'docs site test' }) })
  afterAll(async () => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); await pool.end() })
  const down = { answers: async () => false }

  it('no workbench folder, a folder that is gone, and a folder with no site: nothing to show, and starting says why', async () => {
    const none = await anApp(null)
    expect(await docsSite(none, down)).toMatchObject({ dir: null, found: false, has: false, url: null, up: false })
    await expect(startDocsSite(none)).rejects.toThrow(/no workbench folder/)
    const gone = await anApp('/nowhere/bench-sample')
    expect(await docsSite(gone, down)).toMatchObject({ dir: '/nowhere/bench-sample', found: false, has: false })
    await expect(startDocsSite(gone)).rejects.toThrow(/no folder at/)
    const dir = bench(); dirs.push(dir)
    const bare = await anApp(dir)
    expect(await docsSite(bare, down)).toMatchObject({ dir, found: true, has: false, url: null })
    await expect(startDocsSite(bare)).rejects.toThrow(/has no docs site/)
  })

  it('a site that is not installed says what to run; one that answers is up at its folder\'s port, whoever started it', async () => {
    const dir = bench(); dirs.push(dir)
    mkdirSync(join(dir, 'docs', '.vitepress'), { recursive: true })
    const id = await anApp(dir)
    const s = await docsSite(id, down)
    expect(s).toMatchObject({ has: true, up: false, startedHere: false, url: `http://localhost:${docsPort(dir)}` })
    expect(s.problem).toMatch(/VitePress is not installed in .*run `pnpm install` there/)
    expect(await docsSite(id, { answers: async () => true })).toMatchObject({ up: true, problem: null, frame: frameUrl(`http://localhost:${docsPort(dir)}`), log: [] })
  })
})
