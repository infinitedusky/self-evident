/**
 * The same conversation in the terminal and the UI: a session started in the terminal is brought in with its turns;
 * a UI conversation handed to the terminal gets the command to continue it; while it's there, what's said is copied
 * in as it happens. Claude Code's session store is a temporary folder here (CLAUDE_CONFIG_DIR).
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, repo, session, sessionMessage, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { adoptTalk, closeTalks, handOff, listClaudeSessions, setAutoApprove, talkTranscript } from './talk.js'
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
  const run = `cc-${Date.now().toString(36)}` // Claude Code session ids, new each run
  const cc1 = `${run}-1`, cc2 = `${run}-2`
  const file = (id: string) => join(sessionDir(cwd), `${id}.jsonl`)
  beforeAll(async () => {
    process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'se-claude-'))
    mkdirSync(sessionDir(cwd), { recursive: true })
    await db.insert(workspace).values({ id: wsId, name: 'terminal test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', key: appId.slice(-6).toUpperCase() })
  })
  afterAll(async () => { closeTalks(); delete process.env.CLAUDE_CONFIG_DIR; await pool.end() })

  it('brings in a session started in the terminal, with what was said, once', async () => {
    writeFileSync(file(cc1), line('u1', 'user', 'From the terminal: what needs me?') + line('a1', 'assistant', 'Three things.') + JSON.stringify({ type: 'ai-title', aiTitle: 'What needs me' }) + '\n')
    const s = await adoptTalk({ appId, cwd })
    expect(s).toMatchObject({ agentSessionId: cc1, subject: 'What needs me', worktreePath: null })
    expect(await said(s.id)).toEqual([expect.stringMatching(/^Brought in from the terminal/), 'From the terminal: what needs me?', 'Three things.'])
    const [m] = await db.select().from(sessionMessage).where(eq(sessionMessage.sessionId, s.id)).orderBy(sessionMessage.id).offset(1).limit(1)
    expect(m.payload).toMatchObject({ via: 'terminal' })
    expect((await adoptTalk({ appId, cwd, agentSessionId: cc1 })).id).toBe(s.id)
  })

  it('follows the file while the conversation is in the terminal', async () => {
    const [s] = await db.select().from(session).where(eq(session.agentSessionId, cc1))
    appendFileSync(file(cc1), line('u2', 'user', 'Start the first one') + line('a2', 'assistant', 'Started.'))
    expect(await until(async () => (await said(s.id)).includes('Started.'))).toBe(true)
    expect((await said(s.id)).filter((b) => b === 'Start the first one')).toHaveLength(1)
  })

  it('hands a UI conversation to the terminal: the command, and only what comes after', async () => {
    writeFileSync(file(cc2), line('u1', 'user', 'Said in the UI') + line('a1', 'assistant', 'Answered in the UI'))
    const id = newId('session')
    await db.insert(session).values({ id, appId, kind: 'talk', cwd, agentSessionId: cc2, lastActiveAt: new Date() })
    const { command } = await handOff(id)
    expect(command).toContain(`claude --resume ${cc2}`)
    expect(command).toContain(`/api/mcp/${appId}`)
    const [row] = await db.select().from(session).where(eq(session.id, id))
    expect(row.terminalSince).not.toBeNull()
    appendFileSync(file(cc2), line('u2', 'user', 'Said in the terminal'))
    expect(await until(async () => (await said(id)).includes('Said in the terminal'))).toBe(true)
    expect(await said(id)).not.toContain('Said in the UI') // already the engine's: not copied again
  })

  it('refuses to hand over a conversation with nothing said yet', async () => {
    const id = newId('session')
    await db.insert(session).values({ id, appId, kind: 'talk', cwd, lastActiveAt: new Date() })
    await expect(handOff(id)).rejects.toThrow(/say something here first/)
  })

  it('lists the sessions run in the app\'s checkout and its worktrees, not the engine\'s own, marking one brought in', async () => {
    const checkout = realpathSync(mkdtempSync(join(tmpdir(), 'se-repo-')))
    const git = (...a: string[]) => execFileSync('git', a, { cwd: checkout, stdio: 'pipe' })
    git('init', '-q', '-b', 'main'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'first')
    const mine = `${checkout}-wt-side`, engines = `${checkout}-worktrees/talk-x`
    git('worktree', 'add', '-q', '-b', 'side', mine); git('worktree', 'add', '-q', '-b', 'talk-x', engines)
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: 'sample/fake', localPath: checkout })
    const put = (dir: string, id: string, said: string) => { mkdirSync(sessionDir(dir), { recursive: true }); writeFileSync(join(sessionDir(dir), `${id}.jsonl`), line('u1', 'user', said)) }
    put(checkout, `${run}-main`, 'In the checkout'); put(mine, `${run}-side`, 'In my worktree'); put(engines, `${run}-ours`, 'The engine\'s own')
    const brought = await adoptTalk({ appId, cwd: mine, agentSessionId: `${run}-side` })
    const list = await listClaudeSessions(appId)
    expect(list.map((x) => x.title).sort()).toEqual(['In my worktree', 'In the checkout'])
    expect(list.find((x) => x.id === `${run}-side`)).toMatchObject({ cwd: mine, branch: 'side', talkId: brought.id })
    expect(list.find((x) => x.id === `${run}-main`)).toMatchObject({ branch: 'main', talkId: null })
  })

  it('starts a conversation acting up to moderate, then where the person last set it', async () => {
    writeFileSync(file(`${run}-a1`), line('u1', 'user', 'first'))
    const first = await adoptTalk({ appId, cwd, agentSessionId: `${run}-a1` })
    expect(first.autoApprove).toBe('moderate')
    await setAutoApprove(first.id, 'cheap')
    writeFileSync(file(`${run}-a2`), line('u1', 'user', 'second'))
    expect((await adoptTalk({ appId, cwd, agentSessionId: `${run}-a2` })).autoApprove).toBe('cheap')
  })
})
