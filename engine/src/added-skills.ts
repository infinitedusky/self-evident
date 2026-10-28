/**
 * Skills added as files (LOG.md, "Skills are files"): from a URL, an upload or pasted text. The text is held in
 * Postgres (the `skill` table) so trying one is immediate, and written out as a plugin folder the agents load
 * (`ADDED_HOME`, a Claude Code plugin named `added`); skills.ts lists it with the others, so tags and jobs work the
 * same. One file per skill: a SKILL.md with `name` and `description` in its frontmatter.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { join } from 'node:path'
import { parse } from 'yaml'
import { db } from './db/client.js'
import { skill } from './db/schema.js'
import { newId } from './ids.js'
import { PlanError } from './issues.js'
import { ADDED_HOME } from './skills.js'

export type Source = 'url' | 'upload' | 'paste'
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
const MAX = 256 * 1024

/** A skill's name and description, from its frontmatter; the name may come from where it was found instead. */
export function readSkillText(content: string, hint?: string): { name: string; description: string } {
  if (content.length > MAX) throw new PlanError('a skill is one file of at most 256 KB')
  const m = content.match(/^﻿?---\s*\n([\s\S]*?)\n---\s*(\n|$)/)
  if (!m) throw new PlanError('a skill starts with frontmatter: --- name and description ---')
  let meta: { name?: unknown; description?: unknown } = {}
  try { meta = parse(m[1]) ?? {} } catch (e) { throw new PlanError(`its frontmatter is not valid YAML: ${(e as Error).message}`) }
  const description = typeof meta.description === 'string' ? meta.description.trim() : ''
  if (!description) throw new PlanError("a skill needs a description: it's how an agent knows when to use it")
  const name = (typeof meta.name === 'string' && meta.name.trim()) || hint || ''
  if (!NAME.test(name)) throw new PlanError(name ? `"${name}" can't be a skill name: lowercase letters, digits and dashes` : 'a skill needs a name in its frontmatter')
  return { name, description }
}

/**
 * Where a URL's text is, and what it suggests the skill is called. GitHub page links become raw links; a folder link
 * means its SKILL.md. A file named SKILL.md is named after its folder, any other after itself.
 */
export function rawUrl(url: string): { raw: string; hint?: string } {
  let u: URL
  try { u = new URL(url.trim()) } catch { throw new PlanError('that is not a URL') }
  if (!/^https?:$/.test(u.protocol)) throw new PlanError('only http and https URLs')
  let raw = u.toString()
  const gh = u.hostname === 'github.com' && u.pathname.match(/^\/([^/]+)\/([^/]+)\/(blob|tree)\/(.+)$/)
  if (gh) raw = `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[4]}${gh[3] === 'tree' ? '/SKILL.md' : ''}`
  const parts = new URL(raw).pathname.split('/').filter(Boolean)
  const file = parts.at(-1) ?? ''
  const hint = /^skill\.md$/i.test(file) ? parts.at(-2) : file.replace(/\.md$/i, '')
  return { raw, hint: hint?.toLowerCase() }
}

async function fetchText(url: string) {
  const { raw, hint } = rawUrl(url)
  const r = await fetch(raw, { redirect: 'follow', signal: AbortSignal.timeout(20_000) }).catch((e) => { throw new PlanError(`could not reach ${raw}: ${e.message}`) })
  if (!r.ok) throw new PlanError(`${raw} answered ${r.status}`)
  const text = await r.text()
  if (/^\s*<(!doctype|html)/i.test(text)) throw new PlanError(`${raw} is a web page, not a skill file; link the SKILL.md itself`)
  return { text, hint }
}

export const listAdded = (workspaceId: string) => db.select().from(skill).where(eq(skill.workspaceId, workspaceId)).orderBy(skill.name)

/** Add a skill from a URL, or from text that was uploaded or pasted. */
export async function addSkill(workspaceId: string, input: { url?: string; content?: string; name?: string; source: Source }) {
  const got = input.source === 'url' ? await fetchText(input.url ?? '') : { text: input.content ?? '', hint: undefined }
  const { name, description } = readSkillText(got.text, input.name?.trim() || got.hint)
  const [taken] = await db.select({ id: skill.id }).from(skill).where(and(eq(skill.workspaceId, workspaceId), eq(skill.name, name)))
  if (taken) throw new PlanError(`a skill named ${name} is already added`)
  const [row] = await db.insert(skill).values({ id: newId('skill'), workspaceId, name, description, content: got.text, source: input.source, sourceUrl: input.source === 'url' ? input.url!.trim() : null }).returning()
  await writeAdded(workspaceId)
  return row
}

async function existing(workspaceId: string, name: string) {
  const [row] = await db.select().from(skill).where(and(eq(skill.workspaceId, workspaceId), eq(skill.name, name)))
  if (!row) throw new PlanError(`no skill ${name}`)
  return row
}

/** Replace a skill's text; its name stays, since its tags and job hang on it. */
export async function editSkill(workspaceId: string, name: string, content: string) {
  await existing(workspaceId, name)
  const read = readSkillText(content, name)
  if (read.name !== name) throw new PlanError(`the text names it ${read.name}; a skill keeps its name (remove it and add it again to rename)`)
  await db.update(skill).set({ content, description: read.description, updatedAt: new Date() }).where(and(eq(skill.workspaceId, workspaceId), eq(skill.name, name)))
  await writeAdded(workspaceId)
}

/** Fetch a URL skill again. */
export async function refreshSkill(workspaceId: string, name: string) {
  const row = await existing(workspaceId, name)
  if (!row.sourceUrl) throw new PlanError(`${name} was ${row.source === 'upload' ? 'uploaded' : 'pasted'}; there is nothing to fetch`)
  await editSkill(workspaceId, name, (await fetchText(row.sourceUrl)).text)
}

export async function removeSkill(workspaceId: string, name: string) {
  await existing(workspaceId, name)
  await db.delete(skill).where(and(eq(skill.workspaceId, workspaceId), eq(skill.name, name)))
  await writeAdded(workspaceId)
}

/** Write the added skills out as the `added` plugin: one folder per skill, and nothing that was removed. */
export async function writeAdded(workspaceId?: string) {
  const rows = workspaceId ? await listAdded(workspaceId) : await db.select().from(skill)
  const dir = join(ADDED_HOME, 'skills')
  mkdirSync(join(ADDED_HOME, '.claude-plugin'), { recursive: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(ADDED_HOME, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'added', description: 'Skills added in Settings, as files', skills: './skills' }, null, 2))
  const keep = new Set(rows.map((r) => r.name))
  for (const d of readdirSync(dir)) if (!keep.has(d)) rmSync(join(dir, d), { recursive: true, force: true })
  for (const r of rows) { mkdirSync(join(dir, r.name), { recursive: true }); writeFileSync(join(dir, r.name, 'SKILL.md'), r.content) }
}
