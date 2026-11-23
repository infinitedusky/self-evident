/**
 * Test files: what a person needs in their hands to try a change (Sandy, 2026-11-23: "the one thing that's not a
 * part of this data is the smoke test assets. Things that are required to test … a CSV that has the person who
 * we're also enriching"; "it could be more than one, an image for instance and an id card"). The third kind of
 * thing on a task's Data step, beside its fixtures (what is in the app's database) and its services (what answers
 * outside it): a file, and a line saying what to do with it.
 *
 * A test file goes to a reviewer, so what is kept holds nothing real. Whoever adds one says it is made up, or says it
 * is real (Sandy, 2026-11-23: "if it holds something real, then what we should do is have it fake it or clean it"):
 * a real one that is text is faked on the way in (fake.ts) and only the fake is kept, the real file never. A real
 * picture or document cannot be faked here and is refused. Text is also read against every real response of the
 * app's services on this computer; a made-up picture rests on the person's word.
 *
 * The app's are for every task; a task has its own beside them. The file is kept on this computer
 * (~/.self-evident/test-files/<app>/<id>/<name>) and its row says what it is.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { and, asc, eq, isNull, or } from 'drizzle-orm'
import { db } from './db/client.js'
import { issue, mock, mockData, testFile } from './db/schema.js'
import { appendEvent } from './events.js'
import { fake } from './fake.js'
import { newId } from './ids.js'
import { PlanError } from './issues.js'
import { checkLeaks } from './mock-leaks.js'
import { readRecording, recordingsOfService, workspaceOf } from './mocks.js'

export const testFilesHome = () => process.env.TEST_FILES_HOME ?? join(homedir(), '.self-evident', 'test-files')
export const TEST_FILE_MAX = 10 * 1024 * 1024
export const TEST_FILES_MAX = 30
/** How many real responses of a service a text file is read against, newest first. */
const CHECKED_AGAINST = 20

const TYPES: Record<string, string> = { csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', txt: 'text/plain', md: 'text/markdown', xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', heic: 'image/heic', zip: 'application/zip', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
const typeOf = (name: string) => TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
const isText = (type: string) => type.startsWith('text/') || type === 'application/json' || type === 'application/xml'
/** A file's name as it is kept and given back: no folders, nothing a shell or a header would trip on. */
const cleanName = (name: string) => name.replace(/^.*[\\/]/, '').replace(/[^\w.() -]+/g, '-').replace(/^\.+/, '').trim().slice(0, 120)
const pathOf = (appId: string, id: string, name: string) => join(testFilesHome(), appId, id, name)

export interface TestFileView { id: string; name: string; what: string; mediaType: string; bytes: number; /** The app's, for every task, or one task's own. */ scope: 'app' | 'task'; /** Text read against the real responses on this computer; a picture or a document rests on the person's word. */ checked: { at: string; against: number; /** Made from a real file by the faker: how many values were replaced. The real file was not kept. */ faked?: number } | null; /** It is on this computer: one whose file is gone cannot be given to anyone. */ here: boolean }
type Row = typeof testFile.$inferSelect
const view = (r: Row): TestFileView => ({ id: r.id, name: r.name, what: r.what, mediaType: r.mediaType, bytes: r.bytes, scope: r.issueId ? 'task' : 'app', checked: r.checked ?? null, here: existsSync(pathOf(r.appId, r.id, r.name)) })

/** The app's test files, and (for a task) the task's own after them. */
export async function listTestFiles(appId: string, issueId?: string | null): Promise<TestFileView[]> {
  const rows = await db.select().from(testFile).where(and(eq(testFile.appId, appId), issueId ? or(isNull(testFile.issueId), eq(testFile.issueId, issueId)) : isNull(testFile.issueId))).orderBy(asc(testFile.createdAt))
  return [...rows.filter((r) => !r.issueId), ...rows.filter((r) => r.issueId)].map(view)
}

/** Every value of a real response of the app's services that is in this text, service by service. */
async function leaksIn(appId: string, name: string, text: string) {
  let against = 0
  const found: string[] = []
  for (const m of await db.select().from(mock).where(eq(mock.appId, appId))) {
    // What is structure for this service is already known: what its mock and its fakes were allowed to keep.
    const kept = [...new Set([...(((m.provenance ?? {}) as { kept?: string[] }).kept ?? []), ...(await db.select().from(mockData).where(eq(mockData.mockId, m.id))).flatMap((d) => ((d.provenance ?? {}) as { kept?: string[] }).kept ?? [])])]
    for (const rec of recordingsOfService(appId, m.key).slice(0, CHECKED_AGAINST)) {
      if (!existsSync(rec.dir)) continue
      against++
      const r = checkLeaks(readRecording(rec.dir), [{ path: name, text }], kept)
      // What was found is said by its kind and never quoted: this is read on a page, and the value is someone's.
      if (!r.ok) for (const l of r.leaks) found.push(`${l.kind === 'words' ? 'a run of words' : l.kind === 'value' ? 'a value' : `an ${l.kind}`.replace('an number', 'a number')} from a real response of ${m.name}`)
    }
  }
  return { against, found }
}

/**
 * A test file added: for the app, or for one task. `stated`: whoever adds it says it holds nothing real. `real`: it
 * may hold something real, so a fake is made of it and kept in its place; the real file is never written anywhere.
 * One or the other, or it is refused. Text is read against the real responses here as well. One of the same name in
 * the same place is replaced.
 */
export async function addTestFile(appId: string, i: { name: string; bytes: Uint8Array; what?: string; mediaType?: string; issueId?: string | null; stated?: boolean; real?: boolean }, actor = 'user'): Promise<TestFileView> {
  const name = cleanName(i.name)
  if (!name) throw new PlanError('a test file needs a name, like one-person.csv')
  if (!i.bytes.length) throw new PlanError(`${name} is empty`)
  if (i.bytes.length > TEST_FILE_MAX) throw new PlanError(`${name} is over ${TEST_FILE_MAX / 1024 / 1024} MB: a test file is something a person uploads by hand`)
  if (!i.stated && !i.real) throw new PlanError('a test file goes to a reviewer: say it holds nothing real, or say it is real and a fake is made of it')
  if (i.issueId) { const [t] = await db.select({ appId: issue.appId }).from(issue).where(eq(issue.id, i.issueId)); if (!t || t.appId !== appId) throw new PlanError('no such task in this app') }
  const type = typeOf(name) === 'application/octet-stream' && i.mediaType ? i.mediaType.slice(0, 100) : typeOf(name)
  let checked: Row['checked'] = null
  let faked: number | undefined
  if (i.real) {
    if (!isText(type)) throw new PlanError(`${name} is real and is not text, so no fake can be made of it here. Add a made-up one in its place`)
    const original = [{ name, text: new TextDecoder().decode(i.bytes) }]
    const { files: made, report } = fake(original, { salt: randomBytes(16).toString('hex') })
    const text = made[name] ?? Object.values(made)[0]
    const r = text ? checkLeaks(original, [{ path: name, text }], report.keptValues) : null
    // Said by count alone: what was found is someone's, and this is read on a page.
    if (!r?.ok) throw new PlanError(`refused: the fake of ${name} would still carry ${r?.count ?? 'some'} value${r?.count === 1 ? '' : 's'} of the real file, so nothing was kept. Ask the task's agent to write a made-up one`)
    i = { ...i, bytes: new TextEncoder().encode(text) }
    faked = report.replaced
  }
  if (isText(type)) {
    const r = await leaksIn(appId, name, new TextDecoder().decode(i.bytes))
    if (r.found.length) throw new PlanError(`refused: ${name} holds ${r.found.length} value${r.found.length === 1 ? '' : 's'} of a real response on this computer. Replace each with an invented one:\n${[...new Set(r.found)].map((f) => `- ${f} (${r.found.filter((x) => x === f).length})`).join('\n')}`)
    checked = { at: new Date().toISOString(), against: r.against, ...(faked !== undefined ? { faked } : {}) }
  }
  const scope = i.issueId ? eq(testFile.issueId, i.issueId) : isNull(testFile.issueId)
  const all = await db.select().from(testFile).where(and(eq(testFile.appId, appId), scope))
  const old = all.find((r) => r.name === name)
  if (!old && all.length >= TEST_FILES_MAX) throw new PlanError(`${TEST_FILES_MAX} test files at most ${i.issueId ? 'for a task' : 'for an app'}`)
  const id = old?.id ?? newId('testFile')
  const dir = join(testFilesHome(), appId, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), i.bytes)
  const what = String(i.what ?? old?.what ?? '').trim().slice(0, 300)
  const workspaceId = await workspaceOf(appId)
  const row = await db.transaction(async (tx) => {
    const [r] = old
      ? await tx.update(testFile).set({ what, mediaType: type, bytes: i.bytes.length, checked, updatedAt: new Date() }).where(eq(testFile.id, id)).returning()
      : await tx.insert(testFile).values({ id, appId, issueId: i.issueId ?? null, name, what, mediaType: type, bytes: i.bytes.length, checked, createdBy: actor }).returning()
    await appendEvent(tx, { workspaceId, appId, issueId: i.issueId ?? null, actor, type: old ? 'test_file.replaced' : 'test_file.added', payload: { id, name, bytes: i.bytes.length } })
    return r
  })
  return view(row)
}

async function rowOf(appId: string, id: string) {
  const [r] = await db.select().from(testFile).where(and(eq(testFile.appId, appId), eq(testFile.id, id)))
  if (!r) throw new PlanError('no such test file')
  return r
}
/** What the person does with it, said again. */
export async function editTestFile(appId: string, id: string, i: { what?: string }, actor = 'user'): Promise<TestFileView> {
  const r = await rowOf(appId, id)
  const workspaceId = await workspaceOf(appId)
  const [next] = await db.transaction(async (tx) => {
    const out = await tx.update(testFile).set({ what: String(i.what ?? r.what).trim().slice(0, 300), updatedAt: new Date() }).where(eq(testFile.id, id)).returning()
    await appendEvent(tx, { workspaceId, appId, issueId: r.issueId, actor, type: 'test_file.changed', payload: { id, name: r.name } })
    return out
  })
  return view(next)
}
export async function removeTestFile(appId: string, id: string, actor = 'user') {
  const r = await rowOf(appId, id)
  const workspaceId = await workspaceOf(appId)
  await db.transaction(async (tx) => {
    await tx.delete(testFile).where(eq(testFile.id, id))
    await appendEvent(tx, { workspaceId, appId, issueId: r.issueId, actor, type: 'test_file.removed', payload: { id, name: r.name } })
  })
  rmSync(join(testFilesHome(), appId, id), { recursive: true, force: true })
  return { removed: r.name }
}
/** Where the file is, to give it to the person: its name and type with it. */
export async function testFilePath(appId: string, id: string) {
  const r = await rowOf(appId, id), path = pathOf(appId, r.id, r.name)
  if (!existsSync(path)) throw new PlanError(`${r.name} is no longer on this computer: add it again`)
  return { path, name: r.name, mediaType: r.mediaType }
}
