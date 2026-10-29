/** For tests that plan or run projects: planning waits for an approved brief (work.ts), so approve the app's briefs first. */
import { and, inArray, isNull } from 'drizzle-orm'
import { db } from './db/client.js'
import { issue } from './db/schema.js'

export const approveBriefs = (...appIds: string[]) => db.update(issue).set({ briefApprovedBy: 'test', briefApprovedAt: new Date() })
  .where(and(inArray(issue.appId, appIds), isNull(issue.parentId), isNull(issue.briefApprovedBy)))
