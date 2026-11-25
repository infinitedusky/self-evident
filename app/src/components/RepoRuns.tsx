/**
 * How each of an app's repositories is brought up and run (Sandy, 2026-11-25: "for whatever repo we can get the
 * environment up every time … It should be on a repository basis"). The scripts are files in the app's workbench
 * folder, one folder per repository (the engine's repo-run.ts); this shows which are there and what the last check
 * of them said, and has the two presses: start a folder with stubs, and check the scripts on the default branch.
 * Nothing is edited here: a script is changed in its folder, as a hook is.
 *
 * After a CI provider's pipeline page (GitHub Actions, CircleCI): the jobs in order, each green or red, the failing
 * one's last lines under it, and one press to run it again.
 */
import { useEffect, useState } from 'react'
import { Badge } from './Badge'
import { engine, type RepoRuns as State, type RepoRunView } from '../engine'

const problem = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }
const PARTS = ['setup', 'up', 'test', 'checks', 'down'] as const
const MARK = { pass: '✓', fail: '✗', unrun: '–', none: '○' } as const
const SAID = { pass: 'passed', fail: 'failed', unrun: 'could not be run', none: 'not run' } as const
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function RepoRuns({ appId }: { appId: string }) {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const running = state?.repos.some((r) => r.check?.state === 'running') ?? false
  useEffect(() => {
    let gone = false
    const load = () => engine.repoRuns(appId).then((s) => { if (!gone) setState(s) }).catch((e) => { if (!gone) setError(problem(e)) })
    void load()
    if (!running) return () => { gone = true }
    const t = window.setInterval(load, 2000)
    return () => { gone = true; window.clearInterval(t) }
  }, [appId, running])
  const press = async (repo: string, what: 'check' | 'scaffold') => { setBusy(`${what}:${repo}`); setError(null); try { setState(what === 'check' ? await engine.checkRepoRun(appId, repo) : await engine.scaffoldRepoRun(appId, repo)) } catch (e) { setError(problem(e)) } finally { setBusy(null) } }
  const has = (r: RepoRunView, p: (typeof PARTS)[number]) => (p === 'checks' ? r.scripts.checks.length > 0 : r.scripts[p])

  return (
    <section className="repo-runs" data-component="RepoRuns" aria-label="How each repository is run">
      <h3 className="settings-h3">How each repository is run</h3>
      <p className="faint settings-desc">Set once for a repository and used for every pull request in it: scripts in the workbench folder, one folder per repository. A review runs them. Check them here on the default branch first, so a failure in a review is the pull request's and not this computer's.</p>
      {error && <div className="empty bad">{error}</div>}
      {state === null && !error && <p className="muted">Loading…</p>}
      {state && !state.workbench && <div className="empty">This app has no workbench folder to keep the scripts in. Give it one under Workbench.</div>}
      {state?.workbench && state.repos.map((r) => (
        <article key={r.repo} className="repo-run" aria-label={r.repo}>
          <header>
            <strong>{r.repo}</strong>{r.home && <Badge>home</Badge>}
            {!r.scripts.has ? <Badge tone="warn">no scripts yet</Badge> : !r.check ? <Badge>not checked</Badge> : r.check.state === 'running' ? <Badge tone="accent">checking…</Badge> : r.check.ok ? <Badge tone="ok">works on {r.check.branch}</Badge> : <Badge tone="warn">does not work on {r.check.branch}</Badge>}
            <span style={{ marginLeft: 'auto' }} />
            {!r.scripts.has
              ? <button type="button" className="btn quiet small" disabled={busy !== null} aria-label={`Start ${r.repo}'s folder with stubs`} onClick={() => void press(r.repo, 'scaffold')}>Start its folder</button>
              : <button type="button" className="btn quiet small" disabled={busy !== null || r.check?.state === 'running' || !r.local} title={r.local ? `Runs every script on ${r.check?.branch ?? 'the default branch'}, in a checkout of Evident's own.` : 'It has no folder on this computer.'} aria-label={`Check ${r.repo}'s scripts`} onClick={() => void press(r.repo, 'check')}>{r.check ? 'Check it again' : 'Check it'}</button>}
          </header>
          <div className="faint"><code>{r.scripts.dir}</code></div>
          {!r.scripts.has
            ? <p className="muted">Nothing is run on this repository's pull requests{r.home ? ' from here; a review of one uses the app\'s own settings until it has scripts' : ''}. Start its folder, then write each script.</p>
            : (
              <ul className="repo-run-parts">
                {PARTS.map((p) => (
                  <li key={p} className={has(r, p) ? undefined : 'missing'} title={state.says[p]}>
                    <code>{p === 'checks' ? 'checks/' : p}</code> {has(r, p) ? (p === 'checks' ? <span className="faint">{r.scripts.checks.join(', ')}</span> : null) : <span className="faint">not there</span>}
                  </li>
                ))}
              </ul>
            )}
          {r.check && r.check.steps.length > 0 && (
            <ol className="repo-run-steps" aria-label={`The last check of ${r.repo}`}>
              {r.check.steps.map((s) => (
                <li key={s.key} className={s.state}>
                  <span className="reviews-mark" aria-label={SAID[s.state]}>{MARK[s.state]}</span> <code>{s.name}</code>
                  {s.state === 'unrun' && <span className="faint"> could not be run here</span>}
                  {s.output && <pre>{s.output}</pre>}
                </li>
              ))}
            </ol>
          )}
          {r.check?.state === 'done' && <div className="faint">Checked {when(r.check.at)}{r.check.sha ? <> at <code>{r.check.sha.slice(0, 7)}</code></> : null}.</div>}
        </article>
      ))}
    </section>
  )
}
