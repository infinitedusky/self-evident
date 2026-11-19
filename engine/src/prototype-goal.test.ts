/** The test of a prototype is one sentence, and every place that says what a prototype is for says that sentence. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CONTRACTS } from './contracts.js'
import { DEPLOY_TEST } from './prototype.js'

const here = dirname(fileURLToPath(import.meta.url))
const plain = (s: string) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ')

describe('what a prototype is for', () => {
  it('is said as a test an agent can apply: deployable as it stands, made real by configuration alone', () => {
    expect(DEPLOY_TEST).toContain('deployed as it stands and made real by configuration alone')
    expect(DEPLOY_TEST).toContain('that part is not built yet')
  })
  it('the skill, the prototype\'s own agent, the task\'s agent and the tool that starts one all say it', () => {
    expect(plain(readFileSync(join(here, '..', 'plugin', 'skills', 'prototype', 'SKILL.md'), 'utf8'))).toContain(DEPLOY_TEST) // the same words, so they cannot drift
    const talk = readFileSync(join(here, 'talk.ts'), 'utf8'), tools = readFileSync(join(here, 'tools.ts'), 'utf8')
    expect(talk.match(/\$\{DEPLOY_TEST\}/g)).toHaveLength(2) // the prototype's conversation and the task's
    expect(tools).toContain("' + DEPLOY_TEST + '") // start_prototype, where the brief is written
  })
  it('the settings page says it in a line', () => {
    expect(CONTRACTS.prototype.stages.find((s) => s.key === 'do')?.what).toContain('deployable as it stands')
  })
})
