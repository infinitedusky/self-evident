/** A guide's command steps: run on a press, in the prototype's worktree, one at a time, with what they printed. Sample data. */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { desc, eq } from 'drizzle-orm'
import { db, pool } from './db/client.js'
import { app, event, prototype, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { runsOf, runStep, stopStep } from './prototype-run.js'
import { cleanGuide, setGuide } from './share-guide.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }
const until = async (ok: () => boolean, ms = 30_000) => { const t = Date.now(); while (!ok()) { if (Date.now() - t > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 40)) } }

describe('a guide step that is a command', () => {
  it('is one line, has no path beside it, and may not stop other processes', () => {
    expect(cleanGuide({ steps: [{ title: 'Run the tests (sample)', run: '  python otel/test.py  ', try: 'OK at the end' }] }).steps[0]).toEqual({ title: 'Run the tests (sample)', run: 'python otel/test.py', try: 'OK at the end' })
    expect(() => cleanGuide({ steps: [{ title: 'Both', path: '/app', run: 'ls' }] })).toThrow(/not both/)
    expect(() => cleanGuide({ steps: [{ title: 'Two lines', run: 'ls\nrm x' }] })).toThrow(/one line/)
    expect(() => cleanGuide({ steps: [{ title: 'Clean up', run: 'pkill -f vite' }] })).toThrow(/may not stop other processes/)
  })
})

describe.skipIf(!reachable)('running a guide step (sample data)', () => {
  const wsId = newId('workspace'), appId = newId('app'), id = newId('prototype')
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'if-run-'))
    await writeFile(join(dir, 'here.txt'), 'in the worktree (sample)\n')
    await db.insert(workspace).values({ id: wsId, name: 'guide run test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Collector (sample)', key: appId.slice(-6).toUpperCase() })
    await db.insert(prototype).values({ id, appId, title: 'Our own collector (sample)', branch: 'prototype/sample-run', path: dir, status: 'stopped' })
    await setGuide(id, { intro: 'No screens: it is tried by running it (sample).', steps: [
      { title: 'It runs where the prototype is', run: 'cat here.txt && echo second line', try: 'Two lines.' },
      { title: 'A failing check', run: 'echo to stderr >&2; exit 3' },
      { title: 'A long one', run: 'echo started; sleep 30' },
      { title: 'A page', path: '/app' },
    ] })
  })
  afterAll(async () => { await pool.end() })

  it('runs in the prototype\'s folder, keeps what it printed, and records how it ended', async () => {
    expect((await runStep(id, 0)).status).toBe('running')
    await until(() => runsOf(id)[0].status !== 'running')
    expect(runsOf(id)[0]).toMatchObject({ step: 0, status: 'passed', exitCode: 0, lines: ['in the worktree (sample)', 'second line'], command: 'cat here.txt && echo second line' })
    // The event is written after the run ends: looked for until it is there, not after a guessed pause.
    const last = async () => (await db.select().from(event).where(eq(event.appId, appId)).orderBy(desc(event.seq)).limit(1))[0]
    for (const t = Date.now(); (await last())?.type !== 'prototype.step_ran' && Date.now() - t < 30_000;) await new Promise((r) => setTimeout(r, 50))
    const e = await last()
    expect(e).toMatchObject({ type: 'prototype.step_ran', payload: { prototypeId: id, step: 0, status: 'passed', title: 'It runs where the prototype is' } })
  })

  it('says a command failed, with what it printed to either stream', async () => {
    await runStep(id, 1)
    await until(() => runsOf(id).find((r) => r.step === 1)!.status !== 'running')
    expect(runsOf(id).find((r) => r.step === 1)).toMatchObject({ status: 'failed', exitCode: 3, lines: ['to stderr'] })
  })

  it('one at a time, and a running one can be stopped', async () => {
    await runStep(id, 2)
    await until(() => runsOf(id).find((r) => r.step === 2)!.lines.length > 0)
    await expect(runStep(id, 0)).rejects.toThrow(/another step of this prototype is running/)
    expect((await runStep(id, 2)).status).toBe('running') // pressed again: the same run
    stopStep(id, 2)
    await until(() => runsOf(id).find((r) => r.step === 2)!.status !== 'running')
    expect(runsOf(id).find((r) => r.step === 2)).toMatchObject({ status: 'stopped', lines: expect.arrayContaining(['started']) }) // the shell sometimes adds its own line that the sleep was terminated
    expect((await runStep(id, 0)).status).toBe('running') // free again
    await until(() => runsOf(id)[0].status !== 'running')
  })

  it('runs only what is a command step of the guide, and stops one that goes on too long', async () => {
    await expect(runStep(id, 3)).rejects.toThrow(/no command to run/)
    await expect(runStep(id, 9)).rejects.toThrow(/no command to run/)
    await expect(runStep('proto_none', 0)).rejects.toThrow(/no prototype/)
    await runStep(id, 2, 'person', { limitMs: 150 })
    await until(() => runsOf(id).find((r) => r.step === 2)!.status !== 'running')
    expect(runsOf(id).find((r) => r.step === 2)!.lines.join('\n')).toMatch(/stopped: it ran longer than/)
  })
})
