/**
 * Describe: write the person-facing description for every code issue and sub-issue of a project that has none, from its title
 * and brief. One model call per project, no tools, structured output. For projects written before descriptions existed,
 * and for anything hand-written in builder's language.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, issue, project } from './db/schema.js'
import { appendEvent } from './events.js'
import { PlanError } from './projects.js'

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'description'], properties: { id: { type: 'string' }, description: { type: 'string' } } } } },
}

export async function describeProject(projectId: string, opts: { model?: string } = {}) {
  const [p] = await db.select().from(project).where(eq(project.id, projectId))
  if (!p) throw new PlanError(`no project ${projectId}`)
  const [a] = await db.select().from(app).where(eq(app.id, p.appId))
  const rows = await db.select().from(issue).where(and(eq(issue.projectId, projectId), eq(issue.kind, 'code'), isNull(issue.description)))
  const items = rows.map((t) => ({ id: t.id, title: t.title, brief: t.brief ?? '' }))
  if (!items.length) return { described: 0 }
  const prompt = [
    `These are issues and sub-issues of the project "${p.name}" for the app ${a.name}${p.content ? ` (why: ${p.content})` : ''}. Each has a title and a brief written for the engineer who builds it.`,
    'For each, write a description for the person who asked for it, who may never read the code: one to three short sentences saying what will be different for the people using the app, and why it matters.',
    'No file names, functions, tables, columns, routes, libraries or environment variables. Plain words that read aloud. Do not start with "This issue" or "This sub-issue".',
    'Return every id given, each with its description.',
    '',
    JSON.stringify(items.map((i) => ({ id: i.id, title: i.title, brief: i.brief.slice(0, 4000) })), null, 1),
  ].join('\n')
  let out: unknown
  for await (const m of query({ prompt, options: { model: opts.model, maxTurns: 3, tools: [], allowedTools: [], settingSources: [], outputFormat: { type: 'json_schema', schema: SCHEMA } } })) {
    if (m.type === 'result') { if ((m as any).subtype !== 'success') throw new PlanError(`describe failed: ${(m as any).subtype}`); out = (m as any).structured_output }
  }
  const got = ((out as any)?.items ?? []) as { id: string; description: string }[]
  let n = 0
  for (const g of got) {
    const d = g.description?.trim()
    if (!d) continue
    if (rows.some((t) => t.id === g.id)) { await db.update(issue).set({ description: d }).where(and(eq(issue.id, g.id), isNull(issue.description))); n++ }
  }
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, projectId, actor: 'engine', type: 'project.described', payload: { described: n } }))
  return { described: n }
}
