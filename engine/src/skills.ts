/**
 * Plugins and skills. Two layers (LOG.md, "Skills in two layers"): an app repo's `.claude/skills/` is about working on
 * that app and arrives with `settingSources: ['project']`; this module is the other layer, what the factory brings to
 * every app as Claude Code plugins (LOG.md, "Plugins: installed, switched, filed by what we do").
 *
 * A plugin here is a Claude Code plugin, installed by Claude Code's own installer (the SDK's bundled binary) into the
 * factory's config dir, never the operator's ~/.claude; what is installed is the installer's own record. Self
 * Evident's own plugin (`engine/plugin/`) is built in: it switches off but does not uninstall. Settings keep the rest:
 * each plugin on or off and which agents get it (an app may switch one for itself), and each skill filed under the
 * job it covers (catalogue.ts). The builder gets no plugins: it builds what the plan says.
 */
import type { McpServerConfig, SdkPluginConfig } from '@anthropic-ai/claude-agent-sdk'
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import { parse } from 'yaml'
import { CATEGORY_KEYS } from './catalogue.js'
import { db } from './db/client.js'
import { app, workspace } from './db/schema.js'
import { PlanError } from './issues.js'
import type { Risk } from './risk.js'

export type Role = 'talk' | 'planner'
export const ROLES: Role[] = ['talk', 'planner']

export interface PluginSetting { on?: boolean; roles?: Role[] }
export interface SkillSetting { category?: string | null; on?: boolean }
export interface FactorySettings { plugins?: Record<string, PluginSetting>; skills?: Record<string, SkillSetting> }
export type AppPlugins = Record<string, { on: boolean }> // an app's own switch, per plugin; absent inherits

/** The factory's Claude Code config dir: the installer's marketplaces, cache and record of what is installed. */
export const PLUGINS_HOME = process.env.PLUGINS_HOME ?? join(homedir(), '.self-evident', 'claude')
const OWN_PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin')
const REA_ROOT = dirname(createRequire(import.meta.url).resolve('rea-agents/package.json'))

/** Skills a known plugin brings, filed until someone files them otherwise. */
const DEFAULT_CATEGORY: Record<string, string> = { 'rea@rea/reverse-engineer-anything': 'study-a-shipped-product' }

/**
 * MCP servers the factory supplies for a plugin whose package leaves them out. REA's npm package (what its
 * marketplace installs) has neither its plugin manifest nor its dependencies, so the install brings the skill and no
 * tools (morluto/rea#5062); the server runs from the engine's own `rea-agents`. Used only while the installed plugin
 * declares no server of its own, so it retires itself when upstream ships the manifest.
 */
const SHIMS: Record<string, { mcpServers: Record<string, McpServerConfig>; note: string }> = {
  'rea@rea': {
    mcpServers: { rea: { type: 'stdio', command: process.execPath, args: [join(REA_ROOT, 'scripts', 'rea.mjs'), 'mcp'] } },
    note: "Its tools run from Self Evident's copy of rea-agents: the published plugin leaves its MCP server out (morluto/rea#5062).",
  },
}

export interface SkillInfo { key: string; name: string; description: string }
export interface Installed {
  id: string; name: string; sdkName: string; path: string; version: string | null; description: string
  source: string | null; builtIn: boolean; skills: SkillInfo[]; mcpServers: string[]; shim: string | null
}

const readJson = (p: string) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const skillDirs = (dir: string) => { try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { return [] } }

/** Each skill under a directory, described from its SKILL.md frontmatter; `prefix` makes the key. */
function readSkills(dir: string, prefix: string | null): SkillInfo[] {
  return skillDirs(dir).map((d) => {
    let meta: { description?: string } = {}
    try { meta = parse(readFileSync(join(dir, d, 'SKILL.md'), 'utf8').split(/^---\s*$/m)[1] ?? '') ?? {} } catch { /* no SKILL.md, or no frontmatter */ }
    return { key: prefix ? `${prefix}/${d}` : d, name: d, description: meta.description ?? '' }
  })
}

/** A plugin folder as the SDK will load it: named by its manifest, else by the folder (that is the SDK's rule). */
function describe(id: string, path: string, extra: { builtIn: boolean; version?: string | null; source?: string | null; description?: string }): Installed {
  const manifest = readJson(join(path, '.claude-plugin', 'plugin.json')) ?? {}
  const pkg = readJson(join(path, 'package.json')) ?? {}
  const own = [...Object.keys(manifest.mcpServers ?? {}), ...Object.keys(readJson(join(path, '.mcp.json'))?.mcpServers ?? {})]
  const shim = !own.length && SHIMS[id] ? SHIMS[id] : null
  return {
    id, name: manifest.name ?? id.split('@')[0], sdkName: manifest.name ?? basename(path), path,
    version: manifest.version ?? pkg.version ?? (extra.version && extra.version !== 'unknown' ? extra.version : null),
    description: manifest.description ?? extra.description ?? pkg.description ?? '',
    source: extra.source ?? null, builtIn: extra.builtIn,
    skills: readSkills(join(path, typeof manifest.skills === 'string' ? manifest.skills : 'skills'), id),
    mcpServers: shim ? Object.keys(shim.mcpServers) : own, shim: shim?.note ?? null,
  }
}

/** What is installed: Self Evident's own plugin, then what the installer's record lists. */
export function installed(): Installed[] {
  const out = [describe('self-evident', OWN_PLUGIN, { builtIn: true, description: "Self Evident's own skills" })]
  const record = readJson(join(PLUGINS_HOME, 'plugins', 'installed_plugins.json'))?.plugins ?? {}
  const markets = readJson(join(PLUGINS_HOME, 'plugins', 'known_marketplaces.json')) ?? {}
  for (const [id, entries] of Object.entries(record as Record<string, { installPath: string; version?: string }[]>)) {
    const e = entries[0]
    if (!e || !existsSync(e.installPath)) continue
    const [name, market] = id.split('@')
    const m = markets[market]
    const listing = readJson(join(m?.installLocation ?? '', '.claude-plugin', 'marketplace.json'))?.plugins?.find((p: { name: string }) => p.name === name)
    const src = m?.source
    out.push(describe(id, e.installPath, { builtIn: false, version: e.version, source: src?.repo ?? src?.url ?? src?.path ?? market, description: listing?.description }))
  }
  return out
}

/** On unless switched off: the app's own switch first, then the factory's. */
export const pluginOn = (id: string, f: FactorySettings, a: AppPlugins = {}) => a[id]?.on ?? f.plugins?.[id]?.on ?? true
export const pluginRoles = (id: string, f: FactorySettings) => f.plugins?.[id]?.roles ?? ROLES
export const skillCategory = (key: string, f: FactorySettings) => f.skills?.[key] && 'category' in f.skills[key] ? f.skills[key].category ?? null : DEFAULT_CATEGORY[key] ?? null
export const skillOn = (key: string, f: FactorySettings) => f.skills?.[key]?.on ?? true

/** What a role gets in one app: the plugins switched on for it, and the skills switched on in them. */
export function resolvePlugins(list: Installed[], f: FactorySettings, a: AppPlugins, role: Role) {
  const plugins = list.filter((p) => pluginOn(p.id, f, a) && pluginRoles(p.id, f).includes(role))
  return { plugins, skills: plugins.flatMap((p) => p.skills.filter((s) => skillOn(s.key, f)).map((s) => `${p.sdkName}:${s.name}`)) }
}

/**
 * File a skill, or switch it. One skill holds a category: switching one on there switches the others in it off,
 * since two skills for one job compete on their descriptions. The skills to file are the installed ones.
 */
export function fileSkill(f: FactorySettings, key: string, change: SkillSetting, list: Installed[]): FactorySettings {
  if (change.category != null && !CATEGORY_KEYS.has(change.category)) throw new PlanError(`no category ${change.category}`)
  const all = list.flatMap((p) => p.skills.map((s) => s.key))
  if (!all.includes(key)) throw new PlanError(`no skill ${key}`)
  const skills = { ...(f.skills ?? {}), [key]: { ...(f.skills?.[key] ?? {}), ...change } }
  const category = skillCategory(key, { skills })
  if (category && skillOn(key, { skills })) {
    for (const other of all) if (other !== key && skillCategory(other, { ...f, skills }) === category) skills[other] = { ...(skills[other] ?? {}), on: false }
  }
  return { ...f, skills }
}

async function settingsFor(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  const [w] = a ? await db.select().from(workspace).where(eq(workspace.id, a.workspaceId)) : []
  return { factory: ((w?.settings ?? {}) as FactorySettings), app: ((a?.setup ?? {}) as { plugins?: AppPlugins }).plugins ?? {} }
}

/**
 * A session's plugins, the MCP servers the factory supplies for them, and the skills it may see, named: the plugins'
 * switched-on skills, and the app repo's own (`<cwd>/.claude/skills/`). Named so Claude Code's bundled skills
 * (schedule, loop, update-config…) and switched-off ones stay out.
 */
export async function skillOptions(role: Role, cwd: string, appId: string): Promise<{ plugins: SdkPluginConfig[]; mcpServers: Record<string, McpServerConfig>; skills: string[] }> {
  const s = await settingsFor(appId)
  const r = resolvePlugins(installed(), s.factory, s.app, role)
  return {
    plugins: r.plugins.map((p) => ({ type: 'local', path: p.path })),
    mcpServers: Object.assign({}, ...r.plugins.map((p) => (p.shim ? SHIMS[p.id].mcpServers : {}))),
    skills: [...r.skills, ...skillDirs(join(cwd, '.claude', 'skills'))],
  }
}

/** The app layer: the skills in an app repo's own `.claude/skills/`. */
export const appSkills = (repoPath: string) => readSkills(join(repoPath, '.claude', 'skills'), null)

/** The factory's plugins for Settings: each with its switches, its skills filed, and REA's tools by rating. */
export function describePlugins(f: FactorySettings) {
  return installed().map((p) => ({
    id: p.id, name: p.name, version: p.version, description: p.description, source: p.source, builtIn: p.builtIn,
    on: pluginOn(p.id, f), roles: pluginRoles(p.id, f), mcpServers: p.mcpServers, note: p.shim,
    skills: p.skills.map((s) => ({ ...s, category: skillCategory(s.key, f), on: skillOn(s.key, f) })),
    tools: p.id === 'rea@rea' && p.shim ? reaTools() : null,
  }))
}

// The installer: the SDK's own Claude Code binary, pointed at the factory's config dir.
const execFileP = promisify(execFile)
function claudeBinary() {
  try { return createRequire(createRequire(import.meta.url).resolve('@anthropic-ai/claude-agent-sdk')).resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude`) } catch { return 'claude' }
}

async function plugin(args: string[]): Promise<{ outcome?: string; message?: string; pluginId?: string }> {
  // No -y: a plugin whose install runs a command is refused and reported, not run.
  const r = await execFileP(claudeBinary(), ['plugin', ...args, '--json'], { env: { ...process.env, CLAUDE_CONFIG_DIR: PLUGINS_HOME }, timeout: 300_000 })
    .catch((e: { stdout?: string; stderr?: string; message: string }) => ({ stdout: e.stdout ?? '', stderr: e.stderr || e.message }))
  const line = r.stdout.trim().split('\n').pop() ?? ''
  try { return JSON.parse(line) } catch { return { outcome: 'error', message: (r.stderr || line || 'the installer said nothing').trim() } }
}

/** Install a plugin from a marketplace: owner/repo, a git or https URL, or a path. */
export async function installPlugin(marketplace: string, name: string) {
  if (!marketplace.trim() || !name.trim()) throw new PlanError('a plugin needs a marketplace and a name')
  const r = await plugin(['install', name.trim(), '--marketplace', marketplace.trim()])
  if (r.outcome !== 'ok') throw new PlanError(r.message ?? `could not install ${name}`)
  return r.pluginId ?? name
}

export async function removePlugin(id: string) {
  if (id === 'self-evident') throw new PlanError("Self Evident's own plugin is built in; switch it off instead")
  const r = await plugin(['uninstall', id])
  if (r.outcome !== 'ok') throw new PlanError(r.message ?? `could not uninstall ${id}`)
}

/** Forget what was set for a plugin that is gone: its switches and its skills' filing. */
export function forgetPlugin(f: FactorySettings, id: string): FactorySettings {
  const { [id]: _, ...plugins } = f.plugins ?? {}
  return { ...f, plugins, skills: Object.fromEntries(Object.entries(f.skills ?? {}).filter(([k]) => !k.startsWith(`${id}/`))) }
}

/**
 * REA's tools rated from REA's own catalogue (the MCP annotations each tool declares), never a list kept here.
 * Reading, or local work that changes nothing, is free; changing REA's own session or writing an export, or reaching
 * outside (a browser, a device, an external analyser), is moderate; running or changing the target is expensive.
 * A tool the catalogue does not know is expensive.
 */
type Hints = { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean }
let catalogue: Map<string, Hints> | null = null
const reaCatalogue = () => catalogue ??= new Map((JSON.parse(readFileSync(join(REA_ROOT, 'dist', 'mcp-catalog.json'), 'utf8')).tools as { name: string; annotations?: Hints }[]).map((t) => [t.name, t.annotations ?? {}]))

export function reaRisk(name: string): { risk: Risk; why: string } {
  const h = reaCatalogue().get(name)
  if (!h) return { risk: 'expensive', why: `REA's catalogue does not know ${name}` }
  if (h.readOnlyHint || (!h.destructiveHint && !h.openWorldHint)) return { risk: 'free', why: 'REA reads the target' }
  if (h.destructiveHint && h.openWorldHint) return { risk: 'expensive', why: 'REA runs, drives or changes the target' }
  if (h.openWorldHint) return { risk: 'moderate', why: 'REA reaches outside: a browser, a device or an external analyser' }
  return { risk: 'moderate', why: "REA changes its own session or writes an export" }
}

function reaTools() {
  const ratings = { free: 0, moderate: 0, expensive: 0 } as Record<Risk, number>
  for (const name of reaCatalogue().keys()) ratings[reaRisk(name).risk]++
  return { count: reaCatalogue().size, ratings }
}
