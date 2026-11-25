/** Apart from pr-review.ts because nothing here needs the computer: the Reviews page reads what the person typed with it. */
/**
 * A pull request named by the person, without the list: its number (`412`, `#412`: the app's home repository), a
 * repository and number (`org/repo#412`), or its address on GitHub. Null when it names none of the app's. Pure.
 */
export function namedPull(text: string, repos: string[]): { repo: string; number: number } | null {
  const t = text.trim()
  const url = /github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/.exec(t), short = /^([^/\s#]+\/[^/\s#]+)#(\d+)$/.exec(t), bare = /^#?(\d+)$/.exec(t)
  const hit = url ?? short
  if (hit) { const repo = repos.find((r) => r.toLowerCase() === hit[1].toLowerCase()); return repo ? { repo, number: Number(hit[2]) } : null }
  return bare && repos.length ? { repo: repos[0], number: Number(bare[1]) } : null
}
