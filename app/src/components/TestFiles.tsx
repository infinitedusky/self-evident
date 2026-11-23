/**
 * Test files (engine/src/test-files.ts): what a person needs in their hands to try a change. A CSV to import, a
 * picture to upload, an ID card: any kind, and as many as it takes. The third section of a task's Data step, after
 * its fixtures (what is in the app's database) and its services (what answers outside it). Each is a file and a
 * line saying what to do with it. They go to a reviewer, so whoever adds one says it holds nothing real; text is
 * also read against the real responses on this computer.
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
      <p className="lv-section-note">What a person needs in their hands to try {issueId ? 'this task' : 'the app'}: a file to import, a picture to upload. Each says what to do with it. They go to a reviewer, so they hold nothing real.</p>
      {error && <div className="empty bad" style={{ margin: '8px 0', whiteSpace: 'pre-wrap' }}>{error}</div>}
      {adding && <AddFiles task={!!issueId} onAdd={(files, what) => act(async () => { await engine.addTestFiles(appId, files, { what, issueId: issueId ?? null, stated: true }); setAdding(false) })} onCancel={() => { setAdding(false); setError(null) }} />}
      {!list.length ? !adding && <div className="empty">None yet. Add what the person trying this has to bring: the CSV they import, the picture they upload. Where a file is about someone the mock also answers for, make it the same made-up person in both.</div>
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
          <span className="lv-item-meta" title={f.checked ? `Read against ${f.checked.against} real response${f.checked.against === 1 ? '' : 's'} on this computer: nothing of them is in it` : 'Not text, so it cannot be read for real values: it rests on the word of whoever added it'}>{KIND[f.mediaType] ?? 'File'} · {size(f.bytes)}{f.checked ? ' · checked' : ''}</span>
          <button className="btn quiet small" aria-label={`Say what to do with ${f.name}`} onClick={() => { setWhat(f.what); setEditing(!editing) }}>Edit</button>
          <button className="btn quiet small" aria-label={`Remove ${f.name}`} onClick={onRemove}>×</button>
        </span>
      </div>
      <div className="lv-part">
        {editing ? (
          <form className="mock-edit" style={{ margin: 0 }} onSubmit={(e) => { e.preventDefault(); void onWhat(what.trim()).then(() => setEditing(false)) }}>
            <label>What the person does with it<input autoFocus aria-label={`What to do with ${f.name}`} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Import it on the Employees page" /></label>
            <div className="row"><button className="btn small" type="submit">Save</button><button className="btn quiet small" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
          </form>
        ) : f.what ? <div style={{ fontSize: 14 }}>{f.what}</div> : <div className="lv-sub" style={{ margin: 0 }}>Nothing said yet about what to do with it.</div>}
      </div>
    </div>
  )
}

/** Files chosen, a line on what to do with them, and the word that they hold nothing real. */
function AddFiles({ task, onAdd, onCancel }: { task: boolean; onAdd: (files: File[], what: string) => Promise<void>; onCancel: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [what, setWhat] = useState('')
  const [stated, setStated] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="mock-edit" style={{ margin: '0 0 12px' }} data-component="AddTestFiles">
      <label>The files<input type="file" multiple aria-label="Test files to add" onChange={(e) => setFiles([...(e.target.files ?? [])])} /></label>
      <label>What the person does with {files.length > 1 ? 'them' : 'it'}<input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Import it on the Employees page" /></label>
      <label className="mock-check"><input type="checkbox" checked={stated} onChange={(e) => setStated(e.target.checked)} /> {files.length > 1 ? 'These hold' : 'This holds'} nothing real</label>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>A made-up person, an invented document. It goes to a reviewer as it is. A CSV or other text is also read against the real responses on this computer, and refused while a value of one is in it; a picture cannot be read that way.{task ? ' Added for this task alone.' : ' Added for every task of the app.'}</p>
      <div className="row"><button className="btn small" disabled={!files.length || !stated || busy} onClick={async () => { setBusy(true); try { await onAdd(files, what.trim()) } finally { setBusy(false) } }}>{busy ? 'Adding…' : files.length > 1 ? `Add ${files.length} files` : 'Add it'}</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}
