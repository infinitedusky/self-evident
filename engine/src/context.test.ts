/** Context: reference docs, notes and decisions on an idea, a project and a task, and what an agent is given. Everything here is made up. */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addContextNote, addDoc, addFile, addTicket, contextCount, contextOf, contextPrompt, editContextNote, openQuestionsDoc, editDoc, LIMITS, pullTicket, refreshDoc, removeContextNote, removeDoc } from './context.js'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { createIdea } from './ideas.js'
import { newId } from './ids.js'
import { addNote, listNotes } from './notes.js'
import { keepOrigin } from './origins.js'
import { createProject } from './projects.js'
import { reportFacts } from './reports.js'
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
    // An HTML page is kept as the file too, and an agent is told where it is.
    const h = await addFile({ issueId: other }, { name: 'mockup.html', type: 'text/html', bytes: Buffer.from('<h1>Made up</h1>') })
    const page = h.docs.find((d) => d.fileName === 'mockup.html')!
    expect(page).toMatchObject({ title: 'mockup', body: null, kept: true })
    await expect(editDoc({ issueId: other }, page.id, { body: 'changed' })).rejects.toThrow('an HTML page is kept as the file it was')
    const kept = (await contextPrompt({ issueId: other })).match(/\(an HTML page, (\/[^)]+\.html)\)/)![1]
    expect(readFileSync(kept, 'utf8')).toBe('<h1>Made up</h1>')
    await expect(addFile({ issueId: other }, { name: 'photo.png', type: 'image/png', bytes: Buffer.from('x') })).rejects.toThrow('not a text, Markdown, PDF or HTML file')
  })

  it('keeps a decision as a question and its answer: a person\'s settled, an agent\'s proposed unless the person agreed, and tells every agent which is which', async () => {
    await addContextNote({ issueId: task }, { kind: 'decision', title: 'What is shown of a saved card? (sample)', answer: 'Its last four digits only', body: 'The vault returns no more.' })
    expect((await addContextNote({ issueId: task }, { kind: 'decision', title: 'What happens to a removed card? (sample)', answer: 'It is deleted at the provider', agreed: true }, 'agent')).status).toBe('settled')
    expect((await addContextNote({ issueId: task }, { kind: 'decision', title: 'Which cards are offered? (sample)', answer: 'Those of the last year' }, 'agent')).status).toBe('proposed')
    await expect(addContextNote({ issueId: task }, { kind: 'decision', title: 'Which cards are offered? (sample)', answer: 'All of them' }, 'agent')).rejects.toThrow('already proposed')
    await expect(addContextNote({ issueId: task }, { kind: 'decision', title: ' ', answer: 'Yes' })).rejects.toThrow('needs its question')
    expect(await contextCount({ issueId: task })).toEqual({ count: 3, proposed: 1, waiting: 0 }) // a doc and two settled decisions
    const v = await contextOf({ issueId: task })
    const proposed = v.notes.find((n) => n.status === 'proposed')!
    expect(proposed).toMatchObject({ kind: 'decision', addedBy: 'agent', title: 'Which cards are offered? (sample)', answer: 'Those of the last year' })
    let prompt = await contextPrompt({ issueId: task })
    expect(prompt).toMatch(/### Decisions[\s\S]*Do not reopen them[\s\S]*- What is shown of a saved card\? \(sample\) → Its last four digits only Why: The vault returns no more\./)
    expect(prompt).toMatch(/### Answers proposed, waiting for the person[\s\S]*- Which cards are offered\? \(sample\) → Those of the last year/)
    // Only the person accepts or rejects; a rejected answer is kept, and is not proposed again.
    await expect(editContextNote({ issueId: task }, proposed.id, { status: 'settled' }, 'agent')).rejects.toThrow('is the person\'s')
    await editContextNote({ issueId: task }, proposed.id, { status: 'rejected' })
    prompt = await contextPrompt({ issueId: task })
    expect(prompt).toMatch(/### Answers proposed and turned down by the person[\s\S]*- Which cards are offered\? \(sample\) → Those of the last year/)
    await expect(addContextNote({ issueId: task }, { kind: 'decision', title: 'which cards are offered? (sample)', answer: 'those of the last year' }, 'agent')).rejects.toThrow('already turned that answer down')
    // The app's notes and a report hold only what is settled, each with its answer.
    expect((await listNotes(appId, { issueId: task })).map((n) => [n.title, n.answer]).sort()).toEqual([['What happens to a removed card? (sample)', 'It is deleted at the provider'], ['What is shown of a saved card? (sample)', 'Its last four digits only']])
    expect((await editContextNote({ issueId: task }, proposed.id, { status: 'settled' })).notes.filter((n) => n.status === 'settled')).toHaveLength(3)
  })

  it('holds a decision that is not made yet: asked, counted, told to agents as not decided, and made by answering it', async () => {
    const t = (await createProject({ appId, name: 'Open ones (sample)', issues: [{ title: 'A task with a question (sample)', brief: 'Build it.' }] })).issues[0].id
    expect((await addContextNote({ issueId: t }, { kind: 'decision', title: 'Do we support gift cards? (sample)' })).status).toBe('open')
    expect((await addContextNote({ issueId: t }, { kind: 'decision', title: 'What is shown for an expired card? (sample)', background: 'The list depends on it.' }, 'agent')).status).toBe('open') // an agent may ask
    await expect(addContextNote({ issueId: t }, { kind: 'decision', title: 'Do we support gift cards? (sample)' }, 'agent')).rejects.toThrow('already asked')
    expect(await contextCount({ issueId: t })).toEqual({ count: 0, proposed: 2, waiting: 0 })
    expect(await listNotes(appId, { issueId: t })).toEqual([]) // nothing decided: nothing for a report
    const prompt = await contextPrompt({ issueId: t })
    expect(prompt).toMatch(/### Not decided yet[\s\S]*Do not guess one[\s\S]*- Do we support gift cards\? \(sample\)\n- What is shown for an expired card\? \(sample\)\n  Background: The list depends on it\./)
    expect(prompt).not.toContain('### Decisions')
    // An agent's answer to an open question goes onto that question, proposed; the person's own answer makes it.
    expect((await addContextNote({ issueId: t }, { kind: 'decision', title: 'do we support gift cards? (sample)', answer: 'Not in this task' }, 'agent')).status).toBe('proposed')
    let v = await contextOf({ issueId: t })
    expect(v.notes.filter((n) => n.kind === 'decision')).toHaveLength(2)
    const open = v.notes.find((n) => n.status === 'open')!
    await expect(editContextNote({ issueId: t }, open.id, { status: 'settled' })).rejects.toThrow('made by giving its answer')
    v = await editContextNote({ issueId: t }, open.id, { answer: 'Shown, greyed out' })
    expect(v.notes.find((n) => n.id === open.id)).toMatchObject({ status: 'settled', answer: 'Shown, greyed out' })
    expect(await contextCount({ issueId: t })).toEqual({ count: 1, proposed: 1, waiting: 0 })
    // An answer the person agreed to goes onto the question that had a proposed answer: one decision, not two.
    expect((await addContextNote({ issueId: t }, { kind: 'decision', title: 'Do we support gift cards? (sample)', answer: 'No, a later task', agreed: true }, 'agent')).status).toBe('settled')
    v = await contextOf({ issueId: t })
    expect(v.notes.filter((n) => n.kind === 'decision').map((n) => [n.status, n.answer]).sort()).toEqual([['settled', 'No, a later task'], ['settled', 'Shown, greyed out']])
  })

  it('marks an open decision as waiting on someone, counts it apart, tells agents and a report, and forgets it once answered', async () => {
    const t = (await createProject({ appId, name: 'Waiting (sample)', issues: [{ title: 'A task that waits (sample)', brief: 'Build it.' }] })).issues[0].id
    await addContextNote({ issueId: t }, { kind: 'decision', title: 'Can an app card be used on the web? (sample)', on: '2026-11-20' })
    await addContextNote({ issueId: t }, { kind: 'decision', title: 'Is the list sorted? (sample)' })
    let v = await contextOf({ issueId: t })
    const q = v.notes.find((n) => n.title.startsWith('Can an app card'))!
    v = await editContextNote({ issueId: t }, q.id, { waitingOn: '  Em ' })
    expect(v.notes.find((n) => n.id === q.id)).toMatchObject({ status: 'open', waitingOn: 'Em', on: '2026-11-20' })
    expect(await contextCount({ issueId: t })).toEqual({ count: 0, proposed: 1, waiting: 1 })
    expect(await contextPrompt({ issueId: t })).toContain('- Can an app card be used on the web? (sample) [the person asked Em and is waiting for the answer]')
    const { facts } = await reportFacts(appId, new Date('2026-11-24T00:00:00'), new Date('2026-11-25T00:00:00'), { me: async () => 'sam' })
    expect(facts.openDecisions).toContainEqual({ question: 'Can an app card be used on the web? (sample)', askedOn: '2026-11-20', waitingOn: 'Em', background: null, proposedAnswer: null, tasks: [expect.stringMatching(/-\d+$/)] })
    expect(facts.openDecisions.some((d) => d.question === 'Is the list sorted? (sample)' && d.waitingOn === null)).toBe(true)
    expect(facts.openDecisions.every((d) => d.question !== 'What is shown of a saved card? (sample)')).toBe(true) // a made one is not open
    // What to ask them is kept beside who, and goes when it stops waiting.
    expect((await editContextNote({ issueId: t }, q.id, { ask: ' Are the two vaults one?\nIf not, when? ' })).notes.find((n) => n.id === q.id)).toMatchObject({ waitingOn: 'Em', ask: 'Are the two vaults one?\nIf not, when?' })
    expect((await openQuestionsDoc({ issueId: t })).markdown).toContain('**To ask Em**\n\nAre the two vaults one?\nIf not, when?')
    await expect(editContextNote({ issueId: t }, q.id, { ask: 'x' }, 'agent')).rejects.toThrow('the person')
    expect((await editContextNote({ issueId: t }, q.id, { waitingOn: '' })).notes.find((n) => n.id === q.id)).toMatchObject({ waitingOn: null, ask: null })
    await expect(editContextNote({ issueId: t }, q.id, { ask: 'With nobody to ask' })).rejects.toThrow('say who it waits on')
    await editContextNote({ issueId: t }, q.id, { waitingOn: 'Em', ask: 'Are the two vaults one?' })
    v = await editContextNote({ issueId: t }, q.id, { answer: 'Yes' })
    expect(v.notes.find((n) => n.id === q.id)).toMatchObject({ status: 'settled', answer: 'Yes', waitingOn: null, ask: null })
    await expect(editContextNote({ issueId: t }, q.id, { waitingOn: 'Em' })).rejects.toThrow('only a decision with no answer yet')
    // A decision with an answer an agent proposed can wait on someone too: it is still unanswered.
    await addContextNote({ issueId: t }, { kind: 'decision', title: 'Is the list sorted? (sample)', answer: 'By last use' }, 'agent')
    const p = (await contextOf({ issueId: t })).notes.find((n) => n.status === 'proposed')!
    expect((await editContextNote({ issueId: t }, p.id, { waitingOn: 'the vendor' })).notes.find((n) => n.id === p.id)).toMatchObject({ status: 'proposed', answer: 'By last use', waitingOn: 'the vendor' })
    expect(await contextCount({ issueId: t })).toEqual({ count: 1, proposed: 0, waiting: 1 })
    expect(await contextPrompt({ issueId: t })).toContain('- Is the list sorted? (sample) → By last use [the person asked the vendor and is waiting for the answer]')
    expect((await editContextNote({ issueId: t }, p.id, { status: 'settled' })).notes.find((n) => n.id === p.id)).toMatchObject({ status: 'settled', waitingOn: null })
  })

  it('keeps a decision\'s background, the story of why it is a question, apart from why its answer is the answer', async () => {
    const t = (await createProject({ appId, name: 'Background (sample)', issues: [{ title: 'A task with a story (sample)', brief: 'Build it.' }] })).issues[0].id
    const story = 'The app saves cards with one vendor and the web with another.\n\nSupport gets asked weekly. See the vault notes.'
    let v = (await addContextNote({ issueId: t }, { kind: 'decision', title: 'Can an app card be used on the web? (sample)', background: story })).view
    const q = v.notes[0]
    expect(q).toMatchObject({ status: 'open', background: story, body: '' })
    expect(await contextPrompt({ issueId: t })).toContain('- Can an app card be used on the web? (sample)\n  Background: The app saves cards with one vendor and the web with another.\n  Support gets asked weekly. See the vault notes.')
    const { facts } = await reportFacts(appId, new Date('2026-11-24T00:00:00'), new Date('2026-11-25T00:00:00'), { me: async () => 'sam' })
    expect(facts.openDecisions.find((d) => d.question === 'Can an app card be used on the web? (sample)')!.background).toBe(story)
    // Answering it keeps the story; why the answer is the answer is said apart.
    v = await editContextNote({ issueId: t }, q.id, { answer: 'Not yet', body: 'Two vendors, no shared vault.' })
    expect(v.notes[0]).toMatchObject({ status: 'settled', answer: 'Not yet', body: 'Two vendors, no shared vault.', background: story })
    expect(await contextPrompt({ issueId: t })).toMatch(/→ Not yet Why: Two vendors, no shared vault\.\n  Background: The app saves cards/)
    expect((await editContextNote({ issueId: t }, q.id, { background: '' })).notes[0].background).toBeNull()
    // An agent asking says why it asks: that is the question's background.
    const tool = engineTools({ appId, actor: 'agent' }).find((x) => x.name === 'context')!
    await tool.handler({ op: 'ask', issueId: t, title: 'Is an expired card listed? (sample)', background: 'The list is built from the vault, which still returns them.' })
    expect((await contextOf({ issueId: t })).notes.find((n) => n.title.startsWith('Is an expired'))).toMatchObject({ status: 'open', addedBy: 'agent', background: 'The list is built from the vault, which still returns them.', body: '' })
    // Said beside a question with no answer, by anyone, it is more about the question, kept with its options: there is no answer for it to be the why of.
    await addContextNote({ issueId: t }, { kind: 'decision', title: 'Is there a limit on saved cards? (sample)', body: 'May be tied to pricing.' }, 'agent')
    expect((await contextOf({ issueId: t })).notes.find((x) => x.title.startsWith('Is there a limit'))).toMatchObject({ status: 'open', body: '', background: null, options: 'May be tied to pricing.' })
    // Where it came from and what there is to choose between are kept apart, and an agent is given both.
    const o = (await addContextNote({ issueId: t }, { kind: 'decision', title: 'Who may change the group? (sample)', background: 'The PRD says this must be decided before launch.', options: '(a) admins only\n(b) any member\n\nRecommendation: (a).' })).view.notes.find((x) => x.title.startsWith('Who may change'))!
    expect(o).toMatchObject({ background: 'The PRD says this must be decided before launch.', options: '(a) admins only\n(b) any member\n\nRecommendation: (a).' })
    expect(await contextPrompt({ issueId: t })).toContain('- Who may change the group? (sample)\n  Background: The PRD says this must be decided before launch.\n  Options: (a) admins only\n  (b) any member\n  Recommendation: (a).')
    expect((await editContextNote({ issueId: t }, o.id, { options: '' })).notes.find((x) => x.id === o.id)).toMatchObject({ options: null, background: 'The PRD says this must be decided before launch.' })
    const n = (await addContextNote({ issueId: t }, { title: 'A plain note (sample)' })).view.notes.find((x) => x.kind === 'note')!
    await expect(editContextNote({ issueId: t }, n.id, { background: 'x' })).rejects.toThrow('only a decision')
  })

  it('lets an agent bring a question that is already there up to date, and never its answer', async () => {
    const t = (await createProject({ appId, name: 'Updating (sample)', issues: [{ title: 'A task with old questions (sample)', brief: 'Build it.' }] })).issues[0].id
    const tool = engineTools({ appId, actor: 'agent' }).find((x) => x.name === 'context')!
    const call = async (args: Record<string, unknown>) => { const r = await tool.handler(args); return { error: !!r.isError, said: r.content[0].text } }
    await call({ op: 'ask', issueId: t, title: 'Open: who may change the group? (sample)' })
    const id = (await contextOf({ issueId: t })).notes[0].id
    // By its id: its words, its background, its options.
    expect((await call({ op: 'update', issueId: t, id, title: 'Who may change the group? (sample)', background: 'PRD assumption 1 says admins can add or remove.', options: '(a) admins only (b) any member. Recommendation: (a).' })).error).toBe(false)
    expect((await contextOf({ issueId: t })).notes).toMatchObject([{ id, status: 'open', title: 'Who may change the group? (sample)', background: 'PRD assumption 1 says admins can add or remove.', options: '(a) admins only (b) any member. Recommendation: (a).' }])
    // Asked again in the same words with more to say: added to the one that is there, not a second question.
    expect((await call({ op: 'ask', issueId: t, title: 'who may change the group? (sample)', background: 'The ticket only says add.' })).error).toBe(false)
    expect((await contextOf({ issueId: t })).notes).toMatchObject([{ id, background: 'The ticket only says add.', options: '(a) admins only (b) any member. Recommendation: (a).' }])
    expect((await call({ op: 'ask', issueId: t, title: 'Who may change the group? (sample)' })).said).toContain('use op "update"')
    expect((await call({ op: 'update', issueId: t, id })).said).toContain('give what changes')
    expect((await call({ op: 'update', issueId: t, title: 'No id' })).said).toContain('needs the id')
    // Once it is made, its question is not reworded by an agent; what it carries still can be. The answer is never touched.
    await editContextNote({ issueId: t }, id, { answer: 'Admins only' })
    expect((await call({ op: 'update', issueId: t, id, title: 'Something else?' })).said).toContain('that decision is made')
    expect((await call({ op: 'update', issueId: t, id, options: '' })).error).toBe(false)
    expect((await contextOf({ issueId: t })).notes).toMatchObject([{ id, status: 'settled', answer: 'Admins only', title: 'Who may change the group? (sample)', options: null }])
    const n = (await addContextNote({ issueId: t }, { title: 'A plain note (sample)' })).view.notes.find((x) => x.kind === 'note')!
    expect((await call({ op: 'update', issueId: t, id: n.id, background: 'x' })).said).toContain('only a decision')
  })

  it('lets a decision depend on another: one already here, or a question asked there and then; never itself, and never in a circle', async () => {
    const p = await createProject({ appId, name: 'Depending (sample)', issues: [{ title: 'A task with a chain (sample)', brief: 'Build it.' }] })
    const t = p.issues[0].id
    // Asked with what it depends on, by its words: that question is asked too, unanswered.
    let v = (await addContextNote({ issueId: t }, { kind: 'decision', title: 'Who can set someone as protected? (sample)', dependsOnNew: ['Does the backend use the core permissions? (sample)'] })).view
    const who = v.notes.find((n) => n.title.startsWith('Who can set'))!, perms = v.notes.find((n) => n.title.startsWith('Does the backend'))!
    expect(perms).toMatchObject({ status: 'open', neededBy: [{ id: who.id, title: 'Who can set someone as protected? (sample)' }] })
    expect(who.dependsOn).toEqual([{ id: perms.id, title: 'Does the backend use the core permissions? (sample)', answer: null, status: 'open' }])
    expect(await contextPrompt({ issueId: t })).toContain('- Who can set someone as protected? (sample)\n  Depends on: "Does the backend use the core permissions? (sample)" (not decided yet)')
    // The same words again use the question that is there; an id adds one already here, the project's too.
    await addContextNote({ projectId: p.project.id }, { kind: 'decision', title: 'Is the group per company? (sample)', answer: 'Yes' })
    const theirs = (await contextOf({ issueId: t })).notes.find((n) => n.fromProject)!
    v = await editContextNote({ issueId: t }, who.id, { dependsOn: [perms.id, theirs.id], dependsOnNew: ['does the backend use the core permissions? (sample)'] })
    expect(v.notes.filter((n) => n.kind === 'decision' && !n.fromProject)).toHaveLength(2)
    expect(v.notes.find((n) => n.id === who.id)!.dependsOn.map((d) => [d.title, d.answer, d.status])).toEqual([['Does the backend use the core permissions? (sample)', null, 'open'], ['Is the group per company? (sample)', 'Yes', 'settled']])
    // Answering the one it waits on shows there, and to the agents.
    await editContextNote({ issueId: t }, perms.id, { answer: 'Yes, the core ones' })
    expect(await contextPrompt({ issueId: t })).toContain('Depends on: "Does the backend use the core permissions? (sample)" (decided: Yes, the core ones); "Is the group per company? (sample)" (decided: Yes)')
    await expect(editContextNote({ issueId: t }, who.id, { dependsOn: [who.id] })).rejects.toThrow('does not depend on itself')
    await expect(editContextNote({ issueId: t }, perms.id, { dependsOn: [who.id] })).rejects.toThrow('cannot each wait for the other')
    await expect(editContextNote({ issueId: t }, who.id, { dependsOn: ['note_nothing'] })).rejects.toThrow('no decision note_nothing')
    expect((await editContextNote({ issueId: t }, who.id, { dependsOn: [] })).notes.find((n) => n.id === who.id)!.dependsOn).toEqual([])
    // An agent says it the same way, through its tool.
    const tool = engineTools({ appId, actor: 'agent' }).find((x) => x.name === 'context')!
    await tool.handler({ op: 'update', issueId: t, id: who.id, dependsOn: [perms.id] })
    await tool.handler({ op: 'ask', issueId: t, title: 'Can a member remove someone? (sample)', dependsOnQuestions: ['Who can set someone as protected? (sample)'] })
    v = await contextOf({ issueId: t })
    expect(v.notes.find((n) => n.id === who.id)).toMatchObject({ dependsOn: [{ id: perms.id }], neededBy: [{ title: 'Can a member remove someone? (sample)' }] })
    // One that is dropped is no longer depended on.
    await removeContextNote({ issueId: t }, perms.id)
    expect((await contextOf({ issueId: t })).notes.find((n) => n.id === who.id)!.dependsOn).toEqual([])
  })

  it('writes the open questions as a document to share: a list, then each in full, those waiting on someone first', async () => {
    const p = await createProject({ appId, name: 'Sharing (sample)', issues: [{ title: 'Protect executives (sample)', brief: 'Build it.' }] })
    const t = p.issues[0].id
    expect(await openQuestionsDoc({ issueId: t }, new Date('2026-11-24T12:00:00'))).toMatchObject({ count: 0, markdown: expect.stringContaining('Every decision here has its answer.') })
    await addContextNote({ issueId: t }, { kind: 'decision', title: 'Who can set someone as protected? (sample)', on: '2026-11-22', background: 'The ticket only says add.', options: '(a) admins only\n(b) any member', dependsOnNew: ['Does the backend use the core permissions? (sample)'] })
    await addContextNote({ issueId: t }, { kind: 'decision', title: 'Is there a limit? (sample)', answer: 'Fifty', body: 'Scan cost.', on: '2026-11-23' }, 'agent')
    await addContextNote({ issueId: t }, { kind: 'decision', title: 'Is it one page? (sample)', answer: 'Yes' }) // answered: not in it
    await addContextNote({ projectId: p.project.id }, { kind: 'decision', title: 'Is it per company? (sample)', on: '2026-11-20' })
    const v = await contextOf({ issueId: t })
    await editContextNote({ issueId: t }, v.notes.find((n) => n.title.startsWith('Does the backend'))!.id, { waitingOn: 'Em' })
    const d = await openQuestionsDoc({ issueId: t }, new Date('2026-11-24T12:00:00'))
    expect(d.count).toBe(4)
    expect(d.title).toMatch(/^Open questions: \S+-\d+ Protect executives \(sample\)$/)
    const md = d.markdown
    expect(md).toContain('Shop (sample) · as of 24 Nov 2026 · 4 open')
    expect(md).toMatch(/\| 1 \| Does the backend use the core permissions\? \(sample\) \| Em \|/)
    expect(md.indexOf('## Waiting on Em')).toBeLessThan(md.indexOf('## Not yet with anyone'))
    expect(md).toContain('### 3. Who can set someone as protected? (sample)\n\nAsked 22 Nov 2026\n\n**Background**\n\nThe ticket only says add.\n\n**Options**\n\n(a) admins only\n(b) any member\n\n**Depends on**: question 1 (Does the backend use the core permissions? (sample))')
    expect(md).toContain('**Proposed answer** (not decided): Fifty\n\nScan cost.')
    expect(md).toContain('· from the project, Sharing (sample)')
    expect(md).not.toContain('Is it one page?')
    const tool = engineTools({ appId, actor: 'agent' }).find((x) => x.name === 'context')!
    expect((await tool.handler({ op: 'open_questions', issueId: t })).content[0].text).toContain('# Open questions:')
  })

  it('shows a decision made as one statement as an answer with no question, and takes a question when it is given one', async () => {
    const t = (await createProject({ appId, name: 'Statements (sample)', issues: [{ title: 'A task from before (sample)', brief: 'Build it.' }] })).issues[0].id
    const n = await addNote(appId, { title: 'Test on an empty company first (sample)', kind: 'decision', issueIds: [t] }) // as the Reports page makes one
    expect((await contextOf({ issueId: t })).notes).toMatchObject([{ title: '', answer: 'Test on an empty company first (sample)', status: 'settled' }])
    expect(await contextPrompt({ issueId: t })).toContain('- Test on an empty company first (sample)\n')
    const v = await editContextNote({ issueId: t }, n.id, { title: 'Where is it tested first? (sample)', answer: 'On an empty company' })
    expect(v.notes).toMatchObject([{ title: 'Where is it tested first? (sample)', answer: 'On an empty company' }])
  })

  it('shows a task its project\'s, marked, and does not let it be changed from the task', async () => {
    await addDoc({ projectId }, { title: 'Design principles (sample)', body: 'One page, no steps.', inFull: true })
    await addContextNote({ projectId }, { kind: 'decision', title: 'One page on a phone too? (sample)', answer: 'Yes' })
    await addContextNote({ projectId }, { title: 'Talked with the team (sample)', body: 'Mobile gets its own ticket.' })
    const own = await contextOf({ projectId })
    expect(own).toMatchObject({ on: 'project', project: null })
    expect(own.docs.every((d) => !d.fromProject)).toBe(true)
    const v = await contextOf({ issueId: task })
    const doc = v.docs.find((d) => d.title === 'Design principles (sample)')!
    expect(doc.fromProject).toBe(true)
    expect(v.notes.filter((n) => n.fromProject).map((n) => n.title).sort()).toEqual(['One page on a phone too? (sample)', 'Talked with the team (sample)'])
    await expect(editDoc({ issueId: task }, doc.id, { title: 'Mine now' })).rejects.toThrow('no such doc in this context')
    await expect(editContextNote({ issueId: task }, v.notes.find((n) => n.fromProject)!.id, { title: 'Mine now' })).rejects.toThrow('no such note in this context')
    const prompt = await contextPrompt({ issueId: task })
    expect(prompt).toContain('- One page on a phone too? (sample) → Yes (from the project)')
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
    await addContextNote({ ideaId: i.id }, { kind: 'decision', title: 'Is a card saved without asking? (sample)', answer: 'No' })
    const v = await contextOf({ ideaId: i.id })
    expect(v).toMatchObject({ on: 'idea', docs: [{ id: o.id, from: 'ticket', inFull: true, ticket: { originating: true } }, { title: 'Support requests (sample)' }] })
    await expect(removeDoc({ ideaId: i.id }, o.id)).rejects.toThrow('the ticket the work came from stays')
    await expect(editDoc({ ideaId: i.id }, o.id, { title: 'x' })).rejects.toThrow('never edited here')
    expect(await contextPrompt({ ideaId: i.id })).not.toContain('Ticket SHOP-41 (sample)') // given whole by originPrompt, not said twice
    const out = await convertIdea(i.id, 'task')
    const moved = await contextOf({ issueId: out.issueId })
    expect(moved.docs.map((d) => d.title)).toEqual(['Ticket SHOP-41 (sample)', 'Support requests (sample)'])
    expect(moved.notes.map((n) => [n.title, n.answer])).toEqual([['Is a card saved without asking? (sample)', 'No']])
    expect(await contextOf({ ideaId: i.id })).toMatchObject({ docs: [{ id: o.id }], notes: [] })
  })

  it('lets an agent add to it through its tool: a note freely, a decision only as agreed or proposed', async () => {
    const tool = engineTools({ appId, actor: 'agent' }).find((t) => t.name === 'context')!
    const call = async (args: Record<string, unknown>) => JSON.parse((await tool.handler(args)).content[0].text)
    const t = (await createProject({ appId, name: 'Tooling (sample)', issues: [{ title: 'A task for the tool (sample)', brief: 'Build it.' }] })).issues[0].id
    expect(await call({ op: 'note', issueId: t, title: 'Found a slow call (sample)', body: 'Two seconds.' })).toEqual({ noted: 'Found a slow call (sample)' })
    expect(await call({ op: 'ask', issueId: t, title: 'Is the first call cached? (sample)' })).toMatchObject({ asked: 'Is the first call cached? (sample)' })
    expect(await call({ op: 'propose', issueId: t, title: 'Is the first call cached? (sample)', answer: 'Yes, for an hour' })).toMatchObject({ proposed: 'Yes, for an hour' })
    expect(await call({ op: 'decide', issueId: t, title: 'Is the vault changed? (sample)', answer: 'No, it stays as it is' })).toEqual({ recorded: 'No, it stays as it is', to: 'Is the vault changed? (sample)', as: 'settled' })
    expect((await tool.handler({ op: 'decide', issueId: t, title: 'A question with no answer (sample)' })).isError).toBe(true)
    await call({ op: 'doc', issueId: t, title: 'What I read (sample)', description: 'The guide, in short.', body: 'It is slow at first.' })
    const v = await call({ op: 'read', issueId: t })
    expect(v.notes.map((n: { status: string; addedBy: string; answer: string | null }) => [n.status, n.addedBy, n.answer])).toEqual([['settled', 'agent', null], ['proposed', 'agent', 'Yes, for an hour'], ['settled', 'agent', 'No, it stays as it is']])
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

  it('gives a task its own ticket, not every ticket in its project: the others are listed by title and can be pulled in', async () => {
    const { setTeamNames } = await import('./ticket.js')
    const { project: p, issues: [first, second, bare] } = await createProject({ appId, name: 'Executive protection (sample)', issues: [{ title: 'Protected people (sample)', brief: 'Build it.' }, { title: 'Takedowns (sample)', brief: 'Build it.' }, { title: 'Tidy up (sample)', brief: 'Build it.' }] })
    await addDoc({ projectId: p.id }, { title: 'PRD (sample)', body: 'The whole product, made up.' })
    for (const ref of ['EXP-1', 'EXP-2', 'EXP-3']) await addTicket({ projectId: p.id }, ref, 'user', keep)
    await setTeamNames(first.id, { ticket: 'EXP-1' })
    await setTeamNames(second.id, { ticket: 'EXP-2', also: ['EXP-9'] })
    await keep(appId, 'EXP-9') // read from the tracker, and in no Context: still the second task's, because it is under it
    // The project itself holds all three.
    expect((await contextOf({ projectId: p.id })).docs.map((d) => d.ticket?.origin.ref ?? d.title)).toEqual(['PRD (sample)', 'EXP-1', 'EXP-2', 'EXP-3'])
    expect((await contextOf({ projectId: p.id })).otherTickets).toEqual([])
    // A task: the PRD, its own ticket in full, and the other two by title only.
    const v = await contextOf({ issueId: first.id })
    expect(v.docs.map((d) => [d.ticket?.origin.ref ?? d.title, d.fromProject, d.under, d.inFull])).toEqual([['PRD (sample)', true, false, false], ['EXP-1', true, true, true]])
    expect(v.otherTickets.map((o) => [o.ref, o.title, o.sourceName])).toEqual([['EXP-2', 'Ticket EXP-2 (sample)', 'Linear'], ['EXP-3', 'Ticket EXP-3 (sample)', 'Linear']])
    const said = await contextPrompt({ issueId: first.id })
    expect(said).toContain('### The ticket this task is under: Linear EXP-1')
    expect(said).toContain('### The project\'s other tickets: not this task\'s work')
    expect(said).toContain('- Linear EXP-2: Ticket EXP-2 (sample)')
    expect(said).not.toMatch(/Reference[^\n]*EXP-2|kept[^\n]*EXP-2/) // not given, in full or as a file to open
    // Under a ticket by its other tickets too, and one no Context lists.
    const w = await contextOf({ issueId: second.id })
    expect(w.docs.filter((d) => d.under).map((d) => [d.ticket!.origin.ref, d.fromProject])).toEqual([['EXP-2', true], ['EXP-9', false]])
    expect(w.otherTickets.map((o) => o.ref)).toEqual(['EXP-1', 'EXP-3'])
    // A task under no ticket: the PRD, and every ticket by title.
    const b = await contextOf({ issueId: bare.id })
    expect(b.docs.map((d) => d.title)).toEqual(['PRD (sample)']); expect(b.otherTickets).toHaveLength(3)
    // Pulled in: one shared record on the task, out of the others, and it can be taken out again.
    await expect(pullTicket({ issueId: first.id }, 'EXP-9')).rejects.toThrow(/not one of the project's other tickets/)
    await expect(pullTicket({ projectId: p.id }, 'EXP-2')).rejects.toThrow(/only a task pulls in/)
    const pulled = await pullTicket({ issueId: first.id }, 'exp-3')
    expect(pulled.docs.map((d) => [d.ticket?.origin.ref ?? d.title, d.fromProject, d.under])).toEqual([['EXP-3', false, false], ['PRD (sample)', true, false], ['EXP-1', true, true]])
    expect(pulled.docs[0].ticket!.origin.id).toBe((await contextOf({ projectId: p.id })).docs.find((d) => d.ticket?.origin.ref === 'EXP-3')!.ticket!.origin.id)
    expect(pulled.otherTickets.map((o) => o.ref)).toEqual(['EXP-2'])
    expect((await removeDoc({ issueId: first.id }, pulled.docs[0].id)).otherTickets.map((o) => o.ref)).toEqual(['EXP-2', 'EXP-3'])
  })
})
