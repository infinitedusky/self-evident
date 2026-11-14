/** For tests that plan or run projects: planning waits for an approved brief (work.ts), so approve the app's briefs first. */
import { and, inArray, isNull } from 'drizzle-orm'
import { db } from './db/client.js'
import { issue } from './db/schema.js'

export const approveBriefs = (...appIds: string[]) => db.update(issue).set({ briefApprovedBy: 'test', briefApprovedAt: new Date() })
  .where(and(inArray(issue.appId, appIds), isNull(issue.parentId), isNull(issue.briefApprovedBy)))

/** For tests that approve a brief for real: an optional step is done or skipped first (steps.ts, undecided), so skip the ones left. Returns what it skipped. */
export async function skipTheRest(issueId: string) {
  const { setStep, stepsOf } = await import('./work.js')
  const { undecided } = await import('./steps.js')
  const v = await stepsOf({ issueId })
  const left = undecided(v.states, v.resolved.workflow)
  for (const key of left) await setStep({ issueId }, key, { status: 'skipped' }, 'test')
  return left
}
