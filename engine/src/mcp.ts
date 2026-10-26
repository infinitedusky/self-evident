/**
 * The engine as an MCP server, for Claude Code in VS Code or the terminal: the same tools the agent in Self
 * Evident's own conversations has (tools.ts), scoped to one app by the URL (/api/mcp/<appId>). Stateless: a fresh
 * server and transport per request, JSON responses. Planning starts and returns at once (a tool call that waits
 * minutes can time out in the client); the outcome shows in `now` and `project_graph`. Only local callers: the
 * transport's DNS-rebinding protection accepts localhost hosts only.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app } from './db/schema.js'
import { engineTools, READ_ONLY_TOOLS } from './tools.js'

const DESTRUCTIVE = new Set(['cancel_project', 'backlog_drop', 'finish_todo'])

export function instructions(appName: string) {
  return [
    `Self Evident's engine for the app ${appName}. Self Evident builds software through agents: a project is tasks in order; the planner turns a task into phases; each phase runs as an agent in its own git worktree and lands on the project's branch, which becomes a pull request.`,
    '`now` is My Stuff: what needs the person, what is running, what just happened. Start there when asked what to work on.',
    'To-dos are the work around the code (accounts, approvals, people, checks), each with a checklist; a project\'s backlog is what it must not forget. When the person mentions either, keep it here.',
    'A running phase\'s worktree path is in project_graph (phases[].worktreePath): open it in the editor with `code <path>` to look at the work before it lands.',
  ].join('\n')
}

export async function handleMcp(appId: string, req: Request, port: number): Promise<Response> {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) return Response.json({ error: `no app ${appId}` }, { status: 404 })
  const server = new McpServer({ name: 'self-evident', version: '0.3.0' }, { instructions: instructions(a.name) })
  for (const t of engineTools({ appId, actor: 'agent:claude-code', waitForPlanner: false })) {
    server.registerTool(t.name, {
      description: t.description, inputSchema: t.shape,
      annotations: { readOnlyHint: READ_ONLY_TOOLS.has(t.name), destructiveHint: DESTRUCTIVE.has(t.name), openWorldHint: false },
    }, (args: any) => t.handler(args ?? {}))
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, enableJsonResponse: true,
    enableDnsRebindingProtection: true, allowedHosts: [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`],
  })
  await server.connect(transport)
  try { return await transport.handleRequest(req) } finally { void server.close() }
}
