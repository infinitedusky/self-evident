/** The planner shows as one of a task's agents out, with what its run read and said. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, pool } from './db/client.js'
import { app, event, run, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createIssue } from './issues.js'
import { runLog, taskAgents } from './talk.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('the planner, as an agent a task has out (sample data)', () => {
  const wsId = newId('workspace'), appId = newId('app'), runId = newId('run')
  let taskId: string
  const emit = (type: string, payload: Record<string, unknown>) => db.insert(event).values({ workspaceId: wsId, appId, issueId: taskId, runId, actor: 'engine', type, payload })
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'planner out test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'Shop', key: appId.slice(-6).toUpperCase() })
    taskId = (await createIssue(appId, { title: 'Export (sample)', kind: 'code' })).id
  })
  afterAll(async () => { await pool.end() })

  it('is not there before the task is planned', async () => { expect(await taskAgents(taskId)).toEqual([]) })

  it('is working while its run is, with what it read and said as lines', async () => {
    await db.insert(run).values({ id: runId, appId, issueId: taskId, attempt: 1, kind: 'plan', agent: 'claude-code', status: 'working' })
    await emit('issue.planning', { attempt: 1 })
    await emit('run.tool_call', { tool: 'Read', input: { file: 'src/export.ts' } })
    await emit('run.tool_result', { ok: true, preview: 'not shown' })
    await emit('run.message', { text: 'Two sub-tasks: the query, then the file (sample).' })
    expect(await taskAgents(taskId)).toMatchObject([{ kind: 'planner', what: 'Planner', runId, sessionId: null, busy: true, detail: 'working out the sub-tasks' }])
    const log = await runLog(runId)
    expect(log.working).toBe(true)
    expect(log.lines.map((l) => l.type)).toEqual(['issue.planning', 'run.tool_call', 'run.message']) // results are noise
  })

  it('says what came of it once it is back: planned, or why it failed', async () => {
    await db.update(run).set({ status: 'completed', endedAt: new Date() }).where(eq(run.id, runId))
    await emit('issue.planned', { subIssues: [{ id: 'a' }, { id: 'b' }] })
    expect(await taskAgents(taskId)).toMatchObject([{ kind: 'planner', busy: false, detail: 'planned: 2 sub-tasks', failed: false }])
    await emit('issue.plan_failed', { error: 'the brief names a file that is not there (sample)' })
    expect(await taskAgents(taskId)).toMatchObject([{ busy: false, failed: true, detail: 'failed: the brief names a file that is not there (sample)' }])
  })
})
