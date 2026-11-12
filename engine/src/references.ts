/**
 * Reference apps (Sandy, 2026-11-12: "when I'm working on one, I want to be able to use the other one as a reference
 * for how do I build it"). A product is often two repositories that change apart and are read together: a frontend
 * and the backend it talks to. Each is its own app here, with its own tasks, worktrees and pull requests, and each
 * may name others as references: apps whose checkout its agents may read and never change.
 *
 * Kept on the app as `setup.references: [{ appId, note }]`, by app and not by path, so it means the same on every
 * computer. An agent gets the reference's main checkout as an extra folder (the SDK's `additionalDirectories`), is
 * told what it is, and is refused when it tries to edit a file there. What it reads is whatever is checked out
 * there, normally the default branch.
 */
import { existsSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, repo } from './db/schema.js'

export interface Reference { appId: string; name: string; path: string; note: string | null }
interface Stored { appId: string; note?: string | null }

/** What a person may save: other apps, each once, with a short note. */
export function cleanReferences(value: unknown, ownId: string): Stored[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>([ownId])
  const out: Stored[] = []
  for (const v of value as Stored[]) {
    if (!v || typeof v.appId !== 'string' || seen.has(v.appId)) continue
    seen.add(v.appId)
    const note = typeof v.note === 'string' ? v.note.trim().slice(0, 300) : ''
    out.push(note ? { appId: v.appId, note } : { appId: v.appId })
  }
  return out
}

/** The app's references that can be read on this computer: each a known app with a checkout that is here. */
export async function referencesOf(appId: string | null | undefined): Promise<Reference[]> {
  if (!appId) return []
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  const stored = cleanReferences((a?.setup as { references?: unknown } | undefined)?.references, appId)
  if (!stored.length) return []
  const ids = stored.map((s) => s.appId)
  const [apps, repos] = await Promise.all([db.select().from(app).where(inArray(app.id, ids)), db.select().from(repo).where(inArray(repo.appId, ids))])
  return stored.flatMap((s) => {
    const other = apps.find((x) => x.id === s.appId); const path = repos.find((r) => r.appId === s.appId && r.localPath)?.localPath
    return other && path && existsSync(path) ? [{ appId: s.appId, name: other.name, path, note: s.note ?? null }] : []
  })
}

/** What the agent is told about them; nothing when there are none. */
export function referencePrompt(refs: Reference[]): string {
  if (!refs.length) return ''
  return ['', '', 'Reference apps: other code this app works with. Read it to see how something is done or what it expects; never change it, and do not run commands that write there. If the work needs a change there, say so: it is a task for that app.',
    ...refs.map((r) => `- ${r.name}: ${r.path}${r.note ? ` (${r.note})` : ''}`)].join('\n')
}

/** The reference a file is in, if any. */
export function referenceHolding(refs: Reference[], cwd: string, file: unknown): Reference | null {
  if (typeof file !== 'string' || !file) return null
  const at = resolve(cwd, file) + sep
  return refs.find((r) => at.startsWith(resolve(r.path) + sep)) ?? null
}

export const refusal = (r: Reference) => `${r.name} is a reference: read it, never change it. A change there is a task for ${r.name}.`
