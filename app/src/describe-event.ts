/** One event as one line for a person. My Stuff's "Just happened" and a build's log both read it. */
import type { Event } from './engine'

const toolLine = (p: any) => {
  const i = p.input ?? {}
  const tool = String(p.tool ?? '').replace('mcp__engine__', 'engine · ')
  return tool === 'Bash' ? `$ ${i.command ?? ''}` : `${tool} ${i.file ?? i.pattern ?? i.path ?? ''}`.trim()
}

export function describeEvent(e: Event): string {
  const p = e.payload as any
  switch (e.type) {
    case 'project.created': return `${p.name ?? p.title} · ${p.issues ?? p.tasks} issue(s)`
    case 'issue.created': return `${p.identifier ?? `#${p.number}`} ${p.title}`
    case 'issue.state': return `${p.identifier ?? ''} ${p.title ?? ''}: ${p.from} → ${p.to}${p.reason ? ` (${p.reason})` : ''}`
    case 'build.status': return `${p.identifier ?? ''} ${p.from} → ${p.to}`
    case 'build.held': return p.reason
    case 'issue.planning': return `planning ${p.identifier ?? `#${p.number}`}`
    case 'issue.planned': return `${(p.subIssues ?? p.phases ?? []).length} sub-issues · ${p.decisions} decisions · ${p.questions} questions`
    case 'issue.plan_failed': return String(p.error).slice(0, 120)
    case 'question.asked': return `[${p.cost}] ${p.text}`
    case 'question.answered': return String(p.answer)
    case 'run.started': return `started · ${p.model ?? ''}`
    case 'run.message': return String(p.text ?? '')
    case 'run.tool_call': return toolLine(p)
    case 'run.tool_result': return p.ok === false ? `error · ${p.preview ?? ''}` : String(p.preview ?? '')
    case 'run.steps': return `${(p.steps ?? []).filter((s: any) => s.status === 'completed').length}/${(p.steps ?? []).length} steps`
    case 'run.error': case 'build.error': return String(p.error ?? '')
    case 'run.result': return `${p.subtype} · $${Number(p.costUsd ?? 0).toFixed(2)}`
    case 'land.landed': return `landed ${String(p.sha).slice(0, 7)}`
    case 'pr.opened': case 'pr.updated': return `#${p.number}`
    default: return Object.keys(p).length ? JSON.stringify(p).slice(0, 100) : ''
  }
}
