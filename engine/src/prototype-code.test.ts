/** A prototype's Code view: what changed since its branch left main (committed or not), one file's diff, and what the agent shows. */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { desc, eq } from 'drizzle-orm'
import { app, event, prototype, workspace } from './db/schema.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { inside, prototypeCode, prototypeFile, showInPrototype, unshowInPrototype } from './prototype-code.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('a prototype\'s code', () => {
  const wsId = newId('workspace')
  const appId = newId('app')
  const id = newId('prototype')
  let path: string
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-proto-code-'))
    await git(dir, ['init', '-q', '-b', 'main', 'repo'])
    path = join(dir, 'repo')
    await writeFile(join(path, 'keep.txt'), 'one\ntwo\nthree\n'); await writeFile(join(path, 'gone.txt'), 'bye\n'); await writeFile(join(path, 'same.md'), '# Same\n')
    await commitAll(path, 'init')
    await git(path, ['checkout', '-q', '-b', 'prototype/sample'])
    await writeFile(join(path, 'keep.txt'), 'one\n2\nthree\nfour\n'); await rm(join(path, 'gone.txt'))
    await commitAll(path, 'change')
    await mkdir(join(path, 'src')); await writeFile(join(path, 'src/new.ts'), 'export const a = 1\nexport const b = 2\n') // not added yet
    await writeFile(join(path, 'keep.txt'), 'one\n2\nthree\nfour\nfive\n') // not committed yet
    await db.insert(workspace).values({ id: wsId, name: 'proto code test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    await db.insert(prototype).values({ id, appId, title: 'Sample', branch: 'prototype/sample', path, status: 'stopped' })
  })
  afterAll(async () => { await pool.end() })

  it('lists every file that differs from where the branch left main, with work not committed or added yet', async () => {
    const c = await prototypeCode(id)
    expect(c.files).toEqual([
      { path: 'gone.txt', status: 'deleted', added: 0, removed: 1 },
      { path: 'keep.txt', status: 'modified', added: 3, removed: 1 },
      { path: 'src/new.ts', status: 'added', added: 2, removed: 0 },
    ])
    expect(c.shown).toEqual([])
  })

  it('gives one file as its diff and its text now; a new file is all change, a deleted one only a diff, an unchanged one only text', async () => {
    const keep = await prototypeFile(id, 'keep.txt')
    expect(keep.patch).toMatch(/-two\n\+2/); expect(keep.content).toBe('one\n2\nthree\nfour\nfive\n')
    const fresh = await prototypeFile(id, 'src/new.ts')
    expect(fresh.patch).toContain('@@ -0,0 +1,2 @@\n+export const a = 1\n+export const b = 2')
    const gone = await prototypeFile(id, 'gone.txt')
    expect(gone).toMatchObject({ missing: true, content: null }); expect(gone.patch).toContain('-bye')
    expect(await prototypeFile(id, 'same.md')).toMatchObject({ patch: null, content: '# Same\n' })
    await expect(prototypeFile(id, '../../etc/passwd')).rejects.toThrow(/not a file in the prototype's worktree/)
    await expect(prototypeFile(id, 'nope.txt')).rejects.toThrow(/no file nope.txt/)
    expect(() => inside(path, '/etc/passwd')).toThrow()
  })

  it('lets the agent show a file with lines and a note, or a page; the same thing again replaces it; the person is told', async () => {
    await showInPrototype(id, { file: 'same.md', note: 'Unchanged, for reference (sample).', lines: [{ from: 3, to: 1 }] })
    await showInPrototype(id, { url: 'https://example.com/docs (sample)'.split(' ')[0], title: 'Docs (sample)' })
    const again = await showInPrototype(id, { file: './same.md', note: 'Said better (sample).' })
    const c = await prototypeCode(id)
    expect(c.shown.map((s) => [s.kind, s.path ?? s.url, s.note ?? s.title])).toEqual([['file', 'same.md', 'Said better (sample).'], ['link', 'https://example.com/docs', 'Docs (sample)']])
    const [e] = await db.select().from(event).where(eq(event.appId, appId)).orderBy(desc(event.seq)).limit(1)
    expect(e).toMatchObject({ type: 'prototype.shown', payload: { prototypeId: id, shownId: again.shown.id, path: 'same.md' } })
    await expect(showInPrototype(id, { file: 'nope.txt' })).rejects.toThrow(/no file nope.txt/)
    await expect(showInPrototype(id, { file: '../x' })).rejects.toThrow(/not a file/)
    await expect(showInPrototype(id, { url: 'file:///etc/passwd' })).rejects.toThrow(/http/)
    await expect(showInPrototype(id, {})).rejects.toThrow(/show one thing/)
    expect((await unshowInPrototype(id, 'same.md')).shown).toHaveLength(1)
    expect((await unshowInPrototype(id)).shown).toEqual([])
  })
})
