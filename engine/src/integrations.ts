/**
 * Integrations: the services the factory and its apps report to, set once for the workspace and overridden per app,
 * field by field (Homework Gate can send to its own PostHog project while the rest share one). The workspace's
 * values live in `workspace.settings.integrations`, an app's overrides in `app.setup.integrations`; an empty field
 * inherits. Keys and tokens are never stored here: they stay in each program's .env, and a field only names the
 * variable that holds one.
 */

export interface Field { key: string; label: string; placeholder?: string }
export interface Integration { key: string; name: string; role: string; does: string; fields: Field[] }

export const INTEGRATIONS: Integration[] = [
  {
    key: 'posthog', name: 'PostHog', role: 'Telemetry', does: 'What users do, and every log line: events, flags, experiments, LLM calls, logs over OTLP',
    fields: [
      { key: 'host', label: 'Host', placeholder: 'https://us.i.posthog.com' },
      { key: 'project_id', label: 'Project id', placeholder: '677236' },
      { key: 'key_env', label: 'Key variable', placeholder: 'POSTHOG_API_KEY (in .env, never here)' },
    ],
  },
  {
    key: 'datadog', name: 'Datadog', role: 'Telemetry', does: 'What services do: traces, logs, errors',
    fields: [
      { key: 'site', label: 'Site', placeholder: 'datadoghq.com' },
      { key: 'service', label: 'Service', placeholder: 'the service name' },
      { key: 'key_env', label: 'Key variable', placeholder: 'DD_API_KEY (in .env, never here)' },
    ],
  },
]

export type Values = Record<string, Record<string, string>> // integration → field → value
export interface Effective { value: string | null; from: 'app' | 'workspace' | null }

/** Each integration's fields as the app sees them: its override, else the workspace's value, else unset. */
export function effectiveIntegrations(workspace: Values = {}, app: Values = {}): Record<string, Record<string, Effective>> {
  return Object.fromEntries(INTEGRATIONS.map((i) => [i.key, Object.fromEntries(i.fields.map((f) => {
    const own = app[i.key]?.[f.key]?.trim()
    const shared = workspace[i.key]?.[f.key]?.trim()
    return [f.key, own ? { value: own, from: 'app' } : shared ? { value: shared, from: 'workspace' } : { value: null, from: null }]
  }))]))
}

/** Only known integrations and fields, trimmed, empties dropped: what is stored is what inherits nothing. */
export function cleanValues(v: unknown): Values {
  const out: Values = {}
  for (const i of INTEGRATIONS) {
    const given = (v as Values | undefined)?.[i.key] ?? {}
    const kept = Object.fromEntries(i.fields.map((f) => [f.key, typeof given[f.key] === 'string' ? given[f.key].trim() : '']).filter(([, x]) => x))
    if (Object.keys(kept).length) out[i.key] = kept
  }
  return out
}
