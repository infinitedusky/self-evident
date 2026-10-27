/** Integrations: set for the workspace, overridden per app field by field; an empty field inherits. */
import { describe, expect, it } from 'vitest'
import { cleanValues, effectiveIntegrations } from './integrations.js'

describe('effectiveIntegrations', () => {
  it('an app override wins field by field; the rest inherits from the workspace', () => {
    const e = effectiveIntegrations({ posthog: { host: 'https://us.i.posthog.com', project_id: '1' } }, { posthog: { project_id: '677236' } })
    expect(e.posthog.project_id).toEqual({ value: '677236', from: 'app' })
    expect(e.posthog.host).toEqual({ value: 'https://us.i.posthog.com', from: 'workspace' })
    expect(e.posthog.key_env).toEqual({ value: null, from: null })
    expect(e.datadog.site).toEqual({ value: null, from: null })
  })
  it('a blank override inherits rather than clearing', () => {
    expect(effectiveIntegrations({ posthog: { host: 'h' } }, { posthog: { host: '  ' } }).posthog.host).toEqual({ value: 'h', from: 'workspace' })
  })
})

describe('cleanValues', () => {
  it('keeps known integrations and fields, trimmed, and drops empties', () => {
    expect(cleanValues({ posthog: { host: ' h ', project_id: '', nope: 'x' }, datadog: { site: '' }, other: { a: 'b' } })).toEqual({ posthog: { host: 'h' } })
    expect(cleanValues(undefined)).toEqual({})
  })
})
