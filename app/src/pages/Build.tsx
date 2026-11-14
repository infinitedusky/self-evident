/**
 * Build: everything after the plan (Sandy, 2026-11-14: "after the plan is done, it's done. Now we're in the build
 * phase"; "it also needs to be the place where questions are asked or anything that stops. Everything needs to
 * happen in there"). It lists tasks, since a task is what is built: what is waiting for the person on top (a
 * question to answer here, a build that failed, one that is held), then what is ready, what is building and what
 * has landed. A row leads to the task's own Build section. Laid out like Linear's My Issues: what needs you first.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '../components/Badge'
import { QuestionAsk } from '../components/QuestionAsk'
import { Md } from '../components/Md'
import { API, engine, EVENT_TYPES, openEvents, type BuildTask } from '../engine'
import { useCurrentApp } from '../current-app'

const PR_WORD: Record<string, string> = { open: 'open', draft: 'draft', merged: 'merged', closed: 'closed' }

export function Build() {
  const { app } = useCurrentApp()
  const [tasks, setTasks] = useState<BuildTask[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [refused, setRefused] = useState<{ key: string; why: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    setTasks(null)
    if (!app) return
    let closed = false
    const refresh = () => engine.now(app.id).then((d) => { if (!closed) { setTasks(d.tasks ?? []); setError(null) } }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = openEvents(`${API}/events?since=now&app=${app.id}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 250) }
    for (const type of EVENT_TYPES) if (!type.startsWith('run.tool') && type !== 'run.message') es.addEventListener(type, bump)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [app?.id])
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setRefused(null)
    try { await fn(); if (app) setTasks((await engine.now(app.id)).tasks ?? []) } catch (e) { setRefused({ key, why: e instanceof Error ? e.message : String(e) }) } finally { setBusy(null) }
  }
  const of = (phase: BuildTask['phase']) => tasks?.filter((t) => t.phase === phase) ?? []
  const stopped = of('stopped'), ready = of('ready'), checking = of('checking'), building = of('building'), landed = of('landed')
  const row = (t: BuildTask, extra?: React.ReactNode, action?: React.ReactNode) => (
    <li key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
        <Link to={`/tasks/${t.id}/build`} style={{ fontWeight: 600, textDecoration: 'none' }}>{t.identifier} {t.title}</Link>
        <div className="faint" style={{ fontSize: 13 }}>
          {t.done} of {t.total} sub-task{t.total === 1 ? '' : 's'} done{t.projectName ? <> · in <Link to={`/projects/${t.projectId}`}>{t.projectName}</Link></> : ''}
          {t.pr?.url ? <> · <a href={t.pr.url} target="_blank" rel="noreferrer">pull request #{t.pr.number}</a> {PR_WORD[t.pr.status] ?? t.pr.status}</> : ''}
        </div>
        {extra}
        {refused?.key === t.id && <div className="bad" style={{ fontSize: 13 }}>{refused.why}</div>}
      </div>
      {action}
    </li>
  )
  return (
    <>
      <div className="page-head">
        <div>
          <h1>🔨 Build{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Everything after the plan. A task builds by itself once its brief is approved; what it asks, and anything that stops it, shows here.</p>
        </div>
        <Link to="/graph" className="btn quiet">Graph</Link>
      </div>
      {error && <div className="empty">The engine isn't reachable: {error}.</div>}
      {!app && <div className="empty">No app yet. Add one in Settings.</div>}
      {tasks && !tasks.length && <div className="empty">Nothing is being built. A task shows here once its brief is approved and it has been planned. <Link to="/plan">Go to Plan →</Link></div>}

      {stopped.length > 0 && (
        <section data-component="BuildNeedsYou">
          <h2 className="build-h">Waiting for you</h2>
          <ul className="list panel build-list">
            {stopped.map((t) => row(t, <>
              {t.questions.map((q) => <QuestionAsk key={q.id} q={q} busy={busy !== null} onAnswer={(answer) => act(t.id, () => engine.answer(q.id, answer))} />)}
              {t.checks?.needsYou && <HeldAsk task={t} busy={busy !== null} onAnswer={(answer) => act(t.id, () => engine.say(t.checks!.sessionId!, answer))} />}
              {t.failed.map((x) => (
                <div key={x.id} className="build-ask">
                  <div><Badge tone="bad">failed</Badge> <strong>{x.identifier} {x.title}</strong></div>
                  {x.error && <div className="muted" style={{ fontSize: 13 }}>{x.error.slice(0, 240)}</div>}
                  <div className="opts"><button className="btn quiet small" disabled={busy !== null} onClick={() => void act(t.id, () => engine.retry(x.id))}>Try it again</button></div>
                </div>
              ))}
              {t.held.map((x) => <div key={x.id} className="build-ask"><Badge tone="warn">held</Badge> <strong>{x.identifier} {x.title}</strong> <span className="muted" style={{ fontSize: 13 }}>{x.reason}</span></div>)}
              {!t.questions.length && !t.failed.length && !t.held.length && !t.checks?.needsYou && <div className="build-ask"><Badge tone="warn">{t.projectStatus}</Badge> <span className="muted" style={{ fontSize: 13 }}>Its build is {t.projectStatus}. <Link to={`/projects/${t.projectId}`}>Look →</Link></span></div>}
            </>))}
          </ul>
        </section>
      )}

      {ready.length > 0 && (
        <section data-component="BuildReady">
          <h2 className="build-h">Planned, not started</h2>
          <ul className="list panel build-list">
            {ready.map((t) => row(t, null, <button className="btn" disabled={busy !== null} onClick={() => void act(t.id, () => engine.buildTask(t.id))}>{busy === t.id ? 'Starting…' : 'Build it'}</button>))}
          </ul>
        </section>
      )}

      {checking.length > 0 && (
        <section data-component="BuildChecking">
          <h2 className="build-h">Planned, being read before it is built</h2>
          <ul className="list panel build-list">
            {checking.map((t) => row(t, <div className="muted" style={{ fontSize: 13 }}>Still to come, by themselves: {t.checks?.left.join(', ')}. Then it is built.</div>, <Badge tone="accent" dot>reading</Badge>))}
          </ul>
        </section>
      )}

      {building.length > 0 && (
        <section data-component="BuildRunning">
          <h2 className="build-h">Building</h2>
          <ul className="list panel build-list">
            {building.map((t) => row(t, t.live.map((x) => <div key={x.id} className="muted" style={{ fontSize: 13 }}><span className="mono">{x.identifier}</span> {x.title}{x.step ? <> · {x.step}</> : ''}</div>), <Badge tone="accent" dot>building</Badge>))}
          </ul>
        </section>
      )}

      {landed.length > 0 && (
        <section data-component="BuildLanded">
          <h2 className="build-h">Landed</h2>
          <ul className="list panel build-list">
            {landed.map((t) => row(t, null, t.pr?.url ? <a className="btn quiet small" href={t.pr.url} target="_blank" rel="noreferrer">Pull request #{t.pr.number}</a> : <Badge tone="ok">landed</Badge>))}
          </ul>
        </section>
      )}
    </>
  )
}

/**
 * The last step before the build stopped for the person: its question, and a box to answer it in (the answer goes to
 * that step's agent, which carries on and lets the build start).
 */
function HeldAsk({ task, busy, onAnswer }: { task: BuildTask; busy: boolean; onAnswer: (answer: string) => Promise<unknown> | void }) {
  const [own, setOwn] = useState('')
  return (
    <div className="build-ask" data-component="HeldAsk">
      <div><Badge tone="bad">the build is waiting for you</Badge> <strong>Before it is built, the final ADR and plan needs a decision:</strong></div>
      <div style={{ margin: '6px 0' }}><Md text={task.checks!.needsYou!} /></div>
      {task.checks!.sessionId
        ? <form className="opts" onSubmit={(e) => { e.preventDefault(); if (own.trim()) void onAnswer(own.trim()) }}>
            <input value={own} onChange={(e) => setOwn(e.target.value)} aria-label="Your answer" placeholder="Your answer" style={{ flex: 1, minWidth: 200 }} />
            <button className="btn small" disabled={busy || !own.trim()}>Answer</button>
          </form>
        : <div className="faint" style={{ fontSize: 13 }}>Its agent's conversation is closed. <Link to={`/tasks/${task.id}/final`}>Open the step on the task →</Link></div>}
    </div>
  )
}
