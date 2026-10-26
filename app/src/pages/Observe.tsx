/**
 * Observe: what the app itself says. Its metrics, from its telemetry, and the status of its promises. Not what is
 * happening in Self Evident (that is My Stuff). Learn then tests hypotheses against what is observed here.
 */
import { useCurrentApp } from '../current-app'

export function Observe() {
  const { app } = useCurrentApp()
  return (
    <>
      <div className="page-head"><div>
        <h1>🔭 Observe{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
        <p className="muted" style={{ margin: '4px 0 0', maxWidth: 760 }}>What the app says about itself: its metrics, from its telemetry, and whether its promises hold. Learn tests hypotheses against this.</p>
      </div></div>
      <section className="panel">
        <h2>Metrics</h2>
        <p style={{ margin: 0 }}>Not connected yet. The app's events go to PostHog, but Self Evident does not read them back. Next: read them through PostHog's query API with the app's own key, starting with a handful of metrics per app, each with its value and trend.</p>
      </section>
      <section className="panel">
        <h2>Promises</h2>
        <p style={{ margin: 0 }}>None defined yet. A promise is what must hold, mapped to OpenTelemetry: a <strong>clause</strong> is a span the running app writes as true or false; a <strong>sensor</strong> is a span that measures. Each will show here with whether it holds right now.</p>
      </section>
    </>
  )
}
