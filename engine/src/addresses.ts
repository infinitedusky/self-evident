/**
 * A page that calls an address fixed to this computer (Sandy, 2026-11-20, after an app's set-up gave its frontend
 * `http://localhost:<port>/api`: "the reason I need to make this change seems like something that should be
 * universally set for Evident, not just on this project").
 *
 * What is run here is opened at more than one address: its own port, a shared link, the page on a phone. A page
 * whose code names `http://localhost:…` for its API loads at one of them and nowhere else, and when the port is not
 * its own it may be talking to another copy altogether (main, another prototype). Which variable an app reads for
 * that is the app's, so Evident cannot set it; it can look, and say so.
 *
 * When a prototype or a smoke test first answers, its page and the scripts the page names are read once (a few, each
 * capped) for absolute addresses on this computer. What is found is said on the page beside the view, as a port the
 * server chose itself already is (ports.ts), with what to do: call it by a path. It is a look at text, so it can be
 * wrong both ways: an address in a comment is reported, one put together at run time is not.
 */
const LOCAL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::(\d{2,5}))?(\/[A-Za-z0-9._~%@-]*)?/gi
/** Where a dev server talks to itself: not a call the page makes for the app. */
const TOOLING = /^\/(@vite|@id|@fs|@react-refresh|__vite|node_modules|sockjs-node|webpack|_next\/webpack-hmr|__webpack_hmr)/

/** The absolute addresses on this computer a text names, each as its origin and first path segment, in order met. Pure. */
export function localAddresses(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(LOCAL)) {
    const path = m[2] && m[2] !== '/' ? m[2] : ''
    if (TOOLING.test(path)) continue
    const at = `${m[0].slice(0, m[0].length - (m[2]?.length ?? 0))}${path}`.replace(/^(https?:\/\/)(127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i, '$1localhost')
    if (!out.includes(at)) out.push(at)
  }
  return out
}

export type Get = (url: string) => Promise<string | null>
const MAX_SCRIPTS = 12, MAX_BYTES = 3_000_000
const httpGet: Get = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { accept: 'text/html,application/javascript,*/*' } })
    if (!r.ok) return null
    const type = r.headers.get('content-type') ?? ''
    if (!/html|javascript|ecmascript|json|text/.test(type)) return null
    return (await r.text()).slice(0, MAX_BYTES)
  } catch { return null }
}

/**
 * What a running page calls that is fixed to this computer: read from its HTML and the scripts it names on its own
 * address. Its own address as the page's home (a link to itself, a canonical tag) is not a call and is left out.
 */
export async function fixedAddresses(base: string, get: Get = httpGet): Promise<string[]> {
  const home = base.replace(/\/$/, '')
  const html = await get(home)
  if (!html) return []
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])
    .map((src) => { try { return new URL(src, `${home}/`).toString() } catch { return null } })
    .filter((u): u is string => !!u && u.startsWith(home) && !TOOLING.test(new URL(u).pathname)).slice(0, MAX_SCRIPTS)
  const texts = [html, ...(await Promise.all(scripts.map((u) => get(u)))).filter((t): t is string => !!t)]
  const found: string[] = []
  for (const t of texts) for (const a of localAddresses(t)) if (a !== home && !found.includes(a)) found.push(a)
  return found.slice(0, 5)
}

const looked = new Map<string, { at: number; base: string; found: string[] }>()
const AGAIN_MS = 5 * 60_000
/** The same, looked at once when it comes up and again every few minutes, per thing that runs (`key`). `first` is told the first time something is found. */
export async function fixedOf(key: string, base: string, first?: (found: string[]) => unknown, get: Get = httpGet): Promise<string[]> {
  const was = looked.get(key)
  if (was && was.base === base && Date.now() - was.at < AGAIN_MS) return was.found
  looked.set(key, { at: Date.now(), base, found: was?.base === base ? was.found : [] }) // marked before the look: the page is asked about many times a second while it comes up
  const found = await fixedAddresses(base, get).catch(() => [])
  looked.set(key, { at: Date.now(), base, found })
  if (found.length && !(was?.base === base && was.found.length)) await Promise.resolve(first?.(found)).catch(() => {})
  return found
}
export const forgetFixed = (key: string) => { looked.delete(key) }

/** What the page is told. `base`: where this one runs, to tell its own port from another's. */
export function fixedSays(found: string[], base: string): string {
  const own = (() => { try { return new URL(base).port } catch { return '' } })()
  const other = found.filter((a) => { try { return new URL(a).port !== own } catch { return false } })
  const named = found.map((a) => `\`${a}\``).join(', ')
  return `Its page names ${found.length === 1 ? 'an address' : 'addresses'} fixed to this computer: ${named}. Opened any other way (a shared link, the phone) it will not reach ${found.length === 1 ? 'it' : 'them'}.${other.length ? ` ${other.length === found.length ? (found.length === 1 ? 'It is' : 'They are') : `${other.length} of them ${other.length === 1 ? 'is' : 'are'}`} not on this run's port (${own}), so it may be talking to another copy: main, or another prototype.` : ''} Have the app call it by a path (\`/api\`) so it follows whatever address the page was opened at; which setting that is belongs to the app, so its set-up's script is where to change it.`
}
