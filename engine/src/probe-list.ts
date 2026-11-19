/**
 * An app's probes: the part of what its builds are held to (held.ts) that is run, not judged from a sentence. Nothing
 * here needs the database: the web UI reads it too (contracts.ts). What a probe is, and how one is run, is probes.ts.
 */
import { BUILT_IN as SHIPPED, cleanHeld, heldOf, keyOf, TESTS_KEY, whenRun, type RunsWhen } from './held.js'

export { keyOf, TESTS_KEY }
export type ProbeKind = 'command' | 'skill' | 'built-in'
export interface Probe { key: string; name: string; kind: ProbeKind; /** The command, the skill as a session names it, or what a built-in does. */ runs: string; /** false: reported, and nothing is held or sent back. */ blocks: boolean; on: boolean; /** When it is run (held.ts); none is every build. */ when?: RunsWhen }
export interface ProbeResult { key: string; name: string; kind: ProbeKind; /** null: it could not be run (its skill is not there, its agent gave no verdict). */ pass: boolean | null; evidence: string; findings: string[]; blocks: boolean; /** How many rounds of fixes had landed when it ran: a failure older than the last fix is run again. */ fixes: number; at: string }

/** What the engine brings to every app; an app switches one off, or to report only, by its key. */
export const BUILT_IN = SHIPPED as Probe[]

/** What was given, tidied (held.ts), without the sentences to judge. */
export const cleanProbes = (given: unknown): Partial<Probe>[] => cleanHeld(given).filter((p) => p.kind !== 'judged') as Partial<Probe>[]

/** An app's probes, in the order they are shown: the engine's own, the app's test command, then the app's. Every one, on or off. The sentences its builds are judged by are requirements.ts. */
export function probesOf(setup: unknown): Probe[] {
  return heldOf(setup).filter((h) => h.kind !== 'judged').map((h) => ({ key: h.key, name: h.name, kind: h.kind as ProbeKind, runs: h.runs, blocks: h.blocks, on: h.on, ...(h.when ? { when: h.when } : {}) }))
}

/** The ones a build runs: on, and not left to the repository's CI or to its nightly run. */
export const inForce = (setup: unknown) => probesOf(setup).filter((p) => p.on && whenRun(p) === 'build')
/** The ones nothing here runs: checks of the repository's CI on the pull request (`pr`), and workflows it runs on a schedule (`nightly`). */
export const leftTo = (setup: unknown, when: 'pr' | 'nightly') => probesOf(setup).filter((p) => p.on && whenRun(p) === when)
/** The ones an agent runs, each a sub-task of its own. */
export const agentProbes = (setup: unknown) => inForce(setup).filter((p) => p.kind !== 'command')
/** The ones the engine runs itself, last, on the merged work. */
export const commandProbes = (setup: unknown) => inForce(setup).filter((p) => p.kind === 'command')
