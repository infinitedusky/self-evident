/**
 * What every plan in an app must cover: telemetry, tests, a test plan, docs, and whatever else the app asks for. The
 * list itself is kept on Settings › Skills, with everything else a build is held to (StepContracts.tsx); this is how
 * a task's plan answers each one. After a team's "definition of done": a short list, the same for every change.
 */

export interface RequirementRow { key: string; name: string; what: string; on: boolean }
/** How a task's plan covers one requirement, as the planner said. */
export interface CoveredRow { key: string; name: string; applies: boolean; how: string }

/** On a task: how its plan covers each requirement in force. */
export function PlanCovers({ list }: { list: CoveredRow[] }) {
  if (!list.length) return null
  return (
    <section className="panel" data-component="PlanCovers">
      <h2>What the plan covers</h2>
      <p className="faint" style={{ margin: '0 0 8px', fontSize: 13 }}>What this app asks of every plan, and how this one answers. The same list goes on the pull request.</p>
      <ul className="list" style={{ margin: 0 }}>
        {list.map((c) => (
          <li key={c.key}>
            <strong>{!c.how ? '⬜' : c.applies ? '✅' : '➖'} {c.name}</strong>{!c.how ? '' : c.applies ? '' : ' · does not apply'}
            <div className="muted" style={{ fontSize: 13 }}>{c.how || 'The plan does not say.'}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}
