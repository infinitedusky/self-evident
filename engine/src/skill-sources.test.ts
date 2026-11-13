/** Skills pulled from a repository into the shared skills, and brought up to date when the repository changes. */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { installed, writeSharedSkill } from './skills.js'
import { pullSkills, removeSkillSource, skillSources } from './skill-sources.js'

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Sam Sample', '-c', 'user.email=sam@sample.example', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' })
const skill = (repo: string, at: string, name: string, says: string) => { mkdirSync(join(repo, at, name), { recursive: true }); writeFileSync(join(repo, at, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${says}\n---\n\n${says}\n`) }
const commit = (repo: string, msg: string) => { git(repo, 'add', '-A'); git(repo, 'commit', '-qm', msg) }
const shared = () => installed().find((p) => p.id === 'shared')!.skills.map((s) => `${s.name}: ${s.description}`).sort()

describe('skills from a repository', () => {
  let repo: string
  beforeEach(() => {
    process.env.SHARED_SKILLS_HOME = mkdtempSync(join(tmpdir(), 'shared-skills-'))
    repo = mkdtempSync(join(tmpdir(), 'skills-repo-'))
    git(repo, 'init', '-q')
    skill(repo, '.claude/skills', 'shop-voice', 'How the shop writes.')
    skill(repo, 'skills', 'shop-design', 'How the shop looks.')
    mkdirSync(join(repo, 'skills', 'shop-design', 'reference')); writeFileSync(join(repo, 'skills', 'shop-design', 'reference', 'colours.md'), 'Made-up colours.\n')
    mkdirSync(join(repo, 'node_modules', 'x', 'ignored'), { recursive: true }); writeFileSync(join(repo, 'node_modules', 'x', 'ignored', 'SKILL.md'), 'not ours')
    commit(repo, 'two skills')
  })

  it('pulls every skill in the repository, with its files, and every app then has them', async () => {
    const r = await pullSkills(repo)
    expect(r.added.sort()).toEqual(['shop-design', 'shop-voice'])
    expect(shared()).toEqual(['shop-design: How the shop looks.', 'shop-voice: How the shop writes.'])
    expect(readFileSync(join(process.env.SHARED_SKILLS_HOME!, 'skills', 'shop-design', 'reference', 'colours.md'), 'utf8')).toBe('Made-up colours.\n')
    expect(skillSources()).toMatchObject([{ url: repo, commit: r.source.commit, skills: ['shop-design', 'shop-voice'] }])
  })

  it('pulled again: nothing changes until the repository does, then changed, new and dropped skills follow it', async () => {
    await pullSkills(repo)
    expect(await pullSkills(repo)).toMatchObject({ added: [], updated: [], removed: [], unchanged: ['shop-design', 'shop-voice'] })
    skill(repo, '.claude/skills', 'shop-voice', 'How the shop writes, reworded.')
    skill(repo, 'skills', 'shop-returns', 'How the shop takes things back.')
    rmSync(join(repo, 'skills', 'shop-design'), { recursive: true })
    commit(repo, 'changed')
    const r = await pullSkills(repo)
    expect(r).toMatchObject({ added: ['shop-returns'], updated: ['shop-voice'], removed: ['shop-design'], unchanged: [] })
    expect(shared()).toEqual(['shop-returns: How the shop takes things back.', 'shop-voice: How the shop writes, reworded.'])
    expect(skillSources()).toHaveLength(1)
  })

  it('never overwrites or removes a skill that came from somewhere else', async () => {
    writeSharedSkill({ name: 'shop-voice', description: 'Mine, by hand.', body: 'Mine.' })
    const r = await pullSkills(repo)
    expect(r).toMatchObject({ added: ['shop-design'], skipped: ['shop-voice'] })
    expect(shared()).toContain('shop-voice: Mine, by hand.')
    expect(removeSkillSource(repo)).toEqual({ removed: ['shop-design'] })
    expect(shared()).toEqual(['shop-voice: Mine, by hand.'])
    expect(skillSources()).toEqual([])
  })

  it('says so when it is not a repository, or has no skills', async () => {
    await expect(pullSkills(join(repo, 'nowhere'))).rejects.toThrow("isn't a git repository")
    await expect(pullSkills('--upload-pack=x')).rejects.toThrow("isn't a repository")
    const empty = mkdtempSync(join(tmpdir(), 'skills-empty-')); git(empty, 'init', '-q'); writeFileSync(join(empty, 'README.md'), 'x'); commit(empty, 'x')
    await expect(pullSkills(empty)).rejects.toThrow('No skills in')
    expect(existsSync(join(process.env.SHARED_SKILLS_HOME!, 'sources.json'))).toBe(false)
  })
})
