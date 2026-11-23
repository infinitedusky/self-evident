/**
 * An endpoint's data with fields mapped from a file of the fixtures (Sandy, 2026-11-23: "on the endpoint be able to
 * select fields from either Meridian or a file … So if you tried to do it with a PDF, there would be no fields, but
 * if it's a CSV, you have fields. That means you can fake the data, but map certain fields to the fixture").
 *
 * The file is what a tester brings (test-files.ts): the people in it are who the app will ask the service about, so
 * the mock has to answer for them. The mapping is all that is kept on the endpoint's data. It is worked out each
 * time the data is served, from the version of the file the place uses: a person's own run on the real version is
 * answered for the real person, a reviewer's on the fake for the made-up one, and nothing real is stored in a mock.
 */
import { csvCell } from './fake.js'
import { looksCsv, parseCsv } from './mock-leaks.js'

/** data column ← the file's column. '': the column is there and left empty (one the app wants present, and fills by other means). */
export interface FromFile { file: string; map: Record<string, string> }
export const FILE_PEOPLE_MAX = 200

/** A CSV's rows as records by its header; none for anything else. */
export function csvRecords(text: string): { columns: string[]; rows: Record<string, string>[] } {
  if (!looksCsv(text) && !/^[^\n,]+(\r?\n|$)/.test(text)) return { columns: [], rows: [] }
  const [head = [], ...rest] = parseCsv(text)
  return { columns: head, rows: rest.filter((r) => r.length === head.length && r.some((c) => c !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) }
}

/**
 * The data, answering for the file's people: the template's rows written once for each, with the mapped columns set
 * from them. A mapped column the data does not have is added. `keep`: the rows already there (made for a database
 * fixture's people) stay, and the file's people come after them; otherwise the file's people are all it answers for.
 * Data that is not a CSV is left as it is.
 */
export function withFilePeople(template: string, current: string, people: Record<string, string>[], map: Record<string, string>, keep: boolean): string {
  if (!looksCsv(template) || !people.length) return current
  const [head0 = [], ...own] = parseCsv(template), eol = template.includes('\r\n') ? '\r\n' : '\n'
  const head = [...head0, ...Object.keys(map).filter((c) => !head0.includes(c))]
  const wide = (r: string[]) => [...r, ...Array(Math.max(0, head.length - r.length)).fill('')]
  const base = own.filter((r) => r.length === head0.length)
  const out: string[][] = keep ? parseCsv(current).slice(1).filter((r) => r.length === head0.length).map(wide) : []
  for (const p of people.slice(0, FILE_PEOPLE_MAX)) for (const r of base.length ? base : [Array(head0.length).fill('')]) {
    const row = wide(r)
    for (const [c, from] of Object.entries(map)) row[head.indexOf(c)] = from ? p[from] ?? '' : ''
    out.push(row)
  }
  return [head, ...out].map((r) => r.map(csvCell).join(',')).join(eol) + eol
}
