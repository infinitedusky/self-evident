import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { dropOwnScope } from './own-scope.js'

describe('the engine\'s own Doppler scope', () => {
  it('is taken out of the environment, and nothing else is', () => {
    const env: Record<string, string | undefined> = { DOPPLER_PROJECT: 'self-evident', DOPPLER_CONFIG: 'dev', DOPPLER_ENVIRONMENT: 'dev', DOPPLER_TOKEN: 'kept (sample)', PATH: '/bin', DATABASE_URL: 'kept (sample)' }
    expect(dropOwnScope(env)).toEqual(['DOPPLER_PROJECT', 'DOPPLER_CONFIG', 'DOPPLER_ENVIRONMENT'])
    expect(env).toEqual({ DOPPLER_TOKEN: 'kept (sample)', PATH: '/bin', DATABASE_URL: 'kept (sample)' })
    expect(dropOwnScope(env)).toEqual([])
  })

  it('is not handed to what the engine starts once the module is loaded', () => {
    process.env.DOPPLER_PROJECT = 'self-evident'
    dropOwnScope()
    const seen = execFileSync('sh', ['-c', 'echo "${DOPPLER_PROJECT:-none}"'], { env: process.env }).toString().trim()
    expect(seen).toBe('none')
  })
})
