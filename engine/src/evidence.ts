/**
 * The Evidence section of a pull request, drafted from what was measured and from nothing else (docs/proven-work.md,
 * part 4; Sandy, 2026-11-23: "every PR arrives with hundreds of tests and a green CI, and many of those tests check
 * nothing … a reviewer can see that the change was tested well").
 *
 * In this order, because it is the order of what a reviewer can trust: the tests this pull request wrote, by level;
 * that each was seen to fail before the code that makes it pass; which criterion each proves; what was deferred or
 * is a guard, and why; what mutation testing caught of the breaks made to the changed lines, and every one it did
 * not; and last, in a line, that the whole suite still passes. The size of the suite is never the headline.
 *
 * It is the engine's block in the description, between its own marks, so an update replaces it and nothing the
 * writer said. Nothing of ours is in it: tests are named by their file, slices by what they build.
 */
import { proofOf, PROOF_SAYS, type Criterion } from './acceptance.js'
import { scoreOf, type MutationResult } from './mutation.js'
import { LEVELS, rowState, TESTS, type Level, type RowRun, type TestPlan } from './trajectory.js'

export const EVIDENCE_OPEN = '<!-- evident:evidence -->', EVIDENCE_CLOSE = '<!-- /evident:evidence -->'
export interface Accepted { /** Why it is left as it is, in the person's words. */ reason: string; /** They say no test could see it: out of the score. */ equivalent?: boolean; by?: string; at?: string }

export interface EvidenceFacts {
  /** The plan the build was held to, and the engine's own runs of its rows. Null: built without a test plan. */
  plan: TestPlan | null; runs: RowRun[]
  criteria: Criterion[]
  /** Test files the branch added or changed, when there is no plan to count rows from. */ testFiles: string[]
  /** Null: it was not run, and `mutationSays` is why. */ mutation: MutationResult | null; mutationSays?: string
  /** What the person said of a survivor, by its id. */ accepted: Record<string, Accepted>
  /** The app's held commands as they last ran on the head (the whole test run among them). */ commands: { name: string; pass: boolean }[]
}

const one = (s: string) => s.replace(/\s+/g, ' ').trim()
const cell = (s: string) => one(s).replace(/\|/g, '\\|')
const LEVEL_NAME: Record<Level, string> = { unit: 'unit', integration: 'integration', component: 'component', browser: 'browser', contract: 'contract', live: 'live check' }
const whereOf = (plan: TestPlan, at: string) => (at === TESTS ? 'before any code' : plan.slices.find((s) => s.key === at.replace(/:red$/, ''))?.title ?? at)

/** The section's text, without its heading or marks. Empty when nothing was measured. Pure. */
export function evidenceText(f: EvidenceFacts): string {
  const out: string[] = []
  if (f.plan?.rows.length) {
    const plan = f.plan
    const rows = plan.rows.map((r) => ({ r, state: rowState(r, f.runs), red: f.runs.find((x) => x.row === r.id && x.outcome === 'red'), green: [...f.runs].reverse().find((x) => x.row === r.id && x.outcome === 'green') }))
    const byLevel = LEVELS.map((l) => ({ l, n: rows.filter((x) => x.r.level === l).length })).filter((x) => x.n)
    const passing = rows.filter((x) => x.state === 'green').length
    out.push(`**Tests written by this pull request:** ${byLevel.map((x) => `${x.n} ${LEVEL_NAME[x.l]}`).join(', ')}. ${passing === rows.length ? 'All pass.' : `${passing} of ${rows.length} pass.`}`)
    const guards = rows.filter((x) => x.r.guard), need = rows.filter((x) => !x.r.guard)
    const proven = need.filter((x) => x.state === 'green')
    const not = rows.filter((x) => x.state !== 'green')
    out.push(`**Red before green:** ${proven.length} of ${need.length} ${need.length === 1 ? 'was' : 'were'} run and seen to fail on an assertion before the code that makes ${need.length === 1 ? 'it' : 'them'} pass was written, then seen to pass.${guards.length ? ` ${guards.length} more ${guards.length === 1 ? 'is a regression guard' : 'are regression guards'}, green when written on purpose (below).` : ''}`
      + (not.length ? `\n\nNot proven:\n${not.map((x) => `- ${x.r.id} (\`${x.r.test}\`): ${({ planned: 'never run', red: 'still failing', 'never-red': 'passes, and was never seen to fail', fake: 'fails to load, which is not a failing test', unwritten: 'no test was found', unclear: 'fails, and how could not be told', failing: 'passed, and fails now', green: '' } as Record<string, string>)[x.state]}.`).join('\n')}` : ''))
    out.push(`<details>\n<summary>Each test: what it proves, where it was seen to fail, where it passed</summary>\n\n| Test | Proves | Level | Seen to fail | Passed |\n| --- | --- | --- | --- | --- |\n${rows.map((x) => `| ${x.r.id} \`${x.r.test}\`${x.r.name ? ` (${cell(x.r.name)})` : ''} | ${cell(x.r.asserts)} | ${LEVEL_NAME[x.r.level]} | ${x.r.guard ? 'a guard' : x.red ? cell(whereOf(plan, x.red.at)) : 'not seen'} | ${x.green ? cell(whereOf(plan, x.green.at)) : 'not yet'} |`).join('\n')}\n\n</details>`)
    if (f.criteria.length) out.push(`**Criteria to tests:**\n${f.criteria.map((c) => { const mine = plan.rows.filter((r) => r.criteria.includes(c.id)).map((r) => r.id); const proof = proofOf(c); return `- ${one(c.text)}: ${mine.length ? mine.join(', ') : proof ? PROOF_SAYS[proof].replace(/^you check it/, 'checked by hand') : 'no test of its own'}${mine.length && proof ? `; also ${PROOF_SAYS[proof].replace(/^you check it/, 'checked by hand')}` : ''}` }).join('\n')}`)
    const deferred = rows.filter((x) => x.r.deferred)
    if (deferred.length) out.push(`**Deferred tests** (could not fail for the right reason until part of the code existed; each was written, and seen to fail, just before the code it tests):\n${deferred.map((x) => `- ${x.r.id}: ${one(x.r.deferred!.why)} Written with "${whereOf(plan, x.r.writableAt)}".`).join('\n')}`)
    if (guards.length) out.push(`**Regression guards** (pin what already worked, so they pass from the start):\n${guards.map((x) => `- ${x.r.id}: ${one(x.r.guard!)}`).join('\n')}`)
  } else {
    out.push(`**Tests:** this change was built without a test plan, so there is no record of its tests failing before the code was written.${f.testFiles.length ? ` It adds or changes ${f.testFiles.length} test file${f.testFiles.length === 1 ? '' : 's'}.` : ' It adds or changes no test files.'}`)
  }
  if (f.mutation) {
    const m = f.mutation
    const setAside = new Set(Object.entries(f.accepted).filter(([, a]) => a.equivalent).map(([id]) => id))
    const s = scoreOf(m, setAside)
    const lead = s.meaningful ? `of ${s.meaningful} meaningful break${s.meaningful === 1 ? '' : 's'} made to the lines this pull request changed, the tests catch ${s.caught} (${s.percent}%).` : 'no meaningful break could be made to the lines this pull request changed.'
    const fine = [m.tried < m.found ? `${m.tried} of the ${m.found} possible breaks were tried` : '', m.partial ? m.partial : '', m.invalid ? `${m.invalid} more would not load and ${m.invalid === 1 ? 'is' : 'are'} not counted` : ''].filter(Boolean).join('; ')
    out.push(`**Mutation testing:** ${lead}${fine ? ` (${fine[0].toUpperCase()}${fine.slice(1)}.)` : ''}`
      + (s.open.length ? `\n\nNot caught:\n${s.open.map((x) => `- \`${x.file}:${x.line}\`: \`${x.from}\` became \`${x.to || 'nothing'}\`. ${x.means[0].toUpperCase()}${x.means.slice(1)}.${f.accepted[x.id] ? ` Left as it is: ${one(f.accepted[x.id].reason)}` : ''}`).join('\n')}` : '')
      + (s.equivalent.length ? `\n\nLeft out of the score, because no test could tell:\n${s.equivalent.map((x) => `- \`${x.file}:${x.line}\`: \`${x.from}\` became \`${x.to || 'nothing'}\`. ${one(f.accepted[x.id]?.reason ?? x.equivalent ?? '')}`).join('\n')}` : ''))
  } else if (f.mutationSays) out.push(`**Mutation testing:** not run. ${one(f.mutationSays)}`)
  if (f.commands.length) out.push(f.commands.every((c) => c.pass) ? `**Everything else:** ${f.commands.map((c) => c.name).join(', ')} ${f.commands.length === 1 ? 'passes' : 'all pass'} on this branch: nothing else broke.` : `**Everything else:** ${f.commands.filter((c) => !c.pass).map((c) => c.name).join(', ')} ${f.commands.filter((c) => !c.pass).length === 1 ? 'fails' : 'fail'} on this branch.`)
  return out.join('\n\n')
}

const EVIDENCE_HEADING = /^##+\s+(evidence|how (it|this) was tested|testing|tests?|test evidence|verification)\s*:?\s*$/i
/**
 * A description with the engine's evidence in it: under the heading the writer gave for it ("Evidence", "Testing",
 * "How it was tested"), before what they wrote there, else in a section "Evidence" at its end. Between the engine's
 * marks, so the next draft replaces it; with no text, a block left from before is taken out. The writer's "Test
 * plan" is theirs (what a reviewer should try), and is left alone.
 */
export function withEvidence(written: string, text: string): string {
  const clean = written.replace(/\n*<!-- evident:evidence -->[\s\S]*?<!-- \/evident:evidence -->\n*/g, '\n\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!text.trim()) return clean.replace(/\n*## Evidence\s*$/i, '').trim()
  const block = `${EVIDENCE_OPEN}\n${text.trim()}\n${EVIDENCE_CLOSE}`
  const lines = clean.split('\n')
  let fenced = false, at = -1
  for (let i = 0; i < lines.length; i++) { if (/^\s*```/.test(lines[i])) fenced = !fenced; if (!fenced && EVIDENCE_HEADING.test(lines[i])) { at = i; break } }
  if (at < 0) return [clean, '## Evidence', block].filter(Boolean).join('\n\n')
  return [lines.slice(0, at + 1).join('\n').trim(), block, lines.slice(at + 1).join('\n').trim()].filter(Boolean).join('\n\n')
}
