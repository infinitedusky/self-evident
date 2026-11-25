import { describe, expect, it } from 'vitest'
import { limitOf, replyCost, replyUsage, usageSoFar } from './reply-cost.js'

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

describe('the tokens one reply used', () => {
  const t = (input: number, output: number, cacheRead: number, cacheWrite: number) => ({ input, output, cacheRead, cacheWrite })
  it('reads the four counts for each model from the running total', () => {
    expect(usageSoFar({ 'claude-opus-5-5': { inputTokens: 12, outputTokens: 340, cacheReadInputTokens: 410000, cacheCreationInputTokens: 2100, costUSD: 1.2, contextWindow: 1000000 } })).toEqual({ 'claude-opus-5-5': t(12, 340, 410000, 2100) })
    expect(usageSoFar(undefined)).toBeNull()
  })
  it('is the whole count on the first reply', () => {
    expect(replyUsage(null, { a: t(1, 2, 3, 4) }, true)).toEqual({ a: t(1, 2, 3, 4) })
  })
  it('is the difference from the reply before, with only the models that ran', () => {
    expect(replyUsage({ a: t(10, 20, 300, 40), b: t(5, 5, 5, 5) }, { a: t(15, 50, 900, 40), b: t(5, 5, 5, 5), c: t(1, 1, 0, 0) }, false)).toEqual({ a: t(5, 30, 600, 0), c: t(1, 1, 0, 0) })
  })
  it('is not known for the first reply after one recorded before counts were kept', () => {
    expect(replyUsage(undefined, { a: t(100, 200, 300, 400) }, false)).toBeNull()
  })
  it('is the new count when the running total starts again', () => {
    expect(replyUsage({ a: t(100, 200, 300, 400) }, { a: t(1, 2, 3, 4) }, false)).toEqual({ a: t(1, 2, 3, 4) })
  })
})

describe('where a limit of the plan stands', () => {
  it('keeps which limit, its state, how much is used and when it starts again', () => {
    expect(limitOf({ status: 'allowed_warning', rateLimitType: 'five_hour', utilization: 0.82, resetsAt: 1795700000, isUsingOverage: false })).toEqual(['five_hour', { status: 'allowed_warning', utilization: 0.82, resetsAt: 1795700000 }])
    expect(limitOf({ status: 'allowed' })).toEqual(['plan', { status: 'allowed' }])
    expect(limitOf(undefined)).toBeNull()
  })
})
