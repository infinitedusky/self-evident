/** Recordings: a real service's raw response, kept with the task outside the repository. Sample data. */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, repo, workspace } from './db/schema.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { createProject } from './projects.js'
import { discardPrototype, prototypeEnv, prototypeStatus, setPrototypeCommand, setStandIn, startPrototype, stopPrototypes } from './prototype.js'
import { listRecordings, recordingsDir, recordingsOf, recordingsPrompt } from './recordings.js'

process.env.RECORDINGS_HOME = mkdtempSync(join(tmpdir(), 'if-recordings-'))
process.env.STAND_INS_HOME = mkdtempSync(join(tmpdir(), 'if-rec-protos-'))

describe('where a recording is kept', () => {
  it('with the task; with the idea when there is no task; else with the app', () => {
    expect(recordingsOf('app_s', { issueId: 'iss_1', ideaId: 'idea_1' })).toBe(join(process.env.RECORDINGS_HOME!, 'app_s', 'iss_1'))
    expect(recordingsOf('app_s', { ideaId: 'idea_1' })).toBe(join(process.env.RECORDINGS_HOME!, 'app_s', 'idea_1'))
    expect(recordingsOf('app_s')).toBe(join(process.env.RECORDINGS_HOME!, 'app_s', 'app'))
  })
  it('what is there is listed, newest first, folders included; a conversation is told to save a real response raw', () => {
    const dir = recordingsDir('app_s', { issueId: 'iss_list' })
    expect(listRecordings(dir)).toEqual([])
    mkdirSync(join(dir, 'vendor'), { recursive: true })
    writeFileSync(join(dir, 'vendor', 'scan-2026-11-19.json'), '{"sample":true}')
    writeFileSync(join(dir, '.hidden'), 'x')
    expect(listRecordings(dir).map((f) => [f.name, f.bytes])).toEqual([['vendor/scan-2026-11-19.json', 15]])
    expect(recordingsPrompt(dir, 0)).toContain('save it raw'); expect(recordingsPrompt(dir, 0)).toContain('say that it is assumed')
    expect(recordingsPrompt(dir, 2)).toContain('It holds 2 files already: look there before you assume')
    expect(recordingsPrompt(dir, 1)).toContain(dir)
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

// The stand-in serves the raw recording the task already has; the app reaches it through a variable.
const APP = `node -e "require('http').createServer(async (q, s) => { try { s.end('app got: ' + await (await fetch(process.env.VENDOR_BASE_URL)).text()) } catch (e) { s.end('no vendor') } }).listen(process.env.PORT)"`
const STUB = `node -e "require('http').createServer((q, s) => s.end(require('fs').readFileSync(process.env.RECORDINGS + '/vendor-scan.json', 'utf8'))).listen(process.env.PORT)"`
const until = async (ok: () => Promise<boolean>) => { for (let i = 0; i < 300; i++) { if (await ok()) return true; await new Promise((r) => setTimeout(r, 100)) } return false }
const says = async (url: string) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.text()).catch(() => '')

describe.skipIf(!reachable)('a task\'s recordings and its prototype', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let taskId: string
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-rec-'))
    await git(dir, ['init', '-q', '-b', 'main', 'repo'])
    const repoPath = join(dir, 'repo')
    await writeFile(join(repoPath, 'a.txt'), 'one\n'); await commitAll(repoPath, 'init')
    await db.insert(workspace).values({ id: wsId, name: 'recordings test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: repoPath })
    await setPrototypeCommand(appId, APP)
    taskId = (await createProject({ appId, name: 'scan', issues: [{ title: 'Vendor scan (sample)' }] })).issues[0].id
  })
  afterAll(async () => { stopPrototypes(); await pool.end() })

  it('a real run recorded before any prototype is what the prototype\'s stand-in serves, and it outlives the prototype', async () => {
    // Recorded during research, say: the task has no prototype yet.
    const kept = recordingsDir(appId, { issueId: taskId })
    writeFileSync(join(kept, 'vendor-scan.json'), '{"findings":42,"evidence":["kept, not dropped (sample)"]}')

    const p = await startPrototype({ appId, title: 'Vendor scan (sample)', issueId: taskId })
    expect((await prototypeEnv(p)).RECORDINGS).toBe(kept) // the same folder: the task's
    const set = await setStandIn(p.id, { name: 'Vendor', cmd: STUB, env: { VENDOR_BASE_URL: '{url}' } })
    expect(set.recordings).toMatchObject({ dir: kept, files: [{ name: 'vendor-scan.json' }] }) // the agent sees what there is
    expect(await until(async () => (await says(set.url!)) === 'app got: {"findings":42,"evidence":["kept, not dropped (sample)"]}')).toBe(true)

    await discardPrototype(p.id)
    expect(existsSync(join(kept, 'vendor-scan.json'))).toBe(true) // the task's, not the prototype's
    expect((await prototypeStatus(p.id)).recordings.files).toHaveLength(1)
  })
})
