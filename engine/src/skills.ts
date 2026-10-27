/**
 * Skills, by role. Two layers (LOG.md, "Skills in two layers"): an app repo's `.claude/skills/` is about working on
 * that app and arrives with `settingSources: ['project']`; this module is the other layer, what the factory brings to
 * every app, as Agent SDK plugins. A skill loads when its description matches the situation; this module only says
 * which plugins each role gets. The builder gets none: it builds what the plan says.
 *
 *   engine/plugin/   Self Evident's own skills (none yet; a skill is a folder under skills/)
 *   rea-agents       REA: reverse engineering another product's shipped code (its skill, and its MCP server)
 */
import type { McpServerConfig, SdkPluginConfig } from '@anthropic-ai/claude-agent-sdk'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import type { Risk } from './risk.js'

export type Role = 'talk' | 'planner' | 'builder'
type Source = 'self-evident' | 'rea-agents'

const OWN_PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin')
const REA_ROOT = dirname(createRequire(import.meta.url).resolve('rea-agents/package.json'))
const PLUGIN_ROOT: Record<Source, string> = { 'self-evident': OWN_PLUGIN, 'rea-agents': REA_ROOT }

/** Which of the factory's plugins each role gets. The builder builds what the plan says. */
export const ROLE_PLUGINS: Record<Role, Source[]> = { talk: ['self-evident', 'rea-agents'], planner: ['self-evident', 'rea-agents'], builder: [] }

/** Skill folders under a directory; a missing directory has none. */
const skillDirs = (dir: string) => { try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { return [] } }

/**
 * The plugins, the MCP servers they need, and the skills the session may see, named: its plugins', and the app
 * repo's own (`<cwd>/.claude/skills/`). Named so Claude Code's bundled skills (schedule, loop, update-config…) stay out.
 */
export function skillOptions(role: Role, cwd: string): { plugins: SdkPluginConfig[]; mcpServers: Record<string, McpServerConfig>; skills: string[] } {
  const sources = ROLE_PLUGINS[role]
  return {
    plugins: sources.map((src) => ({ type: 'local', path: PLUGIN_ROOT[src] })),
    // REA 6.8.0 ships its skill without a plugin manifest, so its server is started here; same Node as the engine.
    mcpServers: sources.includes('rea-agents') ? { rea: { type: 'stdio', command: process.execPath, args: [join(REA_ROOT, 'scripts', 'rea.mjs'), 'mcp'] } } : {},
    skills: [
      ...sources.flatMap((src) => skillDirs(join(PLUGIN_ROOT[src], 'skills')).map((n) => `${src}:${n}`)),
      ...skillDirs(join(cwd, '.claude', 'skills')),
    ],
  }
}

export interface SkillInfo { name: string; description: string; source: Source | 'app' }

/** Each skill under a directory, named and described from its SKILL.md frontmatter. */
function readSkills(dir: string, source: SkillInfo['source']): SkillInfo[] {
  return skillDirs(dir).map((d) => {
    let meta: { name?: string; description?: string } = {}
    try { meta = parse(readFileSync(join(dir, d, 'SKILL.md'), 'utf8').split(/^---\s*$/m)[1] ?? '') ?? {} } catch { /* no SKILL.md, or no frontmatter */ }
    return { name: source === 'app' ? d : `${source}:${d}`, description: meta.description ?? '', source }
  })
}

/** The app-wide layer, for Settings: each plugin, its skills, who gets it, and REA's tools by rating. */
export function describeSkills() {
  const reaVersion = JSON.parse(readFileSync(join(REA_ROOT, 'package.json'), 'utf8')).version as string
  const ratings = { free: 0, moderate: 0, expensive: 0 } as Record<Risk, number>
  for (const name of reaCatalogue().keys()) ratings[reaRisk(name).risk]++
  const plugins = (Object.keys(PLUGIN_ROOT) as Source[]).map((source) => ({
    name: source,
    version: source === 'rea-agents' ? reaVersion : null,
    roles: (Object.keys(ROLE_PLUGINS) as Role[]).filter((r) => ROLE_PLUGINS[r].includes(source)),
    skills: readSkills(join(PLUGIN_ROOT[source], 'skills'), source),
  }))
  return { roles: ROLE_PLUGINS, plugins, rea: { version: reaVersion, tools: reaCatalogue().size, ratings } }
}

/** The app layer: the skills in an app repo's own `.claude/skills/`. */
export const appSkills = (repoPath: string) => readSkills(join(repoPath, '.claude', 'skills'), 'app')

/**
 * REA's tools rated from REA's own catalogue (the MCP annotations each tool declares), never a list kept here.
 * Reading, or local work that changes nothing, is free; changing REA's own session or writing an export, or reaching
 * outside (a browser, a device, an external analyser), is moderate; running or changing the target is expensive.
 * A tool the catalogue does not know is expensive.
 */
type Hints = { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean }
let catalogue: Map<string, Hints> | null = null
const reaCatalogue = () => catalogue ??= new Map((JSON.parse(readFileSync(join(REA_ROOT, 'dist', 'mcp-catalog.json'), 'utf8')).tools as { name: string; annotations?: Hints }[]).map((t) => [t.name, t.annotations ?? {}]))
const hintsOf = (name: string) => reaCatalogue().get(name)

export function reaRisk(name: string): { risk: Risk; why: string } {
  const h = hintsOf(name)
  if (!h) return { risk: 'expensive', why: `REA's catalogue does not know ${name}` }
  if (h.readOnlyHint || (!h.destructiveHint && !h.openWorldHint)) return { risk: 'free', why: 'REA reads the target' }
  if (h.destructiveHint && h.openWorldHint) return { risk: 'expensive', why: 'REA runs, drives or changes the target' }
  if (h.openWorldHint) return { risk: 'moderate', why: 'REA reaches outside: a browser, a device or an external analyser' }
  return { risk: 'moderate', why: "REA changes its own session or writes an export" }
}
