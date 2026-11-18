/**
 * Landing: parallel work, serial landing. A finished sub-task is merged with the project's integration branch and
 * fast-forwarded onto it, one at a time per project. (InDusk run-the-graph D5/D6; the data on agent PR conflicts
 * says keep writes single-threaded.)
 *
 * The whole test run is not part of a sub-task's landing (Sandy, 2026-11-15: "running the full test suite for each
 * subtask is dumb, we should test what we are building and then do the regression when the task is done"). Its
 * builder tests what it built; `wholeRun` runs the app's test command once, when every sub-task of the task is in.
 */
import { spawn } from 'node:child_process'
import { commitAll, fastForward, git, hasUncommitted, headSha, mergeInto } from './git.js'

export interface LandInput {
  repoPath: string // the main checkout: owns the refs
  worktreePath: string // the task's worktree
  integrationBranch: string
  testCmd?: string
  testTimeoutMs?: number
  /** A check or a probe: it changes nothing, so what it left in its worktree is thrown away, never committed. */
  discard?: boolean
  onEvent: (type: string, payload: Record<string, unknown>) => Promise<void>
}

export type LandResult = { ok: true; sha: string } | { ok: false; stage: 'merge' | 'test' | 'ff'; detail: string }

const locks = new Map<string, Promise<unknown>>()

/** Serialize work per key (a project): the next landing waits for the previous one. */
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(key, next.catch(() => undefined))
  return next
}

export async function land(i: LandInput): Promise<LandResult> {
  if (i.discard && await hasUncommitted(i.worktreePath)) {
    await git(i.worktreePath, ['reset', '-q', '--hard']); await git(i.worktreePath, ['clean', '-qfd'])
    await i.onEvent('land.discarded', { note: 'a check or a probe left changes: thrown away' })
  }
  if (await hasUncommitted(i.worktreePath)) {
    const sha = await commitAll(i.worktreePath, 'Commit remaining work (engine)')
    await i.onEvent('land.committed', { sha, note: 'the agent left uncommitted changes' })
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const base = await headSha(i.repoPath, i.integrationBranch)
    const merged = await mergeInto(i.worktreePath, base)
    if (!merged.ok) { await i.onEvent('land.conflict', { files: merged.conflict }); return { ok: false, stage: 'merge', detail: `conflicts with the integration branch in: ${merged.conflict}` } }
    if (i.testCmd) {
      const t = await run(i.testCmd, i.worktreePath, i.testTimeoutMs ?? 10 * 60_000)
      await i.onEvent('land.tested', { ok: t.code === 0, code: t.code, tail: t.tail })
      if (t.code !== 0) return { ok: false, stage: 'test', detail: `tests failed (exit ${t.code}):\n${t.tail}` }
    }
    const sha = await headSha(i.worktreePath)
    const ff = await fastForward(i.repoPath, i.integrationBranch, sha, base)
    if (ff.ok) { await i.onEvent('land.landed', { sha, integrationBranch: i.integrationBranch }); return { ok: true, sha } }
    await i.onEvent('land.retry', { attempt, reason: ff.reason }) // the branch moved under us: merge again
  }
  return { ok: false, stage: 'ff', detail: 'the integration branch kept moving' }
}

/**
 * The lines of a test run that say what failed. The end of the output alone often shows only the last suite, which
 * passed, so nobody could tell which test broke (Homework Gate, 2026-11-15).
 */
export function failingLines(out: string, max = 60): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const raw of out.split('\n')) {
    const l = raw.replace(/\x1b\[[0-9;]*m/g, '').trimEnd()
    if (!/\bFAIL(ED|URE)?\b|✗|×|✖|AssertionError|\bError:|\bfailed\b|not ok \d|error TS\d+|timed out/.test(l) || /\b0 failed\b|no failed/.test(l)) continue
    if (seen.has(l)) continue
    seen.add(l); lines.push(l.slice(0, 400))
    if (lines.length >= max) break
  }
  return lines
}

function run(cmd: string, cwd: string, timeoutMs: number): Promise<{ code: number; tail: string }> {
  return new Promise((resolveP) => {
    const child = spawn('sh', ['-c', cmd], { cwd, env: { ...process.env, CI: '1' } })
    let out = ''
    const take = (b: Buffer) => { out = (out + b.toString()).slice(-400_000) }
    child.stdout.on('data', take); child.stderr.on('data', take)
    const timer = setTimeout(() => { child.kill('SIGKILL'); out += `\n[timed out after ${timeoutMs / 1000}s]` }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      const failing = code === 0 ? [] : failingLines(out)
      resolveP({ code: code ?? 1, tail: `${failing.length ? `What failed:\n${failing.join('\n')}\n\nThe end of the output:\n` : ''}${out.slice(-3000)}` })
    })
  })
}

export type WholeRun = { ok: true; flaky: boolean } | { ok: false; code: number; detail: string }

/**
 * The app's whole test command, once, on a task whose sub-tasks are all merged. A run that fails is run once more
 * before anything is blamed: a test that fails now and then (a browser test on a busy machine) passes the second
 * time, and is reported as flaky and not as a failure.
 */
/** One command on the merged work, once: a probe of the app's own (probes.ts). */
export async function commandRun(i: { cmd: string; cwd: string; timeoutMs?: number }): Promise<{ ok: boolean; code: number; detail: string }> {
  const r = await run(i.cmd, i.cwd, i.timeoutMs ?? 20 * 60_000)
  return { ok: r.code === 0, code: r.code, detail: r.tail }
}

export async function wholeRun(i: { testCmd: string; cwd: string; timeoutMs?: number; onEvent: (type: string, payload: Record<string, unknown>) => Promise<void> }): Promise<WholeRun> {
  const timeout = i.timeoutMs ?? 20 * 60_000
  const first = await run(i.testCmd, i.cwd, timeout)
  if (first.code === 0) { await i.onEvent('task.tested', { ok: true, flaky: false }); return { ok: true, flaky: false } }
  await i.onEvent('task.test_again', { code: first.code, tail: first.tail })
  const second = await run(i.testCmd, i.cwd, timeout)
  if (second.code === 0) { await i.onEvent('task.tested', { ok: true, flaky: true, firstRun: first.tail }); return { ok: true, flaky: true } }
  await i.onEvent('task.tested', { ok: false, code: second.code, tail: second.tail })
  return { ok: false, code: second.code, detail: second.tail }
}
