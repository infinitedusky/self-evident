/**
 * Where an issue's work lands, and what its pull request is against. Two modes, set per app (setup.pr_mode):
 * - 'issue' (the default since 2026-11-14: a task is what is built, and a project only groups tasks): each task lands
 *   on its own branch, cut from the previous task's branch, with its own PR stacked on the previous task's PR, or
 *   against main once that one has merged.
 * - 'project' (how it was; an app can still ask for it): every task lands on the project's branch; one PR for the
 *   whole project.
 * A project keeps the mode it started with (project.pr_mode).
 * Issue branches are siblings of the project's branch (`project/<id>--hg-12`): git cannot hold both `a` and `a/b`.
 * The identifier in the name is how Linear's GitHub integration links the branch and its PR to the issue.
 */
export type PrMode = 'project' | 'issue'

export const prMode = (setup: unknown): PrMode => ((setup as { pr_mode?: string } | null)?.pr_mode === 'project' ? 'project' : 'issue')
/** The mode a project builds in: the one it started with, else the app's. */
export const modeOf = (p: { prMode?: string | null }, setup: unknown): PrMode => (p.prMode === 'issue' || p.prMode === 'project' ? p.prMode : prMode(setup))

export const issueBranch = (integrationBranch: string, identifier: string) => `${integrationBranch}--${identifier.toLowerCase()}`

export interface StackIssue { id: string; identifier: string; sortOrder: number }
export interface StackPr { issueId: string | null; status: string; headBranch: string | null; number: number | null }

/** The branch an issue lands on. */
export function landingBranch(mode: PrMode, integrationBranch: string, t: { identifier: string }) {
  return mode === 'issue' ? issueBranch(integrationBranch, t.identifier) : integrationBranch
}

/**
 * Where a new issue branch starts: the nearest earlier issue that has a branch (its work is done: issues run in order),
 * else the project's branch (cut from main when the project started).
 */
export function issueStart(integrationBranch: string, t: StackIssue, issues: StackIssue[], existing: Set<string>) {
  const earlier = issues.filter((x) => x.sortOrder < t.sortOrder).sort((a, b) => b.sortOrder - a.sortOrder)
  const prev = earlier.find((x) => existing.has(issueBranch(integrationBranch, x.identifier)))
  return prev ? issueBranch(integrationBranch, prev.identifier) : integrationBranch
}

/**
 * What an issue's PR is against: the nearest earlier issue's PR while it is still open (the stack), else main. A merged
 * or closed earlier PR drops out, so the next one retargets to main.
 */
export function stackBase(defaultBranch: string, t: StackIssue, issues: StackIssue[], prs: StackPr[]): { base: string; on: number | null } {
  const earlier = issues.filter((x) => x.sortOrder < t.sortOrder).sort((a, b) => b.sortOrder - a.sortOrder)
  for (const e of earlier) {
    const q = prs.find((x) => x.issueId === e.id)
    if (q && ['open', 'draft'].includes(q.status) && q.headBranch) return { base: q.headBranch, on: q.number }
  }
  return { base: defaultBranch, on: null }
}

/**
 * Whether a task builds by itself once its brief is approved: planned, then built, with nothing more to press. On
 * unless the app says no (setup.auto_build false: the person presses Plan it and Run, as before).
 */
export const autoBuild = (setup: unknown): boolean => (setup as { auto_build?: boolean } | null)?.auto_build !== false
