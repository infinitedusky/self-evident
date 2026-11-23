/**
 * Test files (engine/src/test-files.ts): what a person needs in their hands to try a change. A CSV to import, a
 * picture to upload, an ID card: any kind, and as many as it takes. The third section of a task's Data step, after
 * its fixtures (what is in the app's database) and its services (what answers outside it). Each is a file and a
 * line of context. They go to a reviewer, so whoever adds one says it is made up, or says it is real and a fake is
 * made of it (text only) and kept in its place.
 *
 * In the app's settings these are the app's, for every task. On a task its own are added beside them.
 */
import { useEffect, useState } from 'react'
import { Badge } from './Badge'
import { engine, type TestFile } from '../engine'

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${Math.round(n / 1024)} KB` : `${(n / 1_048_576).toFixed(1)} MB`)
const err = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }
const KIND: Record<string, string> = { 'text/csv': 'CSV', 'application/json': 'JSON', 'application/pdf': 'PDF', 'text/plain': 'Text', 'image/png': 'Picture', 'image/jpeg': 'Picture', 'image/gif': 'Picture', 'image/webp': 'Picture', 'image/svg+xml': 'Picture', 'image/heic': 'Picture' }
const shown = (t: string) => /^image\/(png|jpeg|gif|webp)$/.test(t)

export function TestFiles({ appId, issueId, version = 0 }: { appId: string; /** A task: its own are added beside the app's. None: the app's settings. */ issueId?: string; /** Read again when it changes. */ version?: number }) {
  const [list, setList] = useState<TestFile[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reload = () => engine.testFiles(appId, issueId).then((l) => { setList(l); setError(null) }).catch((e) => { setList([]); setError(err(e)) })
  useEffect(() => { void reload() }, [appId, issueId, version]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!list) return null
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await reload() } catch (e) { setError(err(e)) } }
  return (
    <div className="lv-section" data-component="TestFiles">
      <div className="lv-section-head">
        <h3>Test files{list.length > 0 && <span className="lv-count">{list.length}</span>}</h3>
        <span className="lv-end"><button className="btn quiet small" onClick={() => setAdding(!adding)}>Add files</button></span>
      </div>
      <p className="lv-section-note">Files a tester needs to complete the review{issueId ? '' : ' of any task'}.</p>
      {error && <div className="empty bad" style={{ margin: '8px 0', whiteSpace: 'pre-wrap' }}>{error}</div>}
      {adding && <AddFiles task={!!issueId} onAdd={(files, what, real) => act(async () => { await engine.addTestFiles(appId, files, { what, issueId: issueId ?? null, stated: !real, real }); setAdding(false) })} onCancel={() => { setAdding(false); setError(null) }} />}
      {!list.length ? !adding && <div className="empty">None yet.</div>
        : list.map((f) => <FileItem key={f.id} appId={appId} file={f} onTask={!!issueId}
          onWhat={(what) => act(() => engine.editTestFile(appId, f.id, what))}
          onRemove={() => { if (window.confirm(`Remove ${f.name}?${f.scope === 'app' && issueId ? ' It is the app\'s: every task loses it.' : ''}`)) void act(() => engine.removeTestFile(appId, f.id)) }} />)}
    </div>
  )
}

function FileItem({ appId, file: f, onTask, onWhat, onRemove }: { appId: string; file: TestFile; /** Shown on a task: whose it is, is said. */ onTask: boolean; onWhat: (what: string) => Promise<void>; onRemove: () => void }) {
  const [editing, setEditing] = useState(false)
  const [what, setWhat] = useState(f.what)
  return (
    <div className="lv-item" data-test-file={f.name}>
      <div className="lv-item-head">
        {shown(f.mediaType) && f.here && <img className="tf-thumb" src={engine.testFileUrl(appId, f.id, true)} alt="" />}
        <span className="lv-item-name">{f.here ? <a href={engine.testFileUrl(appId, f.id)} download={f.name} title="Download it">{f.name}</a> : f.name}</span>
        {onTask && (f.scope === 'task' ? <Badge tone="accent">This task's</Badge> : <span className="lv-item-meta">The app's</span>)}
        {!f.here && <Badge tone="bad">Not on this computer</Badge>}
        <span className="lv-end">
          <span className="lv-item-meta" title={f.checked?.faked !== undefined ? `Made from a real file: ${f.checked.faked} value${f.checked.faked === 1 ? '' : 's'} replaced. The real file was not kept` : f.checked ? `Read against ${f.checked.against} real response${f.checked.against === 1 ? '' : 's'} on this computer: nothing of them is in it` : 'Not text, so it cannot be read for real values: it rests on the word of whoever added it'}>{KIND[f.mediaType] ?? 'File'} · {size(f.bytes)}{f.checked?.faked !== undefined ? ' · faked' : f.checked ? ' · checked' : ''}</span>
          <button className="btn quiet small" aria-label={`Say what to do with ${f.name}`} onClick={() => { setWhat(f.what); setEditing(!editing) }}>Edit</button>
          <button className="btn quiet small" aria-label={`Remove ${f.name}`} onClick={onRemove}>×</button>
        </span>
      </div>
      <div className="lv-part">
        {editing ? (
          <form className="mock-edit" style={{ margin: 0 }} onSubmit={(e) => { e.preventDefault(); void onWhat(what.trim()).then(() => setEditing(false)) }}>
            <label>File Context<input autoFocus aria-label={`What to do with ${f.name}`} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Import it on the Employees page" /></label>
            <div className="row"><button className="btn small" type="submit">Save</button><button className="btn quiet small" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
          </form>
        ) : f.what ? <div style={{ fontSize: 14 }}>{f.what}</div> : <div className="lv-sub" style={{ margin: 0 }}>No context yet.</div>}
      </div>
    </div>
  )
}

/** Files chosen, a line of context, and whether they are made up or real: a real one is faked and only the fake kept. */
function AddFiles({ task, onAdd, onCancel }: { task: boolean; onAdd: (files: File[], what: string, real: boolean) => Promise<void>; onCancel: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [what, setWhat] = useState('')
  const [kind, setKind] = useState<'made-up' | 'real' | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="mock-edit" style={{ margin: '0 0 12px' }} data-component="AddTestFiles">
      <label>The files<input type="file" multiple aria-label="Test files to add" onChange={(e) => setFiles([...(e.target.files ?? [])])} /></label>
      <label>File Context<input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Import it on the Employees page" /></label>
      <label className="mock-check"><input type="radio" name="tf-kind" checked={kind === 'made-up'} onChange={() => setKind('made-up')} /> Made up: nothing real in {files.length > 1 ? 'them' : 'it'}</label>
      <label className="mock-check"><input type="radio" name="tf-kind" checked={kind === 'real'} onChange={() => setKind('real')} /> Real: make a fake version and keep only that</label>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>{kind === 'real' ? 'Works for a CSV or other text. A real picture or document cannot be faked here.' : 'A reviewer gets these files.'}{task ? ' Added for this task alone.' : ' Added for every task of the app.'}</p>
      <div className="row"><button className="btn small" disabled={!files.length || !kind || busy} onClick={async () => { setBusy(true); try { await onAdd(files, what.trim(), kind === 'real') } finally { setBusy(false) } }}>{busy ? 'Adding…' : files.length > 1 ? `Add ${files.length} files` : 'Add it'}</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}
