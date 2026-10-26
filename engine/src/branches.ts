/**
 * Where a task's work lands, and what its pull request is against. Two modes, set per app (setup.pr_mode):
 * - 'project' (the default): every task lands on the project's branch; one PR for the whole project.
 * - 'task' (for a team: small PRs reviewed fast): each task lands on its own branch, cut from the previous task's
 *   branch, with its own PR stacked on the previous task's PR, or against main once that one has merged.
 * Task branches are siblings of the project's branch (`project/<id>--t<n>`): git cannot hold both `a` and `a/b`.
 */
export type PrMode = 'project' | 'task'

export const prMode = (setup: unknown): PrMode => ((setup as { pr_mode?: string } | null)?.pr_mode === 'task' ? 'task' : 'project')

export const taskBranch = (integrationBranch: string, taskNumber: number) => `${integrationBranch}--t${taskNumber}`

export interface StackTask { id: string; number: number; position: number }
export interface StackPr { taskId: string | null; status: string; headBranch: string | null; number: number | null }

/** The branch a task lands on. */
export function landingBranch(mode: PrMode, integrationBranch: string, t: { number: number }) {
  return mode === 'task' ? taskBranch(integrationBranch, t.number) : integrationBranch
}

/**
 * Where a new task branch starts: the nearest earlier task that has a branch (its work is done: tasks run in order),
 * else the project's branch (cut from main when the project started).
 */
export function taskStart(integrationBranch: string, t: StackTask, tasks: StackTask[], existing: Set<string>) {
  const earlier = tasks.filter((x) => x.position < t.position).sort((a, b) => b.position - a.position)
  const prev = earlier.find((x) => existing.has(taskBranch(integrationBranch, x.number)))
  return prev ? taskBranch(integrationBranch, prev.number) : integrationBranch
}

/**
 * What a task's PR is against: the nearest earlier task's PR while it is still open (the stack), else main. A merged
 * or closed earlier PR drops out, so the next one retargets to main.
 */
export function stackBase(defaultBranch: string, t: StackTask, tasks: StackTask[], prs: StackPr[]): { base: string; on: number | null } {
  const earlier = tasks.filter((x) => x.position < t.position).sort((a, b) => b.position - a.position)
  for (const e of earlier) {
    const q = prs.find((x) => x.taskId === e.id)
    if (q && ['open', 'draft'].includes(q.status) && q.headBranch) return { base: q.headBranch, on: q.number }
  }
  return { base: defaultBranch, on: null }
}
