/**
 * An app's list of probes, and nothing that needs the database: the web UI reads it too (contracts.ts). What a probe
 * is, and how one is run, is probes.ts.
 */
export type ProbeKind = 'command' | 'skill' | 'built-in'
export interface Probe { key: string; name: string; kind: ProbeKind; /** The command, the skill as a session names it, or what a built-in does. */ runs: string; /** false: reported, and nothing is held or sent back. */ blocks: boolean; on: boolean }
export interface ProbeResult { key: string; name: string; kind: ProbeKind; /** null: it could not be run (its skill is not there, its agent gave no verdict). */ pass: boolean | null; evidence: string; findings: string[]; blocks: boolean; /** How many rounds of fixes had landed when it ran: a failure older than the last fix is run again. */ fixes: number; at: string }

export const TESTS_KEY = 'tests'
/** What the engine brings to every app; an app switches one off, or to report only, by its key. */
export const BUILT_IN: Probe[] = [
  { key: 'break', name: 'Try to break it', kind: 'built-in', runs: 'used the way a person would, then the cases nobody wrote down', blocks: true, on: true },
  { key: 'comments', name: 'Comment discipline', kind: 'built-in', runs: 'no debug output, dead code, commented-out code or stray TODOs in the change', blocks: false, on: true },
]

export const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)

/** What Settings or an agent saved, tidied: a built-in's switches by its key; the app's own, a command or a skill with something to run. */
export function cleanProbes(given: unknown): Partial<Probe>[] {
  if (!Array.isArray(given)) return []
  const seen = new Set<string>()
  const out: Partial<Probe>[] = []
  for (const g of given as Partial<Probe>[]) {
    const key = keyOf(String(g?.key || g?.name || ''))
    if (!key || seen.has(key)) continue
    const builtIn = BUILT_IN.some((b) => b.key === key) || key === TESTS_KEY
    const switches = { ...(typeof g.on === 'boolean' ? { on: g.on } : {}), ...(typeof g.blocks === 'boolean' ? { blocks: g.blocks } : {}) }
    if (builtIn) { seen.add(key); out.push({ key, ...switches }); continue }
    const runs = String(g.runs ?? '').trim().slice(0, 500), name = String(g.name ?? '').trim().slice(0, 80)
    if (!runs || !name || (g.kind !== 'command' && g.kind !== 'skill')) continue
    seen.add(key); out.push({ key, name, kind: g.kind, runs, ...switches })
  }
  return out
}

/** An app's probes, in the order they are shown: the engine's own, the app's test command, then the app's. Every one, on or off. */
export function probesOf(setup: unknown): Probe[] {
  const s = (setup ?? {}) as { probes?: unknown; test_cmd?: string }
  const own = cleanProbes(s.probes)
  const over = (p: Probe): Probe => { const o = own.find((x) => x.key === p.key); return { ...p, on: o?.on ?? p.on, blocks: o?.blocks ?? p.blocks } }
  const tests: Probe[] = s.test_cmd?.trim() ? [{ key: TESTS_KEY, name: 'Tests', kind: 'command', runs: s.test_cmd.trim(), blocks: true, on: true }] : []
  return [...BUILT_IN.map(over), ...tests.map(over), ...own.filter((p): p is Probe & Partial<Probe> => !!p.kind).map((p) => ({ key: p.key!, name: p.name!, kind: p.kind!, runs: p.runs!, blocks: p.blocks ?? true, on: p.on ?? true }))]
}
export const inForce = (setup: unknown) => probesOf(setup).filter((p) => p.on)
/** The ones an agent runs, each a sub-task of its own. */
export const agentProbes = (setup: unknown) => inForce(setup).filter((p) => p.kind !== 'command')
/** The ones the engine runs itself, last, on the merged work. */
export const commandProbes = (setup: unknown) => inForce(setup).filter((p) => p.kind === 'command')
