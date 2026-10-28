/**
 * Stories lead: every page and component has a stories file beside it, and the storybook project renders every story
 * in a browser. A screen with no story fails here, before anyone reviews it.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const dirs = ['pages', 'components'].map((d) => join(import.meta.dirname, d))
const ui = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.tsx') && !f.endsWith('.stories.tsx')).map((f) => join(d, f)))

describe('stories', () => {
  it.each(ui.map((f) => [relative(import.meta.dirname, f), f]))('%s has stories', (_, file) => {
    expect(existsSync(file.replace(/\.tsx$/, '.stories.tsx')), `${file} needs a .stories.tsx beside it`).toBe(true)
  })
})
