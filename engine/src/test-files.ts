/**
 * Test files: what a person needs in their hands to try a change (Sandy, 2026-11-23: "the one thing that's not a
 * part of this data is the smoke test assets. Things that are required to test … a CSV that has the person who
 * we're also enriching"; "it could be more than one, an image for instance and an id card"). The third kind of
 * thing on a task's Data step, beside its fixtures (what is in the app's database) and its services (what answers
 * outside it): a file, and a line saying what to do with it.
 *
 * A test file has up to two versions, as a service's endpoint has (Sandy, 2026-11-23: "on the file itself … we would
 * have a real and a fake version, and we would say which one to use for which environment. And the reviewer
 * environment can only use the fake one, or if it's already fake, it's just all the same"). Whoever adds one says it
 * is made up (it is the fake version, and the only one) or real: a real one is kept on this computer only, and where
 * it is text a fake is made of it at once (fake.ts). A real picture or document has no fake until a made-up one is
 * added under the same name. Text that is to go to a reviewer is also read against every real response of the app's
 * services on this computer; a made-up picture rests on the person's word.
 *
 * Each place a task runs says which version it uses: a prototype and a smoke test the fake unless a person turns the
 * real one on, a reviewer the fake always. When a prototype or a smoke test starts, the versions chosen are put in a
 * folder of its own outside every repository, and it is told where ($TEST_FILES): the same files, by the same names,
 * a reviewer will have (Sandy: "I'll be experiencing it just the way the reviewer would").
 *
 * The app's are for every task; a task has its own beside them. The files are kept on this computer
 * (~/.self-evident/test-files/<app>/<id>/<name>, the real version in real/ beside it) and the row says what it is.
 */
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { and, asc, eq, isNull, or } from 'drizzle-orm'
import { db } from './db/client.js'
import { issue, mock, mockData, testFile } from './db/schema.js'
import { appendEvent } from './events.js'
import { fake } from './fake.js'
import { newId } from './ids.js'
import { PlanError } from './issues.js'
import { checkLeaks, parseCsv } from './mock-leaks.js'
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
const realPathOf = (appId: string, id: string, name: string) => join(testFilesHome(), appId, id, 'real', name)
export type Version = 'fake' | 'real'
/** The places a person's own run is in: a reviewer's is not chosen, it is the fake. */
export const USE_PLACES = ['prototype', 'smoke'] as const
export type UsePlace = (typeof USE_PLACES)[number]

export interface TestFileView {
  id: string; name: string; what: string; mediaType: string; /** Of the version a reviewer gets, else of the real one. */ bytes: number; /** The app's, for every task, or one task's own. */ scope: 'app' | 'task'
  /** The version a reviewer gets, read against the real responses on this computer when it is text; faked: made from the real version, and how many values were replaced. */ checked: { at: string; against: number; faked?: number } | null
  /** Which versions are on this computer. fake: made up, or made from the real one. real: this computer only. */ has: { fake: boolean; real: boolean }
  /** Which version each place uses now. A reviewer: the fake, or nothing while there is none. */ use: Record<UsePlace, Version | null> & { review: 'fake' | null }
  /** Why the real version has no fake, when one could not be made. */ note?: string
  /** A CSV: its column names, which an endpoint's data can be mapped from (mock-file-map.ts). */ columns?: string[]
  /** A version of it is on this computer. */ here: boolean
}
type Row = typeof testFile.$inferSelect
/** A CSV's header: names, never a value. */
const headOf = (path: string): string[] => { try { return (parseCsv(readFileSync(path, 'utf8').slice(0, 20_000).split(/\r?\n/)[0] ?? '')[0] ?? []).slice(0, 200) } catch { return [] } }
const usedBy = (r: Row, place: UsePlace, has: { fake: boolean; real: boolean }): Version | null => ((r.use ?? {})[place] === 'real' && has.real ? 'real' : has.fake ? 'fake' : null)
const view = (r: Row): TestFileView => {
  const has = { fake: existsSync(pathOf(r.appId, r.id, r.name)), real: existsSync(realPathOf(r.appId, r.id, r.name)) }
  const columns = /csv$/.test(r.mediaType) && (has.fake || has.real) ? headOf(has.fake ? pathOf(r.appId, r.id, r.name) : realPathOf(r.appId, r.id, r.name)) : []
  return { id: r.id, name: r.name, what: r.what, mediaType: r.mediaType, bytes: r.bytes, scope: r.issueId ? 'task' : 'app', checked: r.checked ?? null, has, use: { prototype: usedBy(r, 'prototype', has), smoke: usedBy(r, 'smoke', has), review: has.fake ? 'fake' : null }, ...(r.real?.note && !has.fake ? { note: r.real.note } : {}), ...(columns.length ? { columns } : {}), here: has.fake || has.real }
}

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
 * A test file added: for the app, or for one task. `stated`: whoever adds it says it holds nothing real, and it is
 * the version every place gets. `real`: it may hold something real, so it is kept on this computer only and, where
 * it is text, a fake is made of it for a reviewer. One or the other, or it is refused. Added under the name of one
 * already there: a real one replaces its real version and the fake made of it; a made-up one replaces the fake and
 * leaves the real version be.
 */
export async function addTestFile(appId: string, i: { name: string; bytes: Uint8Array; what?: string; mediaType?: string; issueId?: string | null; stated?: boolean; real?: boolean }, actor = 'user'): Promise<TestFileView> {
  const name = cleanName(i.name)
  if (!name || name === 'README.md') throw new PlanError('a test file needs a name of its own, like one-person.csv')
  if (!i.bytes.length) throw new PlanError(`${name} is empty`)
  if (i.bytes.length > TEST_FILE_MAX) throw new PlanError(`${name} is over ${TEST_FILE_MAX / 1024 / 1024} MB: a test file is something a person uploads by hand`)
  if (!i.stated && !i.real) throw new PlanError('a test file goes to a reviewer: say it holds nothing real, or say it is real and a fake is made of it')
  if (i.issueId) { const [t] = await db.select({ appId: issue.appId }).from(issue).where(eq(issue.id, i.issueId)); if (!t || t.appId !== appId) throw new PlanError('no such task in this app') }
  const type = typeOf(name) === 'application/octet-stream' && i.mediaType ? i.mediaType.slice(0, 100) : typeOf(name)
  // The version a reviewer gets: the file itself when it is made up, the fake made of it when it is real.
  let safe: Uint8Array | null = i.real ? null : i.bytes
  let faked: number | undefined, note: string | undefined
  if (i.real && !isText(type)) note = 'It is not text, so no fake can be made of it here: add a made-up one under the same name'
  if (i.real && isText(type)) {
    const original = [{ name, text: new TextDecoder().decode(i.bytes) }]
    try {
      const { files: made, report } = fake(original, { salt: randomBytes(16).toString('hex') })
      const text = made[name] ?? Object.values(made)[0]
      const r = text ? checkLeaks(original, [{ path: name, text }], report.keptValues) : null
      // Said by count alone: what was found is someone's, and this is read on a page.
      if (r?.ok) { safe = new TextEncoder().encode(text); faked = report.replaced }
      else note = `The fake made of it would still carry ${r?.count ?? 'some'} value${r?.count === 1 ? '' : 's'} of the real file, so none was kept: ask the task's agent to write a made-up one under the same name`
    } catch (err) { note = `No fake could be made of it (${String((err as Error).message).slice(0, 120)}): add a made-up one under the same name` }
  }
  let checked: Row['checked'] = null
  if (safe && isText(type)) {
    const r = await leaksIn(appId, name, new TextDecoder().decode(safe))
    if (r.found.length) {
      const says = `${name} holds ${r.found.length} value${r.found.length === 1 ? '' : 's'} of a real response on this computer`
      if (!i.real) throw new PlanError(`refused: ${says}. Replace each with an invented one, or add it as real:\n${[...new Set(r.found)].map((f) => `- ${f} (${r.found.filter((x) => x === f).length})`).join('\n')}`)
      safe = null; faked = undefined; note = `The fake made of it still ${says.slice(name.length + 1)}, so none was kept: ask the task's agent to write a made-up one under the same name`
    } else checked = { at: new Date().toISOString(), against: r.against, ...(faked !== undefined ? { faked } : {}) }
  }
  const scope = i.issueId ? eq(testFile.issueId, i.issueId) : isNull(testFile.issueId)
  const all = await db.select().from(testFile).where(and(eq(testFile.appId, appId), scope))
  const old = all.find((r) => r.name === name)
  if (!old && all.length >= TEST_FILES_MAX) throw new PlanError(`${TEST_FILES_MAX} test files at most ${i.issueId ? 'for a task' : 'for an app'}`)
  const id = old?.id ?? newId('testFile')
  const dir = join(testFilesHome(), appId, id)
  mkdirSync(dir, { recursive: true })
  if (i.real) { mkdirSync(join(dir, 'real'), { recursive: true }); writeFileSync(join(dir, 'real', name), i.bytes); rmSync(join(dir, name), { force: true }) } // the fake of an older real version is not this one's
  if (safe) writeFileSync(join(dir, name), safe)
  const what = String(i.what ?? old?.what ?? '').trim().slice(0, 300)
  const real: Row['real'] = i.real ? { bytes: i.bytes.length, at: new Date().toISOString(), ...(note ? { note } : {}) } : old?.real ? { bytes: old.real.bytes, at: old.real.at } : null
  const set = { what, mediaType: type, bytes: (safe ?? i.bytes).length, checked, real }
  const workspaceId = await workspaceOf(appId)
  const row = await db.transaction(async (tx) => {
    const [r] = old
      ? await tx.update(testFile).set({ ...set, updatedAt: new Date() }).where(eq(testFile.id, id)).returning()
      : await tx.insert(testFile).values({ id, appId, issueId: i.issueId ?? null, name, ...set, createdBy: actor }).returning()
    await appendEvent(tx, { workspaceId, appId, issueId: i.issueId ?? null, actor, type: old ? 'test_file.replaced' : 'test_file.added', payload: { id, name, bytes: i.bytes.length, real: !!i.real, fake: !!safe } })
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
export async function editTestFile(appId: string, id: string, i: { what?: string; /** Which version a place uses: the real one only where there is one. */ use?: Partial<Record<UsePlace, Version>> }, actor = 'user'): Promise<TestFileView> {
  const r = await rowOf(appId, id)
  const use = { ...(r.use ?? {}) }
  for (const p of USE_PLACES) { const v = i.use?.[p]; if (v === undefined) continue; if (v !== 'fake' && v !== 'real') throw new PlanError('a place uses the fake version or the real one'); if (v === 'real' && !existsSync(realPathOf(appId, r.id, r.name))) throw new PlanError(`${r.name} has no real version`); use[p] = v }
  const workspaceId = await workspaceOf(appId)
  const [next] = await db.transaction(async (tx) => {
    const out = await tx.update(testFile).set({ what: String(i.what ?? r.what).trim().slice(0, 300), use, updatedAt: new Date() }).where(eq(testFile.id, id)).returning()
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
/** Where a version of the file is, to give it to the person: the one a reviewer gets unless the real one is asked for, or is all there is. */
export async function testFilePath(appId: string, id: string, version?: Version) {
  const r = await rowOf(appId, id), fakeAt = pathOf(appId, r.id, r.name), realAt = realPathOf(appId, r.id, r.name)
  const path = version === 'real' ? realAt : version === 'fake' || existsSync(fakeAt) ? fakeAt : realAt
  if (!existsSync(path)) throw new PlanError(version ? `${r.name} has no ${version} version on this computer` : `${r.name} is no longer on this computer: add it again`)
  return { path, name: r.name, mediaType: r.mediaType, version: (path === realAt ? 'real' : 'fake') as Version }
}

/** A file of the app's by its name, whoever's it is (the app's, or any task's own): to say what columns it has. */
export async function testFileNamed(appId: string, name: string): Promise<TestFileView | null> {
  const rows = await db.select().from(testFile).where(and(eq(testFile.appId, appId), eq(testFile.name, name)))
  const r = rows.find((x) => !x.issueId) ?? rows[0]
  return r ? view(r) : null
}
/** A file's text in the version a place uses, by its name: a task's own before the app's. None: no such file, or no version this place may have. */
export async function testFileText(appId: string, issueId: string | null, place: UsePlace | 'review', name: string): Promise<{ text: string; version: Version } | null> {
  const rows = await db.select().from(testFile).where(and(eq(testFile.appId, appId), eq(testFile.name, name), issueId ? or(isNull(testFile.issueId), eq(testFile.issueId, issueId)) : isNull(testFile.issueId)))
  const r = rows.find((x) => x.issueId) ?? rows[0]
  if (!r) return null
  const v = view(r), version = place === 'review' ? v.use.review : v.use[place]
  if (!version) return null
  return { text: readFileSync(version === 'real' ? realPathOf(appId, r.id, r.name) : pathOf(appId, r.id, r.name), 'utf8'), version }
}

export interface Placed { dir: string; files: { name: string; what: string; version: Version }[]; /** Left out: no version this place may have. */ missing: string[] }
/**
 * The files a place gets, put in a folder of its own: each by its name, in the version the place uses, with a
 * README.md saying what each is for. The folder is made again whole each time, so it is what the page says and no
 * more. A task's own file takes the place of the app's of the same name. A reviewer's holds no real version, ever.
 */
export async function placeTestFiles(appId: string, issueId: string | null, place: UsePlace | 'review', dir: string): Promise<Placed> {
  const rows = await db.select().from(testFile).where(and(eq(testFile.appId, appId), issueId ? or(isNull(testFile.issueId), eq(testFile.issueId, issueId)) : isNull(testFile.issueId))).orderBy(asc(testFile.createdAt))
  const byName = new Map<string, Row>()
  for (const r of [...rows.filter((x) => !x.issueId), ...rows.filter((x) => x.issueId)]) byName.set(r.name, r)
  rmSync(dir, { recursive: true, force: true })
  const out: Placed = { dir, files: [], missing: [] }
  if (!byName.size) return out
  mkdirSync(dir, { recursive: true })
  for (const r of byName.values()) {
    const v = view(r), version = place === 'review' ? v.use.review : v.use[place]
    if (!version) { out.missing.push(r.name); continue }
    copyFileSync(version === 'real' ? realPathOf(appId, r.id, r.name) : pathOf(appId, r.id, r.name), join(dir, r.name))
    out.files.push({ name: r.name, what: r.what, version })
  }
  writeFileSync(join(dir, 'README.md'), ['# Test files', '', 'What a tester needs to try this. Put here by Self Evident; changed on the task\'s Data step, not here.', '', ...out.files.map((f) => `- \`${f.name}\`${f.version === 'real' ? ' (REAL: this computer only)' : ''}${f.what ? `: ${f.what}` : ''}`), ''].join('\n'))
  return out
}
/** What a folder a run was given holds now, as it was put there: read back from the folder, nothing written. None: it was given no files. */
export async function placedFiles(appId: string, issueId: string | null, place: UsePlace, dir: string): Promise<Placed | null> {
  if (!existsSync(join(dir, 'README.md'))) return null
  const all = await listTestFiles(appId, issueId)
  const byName = new Map(all.map((f) => [f.name, f])) // a task's own comes after the app's, and takes its place
  const files = [...byName.values()].filter((f) => existsSync(join(dir, f.name))).map((f) => ({ name: f.name, what: f.what, version: (f.use[place] ?? 'fake') as Version }))
  return { dir, files, missing: [] }
}
/** The same, in words for an agent that tries the task. */
export const testFilesSay = (p: Placed): string[] => (p.files.length ? [`Test files for this task are in ${p.dir} (what a tester brings to it: upload or import them where the check calls for a file):`, ...p.files.map((f) => `- ${f.name}${f.what ? `: ${f.what}` : ''}`)] : [])
