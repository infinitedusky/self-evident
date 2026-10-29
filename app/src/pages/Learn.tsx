/** Learn: what the running app says, turned into what's true. The page exists before its content so the loop is whole in the nav. */
import { useCurrentApp } from '../current-app'

export function Learn() {
  const { app } = useCurrentApp()
  return (
    <>
      <div className="page-head"><div>
        <h1>🧠 Learn{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>What the running app says, turned into what's true: baselines, evidence per idea, the guard after a merge.</p>
      </div></div>
      <section className="panel">
        <h2>Today</h2>
        <p style={{ margin: 0 }}>Homework Gate sends every night as counts, timings and outcomes to PostHog (project 677236): gate changes, tutor replies, work checks, quiz results, parent actions, model calls. Nothing reads it back yet.</p>
      </section>
      <section className="panel">
        <h2>Lands here</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><strong>Evidence per idea</strong>: the baseline captured when an idea is kept, the finding after it ships, the verdict.</li>
          <li><strong>The guard</strong>: a sensor compared against its baseline after a merge; a breach reverts the PR or opens a fix task.</li>
          <li><strong>Clauses and sensors</strong>: the promises the app asserts about itself, as OpenTelemetry spans into PostHog.</li>
        </ul>
      </section>
    </>
  )
}
