/** Plugins: switched for the factory and overridden per app; skills filed by the job they cover, one per job. */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prototypeSkill, withStepDefaults, yoursFirst, installed, removePlugin, writeSharedSkill, cleanStepSkills, stepSkillPrompt, cleanJobs, describeJobs, fileSkill, forgetPlugin, pluginOn, resolvePlugins, skillCategory, type Installed } from './skills.js'

const plugin = (id: string, sdkName: string, skills: string[]): Installed => ({
  id, name: id.split('@')[0], sdkName, path: `/p/${id}`, version: null, description: '', source: null, builtIn: false, mcpServers: [], shim: null,
  skills: skills.map((s) => ({ key: `${id}/${s}`, name: s, description: '' })),
})
const rea = plugin('rea@rea', 'unknown', ['reverse-engineer-anything'])
const sp = plugin('superpowers@sp', 'superpowers', ['systematic-debugging', 'brainstorming'])
const list = [rea, sp]

describe('pluginOn', () => {
  it('is on unless switched off; the app’s own switch wins over the factory’s', () => {
    expect(pluginOn('rea@rea', {})).toBe(true)
    expect(pluginOn('rea@rea', { plugins: { 'rea@rea': { on: false } } })).toBe(false)
    expect(pluginOn('rea@rea', { plugins: { 'rea@rea': { on: false } } }, { 'rea@rea': { on: true } })).toBe(true)
    expect(pluginOn('rea@rea', {}, { 'rea@rea': { on: false } })).toBe(false)
  })
})

describe('resolvePlugins', () => {
  it('gives a role the plugins on for it, and their skills on, named as the SDK names them', () => {
    const r = resolvePlugins(list, { plugins: { 'superpowers@sp': { roles: ['talk'] } }, skills: { 'superpowers@sp/brainstorming': { on: false } } }, {}, 'planner')
    expect(r.plugins.map((p) => p.id)).toEqual(['rea@rea'])
    expect(r.skills).toEqual(['unknown:reverse-engineer-anything'])
    expect(resolvePlugins(list, { plugins: { 'superpowers@sp': { roles: ['talk'] } }, skills: { 'superpowers@sp/brainstorming': { on: false } } }, {}, 'talk').skills)
      .toEqual(['unknown:reverse-engineer-anything', 'superpowers:systematic-debugging'])
  })
  it('leaves out a plugin the app switched off', () => {
    expect(resolvePlugins(list, {}, { 'rea@rea': { on: false } }, 'talk').plugins.map((p) => p.id)).toEqual(['superpowers@sp'])
  })
})

describe('fileSkill', () => {
  it('files a known skill by default, and refuses unknown skills and categories', () => {
    expect(skillCategory('rea@rea/reverse-engineer-anything', {})).toBe('study-a-shipped-product')
    expect(() => fileSkill({}, 'nope@x/y', { category: 'debugging' }, list)).toThrow('no skill')
    expect(() => fileSkill({}, 'superpowers@sp/systematic-debugging', { category: 'nope' }, list)).toThrow('no category')
  })
  it('replaces whatever held the category: one skill per job', () => {
    const f = fileSkill({}, 'superpowers@sp/systematic-debugging', { category: 'debugging' }, list)
    const g = fileSkill(f, 'superpowers@sp/brainstorming', { category: 'debugging' }, list)
    expect(g.skills?.['superpowers@sp/systematic-debugging']?.on).toBe(false)
    expect(g.skills?.['superpowers@sp/brainstorming']).toEqual({ category: 'debugging' })
    const back = fileSkill(g, 'superpowers@sp/systematic-debugging', { on: true }, list)
    expect(back.skills?.['superpowers@sp/brainstorming']?.on).toBe(false)
  })
  it('unfiles to no category without touching others', () => {
    const f = fileSkill({}, 'rea@rea/reverse-engineer-anything', { category: null }, list)
    expect(skillCategory('rea@rea/reverse-engineer-anything', f)).toBe(null)
  })
})

describe('forgetPlugin', () => {
  it('drops a removed plugin’s switches and its skills’ filing', () => {
    expect(forgetPlugin({ plugins: { 'rea@rea': { on: false }, 'superpowers@sp': {} }, skills: { 'rea@rea/reverse-engineer-anything': { on: false }, 'superpowers@sp/brainstorming': {} } }, 'rea@rea'))
      .toEqual({ plugins: { 'superpowers@sp': {} }, skills: { 'superpowers@sp/brainstorming': {} } })
  })
})

describe('an app\'s own skill per job', () => {
  // Both filed under debugging; All apps uses systematic-debugging.
  const f = { skills: { 'superpowers@sp/systematic-debugging': { category: 'debugging', on: true }, 'superpowers@sp/brainstorming': { category: 'debugging', on: false } } }
  it('follows All apps until the app chooses, then gives only its choice for that job', () => {
    expect(resolvePlugins(list, f, {}, 'talk').skills).toEqual(['unknown:reverse-engineer-anything', 'superpowers:systematic-debugging'])
    expect(resolvePlugins(list, f, {}, 'talk', { debugging: 'superpowers@sp/brainstorming' }).skills).toEqual(['unknown:reverse-engineer-anything', 'superpowers:brainstorming'])
    expect(resolvePlugins(list, f, {}, 'talk', { debugging: null }).skills).toEqual(['unknown:reverse-engineer-anything'])
  })
  it('keeps only known jobs, and a skill only under the job it is filed in', () => {
    expect(cleanJobs({ debugging: 'superpowers@sp/brainstorming', 'no-such-job': null, simplify: 'superpowers@sp/brainstorming', falsify: null, 'plan-review': 'gone@x/skill' }, f, list))
      .toEqual({ debugging: 'superpowers@sp/brainstorming', falsify: null })
  })
  it('lists every job, with the skills filed under it, All apps\' choice and the app\'s own', () => {
    const all = describeJobs(f, { debugging: null }, list)
    expect(all.find((j) => j.key === 'simplify')).toMatchObject({ group: 'Review', skills: [], factory: null, overridden: false })
    expect(all.find((j) => j.key === 'interview')?.builtIn).toContain('open questions')
    const jobs = all.filter((j) => j.skills.length)
    expect(jobs.map((j) => j.key)).toEqual(['study-a-shipped-product', 'debugging'])
    expect(jobs[1]).toMatchObject({ factory: 'superpowers@sp/systematic-debugging', overridden: true, own: null })
    expect(jobs[1].skills.map((s) => s.name)).toEqual(['systematic-debugging', 'brainstorming'])
    expect(jobs[0]).toMatchObject({ factory: 'rea@rea/reverse-engineer-anything', overridden: false })
  })
})

describe('an app\'s skills for the steps of its workflow', () => {
  it('keeps known steps and plain names, none twice; the idea step takes none', () => {
    expect(cleanStepSkills({ mockup: ['shop-design', 'shop-design', 7, 'has space'], idea: ['x'], nonsense: ['x'], adr: [], sketch: 'shop-design', risk: ['superpowers:systematic-debugging'] }))
      .toEqual({ mockup: ['shop-design'], risk: ['superpowers:systematic-debugging'] })
  })
  it('tells a conversation which skill goes with which step, leaving out one the session does not have', () => {
    const chosen = { mockup: ['shop-design'], sketch: ['shop-design', 'gone'], adr: ['decision-record'] }
    const said = stepSkillPrompt(chosen, ['shop-design', 'decision-record'])
    expect(said).toContain('- Sketches: `shop-design`\n- Mockups: `shop-design`\n- Draft ADR: `decision-record`')
    expect(said).not.toContain('gone')
    expect(stepSkillPrompt(chosen, [])).toBe('')
    expect(stepSkillPrompt(undefined, ['shop-design'])).toBe('')
  })
  it('tells a check\'s fresh agent only its own step\'s skill, and that it wins on form and place', () => {
    const chosen = { mockup: ['shop-design'], adr: ['decision-record'] }
    const said = stepSkillPrompt(chosen, ['shop-design', 'decision-record'], 'adr')
    expect(said).toContain('`decision-record`')
    expect(said).toContain('wins')
    expect(said).not.toContain('shop-design')
    expect(stepSkillPrompt(chosen, ['shop-design', 'decision-record'], 'risk')).toBe('')
  })
})

describe('your own skills, outside every repo', () => {
  it('brings a prototype skill to every app, on the Prototype step before the app\'s own; the person\'s own skill of that name replaces it', () => {
    expect(installed().find((p) => p.id === 'self-evident')!.skills.map((x) => x.name)).toContain('prototype')
    expect(prototypeSkill(['self-evident:prototype', 'shop-design'])).toBe('self-evident:prototype')
    expect(yoursFirst(['self-evident:prototype', 'shared:prototype', 'shared:other'])).toEqual(['shared:prototype', 'shared:other'])
    expect(prototypeSkill(['shared:prototype'])).toBe('shared:prototype')
    expect(prototypeSkill(['shop-design'])).toBeNull()
    expect(withStepDefaults({ prototype: ['shop-stack', 'self-evident:prototype'], adr: ['decision-record'] }, ['shared:prototype', 'shop-stack'])).toEqual({ prototype: ['shared:prototype', 'shop-stack'], adr: ['decision-record'] })
    expect(withStepDefaults(undefined, ['shop-design'])).toEqual({})
    expect(stepSkillPrompt(withStepDefaults(undefined, ['self-evident:prototype']), ['self-evident:prototype'])).toMatch(/- Prototype: `self-evident:prototype`/)
  })

  it('writes a SKILL.md in the shared folder, which is then a plugin every app gets; the same name replaces it', async () => {
    process.env.SHARED_SKILLS_HOME = mkdtempSync(join(tmpdir(), 'shared-skills-'))
    expect(installed().find((p) => p.id === 'shared')).toMatchObject({ sdkName: 'shared', builtIn: true, skills: [] })
    const made = writeSharedSkill({ name: 'Decision Record', description: 'How we write\na decision: "dated", in docs/decisions.', body: '# Steps\n\n1. Read the others first.' })
    expect(made).toMatchObject({ key: 'shared/decision-record', name: 'decision-record' })
    expect(readFileSync(made.file, 'utf8')).toBe('---\nname: decision-record\ndescription: "How we write a decision: \\"dated\\", in docs/decisions."\n---\n\n# Steps\n\n1. Read the others first.\n')
    expect(installed().find((p) => p.id === 'shared')!.skills).toEqual([{ key: 'shared/decision-record', name: 'decision-record', description: 'How we write a decision: "dated", in docs/decisions.' }])
    writeSharedSkill({ name: 'decision-record', description: 'Reworded.', body: 'New.' })
    expect(installed().find((p) => p.id === 'shared')!.skills.map((k) => k.description)).toEqual(['Reworded.'])
    await expect(removePlugin('shared')).rejects.toThrow('built in')
  })
  it('refuses a skill with no name, no description or nothing to say', () => {
    process.env.SHARED_SKILLS_HOME = mkdtempSync(join(tmpdir(), 'shared-skills-'))
    expect(() => writeSharedSkill({ name: '../escape', description: 'x', body: 'y' })).toThrow('lowercase letters')
    expect(() => writeSharedSkill({ name: 'ok', description: ' ', body: 'y' })).toThrow('needs a description')
    expect(() => writeSharedSkill({ name: 'ok', description: 'x', body: '' })).toThrow('needs its instructions')
  })
})
