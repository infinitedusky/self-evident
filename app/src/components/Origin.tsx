/**
 * Where a piece of work came from, word for word (LOG.md, "The ticket, word for word"): the ticket as its tracker has
 * it, which every agent on the idea, the project or the task is given whole. Folded: a line saying which ticket it is.
 * Open: its text, its comments oldest first, what it links to, and its images, said kept or not.
 */
import { Md } from './Md'
import type { OriginView } from '../engine'

export function Origin({ origin }: { origin: OriginView }) {
  return (
    <section className="panel origin" data-component="Origin">
      <details>
        <summary>
          <h2 style={{ display: 'inline', margin: 0 }}>Where this came from</h2>{' '}
          <span className="faint">{origin.sourceName} {origin.ref}{origin.comments.length ? ` · ${origin.comments.length} comment${origin.comments.length === 1 ? '' : 's'}` : ''}{origin.files.length ? ` · ${origin.files.length} image${origin.files.length === 1 ? '' : 's'}` : ''} · every agent on it reads this, whole</span>
        </summary>
        <OriginBody origin={origin} />
      </details>
    </section>
  )
}

/** The ticket itself: when it was read, its text, comments, links and images. Also a reference doc's inside (Context.tsx). */
export function OriginBody({ origin }: { origin: OriginView }) {
  const missing = origin.files.filter((f) => !f.kept).length
  return (
    <div className="origin-body">
      <p className="faint" style={{ margin: '8px 0', fontSize: 13 }}>
        As {origin.sourceName} had it {new Date(origin.fetchedAt).toLocaleString()}{origin.url ? <> · <a href={origin.url} target="_blank" rel="noreferrer">open it in {origin.sourceName}</a></> : null}. Never edited here: bringing it in again brings it up to date.
      </p>
      <h3 style={{ margin: '4px 0 6px' }}>{origin.title}</h3>
      {origin.body?.trim() ? <div className="md"><Md text={origin.body} /></div> : <p className="muted">No text beyond its title.</p>}
      {origin.comments.length > 0 && <>
        <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>Comments</h3>
        <ul className="origin-comments">
          {origin.comments.map((c, n) => <li key={n}><div className="faint" style={{ fontSize: 12 }}>{c.author ?? 'Someone'} · {new Date(c.at).toLocaleDateString()}</div><Md text={c.body} /></li>)}
        </ul>
      </>}
      {origin.links.length > 0 && <>
        <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>Links</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{origin.links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer">{l.title}</a></li>)}</ul>
      </>}
      {origin.files.length > 0 && <p className={missing ? 'bad' : 'faint'} style={{ margin: '14px 0 0', fontSize: 13 }}>
        {missing ? `${missing} of its ${origin.files.length} image${origin.files.length === 1 ? '' : 's'} could not be fetched, so the agents can't see ${missing === 1 ? 'it' : 'them'}: ${origin.files.filter((f) => !f.kept).map((f) => f.note ?? 'no reason given').join('; ')}. Bring the ticket in again to retry.` : `Its image${origin.files.length === 1 ? ' is' : 's are'} kept on this computer; the agents open ${origin.files.length === 1 ? 'it' : 'them'}.`}
      </p>}
    </div>
  )
}
