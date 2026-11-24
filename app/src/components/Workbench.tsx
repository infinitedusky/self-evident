/**
 * An app's workbench folder and its hooks, in the app's settings (engine hooks.ts).
 *
 * Sandy, 2026-11-24: "evident has a bunch of different lifecycle events that we can hook into. But they would be
 * defined, they would be stored … in the workbench … You don't want them in the repo itself." What is particular to
 * one app (who a tester is signed in as, say) is a script of that app's, in a folder of ours beside its repositories.
 * Evident knows only the points at which it runs one, and says here which are hooked and how each last went.
 *
 * Top to bottom: the folder; then each point, hooked or not, with what the script is given and what Evident does
 * with it; its text to read (it is changed in the folder, where it is versioned); its last run.
 */
import { useEffect, useState } from 'react'
import { Badge } from './Badge'
import { engine, type WorkbenchView } from '../engine'

const problemOf = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }
const when = (at: string) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function Workbench({ appId }: { appId: string }) {
  const [v, setV] = useState<WorkbenchView | null>(null)
  const [dir, setDir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<string | null>(null)
  const take = (x: WorkbenchView) => { setV(x); setDir(x.dir ?? '') }
  useEffect(() => { engine.workbench(appId).then(take).catch((e) => setError(problemOf(e))) }, [appId])
  const save = async () => { setBusy(true); setError(null); try { take(await engine.setWorkbench(appId, dir.trim() || null)) } catch (e) { setError(problemOf(e)) } finally { setBusy(false) } }
  if (!v) return error ? <div className="empty bad">{error}</div> : <p className="muted">Loading…</p>
  const changed = dir.trim() !== (v.dir ?? '')
  return (
    <section className="panel workbench" data-component="Workbench">
      <h2>Workbench</h2>
      <p className="faint" style={{ marginTop: 0 }}>A folder on this computer, outside the app's repositories, for what is ours about working on this app: scripts, a review kit, mockups. Nothing in it goes into the app's code.</p>
      <div className="workbench-dir">
        <label>The folder<input className="mono" value={dir} disabled={busy} onChange={(e) => setDir(e.target.value)} placeholder="/Users/you/code/app-workbench" /></label>
        <button className="btn small" disabled={busy || !changed} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        {v.dir && !changed && (v.found ? <Badge tone="ok">On this computer</Badge> : <Badge tone="warn">Not on this computer</Badge>)}
      </div>
      {error && <p className="bad" role="alert">{error}</p>}
      {v.also.length > 0 && <p className="faint" style={{ fontSize: 13 }}>Also in it: {v.also.map((a) => <span key={a.path}>{a.what} at <code>{a.path}</code> </span>)}</p>}

      <h3>Hooks</h3>
      <p className="faint" style={{ marginTop: 0 }}>A hook is a script in the folder's <code>hooks/</code>, named for a point below. Evident runs it at that point and knows nothing of what it does. Write or change one in the folder.</p>
      {!v.dir && <p className="muted">Name the folder to hook into any of these.</p>}
      <ul className="workbench-hooks" aria-label="Hooks">
        {v.hooks.map((h) => (
          <li key={h.point} aria-label={h.point}>
            <div className="workbench-hook-head">
              <code className="workbench-point">{h.point}</code>
              {h.file ? (h.last && !h.last.ok ? <Badge tone="bad">Failed last time</Badge> : <Badge tone="ok">Hooked</Badge>) : <Badge tone="neutral">Not hooked</Badge>}
              {h.file && <span className="faint mono">{h.file}</span>}
              {h.text != null && <button className="lv-act" onClick={() => setShown(shown === h.point ? null : h.point)}>{shown === h.point ? 'Hide the script' : 'Read the script'}</button>}
            </div>
            <div className="workbench-hook-says">{h.when} {h.then}</div>
            <div className="faint" style={{ fontSize: 12 }}>It is run with {h.given.map((g) => <code key={g} style={{ marginRight: 5 }}>${g}</code>)}</div>
            {!h.file && v.dir && <div className="faint" style={{ fontSize: 12 }}>To hook it, add <code>hooks/{h.point}.sh</code> to the folder.</div>}
            {shown === h.point && h.text != null && <pre className="workbench-script" aria-label={`${h.point} script`}>{h.text}</pre>}
            {h.last && (
              <div className={`workbench-last ${h.last.ok ? '' : 'bad'}`} aria-label={`${h.point} last run`}>
                Last run {when(h.last.at)}{h.last.task ? <> for {h.last.task}</> : null}{h.last.place ? <> ({h.last.place === 'smoke' ? 'smoke test' : h.last.place})</> : null}: {h.last.ok ? 'it ran' : 'it failed, so nothing was started'}
                {h.last.ok && h.last.gave?.length ? <>, and gave the start script {h.last.gave.map((g) => <code key={g} style={{ marginRight: 5 }}>{g}</code>)}</> : null}
                {!h.last.ok && h.last.out.length > 0 && <pre className="workbench-script">{h.last.out.join('\n')}</pre>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
