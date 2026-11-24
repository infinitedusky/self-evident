import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { applyMutant, changedLines, equivalentWhy, fromReport, mask, mutable, mutantsOf, mutationSetup, runMutants, sample, scoreOf, type Mutant, type Sh } from './mutation.js'

const dirs: string[] = []
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })
const ops = (ms: Mutant[]) => ms.map((m) => `${m.op}:${m.from.trim()}>${m.to}`)

describe('what is broken', () => {
  it('breaks code and never what is inside a string or a comment', () => {
    const py = 'x = "a < b and c"  # if a >= 2\nif a >= 2 and not b:\n    return a + 1\n'
    expect(mask(py, 'py').split('\n')[0]).not.toMatch(/<|and|>=/)
    expect(ops(mutantsOf('app/scan.py', py, [1]))).toEqual([])
    expect(ops(mutantsOf('app/scan.py', py, [2]))).toEqual(['boundary:>=>>', 'logic:and>or', 'negation:not>', 'number:2>3'])
    expect(ops(mutantsOf('app/scan.py', py, [3]))).toEqual(['arithmetic:+>-', 'number:1>2', 'return:a + 1>None'])
  })
  it('skips a docstring and a block comment that run over lines', () => {
    const py = 'def f(a):\n    """\n    returns a > 1 and True\n    """\n    return a > 1\n'
    expect(mutantsOf('f.py', py, [3])).toEqual([])
    expect(ops(mutantsOf('f.py', py, [5]))).toContain('boundary:>>>=')
    const ts = '/*\n * if (a === 1 && b) return true\n */\nexport const f = (a: number, b: boolean) => a === 1 && !b\n'
    expect(mutantsOf('f.ts', ts, [2])).toEqual([])
    expect(ops(mutantsOf('f.ts', ts, [4]))).toEqual(['equality:===>!==', 'logic:&&>||', 'negation:!>', 'number:1>2'])
  })
  it('leaves an arrow, a generic and an import alone', () => {
    const ts = "import { a } from './a'\nconst xs: Array<string> = ys.map((y) => y.name)\ntype T = { on: true }\n"
    expect(mutantsOf('f.ts', ts, [1, 2, 3])).toEqual([])
  })
  it('only breaks source: not a test, a story, a migration or a config', () => {
    expect(['app/scan.py', 'src/list.tsx'].map(mutable)).toEqual([true, true])
    expect(['tests/test_scan.py', 'src/list.test.tsx', 'src/List.stories.tsx', 'alembic/versions/1.py', 'migrations/0001.py', 'vite.config.ts', 'README.md', 'types.d.ts'].map(mutable)).toEqual(Array(8).fill(false))
  })
  it('puts a mutant in at its place, and refuses when the line has changed', () => {
    const text = 'a = 1\nif a <= 2:\n    pass\n'
    const [m] = mutantsOf('f.py', text, [2])
    expect(applyMutant(text, m)).toBe('a = 1\nif a < 2:\n    pass\n')
    expect(applyMutant('a = 1\nif a == 2:\n', m)).toBeNull()
  })
  it('keeps a mutant\'s id when its line moves, so what a person said of it still stands', () => {
    const a = mutantsOf('f.py', 'if a <= 2:\n    pass\n', [1]), b = mutantsOf('f.py', '\n\nif a <= 2:\n    pass\n', [3])
    expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id))
    expect(b[0].line).toBe(3)
  })
  it('sets aside a decorator\'s flag and a limit nudged by one, and nothing else', () => {
    const py = '@dataclass(frozen=True)\nMAX_ITEMS = 100\nif count > 3:\n'
    const [flag] = mutantsOf('f.py', py, [1]), [limit] = mutantsOf('f.py', py, [2]), rest = mutantsOf('f.py', py, [3])
    expect(equivalentWhy(flag)).toMatch(/decorator/)
    expect(equivalentWhy(limit)).toMatch(/limit nudged/)
    expect(rest.map(equivalentWhy)).toEqual([null, null])
  })
  it('takes the same sample each time, spread over all of them', () => {
    const all = Array.from({ length: 100 }, (_, i) => i)
    expect(sample(all, 4)).toEqual([0, 25, 50, 75])
    expect(sample(all, 200)).toBe(all)
  })
})

describe('the lines a branch changed', () => {
  it('reads added and changed lines by file, and nothing of what was deleted', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mut-')); dirs.push(repo)
    const g = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' })
    g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't')
    writeFileSync(join(repo, 'a.py'), 'one\ntwo\nthree\nfour\n'); writeFileSync(join(repo, 'gone.py'), 'x\n')
    g('add', '.'); g('commit', '-qm', 'base'); g('checkout', '-qb', 'work')
    writeFileSync(join(repo, 'a.py'), 'one\nTWO\nfour\nfive\n'); writeFileSync(join(repo, 'b.py'), 'new\nfile\n'); rmSync(join(repo, 'gone.py'))
    g('add', '-A'); g('commit', '-qm', 'work')
    const got = await changedLines(repo, 'main', 'work')
    expect(Object.fromEntries(got)).toEqual({ 'a.py': [2, 4], 'b.py': [1, 2] })
  })
})

describe('running them', () => {
  const tree = () => { const d = mkdtempSync(join(tmpdir(), 'mut-run-')); dirs.push(d); writeFileSync(join(d, 'f.py'), 'def f(a):\n    if a >= 2:\n        return a + 1\n    return 0\n'); return d }
  const mutants = (d: string) => mutantsOf('f.py', readFileSync(join(d, 'f.py'), 'utf8'), [2, 3])
  it('counts what the tests catch, names what they miss, and puts every file back', async () => {
    const d = tree(), was = readFileSync(join(d, 'f.py'), 'utf8')
    // The tests fail only when the boundary moves or the file will not load; everything else gets past them.
    const run: Sh = async (_cmd, cwd) => { const now = readFileSync(join(cwd, 'f.py'), 'utf8'); return now.includes('a > 2') ? { exit: 1, output: '=== 1 failed, 3 passed ===' } : now.includes('a - 1') ? { exit: 2, output: 'ERROR collecting f.py\nSyntaxError: invalid syntax' } : { exit: 0, output: '4 passed' } }
    const r = await runMutants({ cwd: d, mutants: mutants(d), testCmd: 'pytest t.py', tests: ['t.py'], run })
    if ('problem' in r) throw new Error(r.problem)
    expect(r).toMatchObject({ tried: 5, caught: 1, invalid: 1, files: 1 })
    expect(r.survivors.map((s) => `${s.line}:${s.from}>${s.to}`)).toEqual(['2:2>3', '3:1>2', '3:a + 1>None'])
    expect(r.survivors[0].means).toMatch(/nothing pins the number/)
    expect(readFileSync(join(d, 'f.py'), 'utf8')).toBe(was)
    expect(scoreOf(r)).toMatchObject({ caught: 1, meaningful: 4, percent: 25 })
    // What the person sets aside as equivalent leaves the score.
    expect(scoreOf(r, new Set([r.survivors[0].id]))).toMatchObject({ meaningful: 3, percent: 33 })
  })
  it('says so, and breaks nothing, when the tests fail with nothing changed', async () => {
    const d = tree()
    const r = await runMutants({ cwd: d, mutants: mutants(d), testCmd: 'pytest t.py', tests: ['t.py'], run: async () => ({ exit: 1, output: '1 failed' }) })
    expect(r).toMatchObject({ problem: expect.stringMatching(/do not pass here with nothing changed/) })
  })
  it('takes a mutant that hangs the tests as caught, and stops when it is out of time', async () => {
    const d = tree()
    let n = 0
    const hung = await runMutants({ cwd: d, mutants: mutants(d).slice(0, 2), testCmd: 'x', tests: [], run: async () => (n++ === 0 ? { exit: 0, output: 'ok' } : { exit: 1, output: '', timedOut: true }) })
    expect(hung).toMatchObject({ caught: 2, tried: 2 })
    const out = await runMutants({ cwd: d, mutants: mutants(d), testCmd: 'x', tests: [], budgetMs: -1, run: async () => ({ exit: 0, output: 'ok' }) })
    expect(out).toMatchObject({ tried: 0, partial: expect.stringMatching(/ran out of time/) })
  })
  it('really runs: a shell test, one break caught and one not', async () => {
    const d = mkdtempSync(join(tmpdir(), 'mut-real-')); dirs.push(d)
    writeFileSync(join(d, 'limit.js'), 'module.exports = (n) => n >= 3\n')
    writeFileSync(join(d, 't.js'), "const f = require('./limit.js'); if (f(5) !== true || f(1) !== false) { console.error('AssertionError: expected'); process.exit(1) }\n")
    const r = await runMutants({ cwd: d, mutants: mutantsOf('limit.js', readFileSync(join(d, 'limit.js'), 'utf8'), [1]), testCmd: 'node t.js', tests: ['t.js'] })
    if ('problem' in r) throw new Error(r.problem)
    // No test sits on the limit itself: both breaks around 3 get past (>= to >, 3 to 4).
    expect(r.caught).toBe(0)
    expect(r.survivors.map((s) => s.op)).toEqual(['boundary', 'number'])
    writeFileSync(join(d, 't.js'), "const f = require('./limit.js'); if (f(3) !== true || f(2) !== false) { console.error('AssertionError: expected'); process.exit(1) }\n")
    const again = await runMutants({ cwd: d, mutants: mutantsOf('limit.js', readFileSync(join(d, 'limit.js'), 'utf8'), [1]), testCmd: 'node t.js', tests: ['t.js'] })
    expect(again).toMatchObject({ caught: 2, survivors: [] })
  })
})

describe('an app\'s own tool', () => {
  it('reads a Stryker report, cut to the changed lines', () => {
    const report = { files: { 'src/list.ts': { source: 'a\nif (n > 3) x()\nreturn y\nz', mutants: [
      { id: '1', mutatorName: 'EqualityOperator', replacement: 'n >= 3', status: 'Survived', location: { start: { line: 2, column: 5 } } },
      { id: '2', mutatorName: 'BlockStatement', status: 'Killed', location: { start: { line: 3, column: 1 } } },
      { id: '3', mutatorName: 'StringLiteral', status: 'CompileError', location: { start: { line: 3, column: 1 } } },
      { id: '4', mutatorName: 'BooleanLiteral', status: 'Survived', location: { start: { line: 4, column: 1 } } },
    ] }, 'src/other.ts': { mutants: [{ id: '5', status: 'Survived', location: { start: { line: 1 } } }] } } }
    const r = fromReport(report, new Map([['src/list.ts', [2, 3]]]), ['src/list.test.ts'])
    expect(r).toMatchObject({ tool: 'app', found: 3, caught: 1, invalid: 1, files: 1 })
    expect(r.survivors).toHaveLength(1)
    expect(r.survivors[0]).toMatchObject({ file: 'src/list.ts', line: 2, to: 'n >= 3', code: 'if (n > 3) x()' })
  })
  it('reads the app\'s settings', () => {
    expect(mutationSetup(null)).toEqual({ off: false, tool: null, testCmd: null, max: 150 })
    expect(mutationSetup({ mutation: { off: true, tool: { cmd: 'npx stryker run', report: 'reports/mutation/mutation.json' }, test_cmd: 'pytest {files}', max: 40 } })).toEqual({ off: true, tool: { cmd: 'npx stryker run', report: 'reports/mutation/mutation.json' }, testCmd: 'pytest {files}', max: 40 })
  })
})
