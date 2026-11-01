/**
 * The engine as tools: the same set for the agent in Self Evident's own conversations (talk.ts, through the Agent
 * SDK) and for any Claude Code session through MCP (mcp.ts), so the two never drift. Thin wrappers over the
 * functions the routes call, shaped like Linear: initiatives, projects, tasks (code or to-do), sub-tasks, cycles. What
 * Linear calls an issue we call a task (the tables and ids still say issue); connecting Linear maps tasks to issues.
 * Every set is scoped to one app: anything addressed by id is checked against it.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './db/client.js'
import { app, idea as ideaTable, initiative, ISSUE_STATES, issue, prototype, question } from './db/schema.js'
import { appendEvent, eventsSince } from './events.js'
import { addIdea, addItems, dropItem, markDuplicate, promote } from './backlog.js'
import { createCycle, createInitiative, listCycles, listInitiatives, updateInitiative } from './goals.js'
import { createIdea, listIdeas } from './ideas.js'
import { changeState, createIssue, listIssues, reorder, updateIssue } from './issues.js'
import { now } from './now.js'
import { convertIdea, guardComplete, guardDirect, listWorkflows, setStep, stepsOf, type Subject } from './work.js'
import { STEPS } from './steps.js'
import { answerQuestion, finishPlanning, preparePlanning } from './planner.js'
import { createProject, issueDetail, listProjects, PlanError, projectGraph } from './projects.js'
import { runner } from './runner.js'
import { listStories } from './storybook.js'
import { discardPrototype, listPrototypes, prototypeStatus, resetPrototypeData, runPrototype, savePrototypeData, setPrototypeCommand, setPrototypeDatabase, startPrototype, stopPrototype } from './prototype.js'
import { syncApp } from './github.js'
import { FOLLOWED, follow } from './follow.js'
import { addChecklist, completeTodo, createTodo, dropTodo, itemToTodo, listTodos, setChecklistItem, updateTodo } from './todos.js'

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }
export interface EngineTool { name: string; description: string; shape: z.ZodRawShape; handler: (args: any) => Promise<ToolResult> }
export interface ToolScope { appId: string; sessionId?: string; actor?: string; waitForPlanner?: boolean }

/** Tools that only read: safe to run without asking. */
export const READ_ONLY_TOOLS = new Set(['now', 'projects', 'project_graph', 'task', 'tasks', 'ideas', 'events', 'todos', 'initiatives', 'cycles', 'open_tab', 'stories', 'prototypes', 'prototype', 'steps', 'workflows'])

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
  const ownIdea = async (id: string) => { const [i] = await db.select().from(ideaTable).where(eq(ideaTable.id, id)); if (!i || i.appId !== appId) throw foreign(); return i }
  const own = async (a: { ideaId?: string; issueId?: string; projectId?: string }): Promise<Subject> => {
    if ([a.ideaId, a.issueId, a.projectId].filter(Boolean).length !== 1) throw new PlanError('give one of ideaId, issueId or projectId')
    if (a.ideaId) { await ownIdea(a.ideaId); return { ideaId: a.ideaId } }
    if (a.issueId) { await ownIssue(a.issueId); return { issueId: a.issueId } }
    await ownProject(a.projectId!); return { projectId: a.projectId! }
  }
  const ownPrototype = async (id: string) => { const [p] = await db.select().from(prototype).where(eq(prototype.id, id)); if (!p || p.appId !== appId) throw foreign(); return p }
  const ownInitiative = async (id: string) => { const [i] = await db.select().from(initiative).where(eq(initiative.id, id)); if (!i || (i.appId && i.appId !== appId)) throw foreign(); return i }
  const line = z.object({ text: z.string(), waitingOn: z.string().optional() })
  const subIssue = z.object({ key: z.string(), title: z.string(), description: z.string().optional(), brief: z.string().optional(), dependsOn: z.array(z.string()).optional(), files: z.array(z.string()).optional() })
  const described = 'one to three plain sentences for a person: what will be different; no file names or code'
  const tools = [
      def('now', 'What is running, what needs a person, what just happened, in this app.', {}, async () => tryIt(() => now(appId))),
      def('projects', 'This app\'s projects with counts (superseded hidden unless all=true).', { all: z.boolean().optional() }, async (a) => tryIt(() => listProjects({ all: a.all, appId }))),
      def('project_graph', 'A project in full: its backlog (open, a duplicate of what covers it, or canceled with why), tasks in order, their sub-tasks with builds, dependencies, files, held reasons, steps and last run; the planner\'s decisions and questions; the to-dos it waits on.', { projectId: z.string() }, async (a) => tryIt(() => ownProject(a.projectId))),
      def('task', 'One task in full, by id: its sub-tasks as a list (builds, or checklist lines), relations, questions and decisions.', { issueId: z.string().describe('the task\'s id') }, async (a) => tryIt(async () => { await ownIssue(a.issueId); return issueDetail(a.issueId) })),
      def('tasks', 'This app\'s tasks: filter by kind (code or todo), by project (projectId; "none" for tasks in no project), top level only, open only.', {
        kind: z.enum(['code', 'todo']).optional(), projectId: z.string().optional(), topLevel: z.boolean().optional(), open: z.boolean().optional(),
      }, async (a) => tryIt(async () => { if (a.projectId && a.projectId !== 'none') await ownProject(a.projectId); return listIssues(appId, { kind: a.kind, projectId: a.projectId === 'none' ? null : a.projectId, topLevel: a.topLevel, open: a.open }) })),
      def('ideas', 'This app\'s ideas inbox and what left it.', {}, async () => tryIt(() => listIdeas(appId))),
      def('create_idea', 'Keep an idea in this app: a title and, optionally, why and what is already decided.', { title: z.string(), body: z.string().optional() }, async (a) => tryIt(() => createIdea({ ...a, appId, actor: actor }))),
      def('create_project', 'Create a project in this app: its tasks in order (the issues field), each a title and a brief. Sub-tasks (each task\'s subIssues) come from the planner (plan_task) or can be given.', {
        name: z.string(), content: z.string().optional().describe('why it exists and what it must do, Markdown'), description: z.string().optional().describe('one line'), ideaId: z.string().optional(), workflowId: z.string().optional().describe('its workflow rules (see workflows); without, the app\'s'),
        issues: z.array(z.object({ title: z.string(), description: z.string().optional().describe(described), brief: z.string().optional().describe('the builder\'s instructions, Markdown, short paragraphs'), subIssues: z.array(subIssue).optional().describe('its sub-tasks') })).describe('the tasks, in order'),
      }, async (a) => tryIt(async () => { if (!a.ideaId) await guardDirect(db, appId, null, a.workflowId); return createProject({ ...a, appId }, actor) })),
      def('create_task', 'Create a task in this app. kind code (built by agents; default) or todo (work outside the code; prefer create_todo for a checklist). With projectId it goes at the end of that project (state backlog to put it in the backlog instead); without, it waits in no project until added to one. parentId (the parent task\'s id) makes it a sub-task.', {
        title: z.string(), kind: z.enum(['code', 'todo']).optional(), description: z.string().optional().describe(described), brief: z.string().optional(),
        projectId: z.string().optional(), parentId: z.string().optional(), state: z.enum(['todo', 'backlog', 'triage']).optional(), priority: z.number().int().min(0).max(4).optional().describe('0 none, 1 urgent, 2 high, 3 medium, 4 low'), cycleId: z.string().optional(), workflowId: z.string().optional().describe('its own workflow rules (see workflows); without, it follows its project\'s or the app\'s'),
      }, async (a) => tryIt(async () => { if (a.projectId) await ownProject(a.projectId); if (a.parentId) await ownIssue(a.parentId); if (a.kind !== 'todo' && !a.parentId) await guardDirect(db, appId, a.projectId, a.workflowId); return createIssue(appId, { ...a, source: 'agent', sourceRef: sessionId ? { sessionId } : null, delegate: a.kind === 'todo' || a.parentId ? null : 'planner' }, actor) })),
      def('update_task', 'Change a task of this app (issueId: the task\'s id): title, description, brief, priority, estimate, cycle; or move it into a project (projectId; it goes at the end).', {
        issueId: z.string(), title: z.string().optional(), description: z.string().optional(), brief: z.string().optional(), priority: z.number().int().min(0).max(4).optional(),
        estimate: z.enum(['S', 'M', 'L', 'XL']).optional(), cycleId: z.string().optional(), projectId: z.string().optional(),
      }, async (a) => tryIt(async () => { await ownIssue(a.issueId); if (a.projectId) await ownProject(a.projectId); const { issueId, ...rest } = a; return updateIssue(issueId, rest, actor) })),
      def('set_task_state', `Move a task of this app (issueId: the task's id) to a state (${ISSUE_STATES.join(', ')}). Canceling needs the reason. A code task's state otherwise follows its sub-tasks; use this for what the engine cannot see.`, {
        issueId: z.string(), state: z.enum(ISSUE_STATES), reason: z.string().optional(),
      }, async (a) => tryIt(async () => { await ownIssue(a.issueId); if (a.state === 'done') await guardComplete(db, a.issueId); const out = await changeState(a.issueId, a.state, { actor, reason: a.reason }); void runner.dispatch(); return out })),
      def('reorder_tasks', 'Put tasks in this order (their ids): a project\'s top-level tasks (the order they are built in), or one parent\'s sub-tasks.', { ids: z.array(z.string()) },
        async (a) => tryIt(async () => { for (const id of a.ids) await ownIssue(id); return reorder(a.ids, actor) })),
      def('backlog_add', 'Add to a project\'s backlog: things the project must not forget (one line each, optional detail), or an idea of this app (ideaId). Use it whenever the person mentions something the project should cover.', {
        projectId: z.string(), items: z.array(z.object({ text: z.string(), body: z.string().optional() })).optional(), ideaId: z.string().optional(),
      }, async (a) => tryIt(async () => { await ownProject(a.projectId); return a.ideaId ? addIdea(a.projectId, a.ideaId, actor) : addItems(a.projectId, (a.items ?? []).map((i: { text: string; body?: string }) => ({ ...i, source: 'agent' as const, sourceRef: sessionId ? { sessionId } : undefined })), actor) })),
      def('backlog_take', 'Take a backlog item on (issueId: its id): it becomes a Todo task at the end of its project (title and brief default to what it says). In a running project the engine plans it when its turn comes.', { issueId: z.string(), title: z.string().optional(), brief: z.string().optional() },
        async (a) => tryIt(async () => { await ownIssue(a.issueId); const out = await promote(a.issueId, a, actor); void runner.dispatch(); return out })),
      def('backlog_duplicate', 'Mark a backlog item (issueId) a duplicate of a task the project already has (ofIssueId), which covers it.', { issueId: z.string(), ofIssueId: z.string(), reason: z.string().optional() },
        async (a) => tryIt(async () => { await ownIssue(a.issueId); const out = await markDuplicate(a.issueId, a.ofIssueId, a.reason, actor); void runner.dispatch(); return out })),
      def('backlog_drop', 'Cancel a backlog item (issueId), with the reason (required). Ask the person first unless they said so.', { issueId: z.string(), reason: z.string() },
        async (a) => tryIt(async () => { await ownIssue(a.issueId); const out = await dropItem(a.issueId, a.reason, actor); void runner.dispatch(); return out })),
      def('backlog_todo', 'Make a backlog item (issueId) a to-do (work outside the code), with a checklist you draft. It stays in its project, which it unblocks.', { issueId: z.string(), title: z.string().optional(), checklist: z.array(line).optional() },
        async (a) => tryIt(async () => { await ownIssue(a.issueId); return itemToTodo(a.issueId, a, actor) })),
      def('todos', 'This app\'s to-dos: the work around the code (accounts, approvals, people, checks), each with its checklist and the project it unblocks.', {}, async () => tryIt(() => listTodos(appId))),
      def('create_todo', 'Keep a to-do in this app: work outside the code. Draft its checklist yourself (concrete lines, in order; mark a line waitingOn when someone else has it, e.g. "Apple\'s review"). owner: person (they do it) or agent (you can do it here). projectId: the project it unblocks, if any.', {
        title: z.string(), notes: z.string().optional(), owner: z.enum(['person', 'agent']).optional(), projectId: z.string().optional(), checklist: z.array(line).optional(),
      }, async (a) => tryIt(async () => { if (a.projectId) await ownProject(a.projectId); return createTodo({ ...a, appId }, actor) })),
      def('update_todo', 'Change a to-do of this app: title, notes, owner, the project it unblocks; or add checklist lines (addChecklist).', {
        todoId: z.string(), title: z.string().optional(), notes: z.string().optional(), owner: z.enum(['person', 'agent']).optional(), projectId: z.string().optional(), addChecklist: z.array(line).optional(),
      }, async (a) => tryIt(async () => { await ownIssue(a.todoId); if (a.projectId) await ownProject(a.projectId); const { todoId, addChecklist: more, ...rest } = a; if (Object.keys(rest).length) await updateTodo(todoId, rest, actor); return more?.length ? addChecklist(todoId, more, actor) : (await listTodos(appId)).find((t) => t.id === todoId) })),
      def('check_item', 'Check or uncheck a line of a to-do\'s checklist (itemId: the line\'s id), or mark it waiting on someone (waitingOn; empty string clears). Check a line only when it is done: you did it, the person said so, or you verified it.', {
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
      def('cycles', 'This app\'s cycles (stretches of time: a week, a sprint), newest first, with their tasks; current marks the one today is in.', {}, async () => tryIt(() => listCycles(appId))),
      def('create_cycle', 'Start a cycle for this app: from and to (YYYY-MM-DD), and the tasks (issueIds) meant to be done by its end.', {
        startsAt: z.string(), endsAt: z.string(), name: z.string().optional(), description: z.string().optional(), issueIds: z.array(z.string()).optional(),
      }, async (a) => tryIt(async () => { for (const id of a.issueIds ?? []) await ownIssue(id); return createCycle({ ...a, appId }, actor) })),
      ...(actor === 'agent:claude-code' ? [def('share_session', 'Bring this Claude Code session (the one you are running in, in a terminal or an editor) into Self Evident\'s UI, so the person can talk to you there too: cwd is your working directory, the folder you were started in; sessionId only if you know it (else the session last written there, which is this one). What\'s said in either place shows in the other.', { cwd: z.string(), sessionId: z.string().optional() }, async (a) => tryIt(async () => { const { adoptTalk } = await import('./talk.js'); const s = await adoptTalk({ appId, cwd: a.cwd, agentSessionId: a.sessionId, actor }); return { sessionId: s.id, note: 'It is in the agent column in Self Evident now. Whoever talks next has the conversation; tell the person to close this session before continuing there.' } }))] : []),
      def('sync_github', 'Read GitHub now for this app (it also happens every two minutes): our pull requests merged, reviewed, checks; teammates\' pull requests and reviews asked of the person; main merged into open project branches, conflicts reported.', {}, async () => tryIt(() => syncApp(appId))),
      def('plan_task', `Run the planner on a code task of this app (issueId: the task's id; minutes): reads the repo and the brief, writes sub-tasks, decisions and questions. ${opts.waitForPlanner ? 'Returns when done.' : 'Returns at once; the outcome shows in now and project_graph.'}`, { issueId: z.string() }, async (a) => tryIt(async () => { await ownIssue(a.issueId); const ctx = await preparePlanning(a.issueId, { actor }); const done = finishPlanning(ctx, { onPlanned: () => void runner.dispatch() }); if (opts.waitForPlanner) return done; void done; return { started: true, runId: ctx.runId, note: 'planning takes a few minutes; the outcome shows in now (My Stuff) and project_graph' } })),
      def('answer_question', 'Answer one of the planner\'s questions on the person\'s behalf; say so to them first.', { questionId: z.string(), answer: z.string() }, async (a) => tryIt(async () => { await ownQuestion(a.questionId); return answerQuestion(a.questionId, a.answer, actor) })),
      def('start_project', 'Run a project of this app: integration branch, a worktree and an agent per sub-task, landing, PR.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.startProject(a.projectId) })),
      def('retry_build', 'Retry a failed or cancelled sub-task of this app (issueId: the sub-task\'s id): three more attempts, told why it failed; fresh=true starts over from the project\'s branch.', { issueId: z.string(), fresh: z.boolean().optional() }, async (a) => tryIt(async () => { await ownIssue(a.issueId); return runner.retry(a.issueId, { fresh: a.fresh, actor: actor }) })),
      def('pause_project', 'Pause a running project of this app: nothing new starts, running agents stop and keep their place.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.pauseProject(a.projectId, actor) })),
      def('resume_project', 'Resume a paused project of this app.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.resumeProject(a.projectId, actor) })),
      def('cancel_project', 'Stop a project of this app: agents aborted, unlanded sub-tasks cancelled, landed work kept.', { projectId: z.string() }, async (a) => tryIt(async () => { await ownProject(a.projectId); return runner.cancelProject(a.projectId) })),
      def('open_tab', 'Open a tab in the person\'s workspace, beside the conversation: a page by its path (/projects/<id>, /tasks/<id>, /ideas, /todos, /settings, ...), its Storybook (storybook), or a story in it (storybook, with story: its id from the stories tool), a sub-task\'s live build log (build, with issueId: the sub-task\'s id), a prototype (prototype, with prototypeId; without one, the list of them). An open tab is focused, not opened twice. split puts it beside (right) or under (below) the tab in front. Use it to show what you are talking about.', {
        kind: z.enum(['page', 'prototype', 'storybook', 'build']).optional().describe('default page'), path: z.string().optional().describe('for a page'), issueId: z.string().optional().describe('for a build log'), prototypeId: z.string().optional().describe('for a prototype'), story: z.string().optional().describe('for storybook: a story id, like pages-taskpage--sub-task-building'),
        split: z.enum(['right', 'below']).optional(),
      }, async (a) => tryIt(async () => {
        const kind = a.kind ?? 'page'
        if (kind === 'page' && !a.path?.startsWith('/')) throw new PlanError('a page needs a path starting with /')
        if (kind === 'build') { if (!a.issueId) throw new PlanError('a build log needs issueId'); await ownIssue(a.issueId) }
        if (kind === 'prototype' && a.prototypeId) await ownPrototype(a.prototypeId)
        const [x] = await db.select({ workspaceId: app.workspaceId }).from(app).where(eq(app.id, appId))
        const tab = { kind, ...(kind === 'page' ? { path: a.path } : {}), ...(kind === 'build' ? { issueId: a.issueId } : {}), ...(kind === 'storybook' && a.story ? { story: a.story } : {}), ...(kind === 'prototype' && a.prototypeId ? { prototypeId: a.prototypeId } : {}) }
        await db.transaction((tx) => appendEvent(tx, { workspaceId: x?.workspaceId ?? 'ws_none', appId, sessionId: sessionId ?? null, actor, type: 'ui.open', payload: { sessionId, tab, split: a.split ?? null } }))
        return { opened: tab, note: 'shown in the person\'s workspace if Self Evident is open' }
      })),
      def('stories', 'This app\'s Storybook stories, from its running Storybook: id (open one with open_tab kind storybook), title (the page or component) and name (the state). match narrows by id, title or name.', { match: z.string().optional() },
        async (a) => tryIt(() => listStories(appId, a.match))),
      def('prototypes', 'This app\'s prototypes: the actual thing built fast in a worktree of its own to demo and learn from, then analysed into the plan and built again from scratch. Each with its branch, worktree path, status and address.', {},
        async () => tryIt(() => listPrototypes(appId))),
      def('prototype', 'One prototype: status, address, whether it answers, and the last lines of its server\'s output.', { prototypeId: z.string() },
        async (a) => tryIt(async () => { await ownPrototype(a.prototypeId); return prototypeStatus(a.prototypeId) })),
      def('start_prototype', 'Start a prototype in this app: the actual thing built fast to demo and learn from, never merged. Makes a branch and worktree of its own, starts its server, and opens it beside the person with a conversation of its own that builds it. That conversation starts from the brief alone, so write it from everything said here: what to build, what we want to learn from it, the mockups (story ids) it should follow, what to fake. It is a step of one thing: give the ideaId, issueId (the task\'s id) or projectId it is for.', { title: z.string(), brief: z.string().describe('Markdown: what to build, what it should teach us, mockups to follow, what to fake'), ideaId: z.string().optional(), issueId: z.string().optional(), projectId: z.string().optional() },
        async (a) => tryIt(async () => { if (a.projectId) await ownProject(a.projectId); if (a.issueId) await ownIssue(a.issueId); if (a.ideaId) await ownIdea(a.ideaId); return startPrototype({ appId, title: a.title, brief: a.brief, projectId: a.projectId, ideaId: a.ideaId, issueId: a.issueId, actor }) })),
      def('steps', 'The steps on one idea, task (issueId: the task\'s id) or project: the workflow in force and where it came from, what each step has so far, the order, and (for a task) what still stops it being completed. Steps: ' + STEPS.map((s) => `${s.key} (${s.label})`).join(', ') + '. A task\'s brief is its own brief and only a person approves it; "idea" is filled by converting an idea.', { ideaId: z.string().optional(), issueId: z.string().optional(), projectId: z.string().optional() },
        async (a) => tryIt(async () => stepsOf(await own(a)))),
      def('set_step', 'Record work on a step of an idea, a task or a project: research notes, an idea\'s rough draft of a brief (key brief, on an idea only), an ADR, the blast radius, a brief audit, or mockups (refs: story ids). body is Markdown; detail is one short line for the step\'s card; status started or done.', { ideaId: z.string().optional(), issueId: z.string().optional(), projectId: z.string().optional(), key: z.enum(STEPS.map((s) => s.key) as [string, ...string[]]), status: z.enum(['started', 'done']).optional(), detail: z.string().optional(), body: z.string().optional(), refs: z.array(z.string()).optional() },
        async (a) => tryIt(async () => setStep(await own(a), a.key, { status: a.status, detail: a.detail, body: a.body, refs: a.refs }, actor))),
      def('convert_idea', 'Turn an idea into a task or a project, taking its steps with it (research, mockups, prototypes; its rough draft becomes the task\'s brief, waiting for approval). Decide which from everything the idea has, even if it is one sentence: a task when it is one thing to build, a project when it is several in order. Say why. projectId puts a task into an existing project.', { ideaId: z.string(), as: z.enum(['task', 'project']), why: z.string(), title: z.string().optional(), projectId: z.string().optional() },
        async (a) => tryIt(async () => { await ownIdea(a.ideaId); if (a.projectId) await ownProject(a.projectId); return convertIdea(a.ideaId, a.as, { title: a.title, projectId: a.projectId, why: a.why }, actor) })),
      def('workflows', 'This app\'s workflows: which steps each requires, which are on, the order and whether it is enforced, and how many projects and tasks use it.', {},
        async () => tryIt(async () => listWorkflows(appId))),
      def('run_prototype', 'Start a stopped prototype\'s server again, on a fresh port; restart=true stops it first (after a change that needs a restart).', { prototypeId: z.string(), restart: z.boolean().optional() },
        async (a) => tryIt(async () => { await ownPrototype(a.prototypeId); return runPrototype(a.prototypeId, actor, { restart: a.restart }) })),
      def('stop_prototype', 'Stop a prototype\'s server; its worktree stays.', { prototypeId: z.string() },
        async (a) => tryIt(async () => { await ownPrototype(a.prototypeId); return stopPrototype(a.prototypeId, actor) })),
      def('discard_prototype', 'Done with a prototype: its server stopped, its worktree and branch removed. Only when the person says so.', { prototypeId: z.string() },
        async (a) => tryIt(async () => { await ownPrototype(a.prototypeId); return discardPrototype(a.prototypeId, actor) })),
      def('prototype_data', 'A prototype\'s made-up data, in its own throwaway database. reset builds the database again from a scenario (.prototype/scenarios/<name>/<table>.json; none: empty tables) and restarts its server; save writes the data as it is now into a scenario of that name (commit it).', { prototypeId: z.string(), action: z.enum(['reset', 'save']), scenario: z.string().optional().describe('reset: which scenario; save: its name, like teacher-three-overdue') },
        async (a) => tryIt(async () => {
          await ownPrototype(a.prototypeId)
          if (a.action === 'save') { if (!a.scenario) throw new PlanError('save needs a scenario name'); return savePrototypeData(a.prototypeId, a.scenario, actor) }
          return resetPrototypeData(a.prototypeId, a.scenario ?? null, actor)
        })),
      def('set_prototype_database', 'Where this app\'s prototypes get their throwaway databases: url, the app\'s development Postgres (any database on that server; each prototype gets its own beside it); env, the variable the app reads (default DATABASE_URL); schema_cmd, a shell command run in the prototype\'s worktree that makes the schema in the database that variable names (the app\'s migrations, or its ORM\'s create/push). Work these out from the app and confirm them with the person first.', { url: z.string(), env: z.string().optional(), schema_cmd: z.string().optional() },
        async (a) => tryIt(() => setPrototypeDatabase(appId, a))),
      def('set_prototype_command', 'How this app\'s prototype server starts: a shell command run in the prototype\'s worktree that installs what it needs and serves on $PORT (like "pnpm install && pnpm dev --port $PORT"). Work it out from the app (package.json scripts, Procfile, README) and confirm it with the person first.', { command: z.string() },
        async (a) => tryIt(() => setPrototypeCommand(appId, a.command))),
      def('events', 'This app\'s event log, newest last. Filter by project or task (issueId: the task\'s id); since is a sequence number.', { projectId: z.string().optional(), issueId: z.string().optional(), since: z.number().optional(), limit: z.number().optional() },
        async (a) => tryIt(async () => (await eventsSince(a.since ?? 0, { appId, projectId: a.projectId, issueId: a.issueId })).slice(-(a.limit ?? 50)))),
  ]
  // A change the person can see: the workspace's following tab goes to its page (follow.ts).
  const parse = (r: ToolResult) => { try { return JSON.parse(r.content[0]?.text ?? '') } catch { return null } }
  return tools.map((t) => (FOLLOWED.has(t.name) ? { ...t, handler: async (a: any) => { const r = await t.handler(a); if (!r.isError) await follow(appId, sessionId ?? null, t.name, a ?? {}, parse(r)); return r } } : t))
}
