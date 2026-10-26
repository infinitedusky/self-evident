/**
 * The engine as tools: the same set for the agent in Self Evident's own conversations (talk.ts, through the Agent
 * SDK) and for any Claude Code session through MCP (mcp.ts), so the two never drift. Thin wrappers over the
 * functions the routes call. Every set is scoped to one app: anything addressed by id is checked against it.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './db/client.js'
import { backlogItem, checklistItem, phase, question, task, todo } from './db/schema.js'
import { eventsSince } from './events.js'
import { addIdea, addItems, coverItem, dropItem, itemToTask } from './backlog.js'
import { createIdea, listIdeas } from './ideas.js'
import { now } from './now.js'
import { answerQuestion, finishPlanning, preparePlanning } from './planner.js'
import { createProject, listProjects, PlanError, projectGraph } from './projects.js'
import { runner } from './runner.js'
import { syncApp } from './github.js'
import { addChecklist, completeTodo, createTodo, dropTodo, itemToTodo, listTodos, setChecklistItem, updateTodo } from './todos.js'

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }
export interface EngineTool { name: string; description: string; shape: z.ZodRawShape; handler: (args: any) => Promise<ToolResult> }
export interface ToolScope { appId: string; sessionId?: string; actor?: string; waitForPlanner?: boolean }

/** Tools that only read: safe to run without asking. */
export const READ_ONLY_TOOLS = new Set(['now', 'projects', 'project_graph', 'ideas', 'events', 'todos'])

export function engineTools(opts: ToolScope): EngineTool[] {
  const { appId, sessionId } = opts
  const actor = opts.actor ?? 'agent'
  const def = (name: string, description: string, shape: z.ZodRawShape, handler: (args: any) => Promise<ToolResult>): EngineTool => ({ name, description, shape, handler })
  const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] })
  const tryIt = async (fn: () => Promise<unknown>) => { try { return text(await fn()) } catch (err: any) { return { ...text(`error: ${err?.message ?? err}`), isError: true } } }
  // The wall: this conversation sees and touches only its own app. Anything addressed by id is checked against it.
  const foreign = () => new PlanError('that belongs to another app; this session is scoped to its own app')
  const ownProject = async (projectId: string) => { const g = await projectGraph(projectId); if (!g || g.project.appId !== appId) throw foreign(); return g }
  const ownTask = async (taskId: string) => { const [t] = await db.select().from(task).where(eq(task.id, taskId)); if (!t || t.appId !== appId) throw foreign(); return t }
  const ownItem = async (itemId: string) => { const [i] = await db.select().from(backlogItem).where(eq(backlogItem.id, itemId)); if (!i || i.appId !== appId) throw foreign(); return i }
  const ownTodo = async (todoId: string) => { const [t] = await db.select().from(todo).where(eq(todo.id, todoId)); if (!t || t.appId !== appId) throw foreign(); return t }
  const ownLine = async (itemId: number) => { const [l] = await db.select().from(checklistItem).where(eq(checklistItem.id, itemId)); if (!l || l.appId !== appId) throw foreign(); return l }
  const ownQuestion = async (questionId: string) => { const [q] = await db.select().from(question).where(eq(question.id, questionId)); if (!q || q.appId !== appId) throw foreign(); return q }
  return [
      def('now', 'What is running, what needs a person, what just happened, in this app.', {}, async () => tryIt(() => now(appId))),
      def('projects', 'This app\'s projects with counts (superseded hidden unless all=true).', { all: z.boolean().optional() }, async (a) => tryIt(() => listProjects({ all: a.all, appId }))),
      def('project_graph', 'A project in full: its backlog (open, covered, dropped), tasks in order, phases with dependencies, files, held reasons, steps and last run; the planner\'s decisions and questions.', { projectId: z.string() }, async (a) => tryIt(() => ownProject(a.projectId))),
      def('ideas', 'This app\'s ideas inbox and what left it.', {}, async () => tryIt(() => listIdeas(appId))),
      def('create_idea', 'Keep an idea in this app: a title and, optionally, why and what is already decided.', { title: z.string(), body: z.string().optional() }, async (a) => tryIt(() => createIdea({ ...a, appId, actor: actor }))),
      def('create_project', 'Create a project in this app: tasks in order, each a title and a brief. Phases come from the planner (plan_task) or can be given.', {
        title: z.string(), spec: z.string().optional(), ideaId: z.string().optional(),
        tasks: z.array(z.object({ title: z.string(), description: z.string().optional().describe('one to three plain sentences for a person: what will be different; no file names or code'), brief: z.string().optional().describe('the builder\'s instructions, Markdown, short paragraphs'), phases: z.array(z.object({ key: z.string(), title: z.string(), description: z.string().optional(), brief: z.string().optional(), dependsOn: z.array(z.string()).optional(), files: z.array(z.string()).optional() })).optional() })),
      }, async (a) => tryIt(() => createProject({ ...a, appId }))),
      def('backlog_add', 'Add to a project\'s backlog: things the project must not forget (one line each, optional detail), or an idea of this app (ideaId). Use it whenever the person mentions something the project should cover.', {
        projectId: z.string(), items: z.array(z.object({ text: z.string(), body: z.string().optional() })).optional(), ideaId: z.string().optional(),
      }, async (a) => tryIt(async () => { await ownProject(a.projectId); return a.ideaId ? addIdea(a.projectId, a.ideaId, actor) : addItems(a.projectId, (a.items ?? []).map((i: { text: string; body?: string }) => ({ ...i, source: 'agent' as const, sourceRef: sessionId ? { sessionId } : undefined })), actor) })),
      def('backlog_task', 'Make an open backlog item a new task at the end of its project (title and brief default to the item). In a running project the engine plans it when its turn comes.', { itemId: z.string(), title: z.string().optional(), brief: z.string().optional() },
        async (a) => tryIt(async () => { await ownItem(a.itemId); const out = await itemToTask(a.itemId, a, actor); void runner.dispatch(); return out })),
      def('backlog_cover', 'Mark an open backlog item covered by a task the project already has.', { itemId: z.string(), taskId: z.string(), reason: z.string().optional() },
        async (a) => tryIt(async () => { await ownItem(a.itemId); const out = await coverItem(a.itemId, a.taskId, a.reason, actor); void runner.dispatch(); return out })),
      def('backlog_drop', 'Drop an open backlog item, with the reason (required). Ask the person first unless they said so.', { itemId: z.string(), reason: z.string() },
        async (a) => tryIt(async () => { await ownItem(a.itemId); const out = await dropItem(a.itemId, a.reason, actor); void runner.dispatch(); return out })),
      def('todos', 'This app\'s to-dos: the work around the code (accounts, approvals, people, checks), each with its checklist and the project it unblocks.', {}, async () => tryIt(() => listTodos(appId))),
      def('create_todo', 'Keep a to-do in this app: work outside the code. Draft its checklist yourself (concrete lines, in order; mark a line waitingOn when someone else has it, e.g. "Apple\'s review"). owner: person (they do it) or agent (you can do it here). projectId: the project it unblocks, if any.', {
        title: z.string(), notes: z.string().optional(), owner: z.enum(['person', 'agent']).optional(), projectId: z.string().optional(),
        checklist: z.array(z.object({ text: z.string(), waitingOn: z.string().optional() })).optional(),
      }, async (a) => tryIt(async () => { if (a.projectId) await ownProject(a.projectId); return createTodo({ ...a, appId }, actor) })),
      def('update_todo', 'Change a to-do of this app: title, notes, owner, the project it unblocks; or add checklist lines (addChecklist).', {
        todoId: z.string(), title: z.string().optional(), notes: z.string().optional(), owner: z.enum(['person', 'agent']).optional(), projectId: z.string().optional(),
        addChecklist: z.array(z.object({ text: z.string(), waitingOn: z.string().optional() })).optional(),
      }, async (a) => tryIt(async () => { await ownTodo(a.todoId); if (a.projectId) await ownProject(a.projectId); const { todoId, addChecklist: more, ...rest } = a; if (Object.keys(rest).length) await updateTodo(todoId, rest, actor); return more?.length ? addChecklist(todoId, more, actor) : (await listTodos(appId)).find((t) => t.id === todoId) })),
      def('check_item', 'Check or uncheck a line of a to-do\'s checklist, or mark it waiting on someone (waitingOn; empty string clears). Check a line only when it is done: you did it, the person said so, or you verified it.', {
        itemId: z.number(), done: z.boolean().optional(), waitingOn: z.string().optional(),
      }, async (a) => tryIt(async () => { await ownLine(a.itemId); return setChecklistItem(a.itemId, { done: a.done, waitingOn: a.waitingOn }, actor) })),
      def('finish_todo', 'Mark a to-do of this app done (when its checklist was wrong or the rest no longer matters), or drop it with a reason.', { todoId: z.string(), drop: z.string().optional().describe('the reason, to drop it instead') },
        async (a) => tryIt(async () => { await ownTodo(a.todoId); return a.drop ? dropTodo(a.todoId, a.drop, actor) : completeTodo(a.todoId, actor) })),
      def('backlog_todo', 'Make an open backlog item a to-do of the app (work outside the code), with a checklist you draft.', { itemId: z.string(), title: z.string().optional(), checklist: z.array(z.object({ text: z.string(), waitingOn: z.string().optional() })).optional() },
        async (a) => tryIt(async () => { await ownItem(a.itemId); return itemToTodo(a.itemId, a, actor) })),
      def('sync_github', 'Read GitHub now for this app (it also happens every two minutes): our pull requests merged, reviewed, checks; teammates\' pull requests and reviews asked of the person; main merged into open project branches, conflicts reported.', {}, async () => tryIt(() => syncApp(appId))),
      def('plan_task', `Run the planner on a task of this app (minutes): reads the repo and the brief, writes phases, decisions and questions. ${opts.waitForPlanner ? 'Returns when done.' : 'Returns at once; the outcome shows in now and project_graph.'}`, { taskId: z.string() }, async (a) => tryIt(async () => { await ownTask(a.taskId); const ctx = await preparePlanning(a.taskId, { actor }); const done = finishPlanning(ctx, { onPlanned: () => void runner.dispatch() }); if (opts.waitForPlanner) return done; void done; return { started: true, runId: ctx.runId, note: 'planning takes a few minutes; the outcome shows in now (My Stuff) and project_graph' } })),
      def('answer_question', 'Answer one of the planner\'s questions on the person\'s behalf; say so to them first.', { questionId: z.string(), answer: z.string() }, async (a) => tryIt(async () => { await ownQuestion(a.questionId); return answerQuestion(a.questionId, a.answer, actor) })),
      def('start_project', 'Run a project of this app: integration branch, a worktree and an agent per phase, landing, PR.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.startProject(a.projectId) })),
      def('retry_phase', 'Retry a failed or cancelled phase of this app: three more attempts, told why it failed; fresh=true starts over from the project\'s branch.', { phaseId: z.string(), fresh: z.boolean().optional() }, async (a) => tryIt(async () => { const [x] = await db.select().from(phase).where(eq(phase.id, a.phaseId)); if (!x || x.appId !== appId) throw foreign(); return runner.retryPhase(a.phaseId, { fresh: a.fresh, actor: actor }) })),
      def('pause_project', 'Pause a running project of this app: nothing new starts, running agents stop and keep their place.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.pauseProject(a.projectId, actor) })),
      def('resume_project', 'Resume a paused project of this app.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.resumeProject(a.projectId, actor) })),
      def('cancel_project', 'Stop a project of this app: agents aborted, unlanded phases cancelled, landed work kept.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.cancelProject(a.projectId) })),
      def('events', 'This app\'s event log, newest last. Filter by project or phase; since is a sequence number.', { projectId: z.string().optional(), phaseId: z.string().optional(), since: z.number().optional(), limit: z.number().optional() },
        async (a) => tryIt(async () => (await eventsSince(a.since ?? 0, { appId, projectId: a.projectId, phaseId: a.phaseId })).slice(-(a.limit ?? 50)))),
  ]
}
