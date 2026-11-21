/**
 * The leak check: does a mock carry any value from the recording it was mined from? (mocks.ts; Sandy, 2026-11-20:
 * "the exported copy contains no value from the recording".) Pure.
 *
 * A mock keeps the recording's shape (its keys, column names, nesting and formats) and replaces every value. So the
 * recording is read for its values only, and the mock's files are searched for them:
 * - emails, addresses (URLs), ids (UUIDs) and runs of seven or more digits (phones, account numbers, dates),
 *   wherever they are;
 * - a value of two or three words (a name, a place), or any four words in a row of a longer one (prose), wherever
 *   they are, prose and code alike;
 * - a one-word value of four letters or more, as a whole value of the mock (a cell, a string); inside prose too when
 *   it looks like a handle (a digit, a dot or an underscore in it, or a capital inside it).
 * What the recording uses as a key or a column name is shape and is never a hit. A value the mock keeps on purpose
 * because it is shape (a status, "completed"; a category) is named in its `kept` list, which the Mocks page shows; an
 * email, an address, an id or a number cannot be kept.
 */

export interface Leak { file: string; kind: 'email' | 'address' | 'id' | 'number' | 'words' | 'value'; /** The value, cut short: for the agent that mines, which has read the recording. Never shown on a page. */ excerpt: string }
export interface LeakReport { ok: boolean; leaks: Leak[]; /** All hits, where leaks stops at LEAKS_SHOWN. */ count: number; /** What was read of the recording. */ read: { files: number; values: number } }
export const LEAKS_SHOWN = 20

const STOP = new Set(['true', 'false', 'null', 'none', 'nan', 'n/a', 'undefined', 'yes', 'no'])
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu
const URL_RE = /\bhttps?:\/\/[^\s"'<>`|\\)\]}]+/gi
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const DIGITS = /\+?\d[\d\s().\-/:]{5,}\d/g
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’_.-]*[\p{L}\p{N}]|[\p{L}\p{N}]/gu

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
const words = (s: string) => (norm(s).match(WORD) ?? []).map((w) => w.replace(/[.’']+$/g, ''))
const urlOf = (u: string) => norm(u).replace(/[.,;:!?]+$/, '').replace(/\/+$/, '')
const digitsOf = (d: string) => d.replace(/\D/g, '')

/** The atoms of a text found anywhere in it: emails, addresses, ids, numbers. */
function anywhere(text: string) {
  const out: { kind: Leak['kind']; v: string }[] = []
  for (const m of text.match(EMAIL) ?? []) out.push({ kind: 'email', v: norm(m) })
  for (const m of text.match(URL_RE) ?? []) out.push({ kind: 'address', v: urlOf(m) })
  for (const m of text.match(UUID) ?? []) out.push({ kind: 'id', v: m.toLowerCase() })
  for (const m of text.match(DIGITS) ?? []) { const d = digitsOf(m); if (d.length >= 7) out.push({ kind: 'number', v: d }); if (d.length > 10) out.push({ kind: 'number', v: d.slice(-10) }) } // and without a country code
  return out
}
const grams = (ws: string[], n: number) => { const out: string[] = []; for (let i = 0; i + n <= ws.length; i++) out.push(ws.slice(i, i + n).join(' ')); return out }
/** Rare enough to look for inside prose: a handle's digit, dot or underscore, or a capital inside the word (McAllister). */
const handleLike = (raw: string) => /[\d_.]/.test(raw) || /\p{Ll}\p{Lu}/u.test(raw)

// ---- reading a file into values and shape -------------------------------------------------------------------------

/** One CSV text into rows (RFC 4180: quotes, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c; continue }
    if (c === '"' && cell === '') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}
export const looksCsv = (text: string) => { const first = text.slice(0, 4000).split(/\r?\n/)[0] ?? ''; return first.split(',').length >= 3 && !/^\s*[[{<]/.test(text) }

const DEPTH = 8
interface Read { values: string[]; shape: string[]; /** Values that are data written out (JSON, a Python-style list): read for what is inside them, and for ids anywhere in them, never as a run of words, since their keys would make one. */ inside: string[] }
/** A value, and what is inside it: JSON in a cell, or quoted strings in a Python-style list. */
function addValue(v: string, out: Read, depth = 0) {
  const t = v.trim()
  if (!t) return
  // Data written out inside data inside data (a provider's raw answer kept as a string in a cell): gone into as far as it goes.
  // Past that, something that is still written-out data is read for ids anywhere in it, never as a run of words.
  if (depth > DEPTH) { if (/^[[{(]/.test(t) && /["']\s*:/.test(t)) out.inside.push(t); else out.values.push(t); return }
  if (/^[[{]/.test(t)) { try { const j: unknown = JSON.parse(t); if (j && typeof j === 'object') { out.inside.push(t); walk(j, out, depth + 1); return } } catch { /* not JSON: a repr, perhaps */ } }
  // Every quoted string is paired, however short, or a one-letter one ('x') would pair the wrong quotes from there on.
  const quoted = [...t.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].filter((m) => (m[1] ?? m[2]).length >= 2)
  if (quoted.length && /^[[{(]/.test(t)) out.inside.push(t); else out.values.push(t)
  for (const m of quoted) {
    const inner = m[1] ?? m[2]
    if (/^\s*:/.test(t.slice(m.index! + m[0].length))) out.shape.push(inner) // a key of a dict written out in a cell
    else addValue(inner, out, depth + 1)
  }
}
function walk(x: unknown, out: Read, depth = 0) {
  if (typeof x === 'string') addValue(x, out, depth)
  else if (typeof x === 'number' || typeof x === 'bigint') out.values.push(String(x))
  else if (Array.isArray(x)) for (const y of x) walk(y, out, depth)
  else if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) { out.shape.push(k); walk(y, out, depth) }
}
/** A recorded file's values and its shape (keys, column names). */
export function readRecorded(text: string): Read {
  const out: Read = { values: [], shape: [], inside: [] }
  const t = text.replace(/^﻿/, '')
  try { walk(JSON.parse(t), out); return out } catch { /* not one JSON document */ }
  if (/^\s*[[{]/.test(t) && t.includes('\n')) { // JSON lines
    let all = true
    for (const line of t.split('\n').filter((l) => l.trim())) { try { walk(JSON.parse(line), out) } catch { all = false; break } }
    if (all) return out
    out.values.length = 0; out.shape.length = 0; out.inside.length = 0
  }
  if (looksCsv(t)) {
    const [head, ...rows] = parseCsv(t)
    out.shape.push(...(head ?? []))
    for (const r of rows) for (const c of r) addValue(c, out)
    return out
  }
  for (const line of t.split(/\r?\n/)) addValue(line, out) // anything else: each line a value
  return out
}

// ---- the check ----------------------------------------------------------------------------------------------------

export interface Recorded { name: string; text: string }
export interface MockFile { path: string; text: string }

export function checkLeaks(recorded: Recorded[], files: MockFile[], kept: string[] = []): LeakReport {
  const shape = new Set<string>(), keptSet = new Set(kept.map(norm).filter(Boolean))
  const strong = new Map<string, Leak['kind']>() // found anywhere
  const phrases = new Set<string>() // 2–4 words in a row, found anywhere
  const whole = new Set<string>() // a one-word value, as a whole value
  const handles = new Set<string>() // a one-word value that is rare enough to look for inside prose
  const proper = new Set<string>() // a one-word value written as a name is (Rowan, Northgate): looked for anywhere, as written
  let values = 0
  const reads = recorded.map((r) => readRecorded(r.text))
  for (const r of reads) for (const k of r.shape) { shape.add(norm(k)); for (const w of words(k)) shape.add(w) }
  for (const r of reads) for (const raw of r.inside) for (const a of anywhere(raw)) strong.set(a.v, a.kind)
  for (const r of reads) for (const raw of r.values) {
    values++
    for (const a of anywhere(raw)) strong.set(a.v, a.kind)
    const v = norm(raw)
    if (shape.has(v) || keptSet.has(v) || STOP.has(v)) continue
    const ws = words(raw)
    if (ws.length === 1 && /^\p{Lu}\p{Ll}{2,}$/u.test(raw.trim())) proper.add(raw.trim())
    if (ws.length === 1) { if (v.length >= 4 && !/^\d+(\.\d+)?$/.test(v)) { whole.add(v); if (handleLike(raw.trim()) && ws[0].length >= 4) handles.add(ws[0]) } } // a handle is looked for inside prose only when it is long enough to be someone's: "(1)." is not
    else if (ws.length <= 3) phrases.add(ws.join(' '))
    else for (const g of grams(ws, 4)) phrases.add(g)
  }
  for (const k of keptSet) phrases.delete(k)

  const leaks: Leak[] = []
  let count = 0
  const hit = (file: string, kind: Leak['kind'], v: string) => { count++; if (leaks.length < LEAKS_SHOWN && !leaks.some((l) => l.file === file && l.excerpt === v.slice(0, 60))) leaks.push({ file, kind, excerpt: v.slice(0, 60) }) }
  for (const f of files) {
    const seen = new Set<string>()
    const once = (kind: Leak['kind'], v: string) => { if (seen.has(v)) return; seen.add(v); hit(f.path, kind, v) }
    for (const a of anywhere(f.text)) if (strong.has(a.v)) once(strong.get(a.v)!, a.v)
    const ws = words(f.text)
    // A run of words that are all structure (keys, column names, kept values, true and false, small numbers) is the response's shape, not anyone's data.
    const plain = (w: string) => shape.has(w) || keptSet.has(w) || STOP.has(w) || /^\d{1,6}(\.\d+)?$/.test(w)
    for (const n of [2, 3, 4]) for (const g of grams(ws, n)) if (phrases.has(g) && !shape.has(g) && !g.split(' ').every(plain)) once('words', g)
    for (const w of ws) if (handles.has(w) && !shape.has(w)) once('value', w)
    // A first name alone in a sentence is someone's too. As it was written, capital and all, so "Mark" is found and "mark" is not.
    for (const m of f.text.matchAll(/\p{Lu}\p{Ll}{2,}/gu)) if (proper.has(m[0]) && !shape.has(m[0].toLowerCase())) once('value', m[0].toLowerCase())
    // Whole values: the mock read the way the recording was (its cells and strings), and its code's string literals.
    const mine = readRecorded(f.text).values
    for (const m of f.text.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`]*)`/g)) { const lit = m[1] ?? m[2] ?? m[3]; if (lit.length >= 4) mine.push(lit) }
    for (const raw of mine) { const v = norm(raw); if (whole.has(v) && !shape.has(v)) once('value', v) }
  }
  return { ok: count === 0, leaks, count, read: { files: recorded.length, values } }
}

/** What a kept value may not be: anything that is a person's or an account's, whatever the mock says. */
export function keptRefused(kept: string[]): string[] {
  return kept.filter((k) => anywhere(k).length > 0 || k.length > 40)
}
