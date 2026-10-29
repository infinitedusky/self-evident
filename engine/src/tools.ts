/**
 * The engine as tools: the same set for the agent in Self Evident's own conversations (talk.ts, through the Agent
 * SDK) and for any Claude Code session through MCP (mcp.ts), so the two never drift. Thin wrappers over the
 * functions the routes call, in Linear's words: initiatives, projects, issues (code or to-do), sub-issues, cycles.
 * Every set is scoped to one app: anything addressed by id is checked against it.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './db/client.js'
import { app, initiative, ISSUE_STATES, issue, question } from './db/schema.js'
import { appendEvent, eventsSince } from './events.js'
import { addIdea, addItems, dropItem, markDuplicate, promote } from './backlog.js'
import { createCycle, createInitiative, listCycles, listInitiatives, updateInitiative } from './goals.js'
import { createIdea, listIdeas } from './ideas.js'
import { changeState, createIssue, listIssues, reorder, updateIssue } from './issues.js'
import { now } from './now.js'
import { answerQuestion, finishPlanning, preparePlanning } from './planner.js'
import { createProject, issueDetail, listProjects, PlanError, projectGraph } from './projects.js'
import { runner } from './runner.js'
import { listStories } from './storybook.js'
import { syncApp } from './github.js'
import { addChecklist, completeTodo, createTodo, dropTodo, itemToTodo, listTodos, setChecklistItem, updateTodo } from './todos.js'

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }
export interface EngineTool { name: string; description: string; shape: z.ZodRawShape; handler: (args: any) => Promise<ToolResult> }
export interface ToolScope { appId: string; sessionId?: string; actor?: string; waitForPlanner?: boolean }

/** Tools that only read: safe to run without asking. */
export const READ_ONLY_TOOLS = new Set(['now', 'projects', 'project_graph', 'issue', 'issues', 'ideas', 'events', 'todos', 'initiatives', 'cycles', 'open_tab', 'stories'])

export function engineTools(opts: ToolScope): EngineTool[] {
  const { appId, sessionId } = opts
  const actor = opts.actor ?? 'agent'
  const def = (name: string, description: string, shape: z.ZodRawShape, handler: (args: any) => Promise<ToolResult>): EngineTool => ({ name, description, shape, handler })
  const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] })
  const tryIt = async (fn: () => Promise<unknown>) => { try { return text(await fn()) } catch (err: any) { return { ...text(`error: ${err?.message ?? err}`), isError: true } } }
  // The wall: this conversation sees and touches only its own app. Anything addressed by id is checked against it.
  const foreign = () => new PlanError('that belongs to another app; this session is scoped to its own app')
  const ownProject = async (projectId: string) => { const g = await projectGraph(projectId); if (!g || g.project.appId !== appId) throw foreign(); return g }
  const ownIssue = async (issueId: string) => { const [t] = await db.select().from(issue).where(eq(issue.id, issueId)); if (!t || t.appId !== appId) throw foreign(); return t }
  const ownQuestion = async (questionId: string) => { const [q] = await db.select().from(question).where(eq(question.id, questionId)); if (!q || q.appId !== appId) throw foreign(); return q }
  const ownInitiative = async (id: string) => { const [i] = await db.select().from(initiative).where(eq(initiative.id, id)); if (!i || (i.appId && i.appId !== appId)) throw foreign(); return i }
  const line = z.object({ text: z.string(), waitingOn: z.string().optional() })
  const subIssue = z.object({ key: z.string(), title: z.string(), description: z.string().optional(), brief: z.string().optional(), dependsOn: z.array(z.string()).optional(), files: z.array(z.string()).optional() })
  const described = 'one to three plain sentences for a person: what will be different; no file names or code'
  return [
      def('now', 'What is running, what needs a person, what just happened, in this app.', {}, async () => tryIt(() => now(appId))),
      def('projects', 'This app\'s projects with counts (superseded hidden unless all=true).', { all: z.boolean().optional() }, async (a) => tryIt(() => listProjects({ all: a.all, appId }))),
      def('project_graph', 'A project in full: its backlog (open, a duplicate of what covers it, or canceled with why), issues in order, their sub-issues with builds, dependencies, files, held reasons, steps and last run; the planner\'s decisions and questions; the to-dos it waits on.', { projectId: z.string() }, async (a) => tryIt(() => ownProject(a.projectId))),
      def('issue', 'One issue in full, by id: its sub-issues as a list (builds, or checklist lines), relations, questions and decisions.', { issueId: z.string() }, async (a) => tryIt(async () => { await ownIssue(a.issueId); return issueDetail(a.issueId) })),
      def('issues', 'This app\'s issues: filter by kind (code or todo), by project (projectId; "none" for issues in no project), top level only, open only.', {
        kind: z.enum(['code', 'todo']).optional(), projectId: z.string().optional(), topLevel: z.boolean().optional(), open: z.boolean().optional(),
      }, async (a) => tryIt(async () => { if (a.projectId && a.projectId !== 'none') await ownProject(a.projectId); return listIssues(appId, { kind: a.kind, projectId: a.projectId === 'none' ? null : a.projectId, topLevel: a.topLevel, open: a.open }) })),
      def('ideas', 'This app\'s ideas inbox and what left it.', {}, async () => tryIt(() => listIdeas(appId))),
      def('create_idea', 'Keep an idea in this app: a title and, optionally, why and what is already decided.', { title: z.string(), body: z.string().optional() }, async (a) => tryIt(() => createIdea({ ...a, appId, actor: actor }))),
      def('create_project', 'Create a project in this app: issues in order, each a title and a brief. Sub-issues come from the planner (plan_issue) or can be given.', {
        name: z.string(), content: z.string().optional().describe('why it exists and what it must do, Markdown'), description: z.string().optional().describe('one line'), ideaId: z.string().optional(),
        issues: z.array(z.object({ title: z.string(), description: z.string().optional().describe(described), brief: z.string().optional().describe('the builder\'s instructions, Markdown, short paragraphs'), subIssues: z.array(subIssue).optional() })),
      }, async (a) => tryIt(() => createProject({ ...a, appId }, actor))),
      def('create_issue', 'Create an issue in this app. kind code (built by agents; default) or todo (work outside the code; prefer create_todo for a checklist). With projectId it goes at the end of that project (state backlog to put it in the backlog instead); without, it waits in no project until added to one. parentId makes it a sub-issue.', {
        title: z.string(), kind: z.enum(['code', 'todo']).optional(), description: z.string().optional().describe(described), brief: z.string().optional(),
        projectId: z.string().optional(), parentId: z.string().optional(), state: z.enum(['todo', 'backlog', 'triage']).optional(), priority: z.number().int().min(0).max(4).optional().describe('0 none, 1 urgent, 2 high, 3 medium, 4 low'), cycleId: z.string().optional(),
      }, async (a) => tryIt(async () => { if (a.projectId) await ownProject(a.projectId); if (a.parentId) await ownIssue(a.parentId); return createIssue(appId, { ...a, source: 'agent', sourceRef: sessionId ? { sessionId } : null, delegate: a.kind === 'todo' || a.parentId ? null : 'planner' }, actor) })),
      def('update_issue', 'Change an issue of this app: title, description, brief, priority, estimate, cycle; or move it into a project (projectId; it goes at the end).', {
        issueId: z.string(), title: z.string().optional(), description: z.string().optional(), brief: z.string().optional(), priority: z.number().int().min(0).max(4).optional(),
        estimate: z.enum(['S', 'M', 'L', 'XL']).optional(), cycleId: z.string().optional(), projectId: z.string().optional(),
      }, async (a) => tryIt(async () => { await ownIssue(a.issueId); if (a.projectId) await ownProject(a.projectId); const { issueId, ...rest } = a; return updateIssue(issueId, rest, actor) })),
      def('set_issue_state', `Move an issue of this app to a state (${ISSUE_STATES.join(', ')}). Canceling needs the reason. A code issue's state otherwise follows its sub-issues; use this for what the engine cannot see.`, {
        issueId: z.string(), state: z.enum(ISSUE_STATES), reason: z.string().optional(),
      }, async (a) => tryIt(async () => { await ownIssue(a.issueId); const out = await changeState(a.issueId, a.state, { actor, reason: a.reason }); void runner.dispatch(); return out })),
      def('reorder_issues', 'Put issues in this order: a project\'s top-level issues (the order they are built in), or one parent\'s sub-issues.', { ids: z.array(z.string()) },
        async (a) => tryIt(async () => { for (const id of a.ids) await ownIssue(id); return reorder(a.ids, actor) })),
      def('backlog_add', 'Add to a project\'s backlog: things the project must not forget (one line each, optional detail), or an idea of this app (ideaId). Use it whenever the person mentions something the project should cover.', {
        projectId: z.string(), items: z.array(z.object({ text: z.string(), body: z.string().optional() })).optional(), ideaId: z.string().optional(),
      }, async (a) => tryIt(async () => { await ownProject(a.projectId); return a.ideaId ? addIdea(a.projectId, a.ideaId, actor) : addItems(a.projectId, (a.items ?? []).map((i: { text: string; body?: string }) => ({ ...i, source: 'agent' as const, sourceRef: sessionId ? { sessionId } : undefined })), actor) })),
      def('backlog_take', 'Take a backlog issue on: it becomes Todo at the end of its project (title and brief default to what it says). In a running project the engine plans it when its turn comes.', { issueId: z.string(), title: z.string().optional(), brief: z.string().optional() },
        async (a) => tryIt(async () => { await ownIssue(a.issueId); const out = await promote(a.issueId, a, actor); void runner.dispatch(); return out })),
      def('backlog_duplicate', 'Mark a backlog issue a duplicate of an issue the project already has, which covers it.', { issueId: z.string(), ofIssueId: z.string(), reason: z.string().optional() },
        async (a) => tryIt(async () => { await ownIssue(a.issueId); const out = await markDuplicate(a.issueId, a.ofIssueId, a.reason, actor); void runner.dispatch(); return out })),
      def('backlog_drop', 'Cancel a backlog issue, with the reason (required). Ask the person first unless they said so.', { issueId: z.string(), reason: z.string() },
        async (a) => tryIt(async () => { await ownIssue(a.issueId); const out = await dropItem(a.issueId, a.reason, actor); void runner.dispatch(); return out })),
      def('backlog_todo', 'Make a backlog issue a to-do (work outside the code), with a checklist you draft. It stays in its project, which it unblocks.', { issueId: z.string(), title: z.string().optional(), checklist: z.array(line).optional() },
        async (a) => tryIt(async () => { await ownIssue(a.issueId); return itemToTodo(a.issueId, a, actor) })),
      def('todos', 'This app\'s to-dos: the work around the code (accounts, approvals, people, checks), each with its checklist and the project it unblocks.', {}, async () => tryIt(() => listTodos(appId))),
      def('create_todo', 'Keep a to-do in this app: work outside the code. Draft its checklist yourself (concrete lines, in order; mark a line waitingOn when someone else has it, e.g. "Apple\'s review"). owner: person (they do it) or agent (you can do it here). projectId: the project it unblocks, if any.', {
        title: z.string(), notes: z.string().optional(), owner: z.enum(['person', 'agent']).optional(), projectId: z.string().optional(), checklist: z.array(line).optional(),
      }, async (a) => tryIt(async () => { if (a.projectId) await ownProject(a.projectId); return createTodo({ ...a, appId }, actor) })),
      def('update_todo', 'Change a to-do of this app: title, notes, owner, the project it unblocks; or add checklist lines (addChecklist).', {
        todoId: z.string(), title: z.string().optional(), notes: z.string().optional(), owner: z.enum(['person', 'agent']).optional(), projectId: z.string().optional(), addChecklist: z.array(line).optional(),
      }, async (a) => tryIt(async () => { await ownIssue(a.todoId); if (a.projectId) await ownProject(a.projectId); const { todoId, addChecklist: more, ...rest } = a; if (Object.keys(rest).length) await updateTodo(todoId, rest, actor); return more?.length ? addChecklist(todoId, more, actor) : (await listTodos(appId)).find((t) => t.id === todoId) })),
      def('check_item', 'Check or uncheck a line of a to-do\'s checklist (its issue id), or mark it waiting on someone (waitingOn; empty string clears). Check a line only when it is done: you did it, the person said so, or you verified it.', {
        itemId: z.string(), done: z.boolean().optional(), waitingOn: z.string().optional(),
      }, async (a) => tryIt(async () => { await ownIssue(a.itemId); return setChecklistItem(a.itemId, { done: a.done, waitingOn: a.waitingOn }, actor) })),
      def('finish_todo', 'Mark a to-do of this app done (when its checklist was wrong or the rest no longer matters), or drop it with a reason.', { todoId: z.string(), drop: z.string().optional().describe('the reason, to drop it instead') },
        async (a) => tryIt(async () => { await ownIssue(a.todoId); return a.drop ? dropTodo(a.todoId, a.drop, actor) : completeTodo(a.todoId, actor) })),
      def('initiatives', 'This app\'s initiatives: the goals the work serves, long term, each with its projects.', {}, async () => tryIt(() => listInitiatives(appId))),
      def('create_initiative', 'State a goal for this app (an initiative): where the work is headed, in the person\'s words; optionally the projects that serve it.', {
        name: z.string(), description: z.string().optional(), targetDate: z.string().optional().describe('YYYY-MM-DD'), projectIds: z.array(z.string()).optional(),
      }, async (a) => tryIt(async () => { for (const p of a.projectIds ?? []) await ownProject(p); return createInitiative({ ...a, appId }, actor) })),
      def('update_initiative', 'Change an initiative: name, description, status (planned, active, completed), target date, the projects that serve it.', {
        initiativeId: z.string(), name: z.string().optional(), description: z.string().optional(), status: z.enum(['planned', 'active', 'completed']).optional(), targetDate: z.string().optional(),
        addProjects: z.array(z.string()).optional(), removeProjects: z.array(z.string()).optional(),
      }, async (a) => tryIt(async () => { await ownInitiative(a.initiativeId); for (const p of [...(a.addProjects ?? []), ...(a.removeProjects ?? [])]) await ownProject(p); const { initiativeId, ...rest } = a; return updateInitiative(initiativeId, rest, actor) })),
      def('cycles', 'This app\'s cycles (stretches of time: a week, a sprint), newest first, with their issues; current marks the one today is in.', {}, async () => tryIt(() => listCycles(appId))),
      def('create_cycle', 'Start a cycle for this app: from and to (YYYY-MM-DD), and the issues meant to be done by its end.', {
        startsAt: z.string(), endsAt: z.string(), name: z.string().optional(), description: z.string().optional(), issueIds: z.array(z.string()).optional(),
      }, async (a) => tryIt(async () => { for (const id of a.issueIds ?? []) await ownIssue(id); return createCycle({ ...a, appId }, actor) })),
      def('sync_github', 'Read GitHub now for this app (it also happens every two minutes): our pull requests merged, reviewed, checks; teammates\' pull requests and reviews asked of the person; main merged into open project branches, conflicts reported.', {}, async () => tryIt(() => syncApp(appId))),
      def('plan_issue', `Run the planner on a code issue of this app (minutes): reads the repo and the brief, writes sub-issues, decisions and questions. ${opts.waitForPlanner ? 'Returns when done.' : 'Returns at once; the outcome shows in now and project_graph.'}`, { issueId: z.string() }, async (a) => tryIt(async () => { await ownIssue(a.issueId); const ctx = await preparePlanning(a.issueId, { actor }); const done = finishPlanning(ctx, { onPlanned: () => void runner.dispatch() }); if (opts.waitForPlanner) return done; void done; return { started: true, runId: ctx.runId, note: 'planning takes a few minutes; the outcome shows in now (My Stuff) and project_graph' } })),
      def('answer_question', 'Answer one of the planner\'s questions on the person\'s behalf; say so to them first.', { questionId: z.string(), answer: z.string() }, async (a) => tryIt(async () => { await ownQuestion(a.questionId); return answerQuestion(a.questionId, a.answer, actor) })),
      def('start_project', 'Run a project of this app: integration branch, a worktree and an agent per sub-issue, landing, PR.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.startProject(a.projectId) })),
      def('retry_build', 'Retry a failed or cancelled sub-issue of this app: three more attempts, told why it failed; fresh=true starts over from the project\'s branch.', { issueId: z.string(), fresh: z.boolean().optional() }, async (a) => tryIt(async () => { await ownIssue(a.issueId); return runner.retry(a.issueId, { fresh: a.fresh, actor: actor }) })),
      def('pause_project', 'Pause a running project of this app: nothing new starts, running agents stop and keep their place.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.pauseProject(a.projectId, actor) })),
      def('resume_project', 'Resume a paused project of this app.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.resumeProject(a.projectId, actor) })),
      def('cancel_project', 'Stop a project of this app: agents aborted, unlanded sub-issues cancelled, landed work kept.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.cancelProject(a.projectId) })),
      def('open_tab', 'Open a tab in the person\'s workspace, beside the conversation: a page by its path (/projects/<id>, /issues/<id>, /ideas, /todos, /settings, ...), the running app (preview), its Storybook (storybook), or a story in it (storybook, with story: its id from the stories tool), a sub-issue\'s live build log (build, with issueId). An open tab is focused, not opened twice. split puts it beside (right) or under (below) the tab in front. Use it to show what you are talking about.', {
        kind: z.enum(['page', 'preview', 'storybook', 'build']).optional().describe('default page'), path: z.string().optional().describe('for a page'), issueId: z.string().optional().describe('for a build log'), story: z.string().optional().describe('for storybook: a story id, like pages-issuepage--sub-issue-building'),
        split: z.enum(['right', 'below']).optional(),
      }, async (a) => tryIt(async () => {
        const kind = a.kind ?? 'page'
        if (kind === 'page' && !a.path?.startsWith('/')) throw new PlanError('a page needs a path starting with /')
        if (kind === 'build') { if (!a.issueId) throw new PlanError('a build log needs issueId'); await ownIssue(a.issueId) }
        const [x] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, appId))
        const tab = { kind, ...(kind === 'page' ? { path: a.path } : {}), ...(kind === 'build' ? { issueId: a.issueId } : {}), ...(kind === 'storybook' && a.story ? { story: a.story } : {}) }
        await db.transaction((tx) => appendEvent(tx, { workspaceId: x?.workspaceId ?? 'ws_none', appId, sessionId: sessionId ?? null, actor, type: 'ui.open', payload: { sessionId, tab, split: a.split ?? null } }))
        return { opened: tab, note: 'shown in the person\'s workspace if Self Evident is open' }
      })),
      def('stories', 'This app\'s Storybook stories, from its running Storybook: id (open one with open_tab kind storybook), title (the page or component) and name (the state). match narrows by id, title or name.', { match: z.string().optional() },
        async (a) => tryIt(() => listStories(appId, a.match))),
      def('events', 'This app\'s event log, newest last. Filter by project or issue; since is a sequence number.', { projectId: z.string().optional(), issueId: z.string().optional(), since: z.number().optional(), limit: z.number().optional() },
        async (a) => tryIt(async () => (await eventsSince(a.since ?? 0, { appId, projectId: a.projectId, issueId: a.issueId })).slice(-(a.limit ?? 50)))),
  ]
}
