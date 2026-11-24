/**
 * Each step's contract, owned by the engine and the same for every app (LOG.md, 2026-11-18, "Steps, stages and
 * probes"): what the step needs, what it leaves, when it is done, and its stages in order. A stage says who runs it:
 * the engine, an agent, or a person. An app attaches skills to a stage an agent does, and probes to the build's
 * Verify; nothing else about a step is an app's to change.
 *
 * `contractsOf` lays an app's own choices over the contracts, for Settings › Skills: only the steps its workflow
 * uses, the skills chosen for each, the one list of what a build is held to (held.ts), and what the pull request's
 * finalizing does and is gated on (finalize.ts), with the one part of it an app sets: mutation testing.
 *
 * Nothing here needs the database: the web UI imports it (`@self-evident/engine/contracts`).
 */
import { applyHeldChange, heldOf, TESTS_KEY, type HeldChange, type Resolved, type RunsWhen } from './held.js'
export type { RunsWhen }
import { applyFinalizeChange, finalizePrepare, mutationSetup, MUTANTS_MAX, type FinalizeChange, type MutationSetup } from './mutation-setup.js'
export { applyFinalizeChange, type FinalizeChange }
import { GATE_NAMES } from './pr-gate.js'
import { normalize, step, STEPS, styleOf, type StepKey, type Workflow } from './steps.js'

export type StageKey = 'prepare' | 'do' | 'verify' | 'report'
export type By = 'engine' | 'agent' | 'person'
export type ContractKey = Exclude<StepKey, 'idea'> | 'build' | 'smoke' | 'pr'
/** How a probe reaches its verdict: a command's exit code, the check's agent judging a sentence, a skill run by a fresh agent that edits nothing, or one the engine brings. */
export type ProbeViewKind = 'command' | 'judged' | 'skill' | 'built-in'
export interface AttachedSkill { name: string; label: string; from: string; missing?: boolean; /** Every app has it here; it is not the app's to remove. */ fixed?: boolean }
export interface ProbeView { key: string; name: string; kind: ProbeViewKind; runs: string; blocks: boolean; on: boolean; /** A command the build does not run: left to the repository's CI on the pull request (`runs` is the check's name), or to its nightly run (`runs` is the workflow's file). */ when?: RunsWhen; /** The app's own: it can be removed. */ own: boolean; /** Its name and what it runs can be changed here. */ editable?: boolean; /** One the engine ships that this app has switched or reworded: it can be put back. */ changed?: boolean; /** The workflow that has the last word on whether it is on, by name. Switching it here switches it for that workflow. */ from?: string; /** Why it cannot be switched here, when it cannot. */ fixed?: string }
/**
 * One thing the pull request's finalizing does (finalize.ts), or one check of its gate (pr-gate.ts). A step's finding is
 * named in the evidence and holds nothing; a gate check holds the press. Only mutation testing is an app's to set.
 */
export interface FinalizeRow { key: string; name: string; what: string; group: 'step' | 'gate'; on: boolean; /** Why it cannot be switched here. */ fixed?: string; /** Mutation testing's settings, on its row. */ set?: MutationSetup & { prepare: string | null; /** The cap the engine ships. */ maxDefault: number } }
export interface Stage { key: StageKey; by: By; what: string; skills?: AttachedSkill[]; probes?: ProbeView[]; finalize?: FinalizeRow[] }
export interface StepContract { key: ContractKey; icon: string; label: string; needs: string[]; leaves: string[]; done: string; stages: Stage[] }
export interface StepGroup { title: string; steps: StepContract[] }

type Fixed = { needs: string[]; leaves: string[]; done: string; stages: Stage[] }
const agent = (what: string): Stage => ({ key: 'do', by: 'agent', what })
const report = (what: string): Stage => ({ key: 'report', by: 'agent', what })
const READ = 'Its summary for you, the full report for the next agent.'

/** The contracts. Words for a person: short. */
export const CONTRACTS: Record<ContractKey, Fixed> = {
  research: { needs: ['The idea or task'], leaves: ['A research note'], done: 'The note says who does this best, what exists already, and the case against.', stages: [agent('Reads the code and the web.'), report(READ)] },
  brief: { needs: ['What the other steps left'], leaves: ['The brief, in at most 200 words', 'Its acceptance criteria'], done: 'You approved it.', stages: [agent('Writes what to build and why, and how we will know it is done.')] },
  sketch: { needs: ['The idea or task'], leaves: ['Plain HTML screens'], done: 'You like a screen.', stages: [agent('Draws the screens, fast, and changes them as you react.')] },
  screen: { needs: ['The sketch you picked'], leaves: ['Every screen and state, still and exact'], done: 'Nothing you can see is left to change.', stages: [agent('Draws each screen and state as a story, from the app\'s own components.'), report('Which parts are new.')] },
  mockup: { needs: ['The agreed screens'], leaves: ['The same screens, clickable'], done: 'You can move through it, and it matches the screens.', stages: [agent('Makes the new parts components and adds the clicks.'), report('Which stories to open.')] },
  data: { needs: ['The task', 'A real response of each outside service, where there is one'], leaves: ['Every call the change makes outside the app, with what it needs answered', 'A mock that answers each', 'Where its data comes from for the prototype, the smoke test and the reviewer'], done: 'Every call is answered, every place has data you chose, and the reviewer\'s holds nothing real.', stages: [agent('Lists every call the change makes outside the app, builds or changes the mocks that answer them, and makes the data this task needs.')] },
  prototype: { needs: ['The brief', 'The agreed mockup'], leaves: ['A branch that runs', 'A guide to try it'], done: 'You approved it.', stages: [{ key: 'prepare', by: 'engine', what: 'A worktree and a port of its own.' }, agent('Builds it to work exactly as the real thing will: deployable as it stands, with only its addresses and keys pointed elsewhere.'), report('One line per requirement, what is not met first.')] },
  analysis: { needs: ['The approved prototype'], leaves: ['A report on how it was built'], done: 'The report is recorded.', stages: [agent('Reads the prototype: what was faked, what to keep, the simpler way.'), report(READ)] },
  adr: { needs: ['The prototype analysis'], leaves: ['A draft decision record'], done: 'The draft is recorded.', stages: [agent('Sets out the options, a proposed choice and why.'), report(READ)] },
  risk: { needs: ['The plan'], leaves: ['The blast radius'], done: 'The report is recorded.', stages: [agent('Reads what the plan touches, what could break, and how we would know.'), report(READ)] },
  audit: { needs: ['The plan', 'The brief', 'The draft ADR'], leaves: ['An audit'], done: 'The report is recorded.', stages: [agent('Reads the plan against the brief, the ADR, the code and the prototype.'), report(READ)] },
  final: { needs: ['The blast radius', 'The audit'], leaves: ['The final ADR and plan', 'The merge checklist'], done: 'The plan is put right.', stages: [agent('Puts the ADR and the plan right from what the checks found.'), report(READ)] },
  testplan: { needs: ['The approved brief', 'Its acceptance criteria', 'The prototype and its reports, when there are any'], leaves: ['The test trajectory: every test the build commits to', 'The slices the build is cut into'], done: 'You approved it.', stages: [agent('Reads the code and writes the table: what each test proves, its level, its criterion, where it is written and where it turns green; what cannot be written up front, with why.'), { key: 'do', by: 'person', what: 'You read it and approve it: the build is made from it.' }] },
  build: { needs: ['The approved brief', 'Its acceptance criteria', 'The ticket'], leaves: ['Commits on the task\'s branch', 'A draft pull request'], done: 'Every blocking probe passes, in at most three rounds, and every planned test was seen to fail and then to pass.', stages: [
    { key: 'prepare', by: 'engine', what: 'Cuts the branch by the app\'s naming, and holds commits to its format.' },
    agent('With a test plan: the tests that can be written first, each seen to fail, then a slice at a time until its tests pass. Without one: the code and its tests. It commits, is told everything Verify will hold it to, and has the reviewers\' skills.'),
    { key: 'verify', by: 'engine', what: 'Runs each probe on what was built. A probe changes nothing: what one finds goes back to a builder.' },
    report('What changed, why, and how it was verified.'),
  ] },
  smoke: { needs: ['The built branch', 'A set-up to try it in'], leaves: ['Your mark on each check'], done: 'You marked every check.', stages: [{ key: 'prepare', by: 'engine', what: 'Brings up the set-up each check needs.' }, { key: 'do', by: 'person', what: 'You try what only a person can judge.' }] },
  pr: { needs: ['The built branch', 'Your accepted smoke test'], leaves: ['The breaks no test caught, each named', 'The evidence, drafted for the description', 'The pull request, ready for review'], done: 'Every gate check passes and you pushed it.', stages: [
    { key: 'verify', by: 'engine', what: 'Finalizes when you accept the smoke test, on this computer and never in the team\'s CI. Nothing reaches GitHub from it.' },
    { key: 'do', by: 'person', what: 'You send a fix after what it found, or leave it with a reason; then you push and mark it ready for review.' },
  ] },
}
/** The finalizing's steps, in the order they run (finalize.ts runs them by these). */
export const FINALIZE_STEPS = [
  { key: 'trajectory', name: 'The trajectory holds' },
  { key: 'mutation', name: 'Mutation testing of the changed lines' },
  { key: 'review', name: 'The review copy, built on the head' },
  { key: 'gate', name: 'The gate checks' },
  { key: 'evidence', name: 'The evidence drafted' },
] as const
const WHAT: Record<(typeof FINALIZE_STEPS)[number]['key'], string> = {
  trajectory: 'every planned test was seen to fail, then to pass; a task with no test plan says so',
  mutation: 'a small break in each line the branch changed, run against its tests; each one no test catches is named',
  review: 'the reviewer\'s copy with nothing real in it; behind the head, it is made again when you push',
  gate: 'the six below',
  evidence: 'what the others found, written for the description and sent only when you push',
}
const ALWAYS = 'Always run.'
const HOLDS = 'Always checked: it holds the press.'
/** The finalizing, in the order it runs, then the gate's checks in the order the page lists them. The names are finalize.ts's and pr-gate.ts's. */
export function finalizingOf(setup: unknown): FinalizeRow[] {
  const m = mutationSetup(setup)
  const gate = (key: keyof typeof GATE_NAMES, name: string, what: string): FinalizeRow => ({ key: `gate:${key}`, name, what, group: 'gate', on: true, fixed: HOLDS })
  return [
    ...FINALIZE_STEPS.map((x): FinalizeRow => ({ key: x.key, name: x.name, what: WHAT[x.key], group: 'step', ...(x.key === 'mutation' ? { on: !m.off, set: { ...m, prepare: finalizePrepare(setup), maxDefault: MUTANTS_MAX } } : { on: true, fixed: ALWAYS }) })),
    gate('github', GATE_NAMES.github, 'the pull request\'s own checks, read from GitHub'),
    gate('commands', GATE_NAMES.commands, 'the tests and every command the build is held to'),
    gate('title', GATE_NAMES.title, 'the app\'s title rule and the task\'s ticket'),
    gate('description', GATE_NAMES.description, 'the app\'s form for a description'),
    gate('rollback', GATE_NAMES.rollback, 'what the description says of taking it back, against the blast radius'),
    gate('smoke', GATE_NAMES.smoke, 'your marks on the Smoke page, on this head'),
  ]
}

/** The steps that take skills: every one an agent does. */
export const TAKES_SKILLS = (Object.keys(CONTRACTS) as ContractKey[]).filter((k) => CONTRACTS[k].stages.some((s) => s.key === 'do' && s.by === 'agent'))

const CRITERIA: ProbeView = { key: 'criteria', name: 'Acceptance criteria', kind: 'built-in', runs: 'each one checked, with evidence', blocks: true, on: true, own: false, fixed: 'Always checked.' }
const NO_TESTS: ProbeView = { key: TESTS_KEY, name: 'Tests', kind: 'command', runs: '', blocks: true, on: false, own: false, editable: true }
const PROTOTYPE_SKILLS = ['shared:prototype', 'self-evident:prototype']

export interface Usable { name: string; label: string; from: string }
export interface ContractsInput { setup: unknown; /** The app's default workflow; none, every step it could have is shown. */ workflow?: Workflow | null; /** The skills the app's agents have. */ usable?: Usable[] }

/** What a build of this app is held to (held.ts), in the order it is verified: the list first, then the agents' probes, then the commands. */
export function heldTo(setup: unknown, workflow?: Workflow | null): ProbeView[] {
  const checklist = !workflow || styleOf(workflow) === 'checklist'
  const view = (h: Resolved): ProbeView => ({
    key: h.id, name: h.name, kind: h.kind, runs: h.runs, blocks: h.blocks, on: h.on, own: h.own,
    ...(h.when ? { when: h.when } : {}), ...(h.kind !== 'built-in' ? { editable: true } : {}), ...(h.changed ? { changed: true } : {}), ...(h.by === 'workflow' && workflow ? { from: workflow.name } : {}),
  })
  const all = heldOf(setup, workflow?.requirements).filter((h) => checklist || h.id === TESTS_KEY).map(view)
  const commands = all.filter((p) => p.kind === 'command')
  return [CRITERIA, ...all.filter((p) => p.kind === 'judged'), ...all.filter((p) => p.kind !== 'command' && p.kind !== 'judged'), ...(commands.some((p) => p.key === TESTS_KEY) ? [] : [NO_TESTS]), ...commands]
}

/** An app's steps as Settings › Skills shows them: the ones its workflow uses, in order, each with what is attached. */
export function contractsOf(i: ContractsInput): StepGroup[] {
  const usable = i.usable ?? []
  const chosen = ((i.setup as { step_skills?: Record<string, string[]> } | null)?.step_skills ?? {})
  const on = i.workflow ? new Set(normalize(i.workflow).steps.filter((s) => s.on).map((s) => s.key)) : null
  const skillsOf = (key: ContractKey): AttachedSkill[] => {
    const given = key === 'prototype' ? PROTOTYPE_SKILLS.find((n) => usable.some((u) => u.name === n)) : undefined
    const one = (n: string, fixed?: boolean): AttachedSkill => { const u = usable.find((x) => x.name === n); return { name: n, label: u?.label ?? n, from: u?.from ?? '', ...(u ? {} : { missing: true }), ...(fixed ? { fixed } : {}) } }
    return [...(given ? [one(given, true)] : []), ...(chosen[key] ?? []).filter((n) => !PROTOTYPE_SKILLS.includes(n) || !given).map((n) => one(n))]
  }
  const contract = (key: ContractKey, icon: string, label: string): StepContract => {
    const c = CONTRACTS[key]
    return { key, icon, label, needs: c.needs, leaves: c.leaves, done: c.done, stages: c.stages.map((s) => ({
      ...s,
      ...(s.key === 'do' && s.by === 'agent' ? { skills: skillsOf(key) } : {}),
      ...(key === 'build' && s.key === 'verify' ? { probes: heldTo(i.setup, i.workflow) } : {}),
      ...(key === 'pr' && s.key === 'verify' ? { finalize: finalizingOf(i.setup) } : {}),
    })) }
  }
  const before = STEPS.filter((s) => s.key !== 'idea' && (!on || on.has(s.key))).map((s) => contract(s.key as ContractKey, step(s.key).icon, step(s.key).label))
  return [
    { title: 'Before the build', steps: before },
    { title: 'The build', steps: [contract('build', '🧱', 'Build'), contract('smoke', '👀', 'Smoke test'), contract('pr', '🔀', 'Pull request')] },
  ]
}

/** A change made on the page, and what it does to the app's settings: held.ts. */
export type ProbeChange = HeldChange
export const applyProbeChange = applyHeldChange
export { applyHeldChanges as applyProbeChanges } from './held.js'
