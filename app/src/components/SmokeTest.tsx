/**
 * A task's smoke test (Sandy, 2026-11-17): the built code running on one side, and on the other the checks the
 * agents left to a person, each with where to go and what to look for. A pass or a fail goes straight onto that
 * criterion, with a note, with no trip through the conversation.
 *
 * It is the code about to be reviewed, not the prototype: the page says which commit, and a mark made on an
 * earlier commit says so. Where it runs is the app's setting: here (the engine starts it, shown beside the checks),
 * on staging, or behind a feature flag (an address to open; the checks and marks are the same).
 *
 * Reading first: a check shows Pass and Fail, and a note is asked for only once one is pressed (a fail needs one:
 * it is what the fix works from). After a QA test run in TestRail and a GitHub deployment's "View deployment":
 * the thing under test and the list to tick off, side by side.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from './Badge'
import { API, engine, openEvents, type SmokeCheck, type SmokeSetupView, type SmokeView } from '../engine'

const WHEN = { here: 'Here, on the built code', pr: 'On the pull request', after: 'After it is merged' } as const

/** Where a check sends the view: a path of the app, or a story by its id. */
/** Whether a check's "where" is somewhere the view can be sent: an address, a path, or a story's id. Anything else is a place said in words ("the pull request on GitHub"), shown as it is. */
export const goable = (where?: string) => !!where && (/^https?:\/\/\S+$/.test(where) || /^\/\S*$/.test(where) || /^[a-z0-9][a-z0-9-]*--[a-z0-9-]+$/i.test(where))

export const addressOf = (base: string, where?: string) => {
  if (!where || !goable(where)) return base
  if (/^https?:\/\//.test(where)) return where
  if (where.startsWith('/')) return `${base.replace(/\/$/, '')}${where}`
  return `${base.replace(/\/$/, '')}/iframe.html?id=${encodeURIComponent(where)}&viewMode=story` // a story's id: the story alone, as Storybook serves it
}

export function SmokeTest({ issueId, appId, base }: { issueId: string; appId: string; /** The task's address, for the links on from here. */ base: string }) {
  const [v, setV] = useState<SmokeView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [at, setAt] = useState<string | null>(null) // where the view is, when a check sent it somewhere
  const [marking, setMarking] = useState<{ id: string; pass: boolean } | null>(null)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState<number | null>(null)
  const [picked, setPicked] = useState<string | null>(null) // which set-up is shown, once they have chosen
  const timer = useRef<number | undefined>(undefined)
  const load = useCallback(() => engine.smoke(issueId).then((x) => { setV(x); setError(null) }).catch((e) => setError(String(e.message ?? e))), [issueId])
  useEffect(() => {
    void load()
    const es = openEvents(`${API}/events?since=now&app=${appId}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void load(), 300) }
    for (const t of ['smoke.started', 'smoke.marked', 'task.checked', 'build.status', 'issue.updated']) es.addEventListener(t, bump)
    return () => { es.close(); window.clearTimeout(timer.current) }
  }, [issueId, appId, load])
  useEffect(() => { // a server that was just started takes a moment to answer: look again until it does
    if (!v || !(v.setups ?? [v]).some((x) => x.where === 'local' && x.url && !x.up)) return
    const t = window.setTimeout(() => void load(), 1500)
    return () => window.clearTimeout(t)
  }, [v, load])
  const act = async (fn: () => Promise<SmokeView>) => { setBusy(true); setError(null); try { setV(await fn()) } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) } }
  const mark = async () => {
    if (!marking) return
    setBusy(true); setError(null)
    try { const r = await engine.markSmoke(issueId, marking.id, marking.pass, note); setV(r); setSent(r.sentBack ?? 0); setMarking(null); setNote('') } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) }
  }
  if (error && !v) return <div className="empty bad">{error}</div>
  if (!v) return <p className="muted">Loading…</p>
  const all: SmokeSetupView[] = v.setups?.length ? v.setups : [{ key: 'main', name: 'Smoke test', what: null, where: v.where, says: v.says, account: v.account, flag: v.flag, running: v.running, url: v.url, up: v.up, canRun: v.canRun, canClean: v.canClean, log: v.log, owed: v.owed }]
  const many = all.length > 1
  // The one they chose; else the first with something still to check; else the first.
  const su = all.find((x) => x.key === picked) ?? all.find((x) => x.owed > 0) ?? all[0]
  const shown = many ? v.checks.filter((c) => (c.setup ?? all[0].key) === su.key) : v.checks
  const local = su.where === 'local'
  const behind = local && su.running && v.head && su.running !== v.head
  const src = su.url ? at ?? su.url : null
  const done = v.checks.length > 0 && v.owed === 0
  const row = (c: SmokeCheck, waits = false) => (
    <li key={c.id} className={`smoke-check ${c.mark}`}>
      <div className="smoke-check-head">
        <strong>{c.text}</strong>
        {c.mark === 'pass' && <Badge tone="ok">pass</Badge>}{c.mark === 'fail' && <Badge tone="bad">fail</Badge>}
        {c.stale && <Badge tone="warn">marked on an earlier commit</Badge>}
      </div>
      {c.where && !goable(c.where) && c.mark === 'todo' && <div className="smoke-how"><span className="faint">Where:</span> {c.where}</div>}
      {c.how && c.mark === 'todo' && <div className="smoke-how">{c.how}</div>}
      {c.before && <div className="faint smoke-before">Last time you {c.before.pass ? 'passed' : 'failed'} it{c.before.note ? `: ${c.before.note}` : ''}. It was sent back, and is yours to try again.</div>}
      {c.note && c.mark !== 'todo' && <div className="faint smoke-before">{c.note}</div>}
      {marking?.id === c.id ? (
        <div className="smoke-note">
          <label>{marking.pass ? 'What you saw (optional)' : 'What you saw: it is sent back with this'}
            <textarea rows={2} value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder={marking.pass ? 'trough visible, lip outline faint' : 'portal 22 fps, 45 without'} /></label>
          <div className="smoke-actions">
            <button className="btn small" disabled={busy || (!marking.pass && !note.trim())} onClick={() => void mark()}>{marking.pass ? 'Mark it passed' : 'Mark it failed'}</button>
            <button className="btn quiet small" onClick={() => { setMarking(null); setNote('') }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="smoke-actions">
          {su.url && goable(c.where) && <button className="btn quiet small" onClick={() => setAt(addressOf(su.url!, c.where))} title={c.where}>Go there</button>}
          <button className="btn small" disabled={busy || waits} onClick={() => { setMarking({ id: c.id, pass: true }); setNote('') }}>{c.mark === 'todo' ? 'Pass' : 'Pass instead'}</button>
          <button className="btn quiet small" disabled={busy || waits} onClick={() => { setMarking({ id: c.id, pass: false }); setNote('') }}>{c.mark === 'todo' ? 'Fail' : 'Fail instead'}</button>
        </div>
      )}
    </li>
  )
  return (
    <section className="panel smoke" data-component="SmokeTest" aria-label="Smoke test">
      <h2>🧪 Smoke test <span className="faint">{v.checks.length === 0 ? 'nothing for you' : done ? `${v.checks.length} checked by hand${v.failed ? `, ${v.failed} failed` : ''}` : `${v.owed} of ${v.checks.length} for you to check`}</span></h2>
      <p className="faint" style={{ margin: '0 0 10px', fontSize: 13 }}>
        {v.staged ? 'Every acceptance criterion no agent has marked, for you to check by hand on the built code' : 'What the agents could not judge, for you to try by hand on the built code'}{v.head ? <> (commit <code>{v.head.slice(0, 7)}</code>{v.branch ? <>, branch <code>{v.branch}</code></> : null})</> : ''}. Not the prototype. {many ? <>This app has {all.length} set-ups; each check is under the one it needs.</> : <>It runs {su.says}.</>}
      </p>
      {error && <p className="bad" style={{ margin: '0 0 8px' }}>{error}</p>}
      {sent !== null && sent > 0 && <p className="smoke-sent" role="status">Sent back: {sent} that failed, with what you saw. It is fixed, checked again, and comes back to you here.</p>}
      {sent === 0 && done && !v.failed && <p className="smoke-sent ok" role="status">All of it holds. The task carries on to its pull request.</p>}
      {v.checks.length === 0 && <p className="muted" style={{ margin: 0 }}>The check after the build left nothing to a person on this task. Its list is on <Link to={`${base}/checklist`}>the checklist</Link>.</p>}
      {v.checks.length > 0 && many && (
        <>
          <div className="smoke-setups" role="tablist" aria-label="Set-ups">
            {all.map((x) => {
              const n = v.checks.filter((c) => (c.setup ?? all[0].key) === x.key).length
              return <button key={x.key} role="tab" aria-selected={x.key === su.key} className={`btn small ${x.key === su.key ? '' : 'quiet'}`} onClick={() => { setPicked(x.key); setAt(null); setMarking(null) }}>{x.name} <span className="faint">{n === 0 ? 'nothing' : x.owed ? `${x.owed} to check` : 'done'}</span>{x.where === 'local' && x.url ? <span className="smoke-on" title="Running" aria-label="running"> ●</span> : null}</button>
            })}
          </div>
        </>
      )}
      {v.checks.length > 0 && su.what && <p className="faint smoke-what">{su.what}</p>}
      {v.checks.length > 0 && (
        <div className="smoke-layout">
          <div className="smoke-view">
            {local && !su.url && (
              <div className="empty">
                {v.head ? (su.canRun
                  ? <>The built code is not running. <button className="btn small" disabled={busy} onClick={() => void act(() => engine.startSmoke(issueId, false, many ? su.key : undefined))}>Run it</button>{su.canClean && <> <button className="btn quiet small" disabled={busy} title="Its database made again and filled, and its script told to start from nothing" onClick={() => void act(() => engine.startSmoke(issueId, true, many ? su.key : undefined))}>Start clean</button></>}</>
                  : <>This app has no command to run it yet. Say how its prototypes are started, in Settings › Prototype, and the smoke test uses the same.</>)
                  : <>Nothing is built yet: the smoke test runs the task's branch once there is one.</>}
              </div>
            )}
            {local && su.url && !su.up && <div className="empty">Starting… {su.log.length > 0 && <pre className="smoke-log">{su.log.slice(-6).join('\n')}</pre>}</div>}
            {src && (local ? su.up : true) && (
              <>
                <div className="smoke-bar">
                  <code className="smoke-address">{src}</code>
                  <a className="btn quiet small" href={src} target="_blank" rel="noreferrer">Open in a new tab</a>
                  {local && <button className="btn quiet small" disabled={busy} onClick={() => void act(() => engine.startSmoke(issueId, false, many ? su.key : undefined))}>{behind ? 'Run the new commit' : 'Restart'}</button>}
                  {local && su.canClean && <button className="btn quiet small" disabled={busy} title="Its database made again and filled, and its script told to start from nothing" onClick={() => void act(() => engine.startSmoke(issueId, true, many ? su.key : undefined))}>Start clean</button>}
                  {local && <button className="btn quiet small" disabled={busy} onClick={() => void act(() => engine.stopSmoke(issueId, many ? su.key : undefined))}>Stop</button>}
                </div>
                {local && su.strayPorts?.length ? <p className="smoke-stale" role="note">{su.strayNote ?? `It also listens on ${su.strayPorts.join(', ')}, which it chose itself.`}</p> : null}
                {behind && <p className="smoke-stale" role="note">The branch has moved on since this was started. Run the new commit to test what will be reviewed.</p>}
                {local
                  ? <iframe className="smoke-frame" title="The built code" src={src} />
                  : <div className="empty">{su.where === 'preview' && v.pr ? <>The preview of pull request #{v.pr.number}. It opens in its own tab, and is rebuilt on each new commit. </> : <>It is deployed, so it opens in its own tab. </>}{su.account && <>Sign in as: {su.account}. </>}{su.flag && <>Flag: <code>{su.flag}</code>. </>}</div>}
              </>
            )}
            {!local && !su.url && (su.where === 'preview' && !v.pr
              ? <div className="empty">This app is tried on a preview of its pull request, and this task has no pull request yet. It is opened once the first of its work is merged.</div>
              : <div className="empty">This app is smoke tested {su.where === 'staging' ? 'on staging' : su.where === 'preview' ? 'on a preview of its pull request' : 'behind a feature flag'}, and has not said at what address. Settings › Prototype has it.</div>)}
          </div>
          <div className="smoke-groups">
            {many && shown.length === 0 && <p className="muted" style={{ margin: 0 }}>No check on this task needs {su.name}.</p>}
            {(['here', 'pr', 'after'] as const).map((when) => {
              const mine = shown.filter((c) => (c.when ?? 'here') === when)
              if (!mine.length) return null
              const waits = when === 'pr' && !v.pr
              return (
                <div key={when} className="smoke-group" role="group" aria-label={WHEN[when]}>
                  {(when !== 'here' || shown.some((c) => (c.when ?? 'here') !== 'here')) && <h3 className="smoke-when">{WHEN[when]}</h3>}
                  {when === 'pr' && (v.pr
                    ? <p className="faint smoke-when-says">{v.pr.url ? <a href={v.pr.url} target="_blank" rel="noreferrer">Pull request #{v.pr.number}</a> : <>Pull request #{v.pr.number}</>}: these can only be seen there.</p>
                    : <p className="faint smoke-when-says">These can only be seen on the pull request, and this task has none yet. It is opened as a draft once the build is done and checked, or from <Link to={`${base}/build`}>the build page</Link>.</p>)}
                  {when === 'after' && <p className="faint smoke-when-says">These can only be seen once it is merged. They do not hold the task; mark them when you have looked.</p>}
                  <ol className={`smoke-checks ${waits ? 'waiting' : ''}`} aria-label={WHEN[when]}>{mine.map((c) => row(c, waits))}</ol>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
