import { describe, expect, it } from 'vitest'
import { depthOf } from './prototype.js'

describe('how thoroughly a prototype is built', () => {
  it('is what the prototype was started as, else the app\'s usual one, else full', () => {
    expect(depthOf(undefined, {})).toBe('full')
    expect(depthOf(null, { prototype_depth: 'rough' })).toBe('rough')
    expect(depthOf('full', { prototype_depth: 'rough' })).toBe('full')
    expect(depthOf('rough', null)).toBe('rough')
    expect(depthOf('quick', { prototype_depth: 'quick' })).toBe('full')
  })
})
