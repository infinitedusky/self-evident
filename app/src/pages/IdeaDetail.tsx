/**
 * One idea from the inbox, worked through like a task (Sandy, 2026-11-13: "when you go to one and work on it you get a
 * dedicated agent. It should really be a task in all but name until you convert"). Its steps (research, sketches,
 * mockups, a prototype, a rough draft of the brief; none of them committing to anything) are down the side as on a
 * task's page, each with a page of its own, and the idea's own agent is in a column beside them. The agent and its
 * worktree start when the person presses "Work on this idea"; an idea nobody works on has neither. Converting it takes
 * the agent, the worktree and the steps to the task. After Linear, where a triage issue has the same page as any other.
 */
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { Badge } from '../components/Badge'
import { useSteps } from '../components/StepsPanel'
import { StepSection } from '../components/StepSection'
import { TaskNav } from '../components/TaskNav'
import { TASK_AGENT_ASKED, TaskAgent, useTaskAgent } from '../components/TaskAgent'
import { engine, type IdeaRow } from '../engine'
import { useCurrentApp } from '../current-app'
import { Md } from '../components/Md'
import { label } from '@self-evident/engine/steps'

export function IdeaDetail({ id, section }: { id: string; section?: string }) {
  const [idea, setIdea] = useState<IdeaRow | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const { app } = useCurrentApp()
  useEffect(() => { if (app) engine.ideas(app.id).then((all) => setIdea(all.find((i) => i.id === id) ?? null)).catch((e) => setError(String(e.message ?? e))) }, [id, app?.id])
  if (error && !idea) return <div className="empty bad">{error}</div>
  if (idea === undefined) return <p className="muted">Loading…</p>
  if (idea === null) return <div className="empty">No such idea. <Link to="/ideas">Back to the ideas</Link>.</div>
  const open = idea.lane === 'inbox'
  return (
    <>
      <p className="mono"><Link to="/ideas">← Ideas</Link></p>
      <div className="page-head">
        <div>
          <h1><span className="mono faint" style={{ fontWeight: 400 }}>#{idea.number}</span> {idea.title}</h1>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}><Badge tone={open ? 'neutral' : 'ok'}>{open ? 'an idea' : 'converted'}</Badge></div>
        </div>
      </div>
      <Work idea={idea} section={section} open={open} />
    </>
  )
}

/** The idea's nav, the section the address names, and its agent. */
function Work({ idea, section, open }: { idea: IdeaRow; section?: string; open: boolean }) {
  const nav = useNavigate()
  const subject = { kind: 'ideas' as const, id: idea.id }
  const { v, error: stepsError } = useSteps(subject, idea.appId)
  const agent = useTaskAgent(idea.id, idea.appId, 'idea')
  const [navOpen, setNavOpen] = useState(() => { try { return localStorage.getItem('se.task-nav.open') !== '0' } catch { return true } })
  const toggleNav = () => setNavOpen((o) => { try { localStorage.setItem('se.task-nav.open', o ? '0' : '1') } catch { /* fine */ } return !o })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = `/ideas/${idea.id}`
  const convert = async (as: 'task' | 'project') => {
    setBusy(true)
    try { const out = await engine.convertIdea(idea.id, { as }); nav(out.issueId ? `/tasks/${out.issueId}` : `/projects/${out.projectId}`) } catch (e: any) { setError(String(e.message ?? e)); setBusy(false) }
  }
  const ask = async () => {
    setBusy(true)
    try { await engine.ask({ appId: idea.appId, subjectRef: { ideaId: idea.id }, text: `Convert the idea #${idea.number} "${idea.title}" (${idea.id}) into a task or a project: read everything it has, decide which, and say why.` }); window.dispatchEvent(new Event(TASK_AGENT_ASKED)) } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) }
  }
  if (stepsError && !v) return <div className="empty bad">{stepsError}</div>
  if (!v) return <p className="muted">Loading…</p>
  const rows = v.rows
  const here = rows.some((r) => r.key === section) ? section! : 'overview'
  if (section && here === 'overview') return <Navigate to={base} replace />
  const row = rows.find((r) => r.key === here)
  const next = rows.find((r) => !r.waitingOn && r.state.status === 'none' && r.key !== 'idea')
  const hasAgent = open || !!agent.session // a converted idea's agent went with it; one that stayed is still shown
  return (
    <div className={`task-layout ${hasAgent ? 'with-agent' : ''} ${agent.open ? '' : 'agent-folded'} ${navOpen ? '' : 'nav-folded'}`}>
      <TaskNav folded={!navOpen} onToggle={toggleNav} base={base} here={here} on="idea" rows={rows} />
      <div className="task-main">
        {here === 'overview' && (
          <>
            <section className="panel">
              <h2>The idea</h2>
              {idea.body ? <Md text={idea.body} /> : <p className="muted" style={{ margin: 0 }}>Only its title so far.</p>}
              {open && next && <p style={{ margin: '10px 0 0' }}>Next, if you want it: <Link to={`${base}/${next.key}`}>{label(next.key, 'idea')}</Link>. Nothing here commits to building it.</p>}
            </section>
            {open && (
              <section className="panel">
                <h2>Convert it</h2>
                <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>When it's something we'll build. As a task, its agent, its worktree and its steps go with it, and its rough draft becomes the brief, waiting for your approval.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" disabled={busy} onClick={ask}>Ask the agent to convert it</button>
                  <button className="btn quiet" disabled={busy} onClick={() => convert('task')}>As a task</button>
                  <button className="btn quiet" disabled={busy} onClick={() => convert('project')}>As a project</button>
                </div>
                {error && <div className="empty bad" style={{ marginTop: 10 }}>{error}</div>}
              </section>
            )}
          </>
        )}
        {row && <StepSection subject={subject} appId={idea.appId} name={idea.title} on="idea" row={row} base={base} waitingState={rows.find((r) => r.key === row.waitingOn)?.state} session={agent.session?.id} />}
      </div>
      {hasAgent && agent.session !== undefined && (
        <TaskAgent sessionId={agent.session?.id ?? null} taskId={idea.id} of="idea" stage={row ? label(row.key, 'idea') : 'Idea'} state={agent.session?.busy ? 'working' : 'idle'}
          deployed={agent.out.map((a) => ({ what: a.what, icon: a.icon ?? '🛠️', title: a.title, sessionId: a.sessionId, state: a.busy ? 'out' as const : 'back' as const }))}
          open={agent.open} onToggle={agent.toggle} onStart={open ? agent.start : undefined} starting={agent.starting} error={agent.error} />
      )}
    </div>
  )
}
