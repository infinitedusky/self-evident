/**
 * A prototype's code, beside it running (Sandy, 2026-11-13: "a diff view of all the files that changed. The agent
 * should be able to add files to that view for reference if the user asks a question. It can then highlight areas,
 * or show docs pages"). Two lists on the left: what the agent is showing (a file with the lines to look at and a note
 * saying why, or a page on the web), and every file the prototype changed, with its counts. One thing at a time on
 * the right: a changed file as its diff or whole, any file with its highlighted lines, a page in a frame.
 *
 * After GitHub's "Files changed": the file list with counts, one diff at a time, a note on a range of lines.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { API, engine, openEvents, type ChangedFile, type PrototypeCode as Code, type PrototypeFile, type ShownRef } from '../engine'
import { inLines, parsePatch } from './diff'

type Mode = 'diff' | 'file' | 'page'
const MARK = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R' } as const
const isDoc = (path?: string) => /\.mdx?$/i.test(path ?? '')
const name = (path: string) => path.split('/').pop() ?? path
const dir = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''

export function PrototypeCode({ id, appId, focus }: { id: string; appId: string; /** Something the agent just showed: select it. */ focus?: string | null }) {
  const [code, setCode] = useState<Code | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(focus ? `s:${focus}` : null) // "s:<shown id>" or "f:<path>"
  const refresh = useCallback(() => engine.prototypeCode(id).then((c) => { setCode(c); setError(null) }).catch((e) => setError(String(e.message ?? e))), [id])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { if (focus) setPicked(`s:${focus}`) }, [focus])
  // The agent shows something, or finishes a turn (it may have changed files): read the lists again.
  useEffect(() => {
    const es = openEvents(`${API}/events?since=now&app=${appId}`)
    const shown = (ev: MessageEvent) => { const p = (JSON.parse(ev.data) as { payload?: { prototypeId?: string; shownId?: string } }).payload; if (p?.prototypeId !== id) return; void refresh(); if (p.shownId) setPicked(`s:${p.shownId}`) }
    const turn = () => void refresh()
    es.addEventListener('prototype.shown', shown as EventListener); es.addEventListener('talk.result', turn)
    return () => es.close()
  }, [appId, id, refresh])

  const sel = useMemo(() => {
    if (!code) return null
    const s = picked?.startsWith('s:') ? code.shown.find((x) => x.id === picked.slice(2)) : undefined
    const f = picked?.startsWith('f:') ? code.files.find((x) => x.path === picked.slice(2)) : undefined
    if (s) return { key: `s:${s.id}`, shown: s, changed: code.files.find((x) => x.path === s.path) }
    if (f) return { key: `f:${f.path}`, changed: f, shown: undefined }
    const first = code.shown[0] ?? null // nothing picked (or it is gone): what the agent last showed, else the first change
    return first ? { key: `s:${first.id}`, shown: first, changed: code.files.find((x) => x.path === first.path) } : code.files[0] ? { key: `f:${code.files[0].path}`, changed: code.files[0], shown: undefined } : null
  }, [code, picked])

  if (!code) return <div className="proto-code-empty" data-component="PrototypeCode">{error ? <div className="empty bad">{error}</div> : <p className="muted">Reading what it changed…</p>}</div>
  const unshow = (s: ShownRef) => void engine.unshowInPrototype(id, s.id).then(refresh).catch((e) => setError(String(e.message ?? e)))
  const total = code.files.reduce((n, f) => ({ a: n.a + (f.added ?? 0), r: n.r + (f.removed ?? 0) }), { a: 0, r: 0 })
  return (
    <div className="proto-code" data-component="PrototypeCode">
      <nav className="proto-code-list" aria-label="Files">
        {code.shown.length > 0 && <>
          <h3>Shown by the agent</h3>
          <ul>
            {code.shown.map((s) => (
              <li key={s.id} className={sel?.key === `s:${s.id}` ? 'on' : ''}>
                <button className="proto-code-item" onClick={() => setPicked(`s:${s.id}`)} title={s.note ?? s.path ?? s.url}>
                  <span className="mark shown" aria-hidden="true">{s.kind === 'link' ? '↗' : '◆'}</span>
                  <span className="path">{s.kind === 'link' ? s.title ?? s.url : <><span className="faint">{dir(s.path!)}</span>{name(s.path!)}</>}</span>
                </button>
                <button className="icon-btn" onClick={() => unshow(s)} title="Take it out of the list" aria-label={`Remove ${s.title ?? s.path ?? s.url}`}>×</button>
              </li>
            ))}
          </ul>
        </>}
        <h3>Changed <span className="faint">{code.files.length} file{code.files.length === 1 ? '' : 's'}</span>{code.files.length > 0 && <span className="counts"><span className="add">+{total.a}</span> <span className="del">−{total.r}</span></span>}</h3>
        {code.files.length === 0
          ? <p className="faint proto-code-none">Nothing differs from where its branch started ({code.base}) yet.</p>
          : <ul>
              {code.files.map((f) => (
                <li key={f.path} className={sel?.key === `f:${f.path}` ? 'on' : ''}>
                  <button className="proto-code-item" onClick={() => setPicked(`f:${f.path}`)} title={`${f.path}: ${f.status}`}>
                    <span className={`mark ${f.status}`} title={f.status}>{MARK[f.status]}</span>
                    <span className="path"><span className="faint">{dir(f.path)}</span>{name(f.path)}</span>
                    <span className="counts">{f.added == null ? <span className="faint">binary</span> : <><span className="add">+{f.added}</span> <span className="del">−{f.removed}</span></>}</span>
                  </button>
                </li>
              ))}
            </ul>}
        {error && <div className="empty bad">{error}</div>}
      </nav>
      {sel
        ? sel.shown?.kind === 'link' ? <Page s={sel.shown} /> : <OneFile key={sel.key} id={id} path={(sel.shown?.path ?? sel.changed?.path)!} shown={sel.shown} changed={sel.changed} />
        : <div className="proto-code-empty"><p className="muted">No changes to read yet. When the prototype's agent changes a file it shows here with its diff; ask the agent how something works and it can put the file here, with the lines to look at.</p></div>}
    </div>
  )
}

/** A page on the web the agent is pointing at: in a frame, with the way out, since many sites refuse to be framed. */
function Page({ s }: { s: ShownRef }) {
  return (
    <div className="proto-code-file">
      <header>
        <strong>{s.title ?? s.url}</strong>
        <a className="btn quiet small" href={s.url} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>Open in a browser tab ↗</a>
      </header>
      {s.note && <p className="proto-code-note">{s.note}</p>}
      <p className="faint proto-code-hint">{s.url} · If this stays blank, the site does not allow being shown inside another page: open it in a browser tab.</p>
      <iframe className="proto-code-page" src={s.url} title={s.title ?? s.url} sandbox="allow-scripts allow-same-origin allow-popups" referrerPolicy="no-referrer" />
    </div>
  )
}

function OneFile({ id, path, shown, changed }: { id: string; path: string; shown?: ShownRef; changed?: ChangedFile }) {
  const [f, setF] = useState<PrototypeFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => { setF(null); setError(null); engine.prototypeFile(id, path).then(setF).catch((e) => setError(String(e.message ?? e))) }, [id, path, shown?.at])
  const rows = useMemo(() => (f?.patch ? parsePatch(f.patch) : []), [f?.patch])
  const lines = shown?.lines
  // Where to start: the diff when it holds every line the agent points at (or it points at none); else the whole file, so the lines are there; a doc nobody changed reads as a page.
  const first: Mode = !f ? 'diff' : !f.patch ? (isDoc(path) && !lines?.length ? 'page' : 'file')
    : lines?.length && f.content != null && !lines.every((l) => rows.some((r) => r.now === l.from)) ? 'file' : 'diff'
  const at = mode ?? first
  useEffect(() => { body.current?.querySelector('.hl')?.scrollIntoView({ block: 'center' }) }, [f, at])
  return (
    <div className="proto-code-file">
      <header>
        <strong className="mono">{path}</strong>
        {changed ? <span className="counts">{changed.status}{changed.added != null && <> <span className="add">+{changed.added}</span> <span className="del">−{changed.removed}</span></>}</span> : <span className="faint">not changed by the prototype</span>}
        {f && (
          <div className="seg" role="group" aria-label="How to show it" style={{ marginLeft: 'auto' }}>
            {f.patch && <button className={at === 'diff' ? 'on' : ''} onClick={() => setMode('diff')}>Diff</button>}
            {f.content != null && <button className={at === 'file' ? 'on' : ''} onClick={() => setMode('file')}>Whole file</button>}
            {f.content != null && isDoc(path) && <button className={at === 'page' ? 'on' : ''} onClick={() => setMode('page')}>As a page</button>}
          </div>
        )}
      </header>
      {shown?.note && <p className="proto-code-note">{shown.note}{lines?.length ? <span className="faint"> · {lines.map((l) => l.from === l.to ? `line ${l.from}` : `lines ${l.from}–${l.to}`).join(', ')}</span> : null}</p>}
      {error && <div className="empty bad">{error}</div>}
      {!f && !error && <p className="muted" style={{ padding: 12 }}>Loading…</p>}
      {f && (
        <div className="proto-code-body" ref={body}>
          {f.unreadable ? <p className="muted" style={{ padding: 12 }}>Not text, or too big to show here.</p>
            : at === 'page' && f.content != null ? <div className="md proto-code-doc"><Markdown remarkPlugins={[remarkGfm]}>{f.content}</Markdown></div>
            : at === 'file' && f.content != null ? (
              <table className="code-lines"><tbody>
                {f.content.replace(/\n$/, '').split('\n').map((text, i) => <tr key={i} className={inLines(i + 1, lines) ? 'hl' : ''}><td className="n">{i + 1}</td><td className="t">{text || ' '}</td></tr>)}
              </tbody></table>
            ) : rows.length ? (
              <table className="code-lines diff"><tbody>
                {rows.map((r, i) => r.kind === 'hunk'
                  ? <tr key={i} className="hunk"><td className="n" /><td className="n" /><td className="t">{r.text}</td></tr>
                  : <tr key={i} className={`${r.kind}${inLines(r.now, lines) ? ' hl' : ''}`}><td className="n">{r.old ?? ''}</td><td className="n">{r.now ?? ''}</td><td className="t"><span className="sign" aria-hidden="true">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}</span>{r.text || ' '}</td></tr>)}
              </tbody></table>
            ) : <p className="muted" style={{ padding: 12 }}>{f.missing ? 'Deleted.' : 'Nothing to show.'}</p>}
        </div>
      )}
    </div>
  )
}
