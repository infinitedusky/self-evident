/**
 * Changing an app's settings (app.setup, one JSON object): only ever the keys that change, merged into what is saved
 * at that moment, under a lock on the app's row. Found on Cloaked (2026-11-19): the Settings page saved the whole
 * object as it was when the page loaded, and each agent tool rewrote the whole object from its own read, so a save
 * wiped what the other had written a minute before (two requirements and the skills on a step, gone). Every writer
 * goes through here: the page (PATCH /apps/:id sends its changes), and each tool that sets one thing.
 */
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app } from './db/schema.js'
import { PlanError } from './issues.js'

/** `changes` (or a function of the settings as they are, giving them): a key with a value is set; a key with null or undefined is removed; a key not named is left as it is. Returns the settings as saved. */
export async function patchSetup(appId: string, changes: Record<string, unknown> | ((now: Record<string, unknown>) => Record<string, unknown>)): Promise<Record<string, unknown>> {
  return db.transaction(async (tx) => {
    const [a] = await tx.select({ setup: app.setup }).from(app).where(eq(app.id, appId)).for('update')
    if (!a) throw new PlanError(`no app ${appId}`)
    return (await tx.update(app).set({ setup: merged(a.setup, typeof changes === 'function' ? changes((a.setup ?? {}) as Record<string, unknown>) : changes) }).where(eq(app.id, appId)).returning({ setup: app.setup }))[0].setup as Record<string, unknown>
  })
}

export function merged(setup: unknown, changes: Record<string, unknown>): Record<string, unknown> {
  const next = { ...((setup ?? {}) as Record<string, unknown>) }
  for (const [k, v] of Object.entries(changes)) { if (v === null || v === undefined) delete next[k]; else next[k] = v }
  return next
}
