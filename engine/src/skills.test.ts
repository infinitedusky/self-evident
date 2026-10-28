/** Plugins: switched for the factory and overridden per app; skills filed by the job they cover, one per job. */
import { describe, expect, it } from 'vitest'
import { fileSkill, forgetPlugin, pluginOn, resolvePlugins, skillCategory, type Installed } from './skills.js'

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
