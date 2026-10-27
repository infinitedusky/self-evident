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
import type { Risk } from './risk.js'

export type Role = 'talk' | 'planner'

const OWN_PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin')
const REA_ROOT = dirname(createRequire(import.meta.url).resolve('rea-agents/package.json'))

/** Skill folders under a directory; a missing directory has none. */
const skillDirs = (dir: string) => { try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { return [] } }

/**
 * The plugins, the MCP servers they need, and the skills the session may see, named: ours, REA's, and the app repo's
 * own (`<cwd>/.claude/skills/`). Named so Claude Code's bundled skills (schedule, loop, update-config…) stay out.
 */
export function skillOptions(_role: Role, cwd: string): { plugins: SdkPluginConfig[]; mcpServers: Record<string, McpServerConfig>; skills: string[] } {
  return {
    plugins: [{ type: 'local', path: OWN_PLUGIN }, { type: 'local', path: REA_ROOT }],
    // REA 6.8.0 ships its skill without a plugin manifest, so its server is started here; same Node as the engine.
    mcpServers: { rea: { type: 'stdio', command: process.execPath, args: [join(REA_ROOT, 'scripts', 'rea.mjs'), 'mcp'] } },
    skills: [
      ...skillDirs(join(OWN_PLUGIN, 'skills')).map((n) => `self-evident:${n}`),
      ...skillDirs(join(REA_ROOT, 'skills')).map((n) => `rea-agents:${n}`),
      ...skillDirs(join(cwd, '.claude', 'skills')),
    ],
  }
}

/**
 * REA's tools rated from REA's own catalogue (the MCP annotations each tool declares), never a list kept here.
 * Reading, or local work that changes nothing, is free; changing REA's own session or writing an export, or reaching
 * outside (a browser, a device, an external analyser), is moderate; running or changing the target is expensive.
 * A tool the catalogue does not know is expensive.
 */
type Hints = { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean }
let catalogue: Map<string, Hints> | null = null
const hintsOf = (name: string) => {
  catalogue ??= new Map((JSON.parse(readFileSync(join(REA_ROOT, 'dist', 'mcp-catalog.json'), 'utf8')).tools as { name: string; annotations?: Hints }[]).map((t) => [t.name, t.annotations ?? {}]))
  return catalogue.get(name)
}

export function reaRisk(name: string): { risk: Risk; why: string } {
  const h = hintsOf(name)
  if (!h) return { risk: 'expensive', why: `REA's catalogue does not know ${name}` }
  if (h.readOnlyHint || (!h.destructiveHint && !h.openWorldHint)) return { risk: 'free', why: 'REA reads the target' }
  if (h.destructiveHint && h.openWorldHint) return { risk: 'expensive', why: 'REA runs, drives or changes the target' }
  if (h.openWorldHint) return { risk: 'moderate', why: 'REA reaches outside: a browser, a device or an external analyser' }
  return { risk: 'moderate', why: "REA changes its own session or writes an export" }
}
