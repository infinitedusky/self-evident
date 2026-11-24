/** Context: reference docs, notes and decisions on an idea, a project and a task, and what an agent is given. Everything here is made up. */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addContextNote, addDoc, addFile, addTicket, contextCount, contextOf, contextPrompt, editContextNote, editDoc, LIMITS, refreshDoc, removeDoc } from './context.js'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { createIdea } from './ideas.js'
import { newId } from './ids.js'
import { listNotes } from './notes.js'
import { keepOrigin } from './origins.js'
import { createProject } from './projects.js'
import { engineTools } from './tools.js'
import { convertIdea } from './work.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('context', () => {
  const wsId = newId('workspace'), appId = newId('app')
  let task = '', other = '', projectId = ''
  let kept = 0
  /** Linear, made up: any ticket asked for exists, and says how many times it has been read. */
  const keep = (id: string, ref: string) => keepOrigin(db, id, { source: 'linear', ref: ref.toUpperCase(), title: `Ticket ${ref.toUpperCase()} (sample)`, body: `Read ${++kept} time${kept === 1 ? '' : 's'}.` })
  beforeAll(async () => {
    process.env.CONTEXT_HOME = mkdtempSync(join(tmpdir(), 'context-test-'))
    await db.insert(workspace).values({ id: wsId, name: 'context test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop (sample)', key: appId.slice(-6).toUpperCase(), setup: {} })
    const p = await createProject({ appId, name: 'Checkout (sample)', issues: [{ title: 'Saved cards (sample)', brief: 'Build it.' }, { title: 'Totals (sample)', brief: 'Build it.' }] })
    projectId = p.project.id; task = p.issues[0].id; other = p.issues[1].id
  })
  afterAll(async () => { await pool.end() })

  it('is there on a task with nothing in it', async () => {
    expect(await contextOf({ issueId: task })).toMatchObject({ on: 'task', project: { id: projectId }, docs: [], notes: [], limits: LIMITS })
    expect(await contextPrompt({ issueId: task }, { canWrite: false })).toBe('')
    expect(await contextPrompt({ issueId: task })).toContain('`context` tool')
  })

  it('keeps pasted text, listed for agents until it is marked to be given in full', async () => {
    const v = await addDoc({ issueId: task }, { title: 'Vault notes (sample)', description: 'What the vault returns.', body: 'last4 and expiry only.' })
    expect(v.docs).toMatchObject([{ title: 'Vault notes (sample)', from: 'pasted', inFull: false, chars: 22, addedBy: 'user', fromProject: false }])
    const listed = await contextPrompt({ issueId: task })
    expect(listed).toContain('- Vault notes (sample): What the vault returns.')
    expect(listed).not.toContain('last4 and expiry only.')
    const path = listed.match(/\((\/[^)]+\.md)\)/)![1]
    expect(readFileSync(path, 'utf8')).toContain('last4 and expiry only.')
    await editDoc({ issueId: task }, v.docs[0].id, { inFull: true })
    expect(await contextPrompt({ issueId: task })).toContain('### Reference, in full: Vault notes (sample)\n\nWhat the vault returns.\n\nlast4 and expiry only.')
  })

  it('refuses a doc with no title or text, one too long to keep, and a long one given in full', async () => {
    await expect(addDoc({ issueId: task }, { title: ' ', body: 'x' })).rejects.toThrow('needs a title')
    await expect(addDoc({ issueId: task }, { title: 'Empty (sample)', body: ' ' })).rejects.toThrow('needs its text')
    await expect(addDoc({ issueId: task }, { title: 'Huge (sample)', body: 'x'.repeat(LIMITS.doc + 1) })).rejects.toThrow('holds up to 200,000')
    await expect(addDoc({ issueId: task }, { title: 'Long (sample)', body: 'x'.repeat(LIMITS.inFull + 1), inFull: true })).rejects.toThrow('holds up to 20,000')
    const v = await addDoc({ issueId: task }, { title: 'Long (sample)', body: 'x'.repeat(LIMITS.inFull + 1) })
    const long = v.docs.find((d) => d.title === 'Long (sample)')!
    await expect(editDoc({ issueId: task }, long.id, { inFull: true })).rejects.toThrow('It stays listed')
    expect((await removeDoc({ issueId: task }, long.id)).docs.map((d) => d.title)).toEqual(['Vault notes (sample)'])
  })

  it('brings in a text file as text and keeps a PDF as the file, and refuses anything else', async () => {
    const v = await addFile({ issueId: other }, { name: 'pricing.md', type: 'text/markdown', bytes: Buffer.from('# Pricing (sample)\n\nPer person.') })
    expect(v.docs).toMatchObject([{ title: 'pricing', from: 'file', fileName: 'pricing.md', body: '# Pricing (sample)\n\nPer person.', kept: false }])
    const w = await addFile({ issueId: other }, { name: 'export.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4 made up') })
    const pdf = w.docs.find((d) => d.fileName === 'export.pdf')!
    expect(pdf).toMatchObject({ body: null, kept: true })
    await expect(editDoc({ issueId: other }, pdf.id, { inFull: true })).rejects.toThrow('cannot be put in front of every agent')
    const prompt = await contextPrompt({ issueId: other })
    const path = prompt.match(/\(a PDF, (\/[^)]+\.pdf)\)/)![1]
    expect(existsSync(path)).toBe(true)
    await expect(addFile({ issueId: other }, { name: 'photo.png', type: 'image/png', bytes: Buffer.from('x') })).rejects.toThrow('not a text, Markdown or PDF file')
  })

  it('keeps a person\'s decision as settled, an agent\'s as proposed unless the person agreed, and tells every agent which is which', async () => {
    await addContextNote({ issueId: task }, { kind: 'decision', title: 'Show last four digits only (sample)', body: 'The vault returns no more.' })
    expect((await addContextNote({ issueId: task }, { kind: 'decision', title: 'Delete at the provider (sample)', agreed: true }, 'agent')).status).toBe('settled')
    expect((await addContextNote({ issueId: task }, { kind: 'decision', title: 'Offer cards of the last year only (sample)' }, 'agent')).status).toBe('proposed')
    await expect(addContextNote({ issueId: task }, { kind: 'decision', title: 'Offer cards of the last year only (sample)' }, 'agent')).rejects.toThrow('already proposed')
    expect(await contextCount({ issueId: task })).toEqual({ count: 3, proposed: 1 }) // a doc and two settled decisions
    const v = await contextOf({ issueId: task })
    const proposed = v.notes.find((n) => n.status === 'proposed')!
    expect(proposed).toMatchObject({ kind: 'decision', addedBy: 'agent' })
    let prompt = await contextPrompt({ issueId: task })
    expect(prompt).toMatch(/### Decisions[\s\S]*Do not reopen them[\s\S]*- Show last four digits only \(sample\) Why: The vault returns no more\./)
    expect(prompt).toMatch(/### Proposed, waiting for the person[\s\S]*- Offer cards of the last year only \(sample\)/)
    // Only the person accepts or rejects; a rejected one is kept, and is not proposed again.
    await expect(editContextNote({ issueId: task }, proposed.id, { status: 'settled' }, 'agent')).rejects.toThrow('is the person\'s')
    await editContextNote({ issueId: task }, proposed.id, { status: 'rejected' })
    prompt = await contextPrompt({ issueId: task })
    expect(prompt).toMatch(/### Proposed and turned down by the person[\s\S]*- Offer cards of the last year only \(sample\)/)
    await expect(addContextNote({ issueId: task }, { kind: 'decision', title: 'offer cards of the last year only (sample)' }, 'agent')).rejects.toThrow('already turned that decision down')
    // The app's notes and a report hold only what is settled.
    expect((await listNotes(appId, { issueId: task })).map((n) => n.title).sort()).toEqual(['Delete at the provider (sample)', 'Show last four digits only (sample)'])
    expect((await editContextNote({ issueId: task }, proposed.id, { status: 'settled' })).notes.filter((n) => n.status === 'settled')).toHaveLength(3)
  })

  it('shows a task its project\'s, marked, and does not let it be changed from the task', async () => {
    await addDoc({ projectId }, { title: 'Design principles (sample)', body: 'One page, no steps.', inFull: true })
    await addContextNote({ projectId }, { kind: 'decision', title: 'One page on a phone too (sample)' })
    await addContextNote({ projectId }, { title: 'Talked with the team (sample)', body: 'Mobile gets its own ticket.' })
    const own = await contextOf({ projectId })
    expect(own).toMatchObject({ on: 'project', project: null })
    expect(own.docs.every((d) => !d.fromProject)).toBe(true)
    const v = await contextOf({ issueId: task })
    const doc = v.docs.find((d) => d.title === 'Design principles (sample)')!
    expect(doc.fromProject).toBe(true)
    expect(v.notes.filter((n) => n.fromProject).map((n) => n.title).sort()).toEqual(['One page on a phone too (sample)', 'Talked with the team (sample)'])
    await expect(editDoc({ issueId: task }, doc.id, { title: 'Mine now' })).rejects.toThrow('no such doc in this context')
    await expect(editContextNote({ issueId: task }, v.notes.find((n) => n.fromProject)!.id, { title: 'Mine now' })).rejects.toThrow('no such note in this context')
    const prompt = await contextPrompt({ issueId: task })
    expect(prompt).toContain('- One page on a phone too (sample) (from the project)')
    expect(prompt).toContain('### Reference, in full: Design principles (sample) (from the project)\n\nOne page, no steps.')
    expect(prompt).toContain('**Talked with the team (sample)**')
  })

  it('adds another ticket by its id, once, and brings it up to date', async () => {
    const v = await addTicket({ issueId: other }, 'shop-37', 'user', keep)
    const t = v.docs.find((d) => d.from === 'ticket')!
    expect(t).toMatchObject({ title: 'Ticket SHOP-37 (sample)', inFull: false, ticket: { originating: false, origin: { ref: 'SHOP-37', body: 'Read 1 time.' } } })
    await expect(addTicket({ issueId: other }, 'SHOP-37', 'user', keep)).rejects.toThrow('already in this context')
    const again = await refreshDoc({ issueId: other }, t.id, keep)
    expect(again.docs.find((d) => d.id === t.id)!.ticket!.origin.body).toBe('Read 3 times.')
    await expect(editDoc({ issueId: other }, t.id, { body: 'changed' })).rejects.toThrow('stays as its tracker has it')
    expect(await contextPrompt({ issueId: other })).toContain('- Linear SHOP-37: Ticket SHOP-37 (sample)')
    expect((await removeDoc({ issueId: other }, t.id)).docs.some((d) => d.from === 'ticket')).toBe(false)
  })

  it('has the ticket the work came from first, never edited or taken out, and its context goes with an idea that becomes a task', async () => {
    const o = await keep(appId, 'SHOP-41')
    const i = await createIdea({ appId, title: 'Saved cards, the idea (sample)' })
    await db.execute(`update idea set origin_id = '${o.id}' where id = '${i.id}'`)
    await addDoc({ ideaId: i.id }, { title: 'Support requests (sample)', body: 'Please remember my card.' })
    await addContextNote({ ideaId: i.id }, { kind: 'decision', title: 'No card is saved without asking (sample)' })
    const v = await contextOf({ ideaId: i.id })
    expect(v).toMatchObject({ on: 'idea', docs: [{ id: o.id, from: 'ticket', inFull: true, ticket: { originating: true } }, { title: 'Support requests (sample)' }] })
    await expect(removeDoc({ ideaId: i.id }, o.id)).rejects.toThrow('the ticket the work came from stays')
    await expect(editDoc({ ideaId: i.id }, o.id, { title: 'x' })).rejects.toThrow('never edited here')
    expect(await contextPrompt({ ideaId: i.id })).not.toContain('Ticket SHOP-41 (sample)') // given whole by originPrompt, not said twice
    const out = await convertIdea(i.id, 'task')
    const moved = await contextOf({ issueId: out.issueId })
    expect(moved.docs.map((d) => d.title)).toEqual(['Ticket SHOP-41 (sample)', 'Support requests (sample)'])
    expect(moved.notes.map((n) => n.title)).toEqual(['No card is saved without asking (sample)'])
    expect(await contextOf({ ideaId: i.id })).toMatchObject({ docs: [{ id: o.id }], notes: [] })
  })

  it('lets an agent add to it through its tool: a note freely, a decision only as agreed or proposed', async () => {
    const tool = engineTools({ appId, actor: 'agent' }).find((t) => t.name === 'context')!
    const call = async (args: Record<string, unknown>) => JSON.parse((await tool.handler(args)).content[0].text)
    const t = (await createProject({ appId, name: 'Tooling (sample)', issues: [{ title: 'A task for the tool (sample)', brief: 'Build it.' }] })).issues[0].id
    expect(await call({ op: 'note', issueId: t, title: 'Found a slow call (sample)', body: 'Two seconds.' })).toEqual({ noted: 'Found a slow call (sample)' })
    expect(await call({ op: 'propose', issueId: t, title: 'Cache the first call (sample)' })).toMatchObject({ proposed: 'Cache the first call (sample)' })
    expect(await call({ op: 'decide', issueId: t, title: 'Keep the vault as it is (sample)' })).toEqual({ recorded: 'Keep the vault as it is (sample)', as: 'settled' })
    await call({ op: 'doc', issueId: t, title: 'What I read (sample)', description: 'The guide, in short.', body: 'It is slow at first.' })
    const v = await call({ op: 'read', issueId: t })
    expect(v.notes.map((n: { status: string; addedBy: string }) => [n.status, n.addedBy])).toEqual([['settled', 'agent'], ['proposed', 'agent'], ['settled', 'agent']])
    expect(v.docs).toMatchObject([{ title: 'What I read (sample)', addedBy: 'agent', inFull: false }])
    expect((await tool.handler({ op: 'note', title: 'About nothing (sample)' })).isError).toBe(true) // it says which idea, task or project
  })

  it('goes to the project when an idea becomes one, so each of its tasks has it', async () => {
    const i = await createIdea({ appId, title: 'A bigger idea (sample)' })
    await addContextNote({ ideaId: i.id }, { title: 'Found while reading (sample)' })
    await addDoc({ ideaId: i.id }, { title: 'A spec (sample)', body: 'What it must do.' })
    const out = await convertIdea(i.id, 'project')
    expect((await contextOf({ projectId: out.projectId! })).docs.map((d) => d.title)).toEqual(['A spec (sample)'])
    const t = await contextOf({ issueId: out.issueId })
    expect(t.docs).toMatchObject([{ title: 'A spec (sample)', fromProject: true }])
    expect(t.notes).toMatchObject([{ title: 'Found while reading (sample)', fromProject: true }])
  })
})
