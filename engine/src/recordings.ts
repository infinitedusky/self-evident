/**
 * Recordings: what a real service really sent back, kept raw, with the task it was made for.
 *
 * Found on Cloaked (Sandy, 2026-11-19, a prototype agent's own account): a real run against the vendor was made
 * early, and only a copy reshaped for a sketch's screen was kept. When the prototype needed a stand-in for that
 * vendor, the raw response was gone: the agent rebuilt the format from an assumption, and two fields the real items
 * carry were dropped without anyone deciding to. A stand-in built on a guess shows the code handles the guess.
 *
 * A prototype has a folder of its own (stand-ins.ts), but a real run is often made before any prototype exists: in
 * research, or for a sketch. So recordings belong to the task (or the idea; else the app): one folder for each,
 * outside every repository, since a real response holds real people's data. Every conversation of that task is
 * given it ($RECORDINGS) and told to save a real response there untouched before doing anything else with it; the
 * task's prototype and its stand-ins are given the same folder, and a stand-in serves from it. It is on this computer
 * only. Discarding a prototype leaves it: it is the task's.
 */
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const recordingsHome = () => process.env.RECORDINGS_HOME ?? join(homedir(), '.self-evident', 'recordings')
/** Where what was recorded for a task, an idea or (neither) the app as a whole is kept. */
export const recordingsOf = (appId: string, subject?: { issueId?: string | null; ideaId?: string | null } | null) =>
  join(recordingsHome(), appId, subject?.issueId || subject?.ideaId || 'app')
/** The folder, made if it is not there. */
export function recordingsDir(appId: string, subject?: { issueId?: string | null; ideaId?: string | null } | null): string {
  const dir = recordingsOf(appId, subject)
  mkdirSync(dir, { recursive: true })
  return dir
}
/** What is in it, newest first: for an agent to see what there is before it assumes a shape. */
export function listRecordings(dir: string): { name: string; bytes: number; at: string }[] {
  const out: { name: string; bytes: number; at: string }[] = []
  const walk = (d: string, prefix: string, left: number) => {
    let names: string[]
    try { names = readdirSync(d) } catch { return }
    for (const n of names) {
      if (n.startsWith('.')) continue
      try { const s = statSync(join(d, n)); if (s.isDirectory()) { if (left > 0) walk(join(d, n), `${prefix}${n}/`, left - 1) } else out.push({ name: `${prefix}${n}`, bytes: s.size, at: s.mtime.toISOString() }) } catch { /* gone meanwhile */ }
    }
  }
  walk(dir, '', 3)
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200)
}

/** What every conversation is told about them. */
export const recordingsPrompt = (dir: string, has: number) => `\n\nRecordings: when you call a real outside service for this work (a vendor's API, another team's service) and get a real response back, save it raw in ${dir} ($RECORDINGS) before you do anything else with it: the whole response exactly as it came (the body, and its status and headers where they matter), in a file named for the service, what was asked and the date. Never only a copy reshaped for a screen: a stand-in is built from the raw one later, and a reshaped copy has lost the format and the fields nobody thought to keep. That folder is this work's own, outside the repository, because a real response holds real people's data: never commit one, and never keep one in /tmp. ${has ? `It holds ${has} file${has === 1 ? '' : 's'} already: look there before you assume what a service sends.` : 'It is empty so far: where you build on a shape nobody recorded, say that it is assumed.'}`
