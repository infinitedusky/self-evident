/**
 * The same conversation in the terminal and the UI: a session started in the terminal is brought in with its turns;
 * a UI conversation handed to the terminal gets the command to continue it; while it's there, what's said is copied
 * in as it happens. Claude Code's session store is a temporary folder here (CLAUDE_CONFIG_DIR).
 */
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, session, sessionMessage, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { adoptTalk, closeTalks, handOff, talkTranscript } from './talk.js'
import { sessionDir } from './terminal.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const line = (uuid: string, type: 'user' | 'assistant', text: string) => JSON.stringify(type === 'user'
  ? { type, uuid, timestamp: new Date().toISOString(), message: { role: 'user', content: text } }
  : { type, uuid, timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text }] } }) + '\n'
const until = async (check: () => Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await check()) return true; await new Promise((r) => setTimeout(r, 200)) } return false }
const said = async (id: string) => (await talkTranscript(id)).messages.map((m) => m.body)

describe.skipIf(!reachable)('one conversation, in the terminal and the UI', () => {
  const wsId = newId('workspace')
  const appId = newId('app')
  const cwd = mkdtempSync(join(tmpdir(), 'se-folder-'))
  const file = (id: string) => join(sessionDir(cwd), `${id}.jsonl`)
  beforeAll(async () => {
    process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'se-claude-'))
    mkdirSync(sessionDir(cwd), { recursive: true })
    await db.insert(workspace).values({ id: wsId, name: 'terminal test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase() })
  })
  afterAll(async () => { closeTalks(); delete process.env.CLAUDE_CONFIG_DIR; await pool.end() })

  it('brings in a session started in the terminal, with what was said, once', async () => {
    writeFileSync(file('cc-1'), line('u1', 'user', 'From the terminal: what needs me?') + line('a1', 'assistant', 'Three things.') + JSON.stringify({ type: 'ai-title', title: 'What needs me' }) + '\n')
    const s = await adoptTalk({ appId, cwd })
    expect(s).toMatchObject({ agentSessionId: 'cc-1', subject: 'What needs me', worktreePath: null })
    expect(await said(s.id)).toEqual([expect.stringMatching(/^Brought in from the terminal/), 'From the terminal: what needs me?', 'Three things.'])
    const [m] = await db.select().from(sessionMessage).where(eq(sessionMessage.sessionId, s.id)).orderBy(sessionMessage.id).offset(1).limit(1)
    expect(m.payload).toMatchObject({ via: 'terminal' })
    expect((await adoptTalk({ appId, cwd, agentSessionId: 'cc-1' })).id).toBe(s.id)
  })

  it('follows the file while the conversation is in the terminal', async () => {
    const [s] = await db.select().from(session).where(eq(session.agentSessionId, 'cc-1'))
    appendFileSync(file('cc-1'), line('u2', 'user', 'Start the first one') + line('a2', 'assistant', 'Started.'))
    expect(await until(async () => (await said(s.id)).includes('Started.'))).toBe(true)
    expect((await said(s.id)).filter((b) => b === 'Start the first one')).toHaveLength(1)
  })

  it('hands a UI conversation to the terminal: the command, and only what comes after', async () => {
    writeFileSync(file('cc-2'), line('u1', 'user', 'Said in the UI') + line('a1', 'assistant', 'Answered in the UI'))
    const id = newId('session')
    await db.insert(session).values({ id, appId, kind: 'talk', cwd, agentSessionId: 'cc-2', lastActiveAt: new Date() })
    const { command } = await handOff(id)
    expect(command).toContain('claude --resume cc-2')
    expect(command).toContain(`/api/mcp/${appId}`)
    const [row] = await db.select().from(session).where(eq(session.id, id))
    expect(row.terminalSince).not.toBeNull()
    appendFileSync(file('cc-2'), line('u2', 'user', 'Said in the terminal'))
    expect(await until(async () => (await said(id)).includes('Said in the terminal'))).toBe(true)
    expect(await said(id)).not.toContain('Said in the UI') // already the engine's: not copied again
  })

  it('refuses to hand over a conversation with nothing said yet', async () => {
    const id = newId('session')
    await db.insert(session).values({ id, appId, kind: 'talk', cwd, lastActiveAt: new Date() })
    await expect(handOff(id)).rejects.toThrow(/say something here first/)
  })
})
