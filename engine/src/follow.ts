/**
 * Following the agent: when a tool changes something, the workspace's following tab goes to the page it shows on,
 * like following someone in Figma or Live Share. The page comes from the tool and what it returned; the UI gathers
 * a burst of changes and lands once (tasks of one project land on the project).
 */
import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, issue, session } from './db/schema.js'
import { appendEvent } from './events.js'

export interface Followed { path: string; projectId?: string | null }

const TASK = new Set(['update_task', 'set_task_state', 'plan_task'])
const BACKLOG = new Set(['backlog_take', 'backlog_duplicate', 'backlog_drop', 'backlog_todo'])
const PROJECT = new Set(['backlog_add', 'start_project', 'pause_project', 'resume_project', 'cancel_project'])
const TODO = new Set(['create_todo', 'update_todo', 'check_item', 'finish_todo'])
const PLAN = new Set(['create_initiative', 'update_initiative', 'create_cycle'])

/** The tools that change something a page shows. */
export const FOLLOWED = new Set(['create_idea', 'create_project', 'create_task', 'reorder_tasks', 'convert_idea', 'set_step', ...TASK, ...BACKLOG, ...PROJECT, ...TODO, ...PLAN])

async function task(id: string | undefined) {
  if (!id) return null
  const [t] = await db.select({ id: issue.id, projectId: issue.projectId, parentId: issue.parentId }).from(issue).where(eq(issue.id, id))
  return t ?? null
}

/** The page a tool's change shows on, from its arguments and what it returned; null when there is none. */
export async function pageFor(tool: string, args: Record<string, any>, out: any): Promise<Followed | null> {
  const project = (id: string | null | undefined): Followed | null => (id ? { path: `/projects/${id}`, projectId: id } : null)
  if (tool === 'create_idea') return { path: out?.id ? `/ideas/${out.id}` : '/ideas' }
  if (tool === 'create_project') return project(out?.project?.id ?? out?.id)
  if (tool === 'create_task') {
    const parent = await task(args.parentId)
    return out?.id ? { path: `/tasks/${parent?.id ?? out.id}`, projectId: out.projectId ?? parent?.projectId ?? args.projectId ?? null } : null
  }
  if (TASK.has(tool)) { const t = await task(args.issueId); return t ? { path: `/tasks/${t.id}`, projectId: t.projectId } : null }
  if (BACKLOG.has(tool)) { const t = await task(args.issueId); return t?.projectId ? project(t.projectId) : t ? { path: `/tasks/${t.id}` } : null }
  if (tool === 'reorder_tasks') { const t = await task(args.ids?.[0]); return t?.parentId ? { path: `/tasks/${t.parentId}`, projectId: t.projectId } : project(t?.projectId) }
  if (PROJECT.has(tool)) return project(args.projectId)
  if (TODO.has(tool)) return { path: '/todos' }
  if (PLAN.has(tool)) return { path: '/plan' }
  if (tool === 'convert_idea') return out?.project?.id ? project(out.project.id) : out?.id ? { path: `/tasks/${out.id}`, projectId: out.projectId ?? null } : null
  if (tool === 'set_step') {
    if (args.ideaId) return { path: `/ideas/${args.ideaId}` }
    if (args.issueId) { const t = await task(args.issueId); return t ? { path: `/tasks/${t.id}`, projectId: t.projectId } : null }
    return project(args.projectId)
  }
  return null
}

/** Tell the workspace the agent changed something there (a ui.follow event); never fails the tool. */
export async function follow(appId: string, sessionId: string | null, tool: string, args: Record<string, any>, out: any): Promise<void> {
  try {
    const page = await pageFor(tool, args, out)
    if (!page) return
    const [a] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, appId))
    await db.transaction((tx) => appendEvent(tx, { workspaceId: a?.workspaceId ?? 'ws_none', appId, sessionId, actor: 'engine', type: 'ui.follow', payload: { sessionId, tool, tab: { kind: 'page', path: page.path }, projectId: page.projectId ?? null } }))
  } catch { /* following is a nicety; the change is made */ }
}

/**
 * Which conversation a Claude Code session over MCP is: the one its address names, else the app's only conversation
 * carried on in a terminal, else none (the following tab then shows the accent colour).
 */
export async function mcpSession(appId: string, named: string | null): Promise<string | null> {
  const open = and(eq(session.appId, appId), eq(session.kind, 'talk'), eq(session.status, 'open'))
  if (named) { const [s] = await db.select({ id: session.id }).from(session).where(and(open, eq(session.id, named))); return s?.id ?? null }
  const inTerminal = await db.select({ id: session.id }).from(session).where(and(open, isNotNull(session.terminalSince)))
  return inTerminal.length === 1 ? inTerminal[0].id : null
}
