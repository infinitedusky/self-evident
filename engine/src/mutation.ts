/**
 * Mutation testing of what a pull request changed (docs/proven-work.md, part 4; Sandy, 2026-11-23: "186 new tests,
 * and nothing proved any of them had ever been red. Mutation testing after the fact caught 82% of meaningful breaks
 * and missed 39 (sort order, edge inputs, log counts)").
 *
 * Only the lines the pull request added or changed, in its source files, and only against the tests that cover them
 * (the test plan's, and the test files the branch touches). Each mutant is one small break on one line: a boundary
 * moved, a comparison turned round, a condition dropped, a number nudged, a return emptied. The tests are run with
 * it in; if none fails, the mutant survived, and it is named: the file, the line, what changed, and what that means
 * in words.
 *
 * Three things are kept out of the score, and said:
 * - a mutant the code no longer loads with (a syntax or type error) broke nothing a test could have caught;
 * - a survivor that no test could see by what the code does (a flag on a decorator, a limit nudged off its boundary)
 *   is set aside as equivalent, and listed apart;
 * - one the person sets aside as equivalent, with their reason.
 *
 * The mutator is the engine's own and small: it reads lines, not a syntax tree, so it works on Python, TypeScript and
 * JavaScript alike and needs nothing installed. An app with a mutation tool of its own (Stryker, or anything that
 * writes Stryker's report) names it in its settings, and its report is read instead, cut to the changed lines.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git } from './git.js'
import { classifyRun, TEST_FILE } from './trajectory.js'

export type Lang = 'py' | 'js'
export const langOf = (file: string): Lang | null => (/\.py$/.test(file) ? 'py' : /\.[cm]?[jt]sx?$/.test(file) && !/\.d\.ts$/.test(file) ? 'js' : null)
/** A file whose changed lines are worth breaking: source, not a test, a story, a migration, generated or vendored. */
export const mutable = (file: string) => !!langOf(file) && !TEST_FILE.test(file) && !/(^|\/)(node_modules|dist|build|vendor|migrations?|alembic|__generated__|generated|stories|\.storybook|fixtures?|__mocks__|mocks?)\/|\.stories\.[jt]sx?$|\.config\.[cm]?[jt]s$|(^|\/)conftest\.py$|(^|\/)setup\.py$/.test(file)

/** The lines a branch added or changed since it left its base, by file. Deleted lines leave nothing to break. */
export async function changedLines(repo: string, base: string, head: string): Promise<Map<string, number[]>> {
  const out = (await git(repo, ['diff', '--unified=0', '--no-color', '--diff-filter=AM', `${base}...${head}`], { allowFail: true })).stdout
  const by = new Map<string, number[]>()
  let file: string | null = null
  for (const l of out.split('\n')) {
    const f = /^\+\+\+ b\/(.+)$/.exec(l)
    if (f) { file = f[1]; continue }
    if (l.startsWith('+++ ')) { file = null; continue }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(l)
    if (!h || !file) continue
    const start = Number(h[1]), n = h[2] === undefined ? 1 : Number(h[2])
    if (!n) continue
    const lines = by.get(file) ?? []
    for (let i = 0; i < n; i++) lines.push(start + i)
    by.set(file, lines)
  }
  return by
}

/**
 * The text with what is inside strings and comments blanked, the same length and the same lines, so a break is only
 * ever made in code. Line by line would miss a docstring or a block comment, so it is one pass over the file.
 */
export function mask(text: string, lang: Lang): string {
  const out = text.split('')
  let i = 0
  const blank = (from: number, to: number) => { for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ' }
  while (i < text.length) {
    const c = text[i], two = text.slice(i, i + 2), three = text.slice(i, i + 3)
    if (lang === 'py' && c === '#') { const e = text.indexOf('\n', i); const end = e < 0 ? text.length : e; blank(i, end); i = end; continue }
    if (lang === 'js' && two === '//') { const e = text.indexOf('\n', i); const end = e < 0 ? text.length : e; blank(i, end); i = end; continue }
    if (lang === 'js' && two === '/*') { const e = text.indexOf('*/', i + 2); const end = e < 0 ? text.length : e + 2; blank(i, end); i = end; continue }
    if (lang === 'py' && (three === '"""' || three === "'''")) { const e = text.indexOf(three, i + 3); const end = e < 0 ? text.length : e + 3; blank(i + 3, end - 3); i = end; continue }
    if (c === '"' || c === "'" || (lang === 'js' && c === '`')) {
      let k = i + 1
      while (k < text.length && text[k] !== c) { if (text[k] === '\\') k++; if (c !== '`' && text[k] === '\n') break; k++ }
      blank(i + 1, k); i = k + 1; continue
    }
    i++
  }
  return out.join('')
}

export interface Mutant {
  /** The same from one run to the next while the line says the same, wherever it has moved to. */ id: string
  file: string; line: number; /** Where on the line, from 0. */ col: number
  /** What kind of break. */ op: 'boundary' | 'equality' | 'logic' | 'arithmetic' | 'boolean' | 'negation' | 'number' | 'return'
  from: string; to: string
  /** What it means when no test fails with it, in words a reviewer reads. */ means: string
  /** The line as written. */ code: string
}

interface Op { op: Mutant['op']; langs?: Lang[]; re: RegExp; to: (m: string) => string | null; means: (from: string, to: string) => string }
const flip = (pairs: Record<string, string>) => (m: string) => pairs[m] ?? null
const OPS: Op[] = [
  { op: 'boundary', re: /(?<![<>=!-])(<=|>=)(?![=>])/g, to: (m) => m[0], means: (f) => `no test checks the value exactly at this limit: the code behaves the same to them whether \`${f}\` lets it through or not` },
  { op: 'boundary', re: /(?<=\s)(<|>)(?=\s)/g, to: (m) => `${m}=`, means: (f) => `no test checks the value exactly at this limit: the code behaves the same to them whether \`${f}\` shuts it out or not` },
  { op: 'equality', re: /(===|!==)/g, to: flip({ '===': '!==', '!==': '===' }), means: () => 'the tests pass with this comparison turned round: nothing checks which way it goes' },
  { op: 'equality', re: /(?<![=!<>])(==|!=)(?!=)/g, to: flip({ '==': '!=', '!=': '==' }), means: () => 'the tests pass with this comparison turned round: nothing checks which way it goes' },
  { op: 'logic', langs: ['js'], re: /(&&|\|\|)/g, to: flip({ '&&': '||', '||': '&&' }), means: (f) => (f === '&&' ? 'the tests pass when either condition alone is enough: no test has one true and the other false' : 'the tests pass when both conditions are needed: no test has only one of them true') },
  { op: 'logic', langs: ['py'], re: /\b(and|or)\b/g, to: flip({ and: 'or', or: 'and' }), means: (f) => (f === 'and' ? 'the tests pass when either condition alone is enough: no test has one true and the other false' : 'the tests pass when both conditions are needed: no test has only one of them true') },
  { op: 'arithmetic', re: /(?<=[\w)\]]\s)([+\-*/])(?=\s[\w(\[])/g, to: flip({ '+': '-', '-': '+', '*': '/', '/': '*' }), means: () => 'the tests do not check the value this works out' },
  { op: 'boolean', langs: ['js'], re: /\b(true|false)\b/g, to: flip({ true: 'false', false: 'true' }), means: () => 'the tests pass with this switched the other way: nothing depends on it' },
  { op: 'boolean', langs: ['py'], re: /\b(True|False)\b/g, to: flip({ True: 'False', False: 'True' }), means: () => 'the tests pass with this switched the other way: nothing depends on it' },
  { op: 'negation', langs: ['js'], re: /(?<![\w)\]])(!)(?=[\w(])/g, to: () => '', means: () => 'the tests pass when this condition is not turned round: no test has it false' },
  { op: 'negation', langs: ['py'], re: /\b(not\s+)/g, to: () => '', means: () => 'the tests pass when this condition is not turned round: no test has it false' },
  { op: 'number', re: /(?<![\w.])(\d+)(?![\w.])/g, to: (m) => String(Number(m) + 1), means: (f, t) => `the tests pass with ${t} here in place of ${f}: nothing pins the number` },
]
const RETURN: Record<Lang, { re: RegExp; to: string }> = {
  py: { re: /^(\s*return\s+)(?!None\s*$)(\S.*?)\s*$/, to: 'None' },
  js: { re: /^(\s*return\s+)(?!undefined\s*;?\s*$)(\S.*?);?\s*$/, to: 'undefined' },
}
const SKIP: Record<Lang, RegExp> = {
  py: /^\s*(import\s|from\s+\S+\s+import\b|pass\b|"""|''')/,
  js: /^\s*(import\b|export\s+(\*|\{[^}]*\})\s+from\b|(export\s+)?(declare\s+)?(type|interface)\s+\w|\/\/|\*)/,
}
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 10)

/** Every break the engine would make on the given lines of one file. Pure. */
export function mutantsOf(file: string, text: string, lines: number[]): Mutant[] {
  const lang = langOf(file)
  if (!lang) return []
  const raw = text.split('\n'), masked = mask(text, lang).split('\n')
  const out: Mutant[] = []
  const seen = new Map<string, number>()
  for (const n of [...new Set(lines)].sort((a, b) => a - b)) {
    const code = raw[n - 1], m = masked[n - 1]
    if (code === undefined || !m.trim() || SKIP[lang].test(code)) continue
    const add = (op: Mutant['op'], col: number, from: string, to: string, means: string) => {
      const key = `${file}:${op}:${hash(code.trim())}:${from}>${to}`
      const nth = seen.get(key) ?? 0; seen.set(key, nth + 1)
      out.push({ id: hash(`${key}:${nth}`), file, line: n, col, op, from, to, means, code: code.trim().slice(0, 200) })
    }
    for (const o of OPS) {
      if (o.langs && !o.langs.includes(lang)) continue
      o.re.lastIndex = 0
      for (let x = o.re.exec(m); x; x = o.re.exec(m)) {
        const from = x[1], to = o.to(from)
        if (to === null || to === from) continue
        add(o.op, x.index, from, to, o.means(from.trim(), to.trim()))
      }
    }
    // A return emptied: only one whose value is all on this line, or the rest of it would be left hanging.
    const r = RETURN[lang].re.exec(m)
    if (r && !/[([{,\\]\s*$/.test(m) && !/[)\]}]/.test(r[2].replace(/\([^()]*\)|\[[^\][]*\]|\{[^{}]*\}/g, '').replace(/\([^()]*\)|\[[^\][]*\]/g, ''))) add('return', r[1].length, code.slice(r[1].length).replace(/;?\s*$/, ''), RETURN[lang].to, 'the tests never look at what this returns')
  }
  return out
}

/** A file's text with one mutant in. Null when the line no longer says what the mutant was made from. */
export function applyMutant(text: string, m: Mutant): string | null {
  const lines = text.split('\n'), line = lines[m.line - 1]
  if (line === undefined || line.slice(m.col, m.col + m.from.length) !== m.from) return null
  lines[m.line - 1] = line.slice(0, m.col) + m.to + line.slice(m.col + m.from.length)
  return lines.join('\n')
}

/**
 * Why a survivor is set aside as one no test could have caught, or null (Sandy: "a frozen-dataclass flag, a value
 * already returned, a limit nudged off its boundary"). Only what a line shows for certain: anything else is the
 * person's to set aside, with their reason.
 */
export function equivalentWhy(m: Mutant): string | null {
  if (/^@/.test(m.code)) return 'a flag on a decorator: it changes how the class is declared, not what the code does'
  if (m.op === 'number' && (/^(export\s+)?(const\s+)?[A-Z][A-Z0-9_]*\s*(:[^=]+)?=/.test(m.code) || /\b(limit|max|min|timeout|ttl|retries|page_?size|per_?page|batch|chunk|interval|delay|width|height|size)\w*\s*[:=]/i.test(m.code))) return 'a limit nudged by one: no input sits exactly on it, so nothing a test does can tell'
  return null
}

/** At most `max` of them, spread evenly over the files and lines, the same ones each time. */
export function sample<T>(all: T[], max: number): T[] {
  if (all.length <= max) return all
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(all[Math.floor((i * all.length) / max)])
  return out
}

export type Outcome = 'killed' | 'survived' | 'invalid' | 'timeout'
export interface Survivor extends Mutant { /** Set aside as equivalent by the engine, with why. */ equivalent?: string }
export interface MutationResult {
  /** The engine's own mutator, or the app's tool. */ tool: 'evident' | 'app'
  /** Breaks found on the changed lines, and how many were tried. */ found: number; tried: number
  caught: number; survivors: Survivor[]
  /** Broke the code so it would not load: nothing a test could catch. */ invalid: number
  files: number
  /** The tests they were run against. */ tests: string[]
  /** Stopped early, and why. */ partial?: string
}
/** The score, with what the person has set aside as equivalent taken out: caught, of the meaningful breaks. */
export function scoreOf(r: Pick<MutationResult, 'caught' | 'survivors'>, setAside: Set<string> = new Set()): { caught: number; meaningful: number; percent: number | null; open: Survivor[]; equivalent: Survivor[] } {
  const equivalent = r.survivors.filter((s) => s.equivalent || setAside.has(s.id)), open = r.survivors.filter((s) => !s.equivalent && !setAside.has(s.id))
  const meaningful = r.caught + open.length
  return { caught: r.caught, meaningful, percent: meaningful ? Math.round((r.caught / meaningful) * 100) : null, open, equivalent }
}

export type Sh = (cmd: string, cwd: string, timeoutMs: number) => Promise<{ exit: number | null; output: string; timedOut?: boolean }>
export const sh: Sh = (cmd, cwd, timeoutMs) => new Promise((resolveP) => {
  // No bytecode kept: a break the same size as what it replaced, written in the same second, would be run from the stale copy.
  execFile('/bin/sh', ['-c', cmd], { cwd, maxBuffer: 20_000_000, timeout: timeoutMs, env: { ...process.env, CI: '1', FORCE_COLOR: '0', PYTHONDONTWRITEBYTECODE: '1' } }, (err, stdout, stderr) => {
    const e = err as (Error & { code?: unknown; killed?: boolean; signal?: string }) | null
    resolveP({ exit: e ? (typeof e.code === 'number' ? e.code : 1) : 0, output: `${stdout}\n${stderr}`, timedOut: !!e?.killed || e?.signal === 'SIGTERM' })
  })
})

export const MUTANTS_MAX = 150
export const BUDGET_MS = 25 * 60_000

/**
 * Each mutant in turn, in a checkout that is the engine's to write in: the file changed, the tests run, the file put
 * back. The tests are run once first with nothing changed: they must pass there, or nothing a mutant does means
 * anything. A mutant is caught when a test fails; one the code will not load with is left out; one that runs three
 * times as long as the tests take is taken as caught (it hung them).
 */
export async function runMutants(i: { cwd: string; mutants: Mutant[]; found?: number; testCmd: string; tests: string[]; run?: Sh; budgetMs?: number; onProgress?: (done: number, of: number) => void; signal?: AbortSignal }): Promise<MutationResult | { problem: string }> {
  const run = i.run ?? sh
  const t0 = Date.now()
  const first = await run(i.testCmd, i.cwd, 15 * 60_000)
  if (first.exit !== 0) return { problem: `the tests do not pass here with nothing changed, so a break could not be told from what is already failing (\`${i.testCmd.slice(0, 200)}\`): ${first.output.trim().split('\n').slice(-6).join(' ').slice(-500)}` }
  const each = Math.max(30_000, (Date.now() - t0) * 3)
  const budget = i.budgetMs ?? BUDGET_MS
  const survivors: Survivor[] = []
  let caught = 0, invalid = 0, tried = 0, partial: string | undefined
  const files = new Set<string>()
  for (const m of i.mutants) {
    if (i.signal?.aborted) { partial = 'it was stopped'; break }
    if (Date.now() - t0 > budget) { partial = `it ran out of time after ${Math.round(budget / 60_000)} minutes`; break }
    const path = join(i.cwd, m.file)
    if (!existsSync(path)) continue
    const was = readFileSync(path, 'utf8'), changed = applyMutant(was, m)
    if (changed === null) continue
    files.add(m.file)
    let ran: Awaited<ReturnType<Sh>>
    try { writeFileSync(path, changed); ran = await run(i.testCmd, i.cwd, each) } finally { writeFileSync(path, was) }
    tried++
    if (ran.exit === 0) { const why = equivalentWhy(m); survivors.push({ ...m, ...(why ? { equivalent: why } : {}) }) }
    else if (!ran.timedOut && classifyRun(ran.exit, ran.output) === 'fake') invalid++
    else caught++
    i.onProgress?.(tried, i.mutants.length)
  }
  return { tool: 'evident', found: i.found ?? i.mutants.length, tried, caught, survivors, invalid, files: files.size, tests: i.tests, ...(partial ? { partial } : {}) }
}

/**
 * An app's own mutation tool's report, in the form Stryker writes (mutation-testing-report-schema: files, each with
 * its mutants, their place and what became of them), cut to the lines the pull request changed.
 */
export function fromReport(report: unknown, changed: Map<string, number[]>, tests: string[] = []): MutationResult {
  const files = ((report ?? {}) as { files?: Record<string, { mutants?: { id?: string; mutatorName?: string; replacement?: string; description?: string; status?: string; location?: { start?: { line?: number; column?: number } } }[]; source?: string }> }).files ?? {}
  const survivors: Survivor[] = []
  let caught = 0, invalid = 0, found = 0
  const touched = new Set<string>()
  for (const [file, f] of Object.entries(files)) {
    const key = [...changed.keys()].find((k) => k === file || file.endsWith(`/${k}`) || k.endsWith(`/${file}`))
    if (!key) continue
    const lines = new Set(changed.get(key))
    const src = (f.source ?? '').split('\n')
    for (const m of f.mutants ?? []) {
      const line = m.location?.start?.line ?? 0
      if (!lines.has(line)) continue
      found++; touched.add(key)
      const status = (m.status ?? '').toLowerCase()
      if (status === 'killed' || status === 'timeout') caught++
      else if (status === 'survived' || status === 'nocoverage') {
        const code = (src[line - 1] ?? '').trim().slice(0, 200), to = (m.replacement ?? m.description ?? '').slice(0, 120)
        const s: Mutant = { id: hash(`${key}:${m.mutatorName}:${hash(code)}:${to}`), file: key, line, col: Math.max(0, (m.location?.start?.column ?? 1) - 1), op: 'equality', from: m.mutatorName ?? 'a change', to, means: status === 'nocoverage' ? 'no test runs this line at all' : `the tests pass with ${to ? `\`${to}\`` : 'this change'} here (${m.mutatorName ?? 'a mutant'})`, code }
        const why = equivalentWhy(s)
        survivors.push({ ...s, ...(why ? { equivalent: why } : {}) })
      } else invalid++
    }
  }
  return { tool: 'app', found, tried: found, caught, survivors, invalid, files: touched.size, tests }
}

/** How an app's mutation testing is set (its settings, `mutation`): off, its own tool, how the covering tests are run, how many breaks at most. */
export function mutationSetup(setup: unknown): { off: boolean; tool: { cmd: string; report: string } | null; testCmd: string | null; max: number } {
  const v = ((setup ?? {}) as { mutation?: { off?: boolean; tool?: { cmd?: string; report?: string }; test_cmd?: string; max?: number } }).mutation ?? {}
  return { off: v.off === true, tool: v.tool?.cmd?.trim() && v.tool.report?.trim() ? { cmd: v.tool.cmd.trim(), report: v.tool.report.trim() } : null, testCmd: v.test_cmd?.trim() || null, max: Number.isFinite(v.max) && Number(v.max) > 0 ? Math.min(2000, Math.floor(Number(v.max))) : MUTANTS_MAX }
}
