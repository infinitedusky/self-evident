/** Making an app's workbench folder from the template. Everything here is made up. */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, repo, workspace } from './db/schema.js'
import { checkPages } from './docs-agent.js'
import { siteIn } from './docs-site.js'
import { newId } from './ids.js'
import { missingIn, seedView, seedWorkbench, suggestedDir, templateFiles, workbenchView } from './workbench-seed.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const roots: string[] = []
const root = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), 'bench-seed-'))); roots.push(d); return d }

describe('the template', () => {
  it('is a docs site with both sections, the docs agent\'s skills, and the folders hooks and mockups go in', () => {
    const files = templateFiles().map((f) => f.to)
    for (const f of ['.gitignore', 'README.md', 'package.json', 'docs/.vitepress/config.ts', 'docs/system/index.md', 'docs/work/index.md', '.claude/skills/docs-pages/task-page.md', '.claude/skills/vitepress/SKILL.md', 'hooks/README.md', 'mockups/README.md'])
      expect(files).toContain(f)
    expect(files).not.toContain('gitignore')
    expect(missingIn(null).pieces).toEqual(expect.arrayContaining(['the docs site', 'the docs agent\'s skills', 'the hooks folder']))
  })
})

describe.skipIf(!reachable)('seeding a workbench', () => {
  const wsId = newId('workspace')
  const anApp = async (name: string, checkout: string | null) => {
    const id = newId('app')
    await db.insert(app).values({ id, workspaceId: wsId, name, key: id.slice(-6).toUpperCase(), setup: {} })
    if (checkout) { mkdirSync(checkout, { recursive: true }); await db.insert(repo).values({ id: newId('repo'), appId: id, fullName: 'acme/shop-sample', localPath: checkout }) }
    return id
  }
  const installed: string[] = [], install = (d: string) => { installed.push(d) }
  beforeAll(async () => { await db.insert(workspace).values({ id: wsId, name: 'workbench seed test' }) })
  afterAll(async () => { for (const d of roots) rmSync(d, { recursive: true, force: true }); await pool.end() })

  it('with nothing named, the folder is made beside the app\'s code, named for the app, as a repository of its own', async () => {
    const r = root(), id = await anApp('Shop "Sample"', join(r, 'shop'))
    expect(await suggestedDir(id)).toBe(join(r, 'shop-sample-workbench'))
    expect(await seedView(id)).toMatchObject({ suggested: join(r, 'shop-sample-workbench'), installing: false, installed: false, problem: null })
    const made = await seedWorkbench(id, null, { install })
    const dir = join(r, 'shop-sample-workbench')
    expect(made).toMatchObject({ dir, found: true, made: true, repoMade: true, seed: { suggested: null, missing: [] } })
    expect(made.added).toHaveLength(templateFiles().length)
    expect(installed).toEqual([dir])
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toMatch(/^# Shop Sample workbench/)
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toContain('"name": "shop-sample-workbench"')
    expect(readFileSync(join(dir, 'docs', '.vitepress', 'config.ts'), 'utf8')).toContain('title: "Shop Sample"')
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('node_modules')
    expect(siteIn(dir)).toMatchObject({ found: true, has: true, bin: null })
    expect(checkPages(dir)).toEqual([]) // what the docs agent's pages are held to, from the start
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).trim()).toBe('')
    expect((await workbenchView(id)).hooks.every((h) => h.file === null)).toBe(true) // hooks/README.md is not a hook
    expect((await db.select().from(event).where(eq(event.appId, id))).filter((e) => e.type === 'workbench.seeded')).toHaveLength(1)
  })

  it('a folder that has things keeps them: only what it lacks is put in, and nothing is committed in a repository that is theirs', async () => {
    const r = root(), id = await anApp('Old (sample)', join(r, 'old')), dir = join(r, 'ours')
    mkdirSync(join(dir, 'hooks'), { recursive: true })
    writeFileSync(join(dir, 'README.md'), '# Ours\n'); writeFileSync(join(dir, 'hooks', 'before-start.sh'), 'echo A=1\n')
    execFileSync('git', ['init', '-q'], { cwd: dir })
    expect(missingIn(dir).pieces).not.toContain('the hooks folder'); expect(missingIn(dir).pieces).toContain('the mockups folder')
    const made = await seedWorkbench(id, `${dir}/`, { install })
    expect(made).toMatchObject({ dir, made: false, repoMade: false })
    expect(made.added).not.toContain('README.md'); expect(made.added).toContain('docs/index.md')
    expect(made.added).not.toContain('hooks/README.md'); expect(made.added).toContain('mockups/README.md') // its hooks folder is a hooks folder already
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe('# Ours\n')
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' })).toContain('?? docs/')
    expect((await seedWorkbench(id, null, { install })).added).toEqual([]) // again: nothing to add, and the folder named is the one filled
  })

  it('refuses a folder inside the app\'s code, a path that is not whole, and an app with no code here and no folder said', async () => {
    const r = root(), id = await anApp('In (sample)', join(r, 'in'))
    await expect(seedWorkbench(id, join(r, 'in', 'workbench'), { install })).rejects.toThrow(/inside the app's own code/)
    await expect(seedWorkbench(id, 'workbench', { install })).rejects.toThrow(/whole path/)
    await expect(seedWorkbench(id, join(r, 'gone', 'deeper'), { install })).rejects.toThrow(/no folder at .*gone/)
    expect(existsSync(join(r, 'in', 'workbench'))).toBe(false)
    const none = await anApp('Nowhere (sample)', null)
    expect(await suggestedDir(none)).toBeNull()
    await expect(seedWorkbench(none, null, { install })).rejects.toThrow(/no code on this computer/)
  })
})
