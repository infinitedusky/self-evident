/** Notes: dated, attached to tasks, and in the report on their day. Everything here is made up. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { addNote, dayOf, editNote, listNotes, removeNote } from './notes.js'
import { createProject } from './projects.js'
import { reportFacts } from './reports.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('notes', () => {
  const wsId = newId('workspace'), appId = newId('app'), otherApp = newId('app')
  let a = '', b = '', elsewhere = ''
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'notes test' })
    await db.insert(app).values([{ id: appId, workspaceId: wsId, name: 'Dashboard (sample)', key: appId.slice(-6).toUpperCase(), setup: {} }, { id: otherApp, workspaceId: wsId, name: 'Other (sample)', key: otherApp.slice(-6).toUpperCase(), setup: {} }])
    const p = await createProject({ appId, name: 'Scans (sample)', issues: [{ title: 'Show findings (sample)', brief: 'Build it.' }, { title: 'Import people (sample)', brief: 'Build it.' }] })
    a = p.issues[0].id; b = p.issues[1].id
    elsewhere = (await createProject({ appId: otherApp, name: 'Else (sample)', issues: [{ title: 'Another (sample)', brief: 'Build it.' }] })).issues[0].id
  })
  afterAll(async () => { await pool.end() })

  it('keeps a note for today, about the tasks it names, and shows it on each of them', async () => {
    const n = await addNote(appId, { title: 'Talked with the team lead about the import (sample)', body: 'It scans everyone. Outcome: a ticket of its own.', issueIds: [a, b] })
    expect(n).toMatchObject({ on: dayOf(new Date()), kind: 'note', tasks: [{ id: a }, { id: b }] })
    expect(n.tasks[0].name).toMatch(/-\d+$/)
    await addNote(appId, { title: 'About nothing in particular (sample)', on: '2026-11-20' })
    expect((await listNotes(appId)).map((x) => x.title)).toEqual(['Talked with the team lead about the import (sample)', 'About nothing in particular (sample)'])
    expect((await listNotes(appId, { issueId: b })).map((x) => x.id)).toEqual([n.id])
    expect(await listNotes(appId, { issueId: elsewhere })).toEqual([])
  })

  it('refuses one with no title, a day that is not one, and a task of another app', async () => {
    await expect(addNote(appId, { title: ' ' })).rejects.toThrow('needs a title')
    await expect(addNote(appId, { title: 'x', on: 'tomorrow' })).rejects.toThrow('YYYY-MM-DD')
    await expect(addNote(appId, { title: 'x', issueIds: [elsewhere] })).rejects.toThrow('no such task in this app')
  })

  it('is changed, marked a decision, moved to other tasks and removed', async () => {
    const [n] = await listNotes(appId, { issueId: a })
    const d = await editNote(appId, n.id, { kind: 'decision', issueIds: [b], on: '2026-11-21' })
    expect(d).toMatchObject({ kind: 'decision', on: '2026-11-21', title: n.title, tasks: [{ id: b }] })
    expect((await listNotes(appId, { kind: 'decision' })).map((x) => x.id)).toEqual([n.id])
    expect(await listNotes(appId, { issueId: a })).toEqual([])
    await removeNote(appId, n.id)
    await expect(editNote(appId, n.id, { title: 'y' })).rejects.toThrow('no such note')
  })

  it('goes into the report on the days it is dated in, and no other', async () => {
    await addNote(appId, { title: 'Decided to test on an empty company (sample)', kind: 'decision', on: '2026-11-18', issueIds: [a] })
    const on = async (from: string, to: string) => ((await reportFacts(appId, new Date(`${from}T00:00:00`), new Date(`${to}T00:00:00`), { me: async () => 'someone' })).facts as { notes: { on: string; kind: string; title: string; tasks: string[] }[] }).notes
    expect(await on('2026-11-18', '2026-11-19')).toMatchObject([{ on: '2026-11-18', kind: 'decision', title: 'Decided to test on an empty company (sample)' }])
    expect((await on('2026-11-18', '2026-11-19'))[0].tasks).toHaveLength(1)
    expect(await on('2026-11-19', '2026-11-20')).toEqual([])
    expect((await on('2026-11-17', '2026-11-21')).map((n) => n.on)).toEqual(['2026-11-18', '2026-11-20']) // a week: in the order of the days
  })
})
