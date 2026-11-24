/**
 * The gate a pull request goes through before it is marked ready, or updated once it is (docs/proven-work.md, part 4:
 * "GitHub's checks green; the app's held commands pass on the head; the title fits the app's rule and carries the
 * team ticket; the description follows the app's form with every section filled and nothing of ours above the fold;
 * the rollback agrees with the blast radius (a one-way door is never called revertable); the person's smoke checks
 * done"). Each check here is pure: what it is given, and what it says. finalize.ts gathers the facts.
 */
export interface GateCheck {
  key: 'github' | 'commands' | 'title' | 'description' | 'rollback' | 'smoke'
  name: string
  /** pass; fail; wait (it cannot be told yet, and holds); none (nothing to check here, and it does not hold). */ state: 'pass' | 'fail' | 'wait' | 'none'
  says: string
  /** What is wrong, one a line, when there is more than one thing. */ details?: string[]
  /** A sub-task could put it right (a failing command, a failing check): what it would be told. Absent: it is the person's, or the task's agent's. */ fix?: string
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The title against the app's rule (`setup.pr_title`), and the team's ticket in it. */
export function titleCheck(i: { template: string | null; title: string; ticket: string | null; ticketRequired: boolean; ours: string }): GateCheck {
  const name = 'The title fits the app\'s rule and carries the team\'s ticket'
  const title = i.title.trim()
  if (!title) return { key: 'title', name, state: 'fail', says: 'It has no title.' }
  const wrong: string[] = []
  if (i.ticketRequired && !i.ticket) wrong.push('This app titles a pull request by the team\'s ticket, and this task has none.')
  if (i.ticket && !title.toLowerCase().includes(i.ticket.toLowerCase())) wrong.push(`It does not carry the team's ticket, ${i.ticket}.`)
  if (i.ticket && i.ours && i.ours.toLowerCase() !== i.ticket.toLowerCase() && new RegExp(`\\b${esc(i.ours)}\\b`, 'i').test(title)) wrong.push(`It carries our own id, ${i.ours}, which means nothing to the team.`)
  if (i.template) {
    // The rule as a pattern: a name in braces is anything (a type is a word), the ticket is the ticket.
    const parts = i.template.trim().split(/(\{\w+\})/).map((p) => { const m = /^\{(\w+)\}$/.exec(p); return !m ? esc(p).replace(/\\?\s+/g, '\\s*') : m[1] === 'ticket' ? esc(i.ticket ?? i.ours) : m[1] === 'type' ? '[a-z]+' : m[1] === 'scope' ? '(?:\\([^)]*\\))?' : '.*?' })
    if (!new RegExp(`^${parts.join('')}$`, 'i').test(title)) wrong.push(`It does not fit the app's rule for titles: ${i.template.trim()}`)
    if (/\{\w+\}/.test(title)) wrong.push('A name in braces was left unfilled.')
  }
  return wrong.length ? { key: 'title', name, state: 'fail', says: wrong[0], ...(wrong.length > 1 ? { details: wrong } : {}) } : { key: 'title', name, state: 'pass', says: i.template ? `"${title}" fits ${i.template.trim()}` : `"${title}"${i.ticket ? ` carries ${i.ticket}` : ''}; this app has no rule for titles.` }
}

interface Section { level: number; heading: string; body: string }
/** A description's sections, headings outside code fences only. */
export function sectionsOf(md: string): Section[] {
  const out: Section[] = []
  let fenced = false, cur: Section | null = null
  for (const l of md.split('\n')) {
    if (/^\s*```/.test(l)) fenced = !fenced
    const h = !fenced && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l)
    if (h) { cur = { level: h[1].length, heading: h[2].trim(), body: '' }; out.push(cur) } else if (cur) cur.body += `${l}\n`
  }
  return out
}
const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const empty = (body: string) => { const t = body.replace(/<!--[\s\S]*?-->/g, '').replace(/[\s_*>-]+/g, ' ').trim(); return !t || /^(todo|tbd|\.\.\.|…|fill (this |me )?in)\.?$/i.test(t) }

/**
 * The description against the app's form: every heading of the template there, in its order, with something under
 * it; and nothing of ours in what the team reads (our name, our ids, how we built it). The engine's own blocks
 * (the evidence, the deploy steps, the review section) are not the writer's and are not read here.
 */
export function descriptionCheck(i: { template: string | null; written: string | null; /** Our ids for the task and its sub-tasks. */ ours: string[]; /** The team's ticket: it may look like one of ours and is theirs. */ ticket?: string | null }): GateCheck {
  const name = 'The description follows the app\'s form, every section filled, nothing of ours above the fold'
  const written = (i.written ?? '').replace(/<!-- evident:(\w+) -->[\s\S]*?<!-- \/evident:\1 -->/g, '').trim()
  if (!written) return { key: 'description', name, state: 'fail', says: 'Its description has not been written for the team: it would lead with Evident\'s merge guide, which reads as our build log. Write it on this page, or ask the task\'s agent to.' }
  const wrong: string[] = []
  if (i.template) {
    const want = sectionsOf(i.template), have = sectionsOf(written)
    let at = -1, ordered = true
    for (const w of want) {
      const k = have.findIndex((h) => same(h.heading, w.heading))
      if (k < 0) { wrong.push(`It has no "${w.heading}" section.`); continue }
      // A section holds its sub-sections: one with nothing of its own and something under a deeper heading is filled.
      let body = have[k].body
      for (let j = k + 1; j < have.length && have[j].level > have[k].level; j++) body += `${have[j].heading}\n${have[j].body}`
      if (empty(body)) wrong.push(`"${w.heading}" has nothing under it.`)
      if (k < at) ordered = false
      at = Math.max(at, k)
    }
    if (!ordered) wrong.push('Its sections are not in the order of the app\'s form.')
  }
  const ticket = (i.ticket ?? '').toLowerCase()
  const ids = i.ours.filter((o) => o && o.toLowerCase() !== ticket)
  const found = [/\bEvident\b/.test(written) ? 'our name (Evident)' : '', ...ids.filter((o) => new RegExp(`(^|[^\\w-])${esc(o)}(?![\\w-])`, 'i').test(written)).slice(0, 3).map((o) => `our id ${o}`), /\b(sub-?tasks?|fix rounds?|merge guide|the builder|probes?) (landed|found|reported|ran|said)\b/i.test(written) ? 'how we built it' : ''].filter(Boolean)
  if (found.length) wrong.push(`It speaks of ${found.join(', ')}: that belongs in the fine print, which is folded under it for you.`)
  return wrong.length ? { key: 'description', name, state: 'fail', says: wrong.length === 1 ? wrong[0] : `${wrong.length} things are wrong with it.`, ...(wrong.length > 1 ? { details: wrong } : {}) } : { key: 'description', name, state: 'pass', says: i.template ? 'Every section of the app\'s form is there, in order, and filled.' : 'It is written for the team; this app has no form of its own for a description.' }
}

const ONE_WAY = /\b((never|do not|don't|cannot|can't|must not|should not|not safe to) (be )?(revert|roll(ed)? back)|fix(ed|ing)? forward|one[- ]way( door)?|irreversible|not reversible|cannot be (undone|rolled back|reverted)|can't be (undone|rolled back|reverted)|no way back)\b/i
const REVERTABLE = /\b(safe(ly)? (to )?(be )?revert(ed|able)?|revertable|revertible|(just|simply)? ?revert (this|the) (pr|pull request|commit|change|merge)|can be (cleanly |safely |simply )?(reverted|rolled back)|roll(ing)? back is (safe|simple|a revert)|rollback:? (is )?(a |by )?(simple |clean |git )?revert)\b/i
const NEGATED = /\b(never|not|don't|do not|cannot|can't|no longer|must not|should not|un)\b/i
/** The sentences of a text that call the change revertable, without saying no in the same breath. */
export const revertableLines = (text: string) => text.split(/\n|(?<=[.!?])\s+/).map((l) => l.replace(/^[\s>*#-]+|\*\*/g, '').trim()).filter((l) => REVERTABLE.test(l) && !NEGATED.test(l.replace(REVERTABLE, '')) && !ONE_WAY.test(l))
/** The line of a text that says the change cannot simply be taken back, or null. */
export const oneWayLine = (text: string) => text.split('\n').map((l) => l.replace(/^[\s>*#-]+|\*\*/g, '').trim()).find((l) => ONE_WAY.test(l)) ?? null

/** The description's rollback against the blast radius: a one-way door is never called revertable. */
export function rollbackCheck(i: { written: string | null; /** All the blast radius wrote, with the merge checklist and the decisions: where a one-way door is said. */ risk: string | null }): GateCheck {
  const name = 'The rollback agrees with the blast radius'
  const door = i.risk ? oneWayLine(i.risk) : null
  if (!i.risk?.trim()) return { key: 'rollback', name, state: 'none', says: 'This task has no blast radius to hold the rollback against.' }
  const says = revertableLines(i.written ?? '')
  if (door && says.length) return { key: 'rollback', name, state: 'fail', says: `The description says "${says[0].slice(0, 160)}" and the blast radius says "${door.slice(0, 200)}". A one-way door is never called revertable: say how it is really taken back.` }
  if (door && !(i.written && ONE_WAY.test(i.written))) return { key: 'rollback', name, state: 'fail', says: `The blast radius says "${door.slice(0, 200)}", and the description does not say so. Whoever merges it has to know before they do.` }
  return { key: 'rollback', name, state: 'pass', says: door ? 'The description says, as the blast radius does, that it is not simply reverted.' : 'The blast radius names no one-way door, and the description claims nothing it does not.' }
}

/** GitHub's own checks on the pull request. */
export function githubCheck(pr: { status: string; checks: { name: string; state: 'pass' | 'fail' | 'pending' | 'skipped' }[] } | null, problem?: string | null): GateCheck {
  const name = 'GitHub\'s checks are green'
  if (problem) return { key: 'github', name, state: 'wait', says: problem }
  if (!pr) return { key: 'github', name, state: 'none', says: 'It is not on GitHub yet, so nothing has been run there. They are read once it is.' }
  const failing = pr.checks.filter((c) => c.state === 'fail'), pending = pr.checks.filter((c) => c.state === 'pending')
  if (failing.length) return { key: 'github', name, state: 'fail', says: `${failing.length} of ${pr.checks.length} failing: ${failing.map((c) => c.name).slice(0, 6).join(', ')}.`, fix: `GitHub's checks on the pull request fail: ${failing.map((c) => c.name).join(', ')}. Read each one's log with gh (gh pr checks, gh run view --log-failed), find what in this branch makes it fail, and fix that. Do not change the check or skip it.` }
  if (pending.length) return { key: 'github', name, state: 'wait', says: `${pending.length} of ${pr.checks.length} still running.` }
  return { key: 'github', name, state: pr.checks.length ? 'pass' : 'none', says: pr.checks.length ? `${pr.checks.length} pass.` : 'This repository runs no checks on a pull request.' }
}

/** The app's held commands on the head: each as it last ran, and on which commit. */
export function commandsCheck(i: { head: string | null; ran: { name: string; runs: string; pass: boolean; /** The commit it ran on, when known. */ sha?: string | null; detail?: string }[] }): GateCheck {
  const name = 'The app\'s held commands pass on the head'
  if (!i.ran.length) return { key: 'commands', name, state: 'none', says: 'This app holds no commands of its own.' }
  const failed = i.ran.filter((r) => !r.pass)
  if (failed.length) return { key: 'commands', name, state: 'fail', says: `${failed.map((f) => f.name).join(', ')} ${failed.length === 1 ? 'fails' : 'fail'}.`, details: failed.map((f) => `\`${f.runs}\`${f.detail ? `: ${f.detail.trim().split('\n').slice(-3).join(' ').slice(-300)}` : ''}`), fix: `${failed.length === 1 ? 'A command' : 'Commands'} this app holds every change to ${failed.length === 1 ? 'fails' : 'fail'} on this branch:\n\n${failed.map((f) => `\`${f.runs}\`\n\n${(f.detail ?? '').slice(-1500)}`).join('\n\n')}\n\nFix what makes ${failed.length === 1 ? 'it' : 'each'} fail. Do not change the command or what it checks.` }
  const old = i.ran.filter((r) => r.sha && i.head && r.sha !== i.head)
  if (old.length) return { key: 'commands', name, state: 'wait', says: `${old.map((o) => o.name).join(', ')} last ran on an earlier commit (${old[0].sha!.slice(0, 7)}): run the task's tests again.` }
  return { key: 'commands', name, state: 'pass', says: `${i.ran.map((r) => r.name).join(', ')}: ${i.ran.length === 1 ? 'passes' : 'all pass'}.` }
}

/** The person's own checks, on the Smoke page. */
export function smokeCheck(i: { owed: number; failed: number; accepted: { sha: string | null } | null; head: string | null }): GateCheck {
  const name = 'Your smoke checks are done'
  if (i.failed) return { key: 'smoke', name, state: 'fail', says: `${i.failed} of your checks failed by hand, and ${i.failed === 1 ? 'is' : 'are'} sent back.` }
  if (i.owed) return { key: 'smoke', name, state: 'fail', says: `${i.owed} of your checks still wait${i.owed === 1 ? 's' : ''} on the Smoke page.` }
  if (!i.accepted) return { key: 'smoke', name, state: 'fail', says: 'The smoke test has not been accepted.' }
  return { key: 'smoke', name, state: 'pass', says: i.accepted.sha && i.head && i.accepted.sha !== i.head ? `Accepted at ${i.accepted.sha.slice(0, 7)}; the branch has moved since, and none of your checks is open.` : 'Accepted, on this commit.' }
}

/** What stands between the results and GitHub: every check that fails or cannot be told yet. Empty: it may go. */
export const gateWaits = (checks: GateCheck[]) => checks.filter((c) => c.state === 'fail' || c.state === 'wait').map((c) => `${c.name}: ${c.says}`)
