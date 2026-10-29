/** Plan's page, live: the engine's view of the app's open projects and tasks with their steps (PlanHome draws it). */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { PlanHome, type Plan as PlanData } from './PlanHome'
import { API, engine } from '../engine'
import { useCurrentApp } from '../current-app'

const LIVE = ['issue.created', 'issue.updated', 'issue.state', 'project.created', 'project.started', 'project.landed', 'project.cancelled', 'step.updated', 'brief.approved', 'brief.unapproved', 'workflow.used', 'workflow.saved', 'idea.converted', 'prototype.created', 'prototype.discarded']

export function Plan() {
  const { app } = useCurrentApp()
  const nav = useNavigate()
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!app) return
    let closed = false
    setPlan(null)
    const refresh = () => engine.plan(app.id).then((p) => { if (!closed) { setPlan(p); setError(null) } }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = new EventSource(`${API}/events?since=-1&app=${app.id}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 250) }
    for (const t of LIVE) es.addEventListener(t, bump)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!app) return <div className="empty">No app yet. Add one in Settings.</div>
  if (error && !plan) return <div className="empty">The engine isn't reachable: {error}. Start it with <code>pnpm dev</code> at the repo root.</div>
  if (!plan) return <p className="muted">Loading…</p>
  return <PlanHome plan={plan} app={app.name} appId={app.id} onNewTask={async (title, workflowId) => { const t = await engine.createIssue({ appId: app.id, title, kind: 'code', workflowId: workflowId ?? undefined }); nav(`/issues/${t.id}`) }} />
}
