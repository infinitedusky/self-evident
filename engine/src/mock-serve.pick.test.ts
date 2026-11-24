/** Which of an endpoint's data files a run is served, by the fixture it starts from. Made-up names. */
import { describe, expect, it } from 'vitest'
import { pickForFixture } from './mock-serve.js'

describe('the fixture a run starts from picks an endpoint\'s data', () => {
  const files = [{ key: 'newest', fixture: 'northwind' }, { key: 'plain', fixture: null }, { key: 'older', fixture: 'meridian' }]
  const pick = (fixture: string | null | undefined, from = files) => pickForFixture(from, (x) => x.fixture, fixture)?.key
  it('the file made for that fixture', () => { expect(pick('meridian')).toBe('older'); expect(pick('northwind')).toBe('newest') })
  it('else the one made for no fixture', () => { expect(pick('sample co')).toBe('plain') })
  it('started empty: the one made for no fixture', () => { expect(pick(null)).toBe('plain') })
  it('nothing fits: the first by the order there was', () => { expect(pick('sample co', [files[0], files[2]])).toBe('newest'); expect(pick(null, [files[2]])).toBe('older') })
  it('the fixture not known: the order alone, as before', () => { expect(pick(undefined)).toBe('newest') })
  it('no files: none', () => { expect(pick('meridian', [])).toBeUndefined() })
})
