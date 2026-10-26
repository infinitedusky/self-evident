import { Link } from 'react-router'
import type { Idea } from '../ideas'
import { LANES } from '../ideas'
import { Badge } from '../components/Badge'

/** One idea: what we believe, how it's measured, the PRs that build it, and the evidence so far. */
export function IdeaPage({ idea }: { idea: Idea }) {
  const lane = LANES.find((l) => l.id === idea.lane)!
  return (
    <>
      <p className="mono"><Link to="/ideas">← Ideas</Link></p>
      <div className="page-head">
        <div>
          <h1>{idea.title}</h1>
          <div className="row" style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Badge tone={idea.lane === 'building' ? 'accent' : idea.lane === 'testing' ? 'warn' : 'neutral'} dot>{lane.label}</Badge>
            {idea.app && <Badge>{idea.app}</Badge>}
            {idea.lookBy && <Badge>look by {idea.lookBy}</Badge>}
          </div>
        </div>
      </div>

      <section className="panel">
        <h2>The bet</h2>
        <dl className="fields">
          <dt>Hypothesis</dt><dd>{idea.hypothesis || <span className="faint">Not written yet.</span>}</dd>
          <dt>Measured by</dt><dd>{idea.measure || <span className="faint">Not decided yet.</span>}</dd>
          <dt>Baseline</dt><dd>{idea.baseline || <span className="faint">None recorded.</span>}</dd>
        </dl>
      </section>

      <section className="panel">
        <h2>Telemetry</h2>
        <div className="empty">Not connected yet. When PostHog is connected, the metrics behind this idea — for, against,
          and the ones it builds on — show here, with the baseline and where they are now.</div>
      </section>

      <section className="panel">
        <h2>The loop it ran</h2>
        {idea.prs.length ? (
          <ul className="list">{idea.prs.map((pr) => (
            <li key={pr}><a href={pr} target="_blank" rel="noreferrer">{pr.replace('https://github.com/', '')}</a></li>
          ))}</ul>
        ) : <div className="empty">No PRs yet.</div>}
      </section>

      <section className="panel">
        <h2>Evidence</h2>
        <div className="empty">Evidence and verdicts are state, so they live in the factory's database, not in the idea file.
          The database isn't connected yet.</div>
      </section>

      {idea.notes && <section className="panel"><h2>Notes</h2><p style={{ margin: 0 }}>{idea.notes}</p></section>}
    </>
  )
}
