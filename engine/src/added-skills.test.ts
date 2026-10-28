/** Skills added as files: what a skill file must say, and where a link's text is. */
import { describe, expect, it } from 'vitest'
import { rawUrl, readSkillText } from './added-skills.js'

const skill = (front: string) => `---\n${front}\n---\n\nThe body.\n`

describe('readSkillText', () => {
  it('reads the name and description from the frontmatter', () => {
    expect(readSkillText(skill('name: tdd\ndescription: Test first.'))).toEqual({ name: 'tdd', description: 'Test first.' })
  })
  it('takes the name from where it was found when the frontmatter has none', () => {
    expect(readSkillText(skill('description: Test first.'), 'tdd').name).toBe('tdd')
  })
  it('refuses a file without frontmatter, a description, or a usable name', () => {
    expect(() => readSkillText('# just markdown')).toThrow('frontmatter')
    expect(() => readSkillText(skill('name: tdd'))).toThrow('description')
    expect(() => readSkillText(skill('name: Test Driven\ndescription: x'))).toThrow("can't be a skill name")
    expect(() => readSkillText(skill('description: x'))).toThrow('needs a name')
    expect(() => readSkillText(skill('name: [\ndescription: x'))).toThrow('not valid YAML')
  })
})

describe('rawUrl', () => {
  it('turns a GitHub file link into its raw file, named after its folder', () => {
    expect(rawUrl('https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md'))
      .toEqual({ raw: 'https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/tdd/SKILL.md', hint: 'tdd' })
  })
  it('reads a GitHub folder link as its SKILL.md', () => {
    expect(rawUrl('https://github.com/obra/superpowers/tree/main/skills/systematic-debugging'))
      .toEqual({ raw: 'https://raw.githubusercontent.com/obra/superpowers/main/skills/systematic-debugging/SKILL.md', hint: 'systematic-debugging' })
  })
  it('names any other .md after itself, and refuses what is not a web URL', () => {
    expect(rawUrl('https://example.com/skills/Perf-AB.md').hint).toBe('perf-ab')
    expect(() => rawUrl('file:///etc/passwd')).toThrow('http')
    expect(() => rawUrl('nope')).toThrow('not a URL')
  })
})
