/** Which Claude account an app's agents run on: the engine's default, or the app's own key or login; never a quiet fall back. */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accountEnv, accountPrefix, accountStatus, cleanAccount, configDirOf } from './account.js'
import { sessionFile } from './terminal.js'

const env = { PATH: '/bin', ANTHROPIC_API_KEY: 'default-key', CLAUDE_CODE_OAUTH_TOKEN: 'default-token', WORK_KEY: 'work-key' }

describe('cleanAccount', () => {
  it('keeps one way, a key over a folder, and nothing when both are blank', () => {
    expect(cleanAccount({ key_env: ' WORK_KEY ', config_dir: '~/x' })).toEqual({ key_env: 'WORK_KEY' })
    expect(cleanAccount({ config_dir: ' ~/.claude-work ' })).toEqual({ config_dir: '~/.claude-work' })
    expect(cleanAccount({ key_env: '', config_dir: '' })).toBeUndefined()
    expect(cleanAccount(null)).toBeUndefined()
  })
  it('refuses a key pasted where the variable name goes', () => {
    expect(() => cleanAccount({ key_env: 'sk-ant-made-up-123' })).toThrow("isn't the name of an environment variable")
  })
})

describe('accountEnv', () => {
  it('is the engine’s own environment when the app chose nothing', () => {
    expect(accountEnv({}, env)).toEqual({})
    expect(accountEnv(undefined, env)).toEqual({})
  })
  it('gives the app’s key as the API key, and takes the default credentials out', () => {
    const got = accountEnv({ account: { key_env: 'WORK_KEY' } }, env).env!
    expect(got.ANTHROPIC_API_KEY).toBe('work-key')
    expect(got.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    expect(got.PATH).toBe('/bin')
  })
  it('refuses, rather than fall back, when the variable is not set', () => {
    expect(() => accountEnv({ account: { key_env: 'NOT_SET' } }, env)).toThrow("NOT_SET isn't set in the engine's environment")
  })
  it('points at the app’s login folder with no key in the way; a folder that is not there is refused', () => {
    const dir = mkdtempSync(join(tmpdir(), 'acct-'))
    const got = accountEnv({ account: { config_dir: dir } }, env).env!
    expect(got.CLAUDE_CONFIG_DIR).toBe(dir)
    expect(got.ANTHROPIC_API_KEY).toBeUndefined()
    expect(() => accountEnv({ account: { config_dir: join(dir, 'missing') } }, env)).toThrow("doesn't exist")
  })
})

describe('where the sessions are and what a terminal needs', () => {
  it('keeps a login app’s sessions under its folder, and prefixes the terminal command', () => {
    expect(configDirOf({ account: { config_dir: '/made/up' } })).toBe('/made/up')
    expect(configDirOf({ account: { key_env: 'WORK_KEY' } })).toBeUndefined()
    expect(sessionFile('/a/b', 'sess', '/made/up')).toBe('/made/up/projects/-a-b/sess.jsonl')
    expect(accountPrefix({ account: { config_dir: '/made/up' } })).toBe('CLAUDE_CONFIG_DIR="/made/up" ')
    expect(accountPrefix({ account: { key_env: 'WORK_KEY' } })).toBe('ANTHROPIC_API_KEY="$WORK_KEY" ')
    expect(accountPrefix({})).toBe('')
  })
})

describe('accountStatus', () => {
  const sam = async () => ({ loggedIn: true, email: 'sam@work.example', orgName: 'Sample Works', subscriptionType: 'team' })
  it('says who the default is, asking Claude Code only when no key is set', async () => {
    expect(await accountStatus({}, { PATH: '/bin' }, sam)).toEqual({ kind: 'default', ok: true, note: "The engine's default, the Claude Code login on this machine: sam@work.example · Sample Works · team." })
    expect((await accountStatus({}, env, async () => { throw new Error('not asked') })).note).toBe("The engine's default: the API key in ANTHROPIC_API_KEY.")
  })
  it('says a key is set or not, and a login folder nobody is logged in to', async () => {
    expect(await accountStatus({ account: { key_env: 'WORK_KEY' } }, env, sam)).toMatchObject({ kind: 'key', ok: true })
    expect(await accountStatus({ account: { key_env: 'NOT_SET' } }, env, sam)).toMatchObject({ kind: 'key', ok: false })
    const dir = mkdtempSync(join(tmpdir(), 'acct-'))
    const out = await accountStatus({ account: { config_dir: dir } }, env, async (e) => { expect(e.CLAUDE_CONFIG_DIR).toBe(dir); return { loggedIn: false } })
    expect(out).toMatchObject({ kind: 'login', ok: false })
    expect(out.note).toContain(`CLAUDE_CONFIG_DIR=${dir} claude auth login`)
  })
})
