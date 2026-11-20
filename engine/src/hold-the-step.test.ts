/** Each step settles its own question: every conversation's agent is told to close an objection where it is raised (SHAPE.md). */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HOLD_THE_STEP } from './talk.js'

const here = dirname(fileURLToPath(import.meta.url))
const talk = readFileSync(join(here, 'talk.ts'), 'utf8')

describe('an agent does not push past a step', () => {
  it('fixes what the step can show in that step, and leaves passing it to the person', () => {
    expect(HOLD_THE_STEP).toContain('If the step you are in can show it, fix it here, now')
    expect(HOLD_THE_STEP).toContain('never suggest moving on while something this step can show is open')
    expect(HOLD_THE_STEP).toContain('only the person passes a step')
  })
  it('is in what every conversation is told', () => {
    expect(talk.match(/\$\{HOLD_THE_STEP\}/g)).toHaveLength(1) // talkPrompt, which every conversation's agent gets
  })
  it('the build looks and behaves as the prototype does, and the prototype as the agreed mockup', () => {
    expect(talk).toContain('it looks and behaves as the approved prototype does')
    expect(talk).not.toContain('follow and improve on')
    expect(talk).toContain('a difference is a fault to fix here, never something left for the real build')
    expect(readFileSync(join(here, '..', 'plugin', 'skills', 'prototype', 'SKILL.md'), 'utf8')).toContain('"The real build will get the look right" is not allowed either.')
  })
})
