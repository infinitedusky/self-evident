/** Screens are the stories under Screens/, by screen; a task's own are the ones whose file its branch made or changed. */
import { describe, expect, it } from 'vitest'
import { groupScreens, madeHere } from './screens.js'
import { DEFAULT_STEPS, normalize, type Workflow } from './steps.js'

const story = (title: string, name: string, file = `./src/screens/${title.split('/').pop()}.stories.tsx`) => ({ id: `${title}--${name}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'), title, name, file })

describe('screens', () => {
  it('a screen is one title under Screens/, and its stories are its states, in the index\'s order', () => {
    const got = groupScreens([story('Screens/Checkout', 'Filled'), story('Pages/Board', 'Default'), story('Screens/Cart', 'Empty'), story('Screens/Checkout', 'Card declined'), story('screens/Flows/Sign in', 'First visit')])
    expect(got.map((s) => [s.title, s.states.map((x) => x.name)])).toEqual([['Checkout', ['Filled', 'Card declined']], ['Cart', ['Empty']], ['Flows/Sign in', ['First visit']]])
    expect(got[0].file).toBe('./src/screens/Checkout.stories.tsx')
  })
  it('a title that only starts with the word is not one', () => {
    expect(groupScreens([story('Screenshots/Home', 'Default'), story('Screens', 'Default')])).toEqual([])
  })
  it('a story\'s file is named from where Storybook runs, the branch\'s files from the checkout\'s top', () => {
    const own = new Set(['app/src/screens/Checkout.stories.tsx', 'README.md'])
    expect(madeHere('./src/screens/Checkout.stories.tsx', own)).toBe(true)
    expect(madeHere('./src/screens/Cart.stories.tsx', own)).toBe(false)
    expect(madeHere('./src/other/Checkout.stories.tsx', own)).toBe(false) // another folder's file of the same name
    expect(madeHere('README.md', own)).toBe(true)
    expect(madeHere(null, own)).toBe(false)
  })
})

describe('the Screens step', () => {
  it('is between the sketches and the mockups, on, in a new app\'s workflow', () => {
    expect(DEFAULT_STEPS.map((s) => s.key)).toEqual(['idea', 'research', 'sketch', 'screen', 'mockup', 'data', 'prototype', 'brief'])
    expect(DEFAULT_STEPS.find((s) => s.key === 'screen')).toEqual({ key: 'screen', on: true, required: false })
  })
  it('a workflow saved before it gets it off, right before its mockups: tasks under way are not asked to do or skip it', () => {
    const saved: Workflow = { id: 'w', name: 'Saved', ordered: true, steps: [{ key: 'idea', on: true, required: false }, { key: 'sketch', on: true, required: false }, { key: 'mockup', on: true, required: true }, { key: 'prototype', on: false, required: false }, { key: 'brief', on: true, required: true }] }
    const steps = normalize(saved).steps
    expect(steps.map((s) => s.key).slice(0, 4)).toEqual(['idea', 'sketch', 'screen', 'mockup'])
    expect(steps.find((s) => s.key === 'screen')).toMatchObject({ on: false, required: false })
  })
  it('one that has it keeps it as saved', () => {
    const saved: Workflow = { id: 'w', name: 'Saved', ordered: false, steps: DEFAULT_STEPS.map((s) => (s.key === 'screen' ? { ...s, required: true } : s)) }
    expect(normalize(saved).steps.find((s) => s.key === 'screen')).toEqual({ key: 'screen', on: true, required: true })
  })
})
