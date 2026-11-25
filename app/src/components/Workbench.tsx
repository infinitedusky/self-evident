/**
 * An app's workbench folder and its hooks, in the app's settings (engine hooks.ts).
 *
 * Sandy, 2026-11-24: "evident has a bunch of different lifecycle events that we can hook into. But they would be
 * defined, they would be stored … in the workbench … You don't want them in the repo itself." What is particular to
 * one app (who a tester is signed in as, say) is a script of that app's, in a folder of ours beside its repositories.
 * Evident knows only the points at which it runs one, and says here which are hooked and how each last went.
 *
 * No folder yet: Evident makes one from its template (engine workbench-seed.ts; Sandy, 2026-11-25: "it should let you
 * create a folder and it would seed it"), where it says or where the person says, or one they already have is chosen.
 * A folder that lacks what a workbench starts with (the docs site, the docs agent's skills) says so, and one press puts
 * that in without touching what is there.
 *
 * Top to bottom: the folder; then each point, hooked or not, with what the script is given and what Evident does
 * with it; its text to read (it is changed in the folder, where it is versioned); its last run.
 */
import { useEffect, useState } from 'react'
import { Badge } from './Badge'
import { engine, type WorkbenchView } from '../engine'

const problemOf = (e: any) => { const m = String(e?.message ?? e); try { return String(JSON.parse(m).error ?? m) } catch { return m } }
const when = (at: string) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const sentence = (xs: string[], last: string) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${last} ${xs[xs.length - 1]}`

export function Workbench({ appId }: { appId: string }) {
  const [v, setV] = useState<WorkbenchView | null>(null)
  const [dir, setDir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<string | null>(null)
  const [where, setWhere] = useState('')
  const take = (x: WorkbenchView) => { setV(x); setDir(x.dir ?? ''); if (!x.dir) setWhere((w) => w || x.seed.suggested || '') }
  useEffect(() => { engine.workbench(appId).then(take).catch((e) => setError(problemOf(e))) }, [appId])
  const put = async (to: string | null) => { setBusy(true); setError(null); try { take(await engine.setWorkbench(appId, to)) } catch (e) { setError(problemOf(e)) } finally { setBusy(false) } }
  const save = () => put(dir.trim() || null)
  // Make the folder from the template, or put into the one named what it lacks; then its dependencies install on their own.
  const seed = async (to?: string) => { setBusy(true); setError(null); try { take(await engine.seedWorkbench(appId, to)) } catch (e) { setError(problemOf(e)) } finally { setBusy(false) } }
  const installing = !!v?.seed.installing
  useEffect(() => { if (!installing) return; const t = window.setInterval(() => { engine.workbench(appId).then(setV).catch(() => {}) }, 2500); return () => window.clearInterval(t) }, [installing, appId])
  // The computer's own folder dialog, as for a repository (it opens on the computer Evident runs on). Choosing is saving.
  const choose = async () => { setBusy(true); setError(null); try { const f = await engine.chooseFolder(v?.dir ?? undefined); if (f.path) { setDir(f.path); await put(f.path) } } catch (e) { setError(problemOf(e)) } finally { setBusy(false) } }
  if (!v) return error ? <div className="empty bad">{error}</div> : <p className="muted">Loading…</p>
  const changed = dir.trim() !== (v.dir ?? '')
  return (
    <section className="panel workbench" data-component="Workbench">
      <h2>Workbench</h2>
      <p className="faint" style={{ marginTop: 0 }}>A folder on this computer, outside the app's repositories, for what is ours about working on this app: scripts, a review kit, mockups. Nothing in it goes into the app's code.</p>
      <div className="workbench-dir">
        <label>The folder<input className="mono" value={dir} disabled={busy} onChange={(e) => setDir(e.target.value)} placeholder="Choose it, or type its path" /></label>
        <button className="btn small" disabled={busy} onClick={() => void choose()}>Choose a folder…</button>
        {changed && <button className="btn quiet small" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : dir.trim() ? 'Save' : 'Take it away'}</button>}
        {v.dir && !changed && (v.found ? <Badge tone="ok">On this computer</Badge> : <Badge tone="warn">Not on this computer</Badge>)}
      </div>
      {!v.dir && (
        <div className="workbench-make" aria-label="Make a workbench">
          <p style={{ margin: 0 }}><strong>There is none yet.</strong> Evident can make it. It starts with {sentence(v.seed.missing, 'and')}, as a git repository of its own.</p>
          <div className="workbench-dir" style={{ margin: 0 }}>
            <label>Where to make it<input className="mono" value={where} disabled={busy} onChange={(e) => setWhere(e.target.value)} placeholder="/the/whole/path/of/a/new/folder" /></label>
            <button className="btn small" disabled={busy || !where.trim()} onClick={() => void seed(where.trim())}>{busy ? 'Making it…' : 'Create the workbench'}</button>
          </div>
          <p className="faint" style={{ margin: 0, fontSize: 12 }}>{v.seed.suggested ? 'Beside the app\'s code, where nothing in it goes into the app.' : 'This app has no code on this computer to put it beside, so say where.'} Or choose a folder you already have, above: what it lacks can be added after.</p>
        </div>
      )}
      {v.dir && !v.found && <p className="workbench-make">There is no folder at <code>{v.dir}</code> on this computer. <button className="btn small" disabled={busy} onClick={() => void seed(v.dir!)}>Make it here</button></p>}
      {v.dir && v.found && v.seed.missing.length > 0 && (
        <p className="workbench-make">This folder does not have {sentence(v.seed.missing, 'or')}. <button className="btn small" disabled={busy} onClick={() => void seed()}>{busy ? 'Adding…' : 'Add what is missing'}</button> <span className="faint" style={{ fontSize: 12 }}>Nothing that is there is changed.</span></p>
      )}
      {v.seed.installing && <p role="status" className="faint">Installing what the docs site needs (<code>pnpm install</code> in the folder). The docs can be started when it is done.</p>}
      {v.seed.problem && <div className="bad" style={{ fontSize: 13 }}>Installing what the docs site needs failed.<pre className="workbench-script">{v.seed.problem}</pre><button className="btn small" disabled={busy} onClick={() => void seed()}>Install again</button></div>}
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
