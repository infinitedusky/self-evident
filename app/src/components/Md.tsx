/**
 * Text someone wrote, shown as Markdown (Sandy, 2026-11-12: "make sure that we are formatting md where ever there is
 * text"). A description, a note, a reason, a question: any of them may carry headings, lists, links and code,
 * most of all a task brought in from a Linear ticket. One component so every page reads them the same way.
 *
 * - the default is a block that takes the size and colour of where it is put;
 * - `inline` for a line inside a sentence ("Why A: …"): its paragraph is not a block;
 * - `clamp` for a row in a list: the first few lines, the rest on the thing's own page.
 * Links open in a new tab, so following one never loses the page.
 * - `html` for text written on GitHub (a pull request's message, a comment, a scanner's findings: Sandy, 2026-11-20,
 *   "make sure that all the Wiz findings are formatted"): GitHub lets a comment carry HTML (a table with icons, a
 *   folded section), and without this it showed as its own source. It is rendered and then cleaned to what GitHub
 *   itself allows (rehype-sanitize's list, made after GitHub's): no script, no style, no handler gets through.
 */
import Markdown, { type Components } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

const link: Components['a'] = ({ node: _, ...p }) => <a {...p} target="_blank" rel="noreferrer" />
const BLOCK: Components = { a: link }
const INLINE: Components = { a: link, p: ({ children }) => <>{children} </> }

const HTML = [rehypeRaw, rehypeSanitize] // in this order: made into elements, then cleaned
// The few of GitHub's :names: that bots write in a status line; any other is left as it was written.
const EMOJI: Record<string, string> = { x: '❌', white_check_mark: '✅', heavy_check_mark: '✔️', warning: '⚠️', rotating_light: '🚨', information_source: 'ℹ️', rocket: '🚀', tada: '🎉', bug: '🐛', lock: '🔒', key: '🔑', memo: '📝', eyes: '👀', '+1': '👍', '-1': '👎', red_circle: '🔴', green_circle: '🟢', yellow_circle: '🟡', orange_circle: '🟠', large_blue_circle: '🔵', white_circle: '⚪', no_entry: '⛔', construction: '🚧', hourglass: '⌛', mag: '🔍', shield: '🛡️', package: '📦', sparkles: '✨', fire: '🔥', bulb: '💡' }
const emoji = (t: string) => t.replace(/:([a-z0-9_+-]+):/g, (all, name: string) => EMOJI[name] ?? all)

export function Md({ text, inline, clamp, html, className = '' }: { text?: string | null; inline?: boolean; clamp?: number; /** It was written on GitHub and may carry HTML: rendered, and cleaned to what GitHub allows. */ html?: boolean; className?: string }) {
  if (!text?.trim()) return null
  if (inline) return <span className={`md-text md-inline ${className}`} data-component="Md"><Markdown remarkPlugins={[remarkGfm]} components={INLINE}>{text}</Markdown></span>
  return (
    <div className={`md-text ${clamp ? 'md-clamp' : ''} ${html ? 'md-html' : ''} ${className}`} style={clamp ? { ['--md-lines' as string]: clamp } : undefined} data-component="Md">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={html ? HTML : undefined} components={BLOCK}>{html ? emoji(text) : text}</Markdown>
    </div>
  )
}
