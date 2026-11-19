/**
 * What a build is held to: one list, in layers (LOG.md, 2026-11-19; Sandy: "too many rigid settings that should be
 * defaults that you override or extend"). The engine ships a list. An app keeps only its differences from it
 * (`setup.held`): a switch or a rewording of one the engine ships, or one of its own. A workflow, then a project,
 * switches some on or off for its own tasks. Nothing is copied, so a default the engine improves reaches every app
 * that has not reworded it.
 *
 * One kind of record, however it is judged:
 * - built-in: a probe the engine brings (probes.ts); switched, never reworded;
 * - command: a shell command, exit 0 passes; the app's test command is the one with the key `tests`, and its command
 *   is `setup.test_cmd` (landing reads it too);
 * - skill: a skill run as a reviewer by a fresh agent that edits nothing;
 * - judged: a sentence the check's agent judges (what requirements.ts calls a requirement).
 *
 * A judged one has a namespace of its own (`req:<key>` as an id here): requirements were named before probes were, and
 * both have a `tests`. It was two stores (`setup.requirements`, a whole copy of the list; `setup.probes`, differences):
 * those are still read when an app has no `held` yet (`legacy`), and every write leaves only `held`.
 *
 * When it is run (Sandy, 2026-11-19, on Bonkei's every-page docs smoke running on every pull request: "I feel like
 * this should be a nightly check"; then "great lets do that"). A command of the app's own says when:
 * - build: the engine runs it on every build (as every other kind is);
 * - pr: nothing runs it here. It is a check of the repository's CI on the pull request, and `runs` is that check's name;
 * - nightly: nothing runs it here and nothing waits for it. It is a workflow the repository runs on a schedule on its
 *   default branch, `runs` is that workflow's file, and the engine reads its last run (nightly.ts). It only reports.
 *
 * Nothing here needs the database: the web UI imports it.
 */
export type HeldKind = 'command' | 'skill' | 'judged' | 'built-in'
export type RunsWhen = 'build' | 'pr' | 'nightly'
export const RUNS_WHEN: RunsWhen[] = ['build', 'pr', 'nightly']
export interface Held { key: string; name: string; kind: HeldKind; /** The command, the skill as a session names it, the sentence to judge, or what a built-in does; left to CI, the pull request check's name; nightly, the workflow's file. */ runs: string; /** false: reported, and nothing is held or sent back. */ blocks: boolean; on: boolean; /** When it is run; none is every build. Only a command of the app's own says otherwise. */ when?: RunsWhen }
/** When one is run. */
export const whenRun = (h: { when?: RunsWhen | string }): RunsWhen => (h.when === 'pr' || h.when === 'nightly' ? h.when : 'build')
/** What an app keeps: for one the engine ships, only what differs; for its own, all of it. */
export type HeldDiff = { key: string } & Partial<Omit<Held, 'key'>>
export interface Resolved extends Held {
  /** Its id in the one list: the key, or `req:<key>` for a judged one. */ id: string
  /** The app's own, not one the engine ships: it can be removed. */ own: boolean
  /** One the engine ships that this app has switched or reworded: it can be put back. */ changed: boolean
  /** Who has the last word on whether it is on, when it is not the app. */ by?: 'workflow' | 'project'
}

export const TESTS_KEY = 'tests'
const REQ = 'req:'
export const idOf = (d: { key: string; kind?: string }) => (d.kind === 'judged' ? `${REQ}${d.key}` : d.key)
export const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)

/** The probes the engine brings to every app. */
export const BUILT_IN: Held[] = [
  { key: 'break', name: 'Try to break it', kind: 'built-in', runs: 'used the way a person would, then the cases nobody wrote down', blocks: true, on: true },
  { key: 'comments', name: 'Comment discipline', kind: 'built-in', runs: 'no debug output, dead code, commented-out code or stray TODOs in the change', blocks: false, on: true },
]
/** The sentences the engine starts every app with, worded for any repository: an app rewords one to say how it is done there. */
export const JUDGED: Held[] = [
  { key: 'telemetry', name: 'Telemetry', kind: 'judged', runs: 'Anything new that a person does, or that can fail, can be seen afterwards, the way this repository already makes things seen (its logs, traces, metrics or events), and with nothing personal in it.', blocks: true, on: true },
  { key: 'tests', name: 'Tests', kind: 'judged', runs: 'New behaviour has automated tests that fail without the change, and the app\'s test command passes.', blocks: true, on: true },
  { key: 'test_plan', name: 'Test plan', kind: 'judged', runs: 'How a person checks it by hand: the pages to open and what to look for, in order.', blocks: true, on: true },
  { key: 'docs', name: 'Docs', kind: 'judged', runs: 'The documentation that describes what changed is updated in the same task.', blocks: true, on: true },
  // What the stages before a build used to write (Sandy, 2026-11-16: "It needs to create an ADR"). Off for an app
  // until it or a workflow switches them on; Main does.
  { key: 'adr', name: 'Decision record', kind: 'judged', runs: 'Each real design choice made in this change is written down where the repo keeps its decisions: what was chosen, what was turned down, and why.', blocks: true, on: false },
  { key: 'risks', name: 'Risks', kind: 'judged', runs: 'The pull request says what this change could break and how someone would notice, in a few lines.', blocks: true, on: false },
]
const SHIPPED = [...BUILT_IN, ...JUDGED]
const TESTS: Held = { key: TESTS_KEY, name: 'Tests', kind: 'command', runs: '', blocks: true, on: true }
const shipped = (id: string) => (id === TESTS_KEY ? TESTS : SHIPPED.find((d) => idOf(d) === id))
/** Wordings the engine shipped before: an app's copy of one is the default, not a rewording of its own. */
const OLD_WORDING: Record<string, string[]> = { 'req:telemetry': ['Anything new that a person does, or that can fail, can be seen with OpenTelemetry: a span or an event where the prototype analysis says one belongs.'] }

/** What was given, tidied to differences: one the engine ships keeps only what differs from it; the app's own needs a name, a kind and something to run. */
export function cleanHeld(given: unknown): HeldDiff[] {
  if (!Array.isArray(given)) return []
  const seen = new Set<string>()
  const out: HeldDiff[] = []
  for (const g of given as Partial<Held>[]) {
    const key = keyOf(String(g?.key || g?.name || ''))
    const judged = g?.kind === 'judged'
    const id = idOf({ key, kind: judged ? 'judged' : undefined })
    if (!key || seen.has(id)) continue
    const d = shipped(id)
    const name = String(g.name ?? '').trim().slice(0, 80), runs = String(g.runs ?? '').trim().slice(0, judged ? 1000 : 500)
    if (d) {
      const diff: HeldDiff = { key, ...(judged ? { kind: 'judged' as const } : {}) }
      if (typeof g.on === 'boolean' && g.on !== d.on) diff.on = g.on
      if (typeof g.blocks === 'boolean' && g.blocks !== d.blocks) diff.blocks = g.blocks
      if (judged && name && name !== d.name) diff.name = name
      if (judged && runs && runs !== d.runs && !(OLD_WORDING[id] ?? []).includes(runs)) diff.runs = runs
      seen.add(id)
      if (Object.keys(diff).length > (judged ? 2 : 1)) out.push(diff)
      continue
    }
    if (!name || (!runs && !judged) || (g.kind !== 'command' && g.kind !== 'skill' && g.kind !== 'judged')) continue
    seen.add(id)
    const when = g.kind === 'command' ? whenRun(g) : 'build'
    out.push({ key, name, kind: g.kind, runs: runs || name, ...(g.on === false ? { on: false } : {}), ...(g.blocks === false || when === 'nightly' ? { blocks: false } : {}), ...(when !== 'build' ? { when } : {}) })
  }
  return out
}

/** The two stores there were, as differences: `requirements` was the whole list (one it left out was dropped: now off), `probes` already differences. */
function legacy(setup: { requirements?: unknown; probes?: unknown }): HeldDiff[] {
  const reqs = Array.isArray(setup.requirements) ? (setup.requirements as { key?: string; name?: string; what?: string; on?: boolean; blocks?: boolean }[]) : null
  const judged = reqs ? [
    ...reqs.map((r) => ({ key: r.key?.trim() || r.name, name: r.name, kind: 'judged' as const, runs: r.what, on: r.on !== false, blocks: r.blocks !== false })),
    ...JUDGED.filter((d) => d.on && !reqs.some((r) => keyOf(String(r.key || r.name || '')) === d.key)).map((d) => ({ key: d.key, kind: 'judged' as const, on: false })),
  ] : []
  return cleanHeld([...judged, ...(Array.isArray(setup.probes) ? setup.probes : [])])
}

/** An app's differences from what the engine ships. */
export function diffsOf(setup: unknown): HeldDiff[] {
  const s = (setup ?? {}) as { held?: unknown; requirements?: unknown; probes?: unknown }
  return Array.isArray(s.held) ? cleanHeld(s.held) : legacy(s)
}
/** Whether an app's settings still carry the two stores there were. */
export const hasLegacy = (setup: unknown) => { const s = (setup ?? {}) as Record<string, unknown>; return 'requirements' in s || 'probes' in s || 'requirements_added' in s }

/**
 * Everything an app's builds are held to, on or off: the engine's probes, the test command when there is one, the
 * engine's sentences, then the app's own. `workflow` and `project` are switches by a judged one's key ({adr: true}):
 * the workflow's over the app's, the project's over both.
 */
export function heldOf(setup: unknown, workflow?: unknown, project?: unknown): Resolved[] {
  const diffs = diffsOf(setup)
  const cmd = String((setup as { test_cmd?: string } | null)?.test_cmd ?? '').trim()
  const wf = workflow && typeof workflow === 'object' ? workflow as Record<string, unknown> : {}
  const pr = project && typeof project === 'object' ? project as Record<string, unknown> : {}
  const one = (d: Held, own: boolean): Resolved => {
    const id = idOf(d), diff = own ? undefined : diffs.find((x) => idOf(x) === id)
    const r: Resolved = { ...d, ...diff, key: d.key, kind: d.kind, id, own, changed: !!diff }
    if (d.kind !== 'judged') return r
    return typeof pr[d.key] === 'boolean' ? { ...r, on: pr[d.key] as boolean, by: 'project' } : typeof wf[d.key] === 'boolean' ? { ...r, on: wf[d.key] as boolean, by: 'workflow' } : r
  }
  const mine = diffs.filter((x) => !shipped(idOf(x))).map((x) => one({ key: x.key, name: x.name!, kind: x.kind!, runs: x.runs!, blocks: x.blocks ?? true, on: x.on ?? true, ...(x.when ? { when: x.when } : {}) }, true))
  return [...BUILT_IN.map((d) => one(d, false)), ...(cmd ? [one({ ...TESTS, runs: cmd }, false)] : []), ...JUDGED.map((d) => one(d, false)), ...mine]
}

export type HeldChange =
  | { op: 'on'; key: string; on: boolean } | { op: 'blocks'; key: string; blocks: boolean } | { op: 'remove'; key: string }
  | { op: 'add'; name: string; kind: 'command' | 'skill' | 'judged'; runs: string; /** false: it reports only. */ blocks?: boolean; /** A command: when it is run (none: every build). */ when?: RunsWhen }
  /** Its name and what it runs (a judged one, its sentence; the test command, its command), and whether it blocks when given. Its key and kind stay. */
  | { op: 'edit'; key: string; name: string; runs: string; blocks?: boolean; /** A command of the app's own: when it is run, when given. */ when?: RunsWhen }
  /** One the engine ships, back to how the engine ships it. */
  | { op: 'reset'; key: string }

/**
 * A change to what a build is held to, as a change to the app's settings. `key` is an id of the one list (`req:docs`,
 * `lint`, `tests`). Returns only the settings that change, and always leaves the old stores empty; null when the
 * change cannot be made (nothing to run, a name already there, a rewording of one of the engine's probes).
 */
export function applyHeldChange(setup: unknown, change: HeldChange): Record<string, unknown> | null {
  const diffs = diffsOf(setup)
  const out = (held: HeldDiff[], more: Record<string, unknown> = {}) => { const tidy = cleanHeld(held); return { held: tidy.length ? tidy : null, requirements: null, probes: null, requirements_added: null, ...more } }
  if (change.op === 'add') {
    const name = change.name.trim(), runs = change.runs.trim(), key = keyOf(name)
    if (!name || !runs || !key) return null
    const id = idOf({ key, kind: change.kind })
    if (shipped(id) || heldOf(setup).some((h) => h.id === id)) return null
    return out([...diffs, { key, name, kind: change.kind, runs, ...(change.blocks === false ? { blocks: false } : {}), ...(change.when ? { when: change.when } : {}) }])
  }
  const judged = change.key.startsWith(REQ), key = judged ? change.key.slice(REQ.length) : change.key
  const id = change.key, d = shipped(id), was = diffs.find((x) => idOf(x) === id), rest = diffs.filter((x) => idOf(x) !== id)
  if (!d && !was) return null
  const put = (patch: Partial<Held>, more?: Record<string, unknown>) => out([...rest, { ...(d ?? {}), ...was, ...patch, key, ...(judged ? { kind: 'judged' as const } : {}) }], more)
  if (change.op === 'remove') return d ? (id === TESTS_KEY ? out(rest, { test_cmd: null }) : null) : out(rest)
  if (change.op === 'reset') return d && was ? out(rest) : null
  if (change.op === 'on') return put({ on: change.on })
  if (change.op === 'blocks') return whenRun(was ?? {}) === 'nightly' && change.blocks ? null : put({ blocks: change.blocks }) // a nightly run has nothing left to block
  const name = change.name.trim(), runs = change.runs.trim(), blocks = typeof change.blocks === 'boolean' ? { blocks: change.blocks } : {}
  if (!runs) return null
  if (id === TESTS_KEY) return put(blocks, { test_cmd: runs })
  if (d?.kind === 'built-in' || !name) return null
  return put({ name, runs, ...blocks, ...(change.when && !d ? { when: change.when } : {}) })
}

/** Several changes, one after another, as one change to the settings (a page's save, an agent's set-up). Ones that cannot be made are passed over. */
export function applyHeldChanges(setup: unknown, changes: HeldChange[]): Record<string, unknown> {
  let now = { ...((setup ?? {}) as Record<string, unknown>) }
  const total: Record<string, unknown> = {}
  for (const c of changes) {
    const patch = applyHeldChange(now, c)
    if (!patch) continue
    Object.assign(total, patch)
    now = Object.fromEntries(Object.entries({ ...now, ...patch }).filter(([, v]) => v !== null && v !== undefined))
  }
  return total
}
