/** Validate: prove it before building (mock-ups, variants, previews) and while building (the checks a build is held to). */
import { useCurrentApp } from '../current-app'

export function Validate() {
  const { app } = useCurrentApp()
  return (
    <>
      <div className="page-head"><div>
        <h1>🧪 Validate{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>Decide fast, on something real, then hold the build to it. Mock-ups and variants before a project runs; stories, tests and clauses while it does.</p>
      </div></div>
      <section className="panel">
        <h2>Today</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Homework Gate's Storybook, every page in every state from the real templates: <a href="http://localhost:6006" target="_blank" rel="noreferrer">localhost:6006</a>.</li>
          <li>The spaced-repetition proof of concept, eight screens with the two open questions as variants: <a href="http://localhost:6008" target="_blank" rel="noreferrer">localhost:6008</a> (homework-gate PR #18).</li>
          <li>Every sub-issue lands only after the app's test command passes on the merged commit; the story suite is part of it.</li>
        </ul>
      </section>
      <section className="panel">
        <h2>Lands here</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><strong>A preview per branch</strong>: the app and its Storybook run from a project's worktree, linked from the project.</li>
          <li><strong>Variants as a first-class thing</strong>: a question is two stories side by side; the pick becomes the decision.</li>
          <li><strong>The decision becomes the checks</strong>: what you agreed to in the mock-up turns into stories, tests and clauses the build is verified against, during and after.</li>
        </ul>
      </section>
    </>
  )
}
