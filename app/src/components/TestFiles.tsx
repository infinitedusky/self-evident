/**
 * Files (engine/src/test-files.ts): what a tester brings to a task. A CSV to import, a picture to upload, an ID
 * card: any kind, and as many as it takes. The second part of the Fixtures section, after the database: the
 * database is what the app starts with, the files are what is added to it in the test (Sandy, 2026-11-23: "a
 * fixture section where we have database and then … files").
 *
 * A file has up to two versions, as an endpoint's data has: the real one, on this computer only, and the fake.
 * A prototype and a smoke test say which they use; a reviewer gets the fake, always. A made-up file is the one
 * version everywhere.
 *
 * In the app's settings these are the app's, for every task. On a task its own are added beside them.
 */
import { useEffect, useRef, useState } from 'react'
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
    <div className="lv-group" data-component="TestFiles">
      <div className="lv-group-head">
        <h4>Files{list.length > 0 && <span className="lv-count">{list.length}</span>}</h4>
        <span className="lv-end"><button className="btn quiet small" onClick={() => setAdding(!adding)}>Add files</button></span>
      </div>
      <p className="lv-section-note">Files a tester needs to complete the review{issueId ? '' : ' of any task'}. A prototype and a smoke test are given them in a folder when they start.</p>
      {error && <div className="empty bad" style={{ margin: '8px 0', whiteSpace: 'pre-wrap' }}>{error}</div>}
      {adding && <AddFiles task={!!issueId} onAdd={(files, what, real) => act(async () => { await engine.addTestFiles(appId, files, { what, issueId: issueId ?? null, stated: !real, real }); setAdding(false) })} onCancel={() => { setAdding(false); setError(null) }} />}
      {!list.length ? !adding && <div className="empty">None yet.</div>
        : list.map((f) => <FileItem key={f.id} appId={appId} file={f} onTask={!!issueId}
          onWhat={(what) => act(() => engine.editTestFile(appId, f.id, { what }))}
          onUse={(place, v) => act(() => engine.editTestFile(appId, f.id, { use: { [place]: v } }))}
          onFake={(file) => act(() => engine.addTestFiles(appId, [new File([file], f.name, { type: file.type })], { what: f.what, issueId: f.scope === 'task' ? issueId ?? null : null, stated: true }))}
          onRemove={() => { if (window.confirm(`Remove ${f.name}?${f.scope === 'app' && issueId ? ' It is the app\'s: every task loses it.' : ''}`)) void act(() => engine.removeTestFile(appId, f.id)) }} />)}
    </div>
  )
}

function FileItem({ appId, file: f, onTask, onWhat, onUse, onFake, onRemove }: { appId: string; file: TestFile; /** Shown on a task: whose it is, is said. */ onTask: boolean; onWhat: (what: string) => Promise<void>; onUse: (place: 'prototype' | 'smoke', v: 'fake' | 'real') => Promise<void>; /** A made-up version given for one that has only its real one. */ onFake: (file: File) => Promise<void>; onRemove: () => void }) {
  const [editing, setEditing] = useState(false)
  const [what, setWhat] = useState(f.what)
  const pick = useRef<HTMLInputElement>(null)
  const kind = `${KIND[f.mediaType] ?? 'File'} · ${size(f.bytes)}`
  const Use = ({ place, name }: { place: 'prototype' | 'smoke'; name: string }) => (
    <div><strong>{name}</strong>
      <select aria-label={`The version of ${f.name} a ${name.toLowerCase()} uses`} value={f.use[place] ?? 'none'} onChange={(e) => void onUse(place, e.target.value as 'fake' | 'real')}>
        {f.has.fake ? <option value="fake">The fake</option> : <option value="none" disabled>Nothing: no fake yet</option>}
        <option value="real">The real one</option>
      </select>
      {f.use[place] === 'real' && <div className="lv-sub">This computer only</div>}
    </div>
  )
  return (
    <div className="lv-item" data-test-file={f.name}>
      <div className="lv-item-head">
        {shown(f.mediaType) && f.here && <img className="tf-thumb" src={engine.testFileUrl(appId, f.id, true)} alt="" />}
        <span className="lv-item-name">{f.name}</span>
        {onTask && (f.scope === 'task' ? <Badge tone="accent">This task's</Badge> : <span className="lv-item-meta">The app's</span>)}
        {!f.here && <Badge tone="bad">Not on this computer</Badge>}
        <span className="lv-end">
          {!f.has.real && <span className="lv-item-meta" title={f.checked ? `Read against ${f.checked.against} real response${f.checked.against === 1 ? '' : 's'} on this computer: nothing of them is in it` : 'Not text, so it cannot be read for real values: it rests on the word of whoever added it'}>{kind}{f.checked ? ' · checked' : ''}</span>}
          {!f.has.real && f.has.fake && <a className="btn quiet small" href={engine.testFileUrl(appId, f.id)} download={f.name} aria-label={`Download ${f.name}`}>Download</a>}
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
      {f.has.real && <>
        <div className="lv-part">
          <div className="lv-part-head"><span className="lv-part-label">Versions</span></div>
          <div className="lv-line"><Badge tone="warn">Real · this computer only</Badge><a className="lv-act" href={engine.testFileUrl(appId, f.id, false, 'real')} download={f.name} aria-label={`Download the real ${f.name}`}>Download</a></div>
          {f.has.fake
            ? <div className="lv-line"><Badge tone="ok">{f.checked?.faked !== undefined ? 'Faked' : 'Made up'}</Badge><span className="lv-item-meta">{kind}{f.checked?.faked !== undefined ? ` · ${f.checked.faked} value${f.checked.faked === 1 ? '' : 's'} replaced` : ''}</span><a className="lv-act" href={engine.testFileUrl(appId, f.id, false, 'fake')} download={f.name} aria-label={`Download the fake ${f.name}`}>Download</a></div>
            : <div className="lv-line"><Badge tone="bad">No fake yet</Badge><span className="lv-sub" style={{ margin: 0 }}>{f.note ?? 'A reviewer does not get this file.'}</span>
              <input ref={pick} type="file" hidden aria-label={`A made-up version of ${f.name}`} onChange={(e) => { const x = e.target.files?.[0]; if (x && window.confirm(`Keep ${x.name} as the made-up version of ${f.name}? It goes to a reviewer, so it must hold nothing real.`)) void onFake(x); e.target.value = '' }} />
              <button className="lv-act" onClick={() => pick.current?.click()}>Add a made-up version</button></div>}
        </div>
        <div className="lv-part">
          <div className="lv-part-head"><span className="lv-part-label">Used by</span></div>
          <div className="lv-cols">
            <Use place="prototype" name="Prototype" />
            <Use place="smoke" name="Smoke test" />
            <div><strong>Reviewer</strong>{f.has.fake ? 'The fake' : 'Nothing: no fake yet'}<div className="lv-sub">Always: a reviewer is never given anything real</div></div>
          </div>
        </div>
      </>}
    </div>
  )
}

/** Files chosen, a line of context, and whether they are made up or real: a real one is kept here and a fake made of it. */
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
      <label className="mock-check"><input type="radio" name="tf-kind" checked={kind === 'real'} onChange={() => setKind('real')} /> Real: keep it on this computer and make a fake version</label>
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>{kind === 'real' ? 'A fake is made of a CSV or other text. A real picture or document needs a made-up one added beside it.' : 'A reviewer gets these files.'}{task ? ' Added for this task alone.' : ' Added for every task of the app.'}</p>
      <div className="row"><button className="btn small" disabled={!files.length || !kind || busy} onClick={async () => { setBusy(true); try { await onAdd(files, what.trim(), kind === 'real') } finally { setBusy(false) } }}>{busy ? 'Adding…' : files.length > 1 ? `Add ${files.length} files` : 'Add it'}</button><button className="btn quiet small" onClick={onCancel}>Cancel</button></div>
    </div>
  )
}
