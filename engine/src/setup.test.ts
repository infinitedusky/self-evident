/** An app's settings are changed a key at a time: two writers that never saw each other's change both keep theirs. Sample data. */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { setPrRules } from './pr.js'
import { setProbe } from './probes.js'
import { merged, patchSetup } from './setup.js'

describe('merged', () => {
  it('sets what has a value, removes what is null, leaves the rest', () => {
    expect(merged({ a: 1, b: 2, c: 3 }, { a: 9, b: null, d: 4 })).toEqual({ a: 9, c: 3, d: 4 })
    expect(merged(null, { a: 1 })).toEqual({ a: 1 })
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('changing an app\'s settings', () => {
  const wsId = newId('workspace'), appId = newId('app')
  const saved = async () => (await db.select().from(app).where(eq(app.id, appId)))[0].setup as Record<string, unknown>
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'setup test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'sample', key: appId.slice(-6).toUpperCase(), setup: { test_cmd: 'pnpm test' } })
  })
  afterAll(async () => { await pool.end() })

  it('a page that loaded before an agent\'s tools ran saves its own changes and wipes none of theirs', async () => {
    // The page loaded here, with only test_cmd. Then an agent sets naming and a probe.
    await setPrRules(appId, { commitFormat: '{type}[{ticket}]: {subject}' })
    await setProbe(appId, { name: 'Lint (sample)', kind: 'command', runs: 'pnpm lint' })
    // The page saves what the person changed on it: a requirement and the skills on a step.
    await patchSetup(appId, { requirements: [{ key: 'privacy', name: 'Privacy (sample)', what: 'Sample.', on: true }], step_skills: { build: ['a-skill'] } })
    expect(await saved()).toMatchObject({ test_cmd: 'pnpm test', commit_format: '{type}[{ticket}]: {subject}', probes: [{ key: 'lint_sample' }], requirements: [{ key: 'privacy' }], step_skills: { build: ['a-skill'] } })
  })
  it('many at once, each its own key: every one is kept', async () => {
    await Promise.all(Array.from({ length: 8 }, (_, n) => patchSetup(appId, { [`k${n}`]: n })))
    expect(Object.keys(await saved()).filter((k) => /^k\d$/.test(k)).length).toBe(8)
  })
  it('null removes a setting; an app that is not there is refused', async () => {
    expect(await patchSetup(appId, { k0: null, commit_format: null })).not.toHaveProperty('k0')
    expect(await saved()).not.toHaveProperty('commit_format')
    await expect(patchSetup('app_nope', { a: 1 })).rejects.toThrow('no app')
  })
})
