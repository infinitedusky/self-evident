/** Plugins: switched for the factory and overridden per app; skills tagged with jobs, one selected per job. */
import { describe, expect, it } from 'vitest'
import { forgetPlugin, jobSkill, pluginOn, resolvePlugins, selectSkill, skillTags, tagSkill, type FactorySettings, type Installed } from './skills.js'

const plugin = (id: string, sdkName: string, skills: string[]): Installed => ({
  id, name: id.split('@')[0], sdkName, path: `/p/${id}`, version: null, description: '', source: null, builtIn: false, mcpServers: [], shim: null,
  skills: skills.map((s) => ({ key: `${id}/${s}`, name: s, description: '', personOnly: false })),
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
  const debugging: FactorySettings = { jobs: { debugging: 'superpowers@sp/systematic-debugging' } }
  it('gives a role only the skills selected for a job, from the plugins on for it, named as the SDK names them', () => {
    expect(resolvePlugins(list, debugging, {}, 'talk').skills).toEqual(['unknown:reverse-engineer-anything', 'superpowers:systematic-debugging'])
    const talkOnly = { ...debugging, plugins: { 'superpowers@sp': { roles: ['talk' as const] } } }
    expect(resolvePlugins(list, talkOnly, {}, 'planner').plugins.map((p) => p.id)).toEqual(['rea@rea'])
    expect(resolvePlugins(list, talkOnly, {}, 'planner').skills).toEqual(['unknown:reverse-engineer-anything'])
  })
  it('installing adds nothing live: an unselected skill stays out', () => {
    expect(resolvePlugins(list, {}, {}, 'talk').skills).toEqual(['unknown:reverse-engineer-anything'])
  })
  it('leaves out a plugin the app switched off', () => {
    expect(resolvePlugins(list, debugging, { 'rea@rea': { on: false } }, 'talk').skills).toEqual(['superpowers:systematic-debugging'])
  })
})

describe('jobs and tags', () => {
  it('REA does its job until someone selects otherwise; selecting none clears it', () => {
    expect(jobSkill('study-a-shipped-product', {})).toBe('rea@rea/reverse-engineer-anything')
    expect(jobSkill('study-a-shipped-product', selectSkill({}, 'study-a-shipped-product', null, list))).toBe(null)
  })
  it('one skill per job: selecting replaces', () => {
    const f = selectSkill({}, 'debugging', 'superpowers@sp/systematic-debugging', list)
    expect(jobSkill('debugging', selectSkill(f, 'debugging', 'superpowers@sp/brainstorming', list))).toBe('superpowers@sp/brainstorming')
  })
  it('refuses unknown jobs and skills', () => {
    expect(() => selectSkill({}, 'nope', null, list)).toThrow('no job')
    expect(() => selectSkill({}, 'debugging', 'nope@x/y', list)).toThrow('no skill')
    expect(() => tagSkill({}, 'rea@rea/reverse-engineer-anything', ['nope'], list)).toThrow('no job')
  })
  it('tags default to the jobs the catalogue saw a skill for, and are replaced when set', () => {
    expect(skillTags('added/retro', {})).toEqual(['project-memory', 'learning-from-sessions'])
    expect(skillTags('superpowers@sp/brainstorming', {})).toEqual([])
    expect(skillTags('superpowers@sp/brainstorming', tagSkill({}, 'superpowers@sp/brainstorming', ['interview', 'interview'], list))).toEqual(['interview'])
  })
})

describe('forgetPlugin', () => {
  it('drops a removed plugin’s switches, its skills’ tags and the jobs they did', () => {
    const f = { plugins: { 'rea@rea': { on: false }, 'superpowers@sp': {} }, skills: { 'rea@rea/reverse-engineer-anything': { tags: [] }, 'superpowers@sp/brainstorming': {} }, jobs: { interview: 'superpowers@sp/brainstorming', 'study-a-shipped-product': 'rea@rea/reverse-engineer-anything' } }
    expect(forgetPlugin(f, 'rea@rea')).toEqual({ plugins: { 'superpowers@sp': {} }, skills: { 'superpowers@sp/brainstorming': {} }, jobs: { interview: 'superpowers@sp/brainstorming' } })
  })
})
