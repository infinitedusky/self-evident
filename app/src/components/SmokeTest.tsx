/**
 * A task's smoke test (Sandy, 2026-11-17): the built code running on one side, and on the other the checks the
 * agents left to a person, each with where to go and what to look for. A pass or a fail goes straight onto that
 * criterion, with a note, with no trip through the conversation.
 *
 * It is the code about to be reviewed, not the prototype: the page says which commit, and a mark made on an
 * earlier commit says so. Where it runs is the app's setting: here (the engine starts it, shown beside the checks),
 * on staging, or behind a feature flag (an address to open; the checks and marks are the same).
 *
 * Every check that names a place has a link to it, as a prototype's guide does (Sandy, 2026-11-17: "smoke tests
 * should have links to test like the prototype guides"): the path, on whatever port this run has, opening in its own
 * tab, with "Go there" to send the view beside it. Before it is running the path is still shown, as words.
 *
 * The view is a small browser (Sandy, 2026-11-17: "back buttons and an address bar … so I can type in an address or
 * go back"): back, forward, reload and an address to type in, as the prototype's view has. Back and forward step
 * through where this page sent the view (an address typed, a check's "Go there"); the built code is another origin,
 * so links pressed inside it are not seen here.
 *
 * Main can be brought up beside it (Sandy, 2026-11-18: "spin up a comp setup that uses main … so I can look at the two
 * side by side"): the same set-up from where the branch left main, on its own port. Each view has its own back,
 * forward, reload and address (Sandy, 2026-11-18: "when main spins up we need to split the address bar and back and
 * refresh"); a check's "Go there" sends both. After a visual regression review (Chromatic, Percy): before and after, next to each other.
 *
 * A check has "Ask an agent" (Sandy, 2026-11-18: "a button that triggers the agent to do a test of it and gets their
 * result. That doesn't pass it"): what the agent saw is shown beside the check, and Pass and Fail stay the person's.
 *
 * Some checks are commands, not pages (Sandy, 2026-11-18: "a way to do tests of things like installing … a temp folder
 * on the machine and a terminal where it runs commands and you see it working"): a set-up can be a terminal, and one
 * tested here has a terminal in its checkout to open, before it is started too ("we want to test starting it"). Every
 * set-up also has a throwaway terminal, in a new empty folder ("we always want access to a terminal pointed at a temp
 * throwaway folder"). A command a check names (`in backticks`) is a button that runs it in whichever is open.
 *
 * Room for the thing being looked at (Sandy, 2026-11-20: "the ability to collapse the cards on the right for smoke
 * tests and … more vertical real estate"): the checks fold away to a strip at the side, remembered on this browser;
 * what the page is sits behind "About" on the title's line; and the view is as tall as the window has left.
 *
 * Reading first: a check shows Pass and Fail, and a note is asked for only once one is pressed (a fail needs one:
 * it is what the fix works from). After a QA test run in TestRail and a GitHub deployment's "View deployment":
 * the thing under test and the list to tick off, side by side.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from './Badge'
import { SmokeTerminal } from './SmokeTerminal'
import { Nav, useTrail } from './Trail'
import { dataChoice, keepDataChoice, useMain } from '../main-running'
import { API, engine, openEvents, type SmokeCheck, type SmokeSetupView, type SmokeView } from '../engine'

const WHEN = { here: 'Here, on the built code', pr: 'On the pull request', after: 'After it is merged', nightly: 'Left to the nightly run' } as const

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
  // Compare is a main of the task's own beside the build, at the same place, on a port of its own (main-running.ts; Sandy, 2026-11-20: "one per task"). The task's prototype shares it; the app's own main is left as it is.
  const [comparing, setComparing] = useState(false)
  // The checks, put aside for a wider view: remembered on this browser.
  const [aside, setAside] = useState(() => { try { return localStorage.getItem('se.smoke.checks') === '0' } catch { return false } })
  const putAside = (to: boolean) => { setAside(to); try { localStorage.setItem('se.smoke.checks', to ? '0' : '1') } catch { /* fine without it */ } }
  // The view is as tall as the window has left under it.
  const viewRef = useRef<HTMLDivElement | null>(null)
  const [room, setRoom] = useState<number | null>(null)
  useEffect(() => {
    const measure = () => { const el = viewRef.current; if (el) setRoom(Math.max(360, Math.round(window.innerHeight - Math.max(0, el.getBoundingClientRect().top) - 70))) }
    measure(); const t = window.setTimeout(measure, 400)
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure); window.clearTimeout(t) }
  }, [v === null, aside, comparing])
  const theMain = useMain(appId, comparing, issueId)
  const [mainData, setMainData] = useState(dataChoice)
  const mine = useTrail(), theirs = useTrail() // the build's view, and main's beside it: each goes its own way
  const { at, setAt: setMine } = mine
  const setAt = (to: string | null) => { setMine(to); if (to === null) theirs.setAt(null) }
  const [marking, setMarking] = useState<{ id: string; pass: boolean; skip?: boolean } | null>(null)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState<number | null>(null)
  const [term, setTerm] = useState<Record<string, boolean>>({}) // which set-ups' terminals the person has opened or closed here
  const [send, setSend] = useState<{ n: number; text: string } | null>(null) // a check's command, on its way to the terminal
  const [picked, setPicked] = useState<string | null>(null) // which set-up is shown, once they have chosen
  const timer = useRef<number | undefined>(undefined)
  const load = useCallback(() => engine.smoke(issueId).then((x) => { setV(x); setError(null) }).catch((e) => setError(String(e.message ?? e))), [issueId])
  useEffect(() => {
    void load()
    const es = openEvents(`${API}/events?since=now&app=${appId}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void load(), 300) }
    for (const t of ['smoke.started', 'smoke.marked', 'smoke.trying', 'smoke.tried', 'task.checked', 'build.status', 'issue.updated']) es.addEventListener(t, bump)
    return () => { es.close(); window.clearTimeout(timer.current) }
  }, [issueId, appId, load])
  useEffect(() => { // a server that was just started takes a moment to answer: look again until it does
    if (!v || !(v.setups ?? [v]).some((x) => (x.where === 'local' && x.url && !x.up))) return
    const t = window.setTimeout(() => void load(), 1500)
    return () => window.clearTimeout(t)
  }, [v, load])
  const act = async (fn: () => Promise<SmokeView>) => { setBusy(true); setError(null); try { setV(await fn()) } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) } }
  const mark = async () => {
    if (!marking) return
    setBusy(true); setError(null)
    try { const r = await engine.markSmoke(issueId, marking.id, marking.pass, note, marking.skip); setV(r); setSent(r.sentBack ?? 0); setMarking(null); setNote('') } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) }
  }
  if (error && !v) return <div className="empty bad">{error}</div>
  if (!v) return <p className="muted">Loading…</p>
  const all: SmokeSetupView[] = v.setups?.length ? v.setups : [{ key: 'main', name: 'Smoke test', what: null, where: v.where, says: v.says, account: v.account, flag: v.flag, running: v.running, url: v.url, up: v.up, canRun: v.canRun, canClean: v.canClean, terminal: v.terminal, scratch: v.scratch, log: v.log, owed: v.owed }]
  const many = all.length > 1
  // The one they chose; else the first with something still to check; else the first.
  const su = all.find((x) => x.key === picked) ?? all.find((x) => x.owed > 0) ?? all[0]
  const shown = many ? v.checks.filter((c) => (c.setup ?? all[0].key) === su.key) : v.checks
  const local = su.where === 'local'
  const shell = su.where === 'terminal'
  const termOn = !!su.terminal && (term[su.key] ?? su.terminal.open)
  const scratchOn = !!su.scratch && (term[`${su.key}@temp`] ?? su.scratch.open)
  const closeTerm = (scratch = false) => { setTerm((t) => ({ ...t, [scratch ? `${su.key}@temp` : su.key]: false })); void act(() => engine.closeSmokeTerminal(issueId, su.key, scratch)) }
  const anyTerm = termOn || scratchOn // a check's command runs in the set-up's own when it is open, else the throwaway one
  /** What to do, with each command it names as a button that runs it in the terminal, once one is open. */
  const how = (text: string) => text.split(/(`[^`\n]+`)/).map((part, n) => (/^`[^`]+`$/.test(part)
    ? (anyTerm ? <button key={n} type="button" className="smoke-cmd" title="Run it in the terminal" onClick={() => setSend((x) => ({ n: (x?.n ?? 0) + 1, text: `${part.slice(1, -1)}\r` }))}>▶ <code>{part.slice(1, -1)}</code></button> : <code key={n}>{part.slice(1, -1)}</code>)
    : part))
  const behind = local && su.running && v.head && su.running !== v.head
  const src = su.url ? at ?? su.url : null
  const cmp = local && su.up && comparing && theMain.main?.running && theMain.main.url ? { url: theMain.main.url, up: theMain.main.up, sha: theMain.main.sha, log: theMain.main.log, branch: theMain.main.branch } : null
  const home = su.url?.replace(/\/$/, '') ?? '', cmpHome = cmp?.url.replace(/\/$/, '') ?? ''
  /** The same place on main: the build's address, on main's port. */
  const onMain = (to: string) => (cmp && to.startsWith(home) ? `${cmpHome}${to.slice(home.length)}` : to)
  const cmpSrc = cmp ? theirs.at ?? cmp.url : null
  const SAW = { holds: 'An agent saw it hold', fails: 'An agent saw it fail', unsure: 'An agent could not tell' } as const
  const done = v.checks.length > 0 && v.owed === 0
  const row = (c: SmokeCheck, waits = false) => (
    <li key={c.id} className={`smoke-check ${c.mark}`}>
      <div className="smoke-check-head">
        <strong>{c.text}</strong>
        {c.mark === 'pass' && <Badge tone="ok">pass</Badge>}{c.mark === 'fail' && <Badge tone="bad">fail</Badge>}{c.mark === 'skip' && <Badge>skipped</Badge>}
        {c.stale && <Badge tone="warn">marked on an earlier commit</Badge>}
      </div>
      {c.where && (() => {
        const to = c.link ?? (su.url && goable(c.where) ? addressOf(su.url, c.where) : null)
        if (!to && c.mark !== 'todo') return null
        return <div className="smoke-how smoke-where"><span className="faint">Where:</span> {to
          ? <><a href={to} target="_blank" rel="noreferrer" title={`${to} (opens in its own tab)`}>{/^https?:/.test(c.where) ? c.where : goable(c.where) && !c.where.startsWith('/') ? `story ${c.where}` : c.where} ↗</a>{src === to && <span className="faint"> you are here</span>}</>
          : goable(c.where) ? <><code>{c.where}</code> <span className="faint">a link once it is running</span></> : c.where}</div>
      })()}
      {c.how && c.mark === 'todo' && <div className="smoke-how">{how(c.how)}</div>}
      {c.before && <div className="faint smoke-before">Last time you {c.before.pass ? 'passed' : 'failed'} it{c.before.note ? `: ${c.before.note}` : ''}. It was sent back, and is yours to try again.</div>}
      {c.note && c.mark !== 'todo' && <div className="faint smoke-before">{c.note}</div>}
      {c.trying && <div className="smoke-tried" role="status">An agent is trying it… <span className="faint">a few minutes at most</span></div>}
      {c.tried && !c.trying && <div className={`smoke-tried ${c.tried.verdict}`}><strong>{SAW[c.tried.verdict]}</strong>{c.tried.stale ? <span className="faint"> on an earlier commit</span> : null}{c.tried.note ? <>: {c.tried.note}</> : null}</div>}
      {marking?.id === c.id ? (
        <div className="smoke-note">
          <label>{marking.skip ? 'Why it is skipped (optional)' : marking.pass ? 'What you saw (optional)' : 'What you saw: it is sent back with this'}
            <textarea rows={2} value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder={marking.skip ? 'nothing to release yet' : marking.pass ? 'trough visible, lip outline faint' : 'portal 22 fps, 45 without'} /></label>
          <div className="smoke-actions">
            <button className="btn small" disabled={busy || (!marking.pass && !marking.skip && !note.trim())} onClick={() => void mark()}>{marking.skip ? 'Skip it' : marking.pass ? 'Mark it passed' : 'Mark it failed'}</button>
            <button className="btn quiet small" onClick={() => { setMarking(null); setNote('') }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="smoke-actions">
          {su.url && local && goable(c.where) && <button className="btn quiet small" onClick={() => { const to = c.link ?? addressOf(su.url!, c.where); setAt(to); if (cmp) theirs.setAt(onMain(to)) }} title={cmp ? `Show ${c.where} in both views` : `Show ${c.where} in the view beside this`}>Go there</button>}
          <button className="btn small" disabled={busy || waits} onClick={() => { setMarking({ id: c.id, pass: true }); setNote('') }}>{c.mark === 'todo' ? 'Pass' : 'Pass instead'}</button>
          <button className="btn quiet small" disabled={busy || waits} onClick={() => { setMarking({ id: c.id, pass: false }); setNote('') }}>{c.mark === 'todo' ? 'Fail' : 'Fail instead'}</button>
          {c.mark !== 'skip' && <button className="btn quiet small" disabled={busy} title="Not tried, by choice. It stops waiting for you, and is recorded as skipped, never as passed." onClick={() => { setMarking({ id: c.id, pass: false, skip: true }); setNote('') }}>Skip</button>}
          <button className="btn quiet small" disabled={busy || waits || !!c.trying || (local && (c.when ?? 'here') === 'here' && !su.up)} title={local && (c.when ?? 'here') === 'here' && !su.up ? 'Run it first: the agent tries what is up' : 'An agent tries it and says what it saw. It does not mark it.'} onClick={() => void act(() => engine.trySmoke(issueId, c.id))}>{c.tried ? 'Ask again' : 'Ask an agent'}</button>
        </div>
      )}
    </li>
  )
  return (
    <section className="panel smoke" data-component="SmokeTest" aria-label="Smoke test">
      <div className="smoke-head">
        <h2>🧪 Smoke test <span className="faint">{v.checks.length === 0 ? 'nothing for you' : done ? `${v.checks.length} checked by hand${v.failed ? `, ${v.failed} failed` : ''}` : `${v.owed} of ${v.checks.length} for you to check`}</span></h2>
        {v.checks.length > 0 && <button className="btn quiet small" aria-expanded={!aside} title={aside ? 'Show the checks beside the view' : 'Put the checks aside, for a wider view'} onClick={() => putAside(!aside)}>{aside ? `Show checks${v.owed ? ` · ${v.owed} to check` : ''}` : 'Hide checks'}</button>}
      </div>
      <details className="smoke-about"><summary className="faint">About this smoke test{v.head ? <> · commit <code>{v.head.slice(0, 7)}</code></> : null}</summary>
      <p className="faint" style={{ margin: '4px 0 0', fontSize: 13 }}>
        {v.staged ? 'Every acceptance criterion no agent has marked, for you to check by hand on the built code' : 'What the agents could not judge, for you to try by hand on the built code'}{v.head ? <> (commit <code>{v.head.slice(0, 7)}</code>{v.branch ? <>, branch <code>{v.branch}</code></> : null})</> : ''}. Not the prototype. {many ? <>This app has {all.length} set-ups; each check is under the one it needs.</> : <>It runs {su.says}.</>}
      </p></details>
      {error && <p className="bad" style={{ margin: '0 0 8px' }}>{error}</p>}
      {sent !== null && sent > 0 && <p className="smoke-sent" role="status">Sent back: {sent} that failed, with what you saw. It is fixed, checked again, and comes back to you here.</p>}
      {sent === 0 && done && !v.failed && <p className="smoke-sent ok" role="status">All of it holds. The task carries on to its pull request.</p>}
      {v.checks.length === 0 && <p className="muted" style={{ margin: '0 0 10px' }}>Nothing is left to you on this task: an agent checked every criterion, and what it saw is on {v.staged ? <Link to={`${base}/brief`}>the brief</Link> : <Link to={`${base}/checklist`}>the checklist</Link>}.{v.head ? ' You can still bring it up and look for yourself.' : ''}</p>}
      {(v.checks.length > 0 || !!v.head) && many && (
        <>
          <div className="smoke-setups" role="tablist" aria-label="Set-ups">
            {all.map((x) => {
              const n = v.checks.filter((c) => (c.setup ?? all[0].key) === x.key).length
              return <button key={x.key} role="tab" aria-selected={x.key === su.key} className={`btn small ${x.key === su.key ? '' : 'quiet'}`} onClick={() => { setPicked(x.key); setAt(null); setMarking(null) }}>{x.name} <span className="faint">{n === 0 ? 'nothing' : x.owed ? `${x.owed} to check` : 'done'}</span>{x.where === 'local' && x.url ? <span className="smoke-on" title="Running" aria-label="running"> ●</span> : null}</button>
            })}
          </div>
        </>
      )}
      {(v.checks.length > 0 || !!v.head) && su.what && <p className="faint smoke-what">{su.what}</p>}
      {((local && su.terminal && !!v.head) || su.scratch) && (
        <div className="smoke-terms" role="group" aria-label="Terminals">
          {local && su.terminal && !!v.head && <button className="btn quiet small" aria-pressed={termOn} disabled={busy} title="A terminal in the build's checkout. It does not need the build to be running." onClick={() => (termOn ? closeTerm() : setTerm((t) => ({ ...t, [su.key]: true })))}>{termOn ? 'Close terminal' : 'Terminal'}</button>}
          {su.scratch && <button className="btn quiet small" aria-pressed={scratchOn} disabled={busy} title="A terminal in a new empty folder, thrown away when you close it" onClick={() => (scratchOn ? closeTerm(true) : setTerm((t) => ({ ...t, [`${su.key}@temp`]: true })))}>{scratchOn ? 'Close scratch terminal' : 'Scratch terminal'}</button>}
        </div>
      )}
      {(v.checks.length > 0 || !!v.head) && (
        <div className={`smoke-layout ${cmp ? 'comparing' : ''} ${aside ? 'checks-aside' : ''}`} style={room ? { ['--smoke-room' as string]: `${room}px` } : undefined}>
          <div className="smoke-view" ref={viewRef}>
            {local && !su.url && (
              <div className="empty">
                {v.head ? (su.canRun
                  ? <>The built code is not running. <button className="btn small" disabled={busy} onClick={() => void act(() => engine.startSmoke(issueId, false, many ? su.key : undefined))}>Run it</button>{su.canClean && <> <button className="btn quiet small" disabled={busy} title="Its database made again and filled, and its script told to start from nothing" onClick={() => void act(() => engine.startSmoke(issueId, true, many ? su.key : undefined))}>Start clean</button></>}</>
                  : <>This app has no command to run it yet. Say how its prototypes are started, in Settings › Prototype, and the smoke test uses the same.</>)
                  : <>Nothing is built yet: the smoke test runs the task's branch once there is one.</>}
              </div>
            )}
            {local && su.url && !su.up && <div className="empty">Starting… {su.log.length > 0 && <pre className="smoke-log">{su.log.slice(-6).join('\n')}</pre>}</div>}
            {src && !shell && (local ? su.up : true) && (
              <>
                <div className="smoke-bar">
                  {local ? (cmp ? null : <Nav t={mine} home={home} src={src} />) : <code className="smoke-address">{src}</code>}
                  <a className="btn quiet small" href={src} target="_blank" rel="noreferrer">Open in a new tab</a>
                  {local && <button className="btn quiet small" disabled={busy} onClick={() => void act(() => engine.startSmoke(issueId, false, many ? su.key : undefined))}>{behind ? 'Run the new commit' : 'Restart'}</button>}
                  {local && su.canClean && <button className="btn quiet small" disabled={busy} title="Its database made again and filled, and its script told to start from nothing" onClick={() => void act(() => engine.startSmoke(issueId, true, many ? su.key : undefined))}>Start clean</button>}
                  {local && !cmp && theMain.main && theMain.main.how !== 'none' && <button className="btn quiet small" disabled={theMain.busy} title="Main beside it, at the same place: a copy of this task's own, on its own port. The app's main is left as it is." onClick={() => { setComparing(true); void theMain.start({ mode: mainData, beside: `smoke:${issueId}:${su.key}` }).then((m) => { if (!m?.running) setComparing(false) }) }}>{theMain.busy ? 'Turning main on…' : 'Compare with main'}</button>}
                  {local && cmp && <button className="btn quiet small" title="Turns this task's main off. The app's own main is not touched." onClick={() => { setComparing(false); theirs.setAt(null); void theMain.stop() }}>Stop comparing</button>}
                  {local && theMain.main?.how === 'local' && theMain.main.database ? <label className="compare-data" title="A copy: main gets its own database, filled as this was to start with. The same database: main's code on this one's data, so what you do here shows there, and a change main cannot read shows as main breaking."><span className="faint">main's data</span> <select aria-label="Main's data" value={mainData} disabled={theMain.busy} onChange={(e) => { const m = e.target.value as 'copy' | 'shared'; setMainData(m); keepDataChoice(m); if (comparing) void theMain.start({ mode: m, beside: `smoke:${issueId}:${su.key}` }) }}><option value="copy">a copy of this one's</option><option value="shared">the same database</option></select></label> : null}
                  {theMain.error && <span className="bad" role="alert">{theMain.error}</span>}
                  {local && <button className="btn quiet small" disabled={busy} onClick={() => void act(() => engine.stopSmoke(issueId, many ? su.key : undefined))}>Stop</button>}
                </div>
                {local && su.strayPorts?.length ? <p className="smoke-stale" role="note">{su.strayNote ?? `It also listens on ${su.strayPorts.join(', ')}, which it chose itself.`}</p> : null}
                {behind && <p className="smoke-stale" role="note">The branch has moved on since this was started. Run the new commit to test what will be reviewed.</p>}
                {local && cmp
                  ? <div className="smoke-pair">
                      <figure><figcaption>This build{su.running ? <> <code>{su.running.slice(0, 7)}</code></> : null}</figcaption><div className="smoke-bar"><Nav t={mine} home={home} src={src} /></div><iframe key={`${src}#${mine.reloads}`} className="smoke-frame" title="The built code" src={src} /></figure>
                      <figure><figcaption>{cmp.branch}{cmp.sha ? <> <code>{cmp.sha.slice(0, 7)}</code></> : null}{theMain.main?.data ? <span className="faint"> · {theMain.main?.data.mode === 'shared' ? 'on the same database' : 'on a copy of the data'}</span> : null}</figcaption>{cmp.up && cmpSrc && <div className="smoke-bar"><Nav t={theirs} home={cmpHome} src={cmpSrc} of="main" /></div>}{cmp.up && cmpSrc
                        ? <iframe key={`${cmpSrc}#${theirs.reloads}`} className="smoke-frame" title="main" src={cmpSrc} />
                        : <div className="empty smoke-frame">Turning main on… {cmp.log.length > 0 && <pre className="smoke-log">{cmp.log.slice(-6).join('\n')}</pre>}</div>}</figure>
                    </div>
                  : local
                  ? <iframe key={`${src}#${mine.reloads}`} className="smoke-frame" title="The built code" src={src} />
                  : <div className="empty">{su.where === 'preview' && v.pr ? <>The preview of pull request #{v.pr.number}. It opens in its own tab, and is rebuilt on each new commit. </> : <>It is deployed, so it opens in its own tab. </>}{su.account && <>Sign in as: {su.account}. </>}{su.flag && <>Flag: <code>{su.flag}</code>. </>}</div>}
              </>
            )}
            {shell && (termOn
              ? <>
                  <div className="smoke-bar"><span className="faint">A terminal on this computer. Commands in a check run here with a press.</span><button className="btn quiet small" disabled={busy} onClick={() => closeTerm()}>Close</button></div>
                  <SmokeTerminal issueId={issueId} setup={su.key} send={send} tall />
                </>
              : <div className="empty">{su.terminal?.folder === 'temp' ? 'This is tried in a terminal, in a new empty folder that is thrown away after.' : v.head ? 'This is tried in a terminal, in the build\'s checkout.' : 'Nothing is built yet: its terminal opens in the build\'s checkout.'} {(su.terminal?.folder === 'temp' || v.head) && <button className="btn small" onClick={() => setTerm((t) => ({ ...t, [su.key]: true }))}>Open terminal</button>}</div>)}
            {!local && !shell && !su.url && (su.where === 'preview' && !v.pr
              ? <div className="empty">This app is tried on a preview of its pull request, and this task has no pull request yet. It is opened once the first of its work is merged.</div>
              : <div className="empty">This app is smoke tested {su.where === 'staging' ? 'on staging' : su.where === 'preview' ? 'on a preview of its pull request' : 'behind a feature flag'}, and has not said at what address. Settings › Prototype has it.</div>)}
          </div>
          {!aside && <div className="smoke-groups">
            {many && shown.length === 0 && v.checks.length > 0 && <p className="muted" style={{ margin: 0 }}>No check on this task needs {su.name}.</p>}
            {(['here', 'pr', 'after', 'nightly'] as const).map((when) => {
              const mine = shown.filter((c) => (c.when ?? 'here') === when)
              if (!mine.length) return null
              const waits = when === 'pr' && !v.pr
              return (
                <div key={when} className="smoke-group" role="group" aria-label={WHEN[when]}>
                  {(when !== 'here' || shown.some((c) => (c.when ?? 'here') !== 'here')) && <h3 className="smoke-when">{WHEN[when]}</h3>}
                  {when === 'pr' && (v.pr
                    ? <p className="faint smoke-when-says">{v.pr.url ? <a href={v.pr.url} target="_blank" rel="noreferrer">Pull request #{v.pr.number}</a> : <>Pull request #{v.pr.number}</>}: these can only be seen there.</p>
                    : <p className="faint smoke-when-says">These can only be seen on the pull request, and this task has none yet. It is opened as a draft once the build is done and checked, or from <Link to={`${base}/build`}>the build page</Link>.</p>)}
                  {when === 'nightly' && <p className="faint smoke-when-says">The repository runs these every night on its default branch. Nobody tries them here and they do not hold the task; a red night shows under what needs you.</p>}
                  {when === 'after' && <p className="faint smoke-when-says">These can only be seen once it is merged. They do not hold the task; mark them when you have looked.</p>}
                  <ol className={`smoke-checks ${waits ? 'waiting' : ''}`} aria-label={WHEN[when]}>{mine.map((c) => row(c, waits))}</ol>
                </div>
              )
            })}
          </div>}
        </div>
      )}
      {local && termOn && <SmokeTerminal key={`${su.key}:own`} issueId={issueId} setup={su.key} send={send} />}
      {scratchOn && <SmokeTerminal key={`${su.key}:scratch`} issueId={issueId} setup={su.key} scratch send={termOn ? null : send} />}
    </section>
  )
}
