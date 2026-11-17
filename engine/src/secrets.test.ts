/** Keys kept in a file on this computer: written, never read back out, the app's over the shared one over the environment. */
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dropSecret, envFor, keepSecret, keptAs, moveSecrets, parse, secretsFile } from './secrets.js'
import { INTEGRATIONS, integrationStatus } from './integrations.js'

describe('keys that persist (sample values)', () => {
  let home: string
  beforeAll(async () => { home = await mkdtemp(join(tmpdir(), 'se-secrets-')); process.env.SECRETS_HOME = home })
  afterAll(() => { delete process.env.SECRETS_HOME })

  it('reads the lines a person might write by hand', () => {
    expect(parse('# a note\nA=one\nexport B="two words"\n  C = \'3\'\nnot a line\nD=\n')).toEqual({ A: 'one', B: 'two words', C: '3', D: '' })
  })

  it('keeps an app\'s key in a file of its own, readable by this user only, and says only that it is set and its last four', async () => {
    const k = await keepSecret('LINEAR_API_KEY', '  lin_api_sample_0000_abcd  ', 'CEB')
    expect(k).toEqual({ name: 'LINEAR_API_KEY', set: true, from: 'app', last4: 'abcd' })
    expect(JSON.stringify(k)).not.toContain('sample')
    expect(secretsFile('CEB')).toBe(join(home, 'apps', 'ceb', 'secrets.env'))
    expect((await stat(secretsFile('CEB'))).mode & 0o777).toBe(0o600); expect((await stat(join(home, 'apps', 'ceb'))).mode & 0o777).toBe(0o700)
    expect(await readFile(secretsFile('CEB'), 'utf8')).toContain('LINEAR_API_KEY=lin_api_sample_0000_abcd\n')
    expect(await keptAs('LINEAR_API_KEY', 'HG', {})).toEqual({ name: 'LINEAR_API_KEY', set: false, from: null, last4: null }) // another app's is not this one's
    expect((await keptAs('SHORT', 'CEB', { SHORT: 'tiny' }))?.last4).toBeNull() // too short to show any of
  })

  it('looks in the app\'s file, then the shared one, then the engine\'s environment', async () => {
    await keepSecret('LINEAR_API_KEY', 'shared_sample_key_1111', null)
    const env = { LINEAR_API_KEY: 'from_the_environment_2222', OTHER: 'x' }
    expect((await envFor('CEB', env)).LINEAR_API_KEY).toBe('lin_api_sample_0000_abcd')
    expect((await envFor('HG', env)).LINEAR_API_KEY).toBe('shared_sample_key_1111')
    expect((await envFor('HG', env)).OTHER).toBe('x')
    await dropSecret('LINEAR_API_KEY', null)
    expect(await keptAs('LINEAR_API_KEY', 'HG', env)).toMatchObject({ from: 'environment', last4: '2222' })
    expect(existsSync(secretsFile())).toBe(false) // an empty file is not left behind
  })

  it('makes an integration ready without the variable being exported', async () => {
    const linear = INTEGRATIONS.find((i) => i.key === 'linear')!
    const values = { team: 'SHOP', key_env: 'LINEAR_API_KEY' }
    expect(integrationStatus(linear, values, {}).state).toBe('no-key')
    expect(integrationStatus(linear, values, await envFor('CEB', {})).state).toBe('ready')
  })

  it('refuses what is not a key or a name, takes one away, and follows the app when its key changes', async () => {
    await expect(keepSecret('not a name', 'x', 'CEB')).rejects.toThrow(/letters, digits and _/)
    await expect(keepSecret('A_KEY', 'two\nlines', 'CEB')).rejects.toThrow(/one line/)
    await expect(keepSecret('A_KEY', '  ', 'CEB')).rejects.toThrow(/paste the key/)
    await moveSecrets('CEB', 'ENT')
    expect(await keptAs('LINEAR_API_KEY', 'ENT', {})).toMatchObject({ set: true, from: 'app' }); expect(existsSync(join(home, 'apps', 'ceb'))).toBe(false)
    expect(await dropSecret('LINEAR_API_KEY', 'ENT')).toMatchObject({ set: false, from: null })
  })
})
