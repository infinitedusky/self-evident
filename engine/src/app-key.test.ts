/** An app's abbreviation: what a person may set, and what the engine makes from a name when they do not. */
import { describe, expect, it } from 'vitest'
import { appKey, cleanKey } from './ids.js'

describe('an app\'s abbreviation', () => {
  it('is two to five letters or digits starting with a letter, kept in capitals', () => {
    expect(cleanKey(' mer ')).toBe('MER')
    expect(cleanKey('se2')).toBe('SE2')
    expect(cleanKey('bonke')).toBe('BONKE')
    for (const bad of ['', 'M', 'TOOLONG', '2SE', 'M-R', 'me r']) expect(() => cleanKey(bad)).toThrow(/two to five letters or digits, starting with a letter/)
  })
  it('is made from the name when none is given: initials of several words, else the first three letters, numbered when taken', () => {
    expect(appKey('Ragdoll Golf', [])).toBe('RG')
    expect(appKey('Merman', [])).toBe('MER')
    expect(appKey('Merman', ['MER'])).toBe('MER2')
  })
})
