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
import { Badge } from '../components/Badge'
import { useCurrentApp } from '../current-app'
import { engine, type ReviewPulls, type ReviewView } from '../engine'

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
  const [find, setFind] = useState('') // a repository with a hundred open is found by who or what

  useEffect(() => {
    setList(null); setError(null)
    if (!app || open) return
    let gone = false
    const load = () => engine.reviewPulls(app.id).then((l) => { if (!gone) setList(l) }).catch((e) => { if (!gone) setError(problem(e)) })
    void load()
    const t = window.setInterval(load, 15_000) // a review running elsewhere, a pull request opened since
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
          {list === null && !error && <p className="muted">Reading the open pull requests from GitHub…</p>}
          {list && !list.pulls.length && !list.problems.length && <div className="empty">No open pull requests in this app's repositories.</div>}
          {list && list.pulls.length > 0 && (
            <div className="reviews-find">
              <input type="search" aria-label="Find a pull request" placeholder="Find by person, title, number or branch" value={find} onChange={(e) => setFind(e.target.value)} />
              <span className="faint">{shown.length === list.pulls.length ? `${list.pulls.length} open` : `${shown.length} of ${list.pulls.length} open`}</span>
            </div>
          )}
          {list && list.pulls.length > 0 && !shown.length && <div className="empty">None of the open pull requests match.</div>}
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

              {view.state === 'done' && (
                <>
                  <section aria-label="Suggested comments">
                    <h2>Suggested comments <span className="faint">{view.suggestions.length}</span></h2>
                    {view.suggestions.length === 0
                      ? <p className="muted">Nothing to suggest from what was run. That is not a review: it only says the tests hold on the changed lines and the commands pass.</p>
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
                      <h2>Commands <span className="faint">{view.commands.filter((c) => c.pass).length} of {view.commands.length} pass</span></h2>
                      <ul className="reviews-commands">
                        {view.commands.map((c) => (
                          <li key={c.key}>
                            <span className="reviews-mark" aria-label={c.pass ? 'passed' : 'failed'}>{c.pass ? '✓' : '✗'}</span> <strong>{c.name}</strong> <code>{c.runs}</code>
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
