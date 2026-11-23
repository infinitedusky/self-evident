/**
 * The faker: a real response in, an invented one of the same structure out (Sandy, 2026-11-21: "we need a feature
 * that will take the real person and make a fake version of it, kind of like a really rudimentary faker").
 *
 * Why not leave it to an agent: an agent rewriting values by hand loses what makes a real response worth having, the
 * cells nobody thought of (an empty list, a paragraph with line breaks in it, a dict written out inside a cell). This
 * is mechanical and repeatable. It reads a file the way the leak check does (mock-leaks.ts: one JSON document, JSON
 * lines, CSV, or lines), goes into what is packed inside a value (JSON, or a Python-style list or dict), and:
 *
 * - keeps the structure: every column and key in order, the nesting, which values are empty, each long text's
 *   lines and rough length, booleans, nulls and small numbers, and whatever the plan says is structure (a status
 *   column, a category);
 * - replaces every other value by its kind: an email, a web address, an id, a date (shifted), a long number or
 *   phone (same format, other digits), a short text (word for word, keeping its capitals and punctuation), a long
 *   text (sample text marked "Sample data:");
 * - is consistent: the same real value becomes the same fake one wherever it appears, so the data still hangs
 *   together.
 *
 * It is rudimentary on purpose, and it is not the guard: the leak check runs on what it makes and refuses anything
 * that still carries a real value. What it cannot hide is the outline (how many findings, how long each), so lists
 * inside a value lose a few items unless the plan says not to.
 */
import { createHash } from 'node:crypto'
import { looksCsv, parseCsv } from './mock-leaks.js'

export interface FakePlan {
  /** Columns or keys whose values are structure, kept as they are: a name ("status"), or a path ("findings.severity"). */ keep?: string[]
  /** Values kept wherever they are (a status, a category), whatever column they are in. */ keepValues?: string[]
  /** Hosts of web addresses kept, because which site it is is structure ("linkedin.com"); the rest of the address is still faked. */ keepHosts?: string[]
  /** Columns or keys always replaced whole with sample text, whatever they hold: a cell or key holding a written-out object or list becomes text too, keys and all. */ text?: string[]
  /** false: lists inside a value keep their length. */ varyCounts?: boolean
  /** Makes the same real value the same fake one each time this response is faked. Never leaves this computer. */ salt?: string
}
export interface FakeReport {
  files: number; /** Values replaced. */ replaced: number; /** Values left as they were. */ kept: number
  byKind: Record<string, number>
  /** What was kept because the plan said so: these go to the leak check as kept, and into the provenance. */ keptValues: string[]
  /** Columns or keys the plan kept but that held something personal (an email, an address, an id): faked anyway. */ refusedKeep: string[]
  /** Columns or keys whose values all look like structure (one short word each) and were replaced: perhaps to keep. Names only. */ maybeStructure: string[]
}

const STOP = new Set(['true', 'false', 'null', 'none', 'nan', 'n/a', 'undefined', 'yes', 'no', ''])
const SMALL = new Set(['of', 'and', 'the', 'in', 'at', 'for', 'to', 'a', 'an', 'on', 'by', 'with', 'or'])
const EMAIL = /^[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}$/u
const WEB = /^https?:\/\/[^\s"'<>`|\\]+$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PERSONAL = /@[\p{L}\p{N}.-]+\.\p{L}{2,}|https?:\/\/|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/iu
// Plain, neutral words: a fake is plainly a fake, and none is anyone's name.
const POOL = ['amber', 'basalt', 'cedar', 'delta', 'ember', 'fallow', 'garnet', 'harbor', 'indigo', 'juniper', 'kelp', 'larch', 'meadow', 'nimbus', 'ochre', 'pebble', 'quartz', 'russet', 'sorrel', 'thistle', 'umber', 'vale', 'willow', 'yarrow', 'zinnia', 'alder', 'birch', 'cobalt', 'dune', 'elm', 'fjord', 'glade', 'heath', 'iris', 'jade', 'knoll', 'lichen', 'moss', 'nettle', 'opal', 'pine', 'quill', 'reed', 'slate', 'tarn', 'upland', 'vetch', 'wren', 'aster', 'bramble', 'clover', 'drift', 'fern', 'gorse', 'hazel', 'islet', 'kale', 'linden', 'marsh', 'oat', 'plume', 'rowan', 'sedge', 'teasel']

// ---- a value written out: JSON, or a Python-style list or dict ------------------------------------------------------

type Node =
  | { t: 'dict'; items: [Node, Node][] }
  | { t: 'list'; open: string; items: Node[] }
  | { t: 'str'; v: string; raw: string; q: string }
  | { t: 'raw'; raw: string }
const CLOSE: Record<string, string> = { '[': ']', '(': ')', '{': '}' }
const ESC: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '0': '\0' }

/** Read one written-out value, or throw: strings in either quote, True/False/None as well as true/false/null, numbers as written. */
export function parseLiteral(text: string): Node {
  let i = 0
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++ }
  const fail = (what: string): never => { throw new Error(`${what} at ${i}`) }
  const value = (): Node => {
    ws()
    const c = text[i]
    if (c === '{') {
      i++
      const items: [Node, Node][] = []
      for (;;) {
        ws()
        if (text[i] === '}') { i++; break }
        const k = value()
        ws()
        if (text[i] !== ':') fail('expected :')
        i++
        items.push([k, value()])
        ws()
        if (text[i] === ',') { i++; continue }
        if (text[i] === '}') { i++; break }
        fail('expected , or }')
      }
      return { t: 'dict', items }
    }
    if (c === '[' || c === '(') {
      i++
      const items: Node[] = []
      for (;;) {
        ws()
        if (text[i] === CLOSE[c]) { i++; break }
        items.push(value())
        ws()
        if (text[i] === ',') { i++; continue }
        if (text[i] === CLOSE[c]) { i++; break }
        fail('expected , or the end of the list')
      }
      return { t: 'list', open: c, items }
    }
    if (c === '"' || c === "'") {
      const start = i++
      let v = ''
      for (;;) {
        if (i >= text.length) fail('a string that does not end')
        const d = text[i++]
        if (d === c) break
        if (d !== '\\') { v += d; continue }
        const e = text[i++]
        if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i, i + 4))) { v += String.fromCharCode(parseInt(text.slice(i, i + 4), 16)); i += 4 }
        else if (e === 'x' && /^[0-9a-fA-F]{2}$/.test(text.slice(i, i + 2))) { v += String.fromCharCode(parseInt(text.slice(i, i + 2), 16)); i += 2 }
        else v += ESC[e] ?? e
      }
      return { t: 'str', v, raw: text.slice(start, i), q: c }
    }
    const m = /^[A-Za-z0-9_.+-]+/.exec(text.slice(i, i + 80))
    if (!m) fail('not a value')
    i += m![0].length
    return { t: 'raw', raw: m![0] }
  }
  const node = value()
  ws()
  if (i < text.length) fail('something after the value')
  return node
}

interface Style { item: string; kv: string; indent: number }
const styleOf = (text: string): Style => {
  const pretty = /^\s*[[{(]\s*\n( +)/.exec(text)
  return { item: /,\s/.test(text) ? ', ' : ',', kv: /:\s/.test(text) ? ': ' : ':', indent: pretty ? pretty[1].length : 0 }
}
const quote = (v: string, q: string) => q === '"'
  ? JSON.stringify(v)
  : `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}'`
function write(n: Node, s: Style, depth = 0): string {
  if (n.t === 'str' || n.t === 'raw') return n.raw
  const open = n.t === 'dict' ? '{' : n.open
  const parts = n.t === 'dict' ? n.items.map(([k, v]) => `${write(k, s, depth + 1)}${s.kv}${write(v, s, depth + 1)}`) : n.items.map((x) => write(x, s, depth + 1))
  if (!parts.length) return open + CLOSE[open]
  if (!s.indent) return open + parts.join(s.item) + (n.t === 'list' && n.open === '(' && parts.length === 1 ? ',' : '') + CLOSE[open]
  const pad = ' '.repeat(s.indent * (depth + 1))
  return `${open}\n${parts.map((p) => pad + p).join(',\n')}\n${' '.repeat(s.indent * depth)}${CLOSE[open]}`
}

// ---- the faker ----------------------------------------------------------------------------------------------------

export const csvCell = (c: string) => (/[",\r\n]/.test(c) || /^\s|\s$/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)

export function fake(recorded: { name: string; text: string }[], plan: FakePlan = {}): { files: Record<string, string>; report: FakeReport } {
  const salt = plan.salt ?? 'self-evident'
  const low = (xs?: string[]) => new Set((xs ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))
  const keep = low(plan.keep), keepValues = low(plan.keepValues), textPaths = low(plan.text)
  const hosts = [...low(plan.keepHosts)].map((h) => h.replace(/^www\./, ''))
  // No fake word may be a word of the real response: a fake that happened to be someone's name would be a leak.
  const real = new Set<string>()
  for (const r of recorded) for (const w of r.text.toLowerCase().match(/\p{L}+/gu) ?? []) real.add(w)
  const pool = POOL.filter((w) => !real.has(w))
  if (pool.length < 8) throw new Error('the faker has too few words that are not in the response to make a fake of it')

  const report: FakeReport = { files: 0, replaced: 0, kept: 0, byKind: {}, keptValues: [], refusedKeep: [], maybeStructure: [] }
  const keptValues = new Set<string>(), refused = new Set<string>()
  const fields = new Map<string, { n: number; plain: number; faked: number; lower: number }>()
  const cache = new Map<string, string>()

  const bytes = (what: string, v: string) => createHash('sha256').update(`${salt}\0${what}\0${v}`).digest()
  /** The at-th word of a run of words made for a value: a new run of hash every 15, so long text does not repeat. */
  const word = (of: string, at: number) => pool[bytes('word', `${of}\0${Math.floor(at / 15)}`).readUInt16BE((at % 15) * 2) % pool.length]
  const digit = (b: Buffer, at: number) => String(b[at % 32] % 10)
  const shift = 37 + (bytes('shift', '')[0] * 256 + bytes('shift', '')[1]) % 300 // days, into the past
  const moved = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - shift * 86_400_000)
  const two = (n: number) => String(n).padStart(2, '0')

  const onPath = (set: Set<string>, path: string[]) => !!path.length && (set.has(path.join('.').toLowerCase()) || set.has(path[path.length - 1].toLowerCase()))
  const count = (kind: string) => { report.replaced++; report.byKind[kind] = (report.byKind[kind] ?? 0) + 1 }
  const note = (path: string[], v: string, faked: boolean) => {
    const k = path.join('.')
    if (!k) return
    const f = fields.get(k) ?? { n: 0, plain: 0, faked: 0, lower: 0 }
    f.n++
    if (/^[\p{L}][\p{L}_-]{1,23}$/u.test(v)) f.plain++
    if (faked) f.faked++
    if (v === v.toLowerCase()) f.lower++
    fields.set(k, f)
  }

  const digits = (t: string) => { const b = bytes('digits', t); let n = 0; return t.replace(/\d/g, () => digit(b, n++)) }
  /** Word for word: letters to a word of the same case, digits to other digits, everything else as it is. */
  const tokens = (t: string) => {
    const b = bytes('words', t), many = /\s/.test(t.trim())
    let n = 0
    return t.replace(/\p{L}+|\d+/gu, (w) => {
      const at = n++
      if (/^\d+$/.test(w)) return w.replace(/\d/g, (_, i: number) => digit(b, at * 3 + i))
      if (many && SMALL.has(w.toLowerCase())) return w
      if (w.length <= 3 && w === w.toUpperCase() && w !== w.toLowerCase()) return [...w].map((_, i) => String.fromCharCode(65 + (b[(at * 3 + i) % 32] % 26))).join('')
      const p = word(`t\0${t}`, at)
      return w === w.toUpperCase() && w !== w.toLowerCase() ? p.toUpperCase() : w[0] !== w[0].toLowerCase() ? p[0].toUpperCase() + p.slice(1) : p
    })
  }
  /** Sample text of the same lines and about the same length. */
  const prose = (t: string) => {
    let n = 0
    return t.split('\n').map((line, li) => {
      const lead = /^\s*/.exec(line)![0], want = line.trim().length
      if (!want) return line
      let out = li === 0 ? 'Sample data:' : ''
      for (let first = li !== 0; out.length < want; first = false) { const w = word(`p\0${t}`, n++); out += `${out ? ' ' : ''}${first ? w[0].toUpperCase() + w.slice(1) : w}` }
      return `${lead}${out}.`
    }).join('\n')
  }
  const web = (t: string) => {
    let u: URL
    try { u = new URL(t) } catch { return tokens(t) }
    const host = u.hostname.replace(/^www\./, '')
    const keepHost = hosts.some((h) => host === h || host.endsWith(`.${h}`))
    const path = u.pathname.split('/').map((seg) => { let s = seg; try { s = decodeURIComponent(seg) } catch { /* as written */ } return !seg || (keepHost && /^\p{Ll}{1,2}$/u.test(seg)) ? seg : tokens(s).replace(/[^\w.~-]+/g, '-') }).join('/') // a kept site's /in/ or /u/ is its structure
    const query = [...u.searchParams].map(([k, v]) => `${k}=${encodeURIComponent(tokens(v))}`).join('&')
    const faked = `${u.protocol}//${keepHost ? u.host : `${word(`w\0${t}`, 0)}-${word(`w\0${t}`, 1)}.example`}${path === '/' && !t.replace(/[?#].*$/, '').endsWith('/') ? '' : path}${query ? `?${query}` : ''}${u.hash ? `#${tokens(u.hash.slice(1))}` : ''}`
    if (keepHost) keptValues.add(host)
    return faked === t ? `${faked.replace(/\/$/, '')}/${word(`w\0${t}`, 2)}` : faked // a kept host with nothing after it would be the real address
  }

  /** One value as text: what it becomes, and of what kind (null: kept). */
  const leaf = (t: string, path: string[]): { v: string; kind: string | null } => {
    const lowT = t.toLowerCase()
    if (STOP.has(lowT) || /^[-+]?\d{1,6}(\.\d+)?%?$/.test(t)) return { v: t, kind: null }
    if (keepValues.has(lowT) || onPath(keep, path)) {
      if (!PERSONAL.test(t) && t.length <= 40 && (t.match(/\d/g) ?? []).length < 7) { keptValues.add(t); return { v: t, kind: null } }
      refused.add(path.join('.') || t.slice(0, 20))
    }
    const hit = cache.get(t)
    if (hit !== undefined) return { v: hit, kind: 'again' }
    let v: string, kind: string
    const b = bytes('value', t)
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?=$|[T\s])/.exec(t), us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?=$|\s)/.exec(t)
    if (onPath(textPaths, path)) { v = prose(t); kind = 'text' }
    else if (EMAIL.test(t)) { v = `${word(`e\0${t}`, 0)}.${word(`e\0${t}`, 1)}@${word(`e\0${t}`, 2)}.example`; kind = 'email' }
    else if (WEB.test(t)) { v = web(t); kind = 'address' }
    else if (UUID.test(t)) { const h = b.toString('hex'); v = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; kind = 'id' }
    else if (iso) { const d = moved(+iso[1], +iso[2], +iso[3]); v = `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}${t.slice(iso[0].length)}`; kind = 'date' }
    else if (us) { const d = moved(+us[3], +us[1], +us[2]); v = `${us[1].length === 2 ? two(d.getUTCMonth() + 1) : d.getUTCMonth() + 1}/${us[2].length === 2 ? two(d.getUTCDate()) : d.getUTCDate()}/${d.getUTCFullYear()}${t.slice(us[0].length)}`; kind = 'date' }
    else if (/^[+(]?\d[\d\s().\-/:]*$/.test(t)) { v = digits(t); kind = 'number' }
    else if (t.includes('\n') || t.length > 60 || t.trim().split(/\s+/).length > 5) { v = prose(t); kind = 'text' }
    else { v = tokens(t); kind = 'words' }
    // Never the real one back: other digits tried until they differ (one digit comes out the same one time in ten).
    for (let n = 1; v === t && kind === 'number' && n < 12; n++) v = digits(t + ' '.repeat(n)).trimEnd()
    if (v === t) v = `${v}-${word(`x\0${t}`, 0)}`
    cache.set(t, v)
    return { v, kind }
  }

  /** A value that may have more written inside it. */
  const value = (raw: string, path: string[], depth: number, level = 0): string => {
    const t = raw.trim()
    if (!t) return raw
    const lead = raw.slice(0, raw.indexOf(t)), tail = raw.slice(raw.indexOf(t) + t.length)
    // A column or key named as text is replaced whole, whatever it holds: a written-out object there is not gone into, since its keys may be what was found.
    if (depth < 9 && /^[[{(]/.test(t) && !onPath(textPaths, path)) { // as deep as the leak check reads (mock-leaks.ts)
      try { const n = parseLiteral(t); walk(n, path, depth + 1, level + 1); return lead + write(n, styleOf(t)) + tail } catch { /* not one written-out value */ }
      // Something like one (it has quoted strings): those and its long numbers, where they stand. Anything else that merely opens with a bracket, "(1)." or "[draft] a note", is a plain value.
      if (/["']/.test(t)) return lead + t.replace(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\d{7,}/g, (m, a: string | undefined, b: string | undefined, at: number) => {
        if (a === undefined && b === undefined) { count('number'); return digits(m) }
        if (/^\s*:/.test(t.slice(at + m.length))) return m
        const r = leaf(a ?? b ?? '', path)
        if (r.kind) count(r.kind); else report.kept++
        return r.kind ? quote(r.v, m[0]) : m
      }) + tail
    }
    const r = leaf(t, path)
    note(path, t, !!r.kind)
    if (r.kind) count(r.kind); else report.kept++
    return r.kind ? lead + r.v + tail : raw
  }
  /** level: how far inside the response this is (0: the document itself). */
  function walk(n: Node, path: string[], depth: number, level: number) {
    if (n.t === 'str') { const v = value(n.v, path, depth, level); if (v !== n.v) { n.v = v; n.raw = quote(v, n.q) } return }
    if (n.t === 'raw') { if (/^\d{7,}$/.test(n.raw)) { n.raw = digits(n.raw); count('number') } else report.kept++; return }
    if (n.t === 'list') {
      if (plan.varyCounts !== false && level >= 1 && n.items.length >= 5) { // the outline: a few fewer
        const b = bytes('count', `${path.join('.')}:${n.items.length}`)
        for (let drop = 1 + (b[0] % Math.max(1, Math.floor(n.items.length / 5))), k = 1; drop > 0; drop--, k++) n.items.splice(b[k] % n.items.length, 1)
      }
      for (const x of n.items) walk(x, path, depth, level + 1)
      return
    }
    for (const pair of n.items) {
      const [k, v] = pair
      // A key is structure, unless it is itself someone's (an email or an id used as a key).
      if (k.t === 'str' && PERSONAL.test(k.v)) { const r = leaf(k.v, path); if (r.kind) { k.v = r.v; k.raw = quote(r.v, k.q); count(r.kind) } }
      const at = k.t === 'str' ? [...path, k.v] : path
      // A key named as text that holds an object or a list: replaced whole with sample text, keys and all.
      if (k.t === 'str' && (v.t === 'dict' || v.t === 'list') && onPath(textPaths, at)) { const made = prose(write(v, { item: ', ', kv: ': ', indent: 0 })); pair[1] = { t: 'str', v: made, raw: quote(made, k.q), q: k.q }; count('text'); continue }
      walk(v, at, depth, level + 1)
    }
  }

  const files: Record<string, string> = {}
  for (const r of recorded) {
    report.files++
    const bom = r.text.startsWith('﻿') ? '﻿' : '', t = r.text.slice(bom.length)
    const whole = (): string | null => { // one written-out document
      if (!/^\s*[[{]/.test(t)) return null
      try { const n = parseLiteral(t.trim()); walk(n, [], 0, 0); return /^\s*/.exec(t)![0] + write(n, styleOf(t)) + /\s*$/.exec(t)![0] } catch { return null }
    }
    const lines = (): string | null => { // one to a line
      if (!/^\s*[[{]/.test(t) || !t.trim().includes('\n')) return null
      const out: string[] = []
      for (const line of t.split('\n')) {
        if (!line.trim()) { out.push(line); continue }
        try { const n = parseLiteral(line.trim()); walk(n, [], 0, 0); out.push(write(n, styleOf(line))) } catch { return null }
      }
      return out.join('\n')
    }
    const csv = (): string | null => {
      if (!looksCsv(t)) return null
      const [head, ...rows] = parseCsv(t)
      const nl = t.includes('\r\n') ? '\r\n' : '\n'
      const out = [head.map(csvCell).join(','), ...rows.map((row) => row.map((c, i) => csvCell(value(c, [head[i] ?? `column ${i + 1}`], 0))).join(','))]
      return out.join(nl) + (/\r?\n$/.test(t) ? nl : '')
    }
    files[r.name] = bom + (whole() ?? lines() ?? csv() ?? t.split('\n').map((line) => value(line, [], 0)).join('\n'))
  }
  report.keptValues = [...keptValues].sort()
  report.refusedKeep = [...refused].sort()
  // Never a column that by its name is someone's (a first name is one plain word too), and never one whose values begin with a capital, as a name does.
  const someones = /name|address|city|state|street|zip|postal|country|locality|region|company|employer|organi[sz]ation|title|handle|user|owner|author/i
  report.maybeStructure = [...fields].filter(([k, f]) => f.n > 0 && f.plain === f.n && f.faked === f.n && f.lower === f.n && !someones.test(k)).map(([k]) => k).sort()
  return { files, report }
}
