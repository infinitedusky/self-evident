/**
 * Reviews: a pull request that is someone else's, reviewed from here (Sandy, 2026-11-25: "I want to choose a PR that
 * isn't mine and I want to review it … all from here"). The app's open pull requests, other people's first. Open one
 * and Evident runs on it what it runs on a task of ours before its own goes out: the breaks its tests miss, and the
 * commands the app is held to. From those it drafts comments.
 *
 * Two rules the page keeps in sight. Nothing is posted from here ("an agent shouldn't comment on other people's PRs;
 * it could suggest comments, but we would do that"): each draft is copied, and its line opened on GitHub, by the
 * person. And a review runs code nobody here has read, on this computer: the page says so beside the press that
 * starts it, every time.
 *
 * After GitHub's own pull request list for the rows, and its "Files changed" review for a comment tied to a line;
 * after a CI run's page (GitHub Actions) for the steps and what each said.
 */
import { useEffect, useState } from 'react'
import { namedPull } from '@self-evident/engine/pr-named'
import { Badge } from '../components/Badge'
import { useCurrentApp } from '../current-app'
import { engine, type ReviewPulls, type ReviewRepoRun, type ReviewView } from '../engine'

const problem = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')
const MARK = { waiting: '○', running: '…', pass: '✓', fail: '✗', skipped: '–' } as const
const SAID = { waiting: 'not run yet', running: 'running', pass: 'passed', fail: 'found something', skipped: 'skipped' } as const
type Which = { repo: string; number: number }

/** `open`: the pull request shown (else the list). */
export function Reviews({ open: first }: { open?: Which }) {
  const { app } = useCurrentApp()
  const [list, setList] = useState<ReviewPulls | null>(null)
  const [open, setOpen] = useState<Which | null>(first ?? null)
  const [view, setView] = useState<ReviewView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [repoNames, setRepoNames] = useState<string[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [find, setFind] = useState('') // a repository with a hundred open is found by who or what

  useEffect(() => {
    setList(null); setError(null)
    if (!app || open) return
    let gone = false
    const load = () => engine.reviewPulls(app.id).then((l) => { if (!gone) setList(l) }).catch((e) => { if (!gone) setError(problem(e)) })
    void load()
    engine.reviewRepos(app.id).then((r) => { if (!gone) setRepoNames(r.repos) }).catch(() => {}) // to open one by its number before GitHub has answered with the list
    const t = window.setInterval(load, 15_000) // where each review stands; GitHub itself is asked again only every few minutes, or on Refresh
    return () => { gone = true; window.clearInterval(t) }
  }, [app?.id, open])
  useEffect(() => {
    setView(null); setError(null)
    if (!app || !open) return
    let gone = false, timer: number | undefined
    const load = () => engine.review(app.id, open.repo, open.number).then((v) => { if (gone) return; setView(v); if (v.state === 'running') timer = window.setTimeout(load, 2000) }).catch((e) => { if (!gone) setError(problem(e)) })
    void load()
    return () => { gone = true; window.clearTimeout(timer) }
  }, [app?.id, open?.repo, open?.number, starting])

  const run = async () => { if (!app || !open) return; setStarting(true); setError(null); try { setView(await engine.startReview(app.id, open.repo, open.number)) } catch (e) { setError(problem(e)) } finally { setStarting(false) } }
  const copy = async (id: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500) } catch { /* no clipboard here */ } }
  const repos = [...new Set((list?.pulls ?? []).map((p) => p.repo))]
  const named = namedPull(find, list?.repos ?? repoNames) // a number or a link: opened without the list
  const refresh = async () => { if (!app) return; setRefreshing(true); try { setList(await engine.reviewPulls(app.id, true)); setError(null) } catch (e) { setError(problem(e)) } finally { setRefreshing(false) } }
  const ago = (iso?: string) => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000); return m < 1 ? 'just now' : m === 1 ? 'a minute ago' : `${m} minutes ago` }
  const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = (list?.pulls ?? []).filter((p) => words.every((w) => `${p.author} ${p.title} #${p.number} ${p.branch} ${p.repo}`.toLowerCase().includes(w)))

  return (
    <div className="reviews" data-component="Reviews">
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div>
          <h1>🔍 Reviews{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Other people's pull requests, checked the way your own are. Evident drafts comments; nothing is posted from here. You say them on GitHub yourself.</p>
        </div>
      </div>
      {error && <div className="empty bad">{error}</div>}
      {!app && <div className="empty">Pick an app in the nav.</div>}

      {app && !open && (
        <>
          {list?.problems.map((p) => <div key={p} className="empty bad">{p}</div>)}
          <form className="reviews-find" onSubmit={(e) => { e.preventDefault(); if (named) { setOpen(named); setFind('') } }}>
            <input type="search" aria-label="Find a pull request" placeholder="Find by person or title, or paste a number or link" value={find} onChange={(e) => setFind(e.target.value)} />
            {named && <button type="submit" className="btn small">Open #{named.number}</button>}
            {list && list.pulls.length > 0 && <span className="faint">{shown.length === list.pulls.length ? `${list.pulls.length} open` : `${shown.length} of ${list.pulls.length} open`}</span>}
            {list?.readAt && <span className="faint" style={{ marginLeft: 'auto' }}>Read from GitHub {ago(list.readAt)} <button type="button" className="linkish" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Reading…' : 'Refresh'}</button></span>}
          </form>
          {list === null && !error && <p className="muted">Reading the open pull requests from GitHub. To go straight to one, paste its number or link above.</p>}
          {list && !list.pulls.length && !list.problems.length && <div className="empty">No open pull requests in this app's repositories.</div>}
          {list && list.pulls.length > 0 && !shown.length && !named && <div className="empty">None of the open pull requests match.</div>}
          {list && shown.length > 0 && (
            <table className="reviews-list">
              <thead><tr><th>Pull request</th><th>By</th><th>Updated</th><th>Review</th><th /></tr></thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={`${p.repo}#${p.number}`}>
                    <td>
                      <button type="button" className="linkish reviews-title" aria-label={`Open #${p.number}, ${p.title}`} onClick={() => setOpen({ repo: p.repo, number: p.number })}>#{p.number} {p.title}</button>
                      <div className="faint">{repos.length > 1 ? `${p.repo} · ` : ''}{p.branch} · {p.files} file{p.files === 1 ? '' : 's'}{p.draft ? ' · draft' : ''}</div>
                    </td>
                    <td>{p.author}{p.mine && <> <Badge>yours</Badge></>}</td>
                    <td className="faint">{when(p.updatedAt)}</td>
                    <td>
                      {!p.review ? <span className="faint">not reviewed</span>
                        : p.review.state === 'running' ? <Badge tone="accent">running</Badge>
                        : p.review.state === 'failed' ? <Badge tone="warn">did not finish</Badge>
                        : <>{p.review.suggestions ? `${p.review.suggestions} comment${p.review.suggestions === 1 ? '' : 's'} drafted` : 'nothing found'}{p.review.stale && <span className="faint"> · it has moved since</span>}</>}
                    </td>
                    <td><button type="button" className="btn quiet small" onClick={() => setOpen({ repo: p.repo, number: p.number })}>{p.review ? 'Open' : 'Review'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {app && open && (
        <>
          <div className="screen-bar">
            <button className="btn quiet small" onClick={() => setOpen(null)}>← All pull requests</button>
            {view?.pull && <><strong>#{view.pull.number} {view.pull.title}</strong> <span className="muted">by {view.pull.author}</span>
              <a style={{ marginLeft: 'auto' }} href={view.pull.url} target="_blank" rel="noreferrer">Open on GitHub ↗</a></>}
          </div>
          {view === null && !error && <p className="muted">Reading it…</p>}
          {view?.problem && <div className="empty bad">{view.problem}</div>}
          {view && (
            <>
              {view.state !== 'running' && (
                <div className="reviews-run" role="note" aria-label="Before you run it">
                  <p><strong>This is unreviewed code.</strong> {view.warning}</p>
                  <button type="button" className="btn" disabled={starting || !view.pull} onClick={() => void run()}>{view.state === 'none' ? 'Run the review' : 'Run it again'}</button>
                  {view.state === 'done' && <span className="faint">Last run {when(view.at)} at <code>{view.sha?.slice(0, 7)}</code>.{view.stale ? ' The pull request has moved since: what is below is of the earlier commit.' : ''}</span>}
                </div>
              )}
              {view.state !== 'none' && (
                <ol className="reviews-steps" aria-label="What was run">
                  {view.steps.map((s) => (
                    <li key={s.key} className={s.state}>
                      <span className="reviews-mark" aria-label={SAID[s.state]}>{MARK[s.state]}</span>
                      <span><strong>{s.name}</strong>{s.says && <span className="muted"> {s.says}</span>}</span>
                    </li>
                  ))}
                </ol>
              )}

              {view.repoRun && !view.repoRun.home && view.pull && view.state !== 'running' && (
                <RepoRunForm key={`${view.pull.repo}:${JSON.stringify(view.repoRun)}`} repo={view.pull.repo} run={view.repoRun} onSave={async (i) => { if (!app) return; try { const repoRun = await engine.setReviewRepoRun(app.id, view.pull!.repo, i); setView({ ...view, repoRun }); setError(null) } catch (e) { setError(problem(e)) } }} />
              )}
              {view.state === 'done' && (
                <>
                  <section aria-label="Suggested comments">
                    <h2>Suggested comments <span className="faint">{view.suggestions.length}</span></h2>
                    {view.suggestions.length === 0
                      ? <p className="muted">{view.steps.slice(1).every((x) => x.state === 'skipped') ? 'Nothing was run on it, so there is nothing to suggest.' : 'Nothing to suggest from what was run. That is not a review: it only says the tests hold on the changed lines and the commands pass.'}</p>
                      : <p className="muted">Drafts, for you to make or not. Copy one, open its line on GitHub, and say it your way. Nothing is posted from here.</p>}
                    {view.suggestions.map((s) => (
                      <article key={s.id} className="reviews-suggestion" aria-label={s.file ? `Comment on ${s.file}, line ${s.line}` : 'A general comment'}>
                        <header>
                          {s.file ? <code>{s.file}:{s.line}</code> : <span className="faint">On the pull request as a whole</span>}
                          <span style={{ marginLeft: 'auto' }} />
                          {s.url && <a href={s.url} target="_blank" rel="noreferrer">Open the line ↗</a>}
                          <button type="button" className="btn quiet small" aria-label={`Copy the comment${s.file ? ` on ${s.file}, line ${s.line}` : ''}`} onClick={() => void copy(s.id, s.text)}>{copied === s.id ? 'Copied' : 'Copy'}</button>
                        </header>
                        <p>{s.text}</p>
                      </article>
                    ))}
                  </section>

                  {view.mutation && (
                    <section aria-label="Breaks no test caught">
                      <h2>Breaks no test caught <span className="faint">{view.mutation.survivors.filter((x) => !x.equivalent).length}</span></h2>
                      <p className="muted">Of {view.mutation.meaningful} small breaks made to the lines it changed, its tests catch {view.mutation.caught}{view.mutation.percent !== null ? ` (${view.mutation.percent}%)` : ''}.{view.mutation.partial ? ` Stopped early: ${view.mutation.partial}.` : ''}</p>
                      {view.mutation.survivors.length > 0 && (
                        <table className="reviews-breaks">
                          <tbody>
                            {view.mutation.survivors.map((x) => (
                              <tr key={x.id} className={x.equivalent ? 'off' : undefined}>
                                <td><code>{x.file}:{x.line}</code></td>
                                <td><code>{x.from.trim()}</code> → <code>{x.to.trim() || 'nothing'}</code></td>
                                <td><code className="reviews-code">{x.code.trim()}</code>{x.equivalent && <div className="faint">Left out: {x.equivalent}</div>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </section>
                  )}

                  {view.commands.length > 0 && (
                    <section aria-label="Commands">
                      <h2>Commands <span className="faint">{view.commands.filter((c) => c.pass).length} of {view.commands.length} pass{view.commands.some((c) => c.ran === false) ? `, ${view.commands.filter((c) => c.ran === false).length} could not be run here` : ''}</span></h2>
                      <ul className="reviews-commands">
                        {view.commands.map((c) => (
                          <li key={c.key}>
                            <span className="reviews-mark" aria-label={c.pass ? 'passed' : c.ran === false ? 'could not be run here' : 'failed'}>{c.pass ? '✓' : c.ran === false ? '–' : '✗'}</span> <strong>{c.name}</strong> <code>{c.runs}</code>
                            {c.ran === false && <div className="faint">Could not be run here: a folder or a program it needs is not there. That is this computer or the app's settings, not the pull request, so no comment is drafted from it.</div>}
                            {!c.pass && c.output && <pre>{c.output}</pre>}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

/**
 * How a repository that is not the app's home one is run for a review. The app's own commands are its home
 * repository's, and running them elsewhere fails before it starts (Sandy's first review, 2026-11-25). Open while
 * nothing is set; one line otherwise. After a CI config's three parts: install, test, checks.
 */
function RepoRunForm({ repo, run, onSave }: { repo: string; run: ReviewRepoRun; onSave: (i: { prepare: string; testCmd: string; commands: { name: string; runs: string }[] }) => Promise<void> }) {
  const [prepare, setPrepare] = useState(run.prepare ?? '')
  const [testCmd, setTestCmd] = useState(run.testCmd ?? '')
  const [lines, setLines] = useState(run.commands.map((c) => `${c.name}: ${c.runs}`).join('\n'))
  const [busy, setBusy] = useState(false)
  const commands = lines.split('\n').map((l) => { const at = l.indexOf(':'); return at > 0 ? { name: l.slice(0, at).trim(), runs: l.slice(at + 1).trim() } : null }).filter((c): c is { name: string; runs: string } => !!c && !!c.name && !!c.runs)
  const unread = lines.split('\n').filter((l) => l.trim()).length - commands.length
  return (
    <details className="reviews-repo-run" open={!run.set || undefined}>
      <summary>How <code>{repo}</code> is run {run.set ? <span className="faint">· {[run.prepare && 'prepared', run.testCmd && 'tests', run.commands.length && `${run.commands.length} command${run.commands.length === 1 ? '' : 's'}`].filter(Boolean).join(', ')}</span> : <span className="faint">· not set yet, so nothing is run on its pull requests</span>}</summary>
      <form aria-label={`How ${repo} is run`} onSubmit={(e) => { e.preventDefault(); setBusy(true); void onSave({ prepare: prepare.trim(), testCmd: testCmd.trim(), commands }).finally(() => setBusy(false)) }}>
        <p className="muted">This app's own commands are for its home repository and are not run here. Each of these is run in a checkout of the pull request, from the repository's top folder.</p>
        <label><span>Run first in its checkout</span><input className="mono" aria-label="Run first in its checkout" placeholder="e.g. uv sync" value={prepare} onChange={(e) => setPrepare(e.target.value)} /></label>
        <label><span>How its tests are run</span><input className="mono" aria-label="How its tests are run" placeholder="e.g. uv run pytest -q {files}" value={testCmd} onChange={(e) => setTestCmd(e.target.value)} /></label>
        <p className="faint">{'{files}'} is replaced by the test files the pull request added or changed. This is what each small break is run against.</p>
        <label><span>Commands it is held to</span><textarea className="mono" aria-label="Commands it is held to" rows={3} placeholder={'One a line, as  Name: command\nLint: uv run ruff check .'} value={lines} onChange={(e) => setLines(e.target.value)} /></label>
        {unread > 0 && <p className="faint">{unread} line{unread === 1 ? ' is' : 's are'} not read: each needs a name, a colon, then the command.</p>}
        <div><button type="submit" className="btn small" disabled={busy || unread > 0}>Save</button> <span className="faint">Then run the review again.</span></div>
      </form>
    </details>
  )
}
