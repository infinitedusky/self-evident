/** An app with two repositories: what its sessions are given and what Settings offers. Against the database; sample data. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, repo, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { skillOptions, usableSkills } from './skills.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('an app with a second repository', () => {
  const wsId = newId('workspace'), appId = newId('app'), homeId = newId('repo')
  let home: string, other: string
  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'two-repos-'))
    process.env.REPO_SKILLS_HOME = join(root, 'ours'); process.env.SHARED_SKILLS_HOME = join(root, 'shared')
    home = join(root, 'enterprise-dashboard'); other = join(root, 'backend-core')
    for (const [dir, name] of [[home, 'ticket-naming'], [other, 'security-review']] as const) {
      mkdirSync(join(dir, '.claude', 'skills', name), { recursive: true })
      writeFileSync(join(dir, '.claude', 'skills', name, 'SKILL.md'), `---\ndescription: ${name} (sample)\n---\nBody (sample).\n`)
    }
    await db.insert(workspace).values({ id: wsId, name: 'two repos test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'dashboard', key: appId.slice(-6).toUpperCase(), setup: { home_repo: homeId } })
    // backend-core sorts first by name: the home repository is the one the app says, not the first.
    await db.insert(repo).values([{ id: newId('repo'), appId, fullName: 'sample/backend-core', localPath: other }, { id: homeId, appId, fullName: 'sample/enterprise-dashboard', localPath: home }])
  })
  afterAll(async () => { await pool.end() })

  it('Settings offers the other repository\'s skills, named by it and saying where they are from', async () => {
    const usable = await usableSkills(appId, home)
    expect(usable.find((u) => u.name === 'ticket-naming')).toMatchObject({ from: 'this repo' })
    expect(usable.find((u) => u.name === 'backend-core:security-review')).toMatchObject({ label: 'security-review', from: 'sample/backend-core', description: 'security-review (sample)' })
    expect(usable.some((u) => u.name === 'enterprise-dashboard:ticket-naming')).toBe(false) // the home one is not offered twice
  })
  it('a session in the home repository is given them as a plugin, with the skill allowed by name', async () => {
    const o = await skillOptions('talk', home, appId)
    expect(o.skills).toContain('backend-core:security-review')
    expect(o.skills).toContain('ticket-naming')
    expect(o.plugins.some((p) => p.path === join(process.env.REPO_SKILLS_HOME!, appId, 'backend-core'))).toBe(true)
  })
})
