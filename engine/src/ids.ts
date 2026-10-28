import { customAlphabet } from 'nanoid'

// Prefixed short IDs, readable in logs and URLs: task_x7Kq3mNp2v, idea_…
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const nano = customAlphabet(alphabet, 12)

export const PREFIXES = {
  workspace: 'ws', user: 'usr', app: 'app', repo: 'repo', provider: 'prov', idea: 'idea', project: 'proj',
  decision: 'dec', question: 'q', task: 'task', phase: 'ph', session: 'sess', run: 'run', pr: 'pr', verification: 'ver', backlog: 'bl', todo: 'todo', issue: 'iss', initiative: 'init', cycle: 'cyc', skill: 'sk',
} as const

export type Kind = keyof typeof PREFIXES

export function newId(kind: Kind): string {
  return `${PREFIXES[kind]}_${nano()}`
}

export function kindOf(id: string): Kind | null {
  const prefix = id.split('_')[0]
  const found = (Object.entries(PREFIXES) as [Kind, string][]).find(([, p]) => p === prefix)
  return found ? found[0] : null
}

/** An app's key, the prefix of its issues (HG in HG-12): its initials, or its first letters, unique in the workspace. */
export function appKey(name: string, taken: string[]) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const base = (words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? 'APP').slice(0, 3)).toUpperCase().slice(0, 4) || 'APP'
  if (!taken.includes(base)) return base
  for (let n = 2; ; n++) if (!taken.includes(`${base}${n}`)) return `${base}${n}`
}
