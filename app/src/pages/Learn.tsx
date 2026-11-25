/**
 * Learn has two halves (Sandy, 2026-11-16): what the code says, and what the running app says. Both end in ideas.
 *
 * The codebase half is here: an agent reads the app's code and writes four short documents (what it is, the parts,
 * running and testing it, what is fragile). They are the app's workbench docs, and this page is where they are read.
 * Each shows the part written for a person; the part written for agents is folded under it. What the agent thinks
 * should change it keeps as ideas, so the way on from here is Ideas.
 *
 * Learn has its own agent, beside what it wrote (Sandy, 2026-11-16: "its own agent that's broken off from the
 * global"): its conversation is on this page and not in the app's column, as a task's agent is on the task's page.
 *
 * The other half, the running app, is still a statement of intent: nothing reads the telemetry back yet.
 *
 * Between them, "Your docs" (Sandy, 2026-11-24: "documentation that represents my personal understanding of the
 * project so that I can probe and build up … host this inside of Evident … in Learn"): the person's own pages about
 * the app, any number, a title and Markdown each. The four above are the agent's account and are replaced when the
 * code is learned again; these are the person's and are not. Written here, or by Learn's agent at their word; agents
 * read them, so one can be asked to check a page against the code.
 *
 * The documents after an architecture decision record and a README's "getting started": a fixed, small set with the
 * same headings in every app, so a person and an agent both know where to look.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { API, engine, openEvents, type AppDoc, type Learning } from '../engine'
import { useCurrentApp } from '../current-app'
import { Badge } from '../components/Badge'
import { Md } from '../components/Md'
import { Conversation } from '../components/Conversation'

export function Learn() {
  const { app } = useCurrentApp()
  const [l, setL] = useState<Learning | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const load = useCallback(() => { if (app) void engine.learning(app.id).then((x) => { setL(x); setError(null) }).catch((e) => setError(String(e.message ?? e))) }, [app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!app) return
    setL(null); load()
    const es = openEvents(`${API}/events?since=now&app=${app.id}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(load, 300) }
    for (const t of ['learn.written', 'talk.result', 'talk.message', 'idea.created']) es.addEventListener(t, bump)
    return () => { es.close(); window.clearTimeout(timer.current) }
  }, [app?.id, load]) // eslint-disable-line react-hooks/exhaustive-deps
  const learn = async () => {
    if (!app) return
    setBusy(true); setError(null)
    try { const r = await engine.learn(app.id); setL((now) => (now ? { ...now, working: { sessionId: r.sessionId }, sessionId: r.sessionId } : now)); load() } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) }
  }
  const none = !!l && l.docs.length === 0
  return (
    <>
      <div className="page-head"><div>
        <h1>🧠 Learn{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>What is true about this app, from two places: its code, and what it does when it runs. Both end in ideas.</p>
      </div></div>

      <div className={`learn-layout ${l?.sessionId ? 'with-agent' : ''}`}>
      <div className="learn-main">
      <section className="panel" data-component="LearnCodebase" aria-label="The codebase">
        <h2>The codebase {l && l.docs.length > 0 && <span className="faint">{l.docs.length} of {l.docs.length + l.missing.length} written</span>}
          {l && !l.working && app && <button className={`btn small ${none ? '' : 'quiet'}`} style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => void learn()}>{none ? 'Learn this codebase' : 'Learn it again'}</button>}
        </h2>
        {!app && <p className="muted" style={{ margin: 0 }}>Add an app in Settings, and its code can be learned here.</p>}
        {error && <p className="bad" style={{ margin: '0 0 8px' }}>{error}</p>}
        {l?.working && <p style={{ margin: '0 0 10px' }}><Badge tone="accent" dot>working</Badge> An agent is reading the code. What it writes shows here as it goes.</p>}
        {none && !l?.working && <p style={{ margin: 0 }}>An agent reads the code and writes four short documents: what the app is, its parts, how to run and test it, and what is fragile. It changes nothing. Where it sees something worth changing, it keeps an idea. Start here on a new app.</p>}
        {l && !l.working && l.stale > 0 && <p className="learn-stale" role="note">The code has changed since these were written. Learn it again to bring them up to date.</p>}
        {l?.docs.map((d) => (
          <article key={d.key} className="learn-doc">
            <h3>{d.title} <span className="faint">{new Date(d.updatedAt).toLocaleDateString()}</span></h3>
            <Md text={d.summary} />
            {d.body && <details><summary className="faint">For agents</summary><Md text={d.body} /></details>}
          </article>
        ))}
        {l && l.docs.length > 0 && l.missing.length > 0 && !l.working && <p className="faint" style={{ margin: '8px 0 0', fontSize: 13 }}>Not written yet: {l.missing.join(', ')}.</p>}
        {l && l.docs.length > 0 && <p style={{ margin: '12px 0 0' }}>What it thought should change is in <Link to="/ideas">Ideas</Link>.</p>}
      </section>

      {app && <YourDocs appId={app.id} hasAgent={!!l?.sessionId} />}

      <section className="panel" aria-label="The running app">
        <h2>The running app <span className="faint">not built yet</span></h2>
        <p style={{ margin: 0 }}>The other half: reading what the app reports when it runs (counts, timings, outcomes) and saying what is true. A baseline when an idea is kept, what changed after it shipped, a guard after a merge. Nothing reads the telemetry back yet.</p>
      </section>
      </div>
      {l?.sessionId && (
        <aside className="panel learn-agent" data-component="LearnAgent" aria-label="Learn's agent">
          <h2>🧠 Learn's agent <span className="faint">it read the code; ask it</span></h2>
          <Conversation sessionId={l.sessionId} compact context={{ path: '/learn', label: 'what it learned' }} onChanged={load} />
        </aside>
      )}
      </div>
    </>
  )
}

const said = (e: unknown) => { const m = String((e as Error)?.message ?? e); try { return (JSON.parse(m) as { error?: string }).error ?? m } catch { return m } }

/** The person's own pages about the app: read folded under their titles, written and changed in place. */
function YourDocs({ appId, hasAgent }: { appId: string; hasAgent: boolean }) {
  const [docs, setDocs] = useState<AppDoc[] | null>(null)
  const [open, setOpen] = useState<Set<string> | null>(null) // none chosen yet: the first is open
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [asking, setAsking] = useState<string | null>(null) // the page a delete was pressed on, until it is confirmed
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const load = useCallback(() => { void engine.appDocs(appId).then(setDocs).catch((e) => setError(said(e))) }, [appId])
  useEffect(() => {
    setDocs(null); setOpen(null); setEditing(null); setAsking(null); setError(null); load()
    const es = openEvents(`${API}/events?since=now&app=${appId}`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(load, 300) }
    for (const t of ['doc.written', 'doc.removed']) es.addEventListener(t, bump)
    return () => { es.close(); window.clearTimeout(timer.current) }
  }, [appId, load])
  const isOpen = (d: AppDoc, i: number) => (open ? open.has(d.id) : i === 0)
  const toggle = (id: string, to: boolean) => setOpen((now) => { const next = new Set(now ?? (docs?.[0] ? [docs[0].id] : [])); if (to) next.add(id); else next.delete(id); return next })
  const save = async (id: string | null, page: { title: string; body: string }) => {
    const saved = id ? await engine.editAppDoc(id, page) : await engine.writeAppDoc(appId, page)
    setDocs((now) => (id ? (now ?? []).map((d) => (d.id === id ? saved : d)) : [...(now ?? []), saved]))
    toggle(saved.id, true); setEditing(null)
  }
  const remove = async (id: string) => {
    setError(null)
    try { await engine.removeAppDoc(id); setDocs((now) => (now ?? []).filter((d) => d.id !== id)); setAsking(null) } catch (e) { setError(said(e)) }
  }
  return (
    <section className="panel" data-component="YourDocs" aria-label="Your docs">
      <h2>Your docs {docs && docs.length > 0 && <span className="faint">{docs.length} {docs.length === 1 ? 'page' : 'pages'}</span>}
        {editing !== 'new' && <button className={`btn small ${docs?.length ? 'quiet' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => setEditing('new')}>New page</button>}
      </h2>
      {error && <p className="bad" style={{ margin: '0 0 8px' }}>{error}</p>}
      {docs?.length === 0 && editing !== 'new' && <p style={{ margin: 0 }}>Write down how you understand this app, in your own words: how a part works, what you are not sure of. Write a page here, or tell Learn's agent to write down what you said. Agents read these pages, and Learn's agent can check one against the code. Learning the code again does not change them.</p>}
      {docs && docs.length > 0 && <p className="faint" style={{ margin: '0 0 4px', fontSize: 13 }}>What you understand, in your words. Agents read these.{hasAgent ? ' Ask Learn\'s agent to check a page against the code, or to write down what you tell it.' : ''}</p>}
      {docs?.map((d, i) => editing === d.id
        ? <PageEditor key={d.id} page={d} onSave={(p) => save(d.id, p)} onCancel={() => setEditing(null)} />
        : (
          <details key={d.id} className="learn-doc your-doc" open={isOpen(d, i)} onToggle={(e) => { const to = e.currentTarget.open; if (to !== isOpen(d, i)) toggle(d.id, to) }}>
            <summary><span className="your-doc-title">{d.title}</span> <span className="faint">{d.by === 'user' ? 'you' : 'an agent, at your word'} · {new Date(d.updatedAt).toLocaleDateString()}</span></summary>
            {d.body ? <Md text={d.body} /> : <p className="faint" style={{ margin: '6px 0 0' }}>Nothing written in it yet.</p>}
            <div className="your-doc-actions">
              {asking === d.id
                ? <><span>Delete "{d.title}"? It cannot be brought back.</span> <button className="btn small" onClick={() => void remove(d.id)}>Delete this page</button> <button className="btn small quiet" onClick={() => setAsking(null)}>Keep it</button></>
                : <><button className="btn small quiet" onClick={() => { setEditing(d.id); setAsking(null) }}>Edit</button> <button className="btn small quiet" onClick={() => setAsking(d.id)}>Delete</button></>}
            </div>
          </details>
        ))}
      {editing === 'new' && <PageEditor onSave={(p) => save(null, p)} onCancel={() => setEditing(null)} />}
    </section>
  )
}

/** A page being written or changed: its title and the page in Markdown. What was typed stays when saving is refused. */
function PageEditor({ page, onSave, onCancel }: { page?: AppDoc; onSave: (p: { title: string; body: string }) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState(page?.title ?? '')
  const [body, setBody] = useState(page?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setBusy(true); setError(null)
    try { await onSave({ title, body }) } catch (e) { setError(said(e)); setBusy(false) }
  }
  return (
    <form className="form-grid your-doc-editor" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <label style={{ gridColumn: '1 / -1' }}>Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="How sign-in works" autoFocus={!page} /></label>
      <label style={{ gridColumn: '1 / -1' }}>Page<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} placeholder="As you understand it. Markdown: lists, headings and code are shown as such." /></label>
      {error && <p className="bad" style={{ gridColumn: '1 / -1', margin: 0 }}>{error}</p>}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
        <button className="btn small" type="submit" disabled={busy || !title.trim()}>Save</button>
        <button className="btn small quiet" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
