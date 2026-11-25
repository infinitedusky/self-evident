/** Which GitHub account an Evident acts as. Made-up accounts and tokens. */
import { describe, expect, it } from 'vitest'
import { ownerOf, useGhAccount } from './gh-account.js'

const tokens = (have: Record<string, string>) => (a: string) => have[a] ?? null

describe('the GitHub account of a process', () => {
  it('reads an owner from an https or an ssh address', () => {
    expect(ownerOf('https://github.com/sample-person/evident-state.git')).toBe('sample-person')
    expect(ownerOf('https://github.com/sample-person/evident-state/')).toBe('sample-person')
    expect(ownerOf('git@github-second:sample-person/evident-state.git')).toBe('sample-person')
    expect(ownerOf(undefined)).toBeNull(); expect(ownerOf('not an address')).toBeNull()
  })
  it('is the one named, when gh is signed in as it; said when it is not', () => {
    const env: NodeJS.ProcessEnv = { GH_ACCOUNT: 'sample-person', STATE_REPO: 'https://github.com/someone-else/state.git' }
    expect(useGhAccount(env, tokens({ 'sample-person': 'tok_sample' }))).toBe('GitHub: acting as sample-person')
    expect(env.GH_TOKEN).toBe('tok_sample')
    const none: NodeJS.ProcessEnv = { GH_ACCOUNT: 'nobody-sample' }
    expect(useGhAccount(none, tokens({}))).toMatch(/gh is not signed in as nobody-sample/); expect(none.GH_TOKEN).toBeUndefined()
  })
  it('with none named, is the state repository\'s owner when gh has it; otherwise nothing changes', () => {
    const env: NodeJS.ProcessEnv = { STATE_REPO: 'https://github.com/sample-person/evident-state.git' }
    expect(useGhAccount(env, tokens({ 'sample-person': 'tok_sample' }))).toMatch(/acting as sample-person \(the state repository's owner/)
    expect(env.GH_TOKEN).toBe('tok_sample')
    const other: NodeJS.ProcessEnv = { STATE_REPO: 'https://github.com/sample-person/evident-state.git' }
    expect(useGhAccount(other, tokens({}))).toBeNull(); expect(other.GH_TOKEN).toBeUndefined()
    expect(useGhAccount({}, tokens({ x: 'y' }))).toBeNull() // this computer's own Evident: no state repository, the active account
  })
  it('leaves a token that is already set', () => {
    const env: NodeJS.ProcessEnv = { GH_TOKEN: 'tok_mine', GH_ACCOUNT: 'sample-person' }
    expect(useGhAccount(env, tokens({ 'sample-person': 'tok_sample' }))).toBeNull(); expect(env.GH_TOKEN).toBe('tok_mine')
  })
})
