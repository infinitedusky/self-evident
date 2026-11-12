/**
 * How a task or phase reads: the description first (for a person: what will be different), then the brief (for the
 * builder: Markdown, folded). A brief written before descriptions existed shows its first sentence as the lead.
 */
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Md } from './Md'

const firstSentence = (s: string) => (s.match(/^[\s\S]*?[.!?](\s|$)/)?.[0] ?? s.slice(0, 200)).trim()

export function Brief({ description, brief, open }: { description?: string | null; brief?: string | null; open?: boolean }) {
  const lead = description?.trim() || (brief ? firstSentence(brief) : '')
  return (
    <div className="brief-block" data-component="Brief">
      {lead ? <Md text={lead} className="brief-lead" /> : <p className="faint">No description yet.</p>}
      {brief && (
        <details open={open}>
          <summary className="faint">For the builder</summary>
          <div className="md"><Markdown remarkPlugins={[remarkGfm]}>{brief}</Markdown></div>
        </details>
      )}
    </div>
  )
}
