/**
 * Text someone wrote, shown as Markdown (Sandy, 2026-11-12: "make sure that we are formatting md where ever there is
 * text"). A description, a note, a reason, a question: any of them may carry headings, lists, links and code,
 * most of all a task brought in from a Linear ticket. One component so every page reads them the same way.
 *
 * - the default is a block that takes the size and colour of where it is put;
 * - `inline` for a line inside a sentence ("Why A: …"): its paragraph is not a block;
 * - `clamp` for a row in a list: the first few lines, the rest on the thing's own page.
 * Links open in a new tab, so following one never loses the page.
 */
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const link: Components['a'] = ({ node: _, ...p }) => <a {...p} target="_blank" rel="noreferrer" />
const BLOCK: Components = { a: link }
const INLINE: Components = { a: link, p: ({ children }) => <>{children} </> }

export function Md({ text, inline, clamp, className = '' }: { text?: string | null; inline?: boolean; clamp?: number; className?: string }) {
  if (!text?.trim()) return null
  if (inline) return <span className={`md-text md-inline ${className}`} data-component="Md"><Markdown remarkPlugins={[remarkGfm]} components={INLINE}>{text}</Markdown></span>
  return (
    <div className={`md-text ${clamp ? 'md-clamp' : ''} ${className}`} style={clamp ? { ['--md-lines' as string]: clamp } : undefined} data-component="Md">
      <Markdown remarkPlugins={[remarkGfm]} components={BLOCK}>{text}</Markdown>
    </div>
  )
}
