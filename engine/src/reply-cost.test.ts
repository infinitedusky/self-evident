import { describe, expect, it } from 'vitest'
import { replyCost } from './reply-cost.js'

describe('what one reply cost', () => {
  it('is the whole figure on the first reply', () => {
    expect(replyCost(null, 1.33)).toEqual({ stepUsd: 1.33, totalUsd: 1.33 })
  })
  it('is the difference from the reply before, and the total is the running figure', () => {
    expect(replyCost({ costUsd: 185.39, totalUsd: 185.39 }, 192.58)).toEqual({ stepUsd: 7.19, totalUsd: 192.58 })
  })
  it('reads a reply recorded before totals were kept', () => {
    expect(replyCost({ costUsd: 0.5 }, 0.75)).toEqual({ stepUsd: 0.25, totalUsd: 0.75 })
  })
  it('keeps the conversation total when the running figure starts again', () => {
    expect(replyCost({ costUsd: 40, totalUsd: 40 }, 0.2)).toEqual({ stepUsd: 0.2, totalUsd: 40.2 })
    expect(replyCost({ costUsd: 0.2, totalUsd: 40.2 }, 0.5)).toEqual({ stepUsd: 0.3, totalUsd: 40.5 })
  })
  it('costs nothing when a crash reports zero, and says nothing when there is no figure', () => {
    expect(replyCost({ costUsd: 40, totalUsd: 40 }, 0)).toEqual({ stepUsd: 0, totalUsd: 40 })
    expect(replyCost({ costUsd: 40, totalUsd: 40 }, undefined)).toBeNull()
  })
})
