/**
 * The viewer for what a task is looked at through: its sketches, its mockups (Storybook), a prototype. It sits where
 * the work is (the step's page on a task, a tab in the workspace) and can be detached into a browser tab of its own,
 * for room or a second screen, and put back (Sandy, 2026-11-10: "each should have a way to detach the viewer, which
 * makes it a tab in Chrome; it can be reattached"). After the agent's own pop-out (TalkDrawer) and the way Chrome's
 * dev tools undock into a window: one place at a time, and the place it left says where it went.
 *
 * `/view?tab=<json>` is the detached page (ViewerWindow). The two sides talk over a BroadcastChannel, keyed by what is
 * shown, so a reload on either side finds the other.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Mockups } from '../pages/Mockups'
import { Sketches } from '../pages/Sketches'
import { PagePane } from './PagePane'
import { PrototypePane } from './PrototypePane'
import type { Tab } from '../workspace'

export type Viewed = Extract<Tab, { kind: 'sketch' | 'storybook' | 'prototype' }>
const NAME = { sketch: 'Sketches', storybook: 'Mockups', prototype: 'The prototype' }
type Msg = { type: 'here' | 'closed' | 'who' | 'back'; key: string }
const channel = () => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('self-evident-viewer'))
/** What is shown, as one string: a detached viewer and the place it left agree on it. */
export const viewKey = (t: Viewed) => `${t.kind}:${t.kind === 'prototype' ? t.id ?? '' : `${t.session ?? ''}:${t.kind === 'sketch' ? t.file ?? '' : t.story ?? ''}`}`
export const viewUrl = (t: Viewed) => `${window.location.origin}/view?tab=${encodeURIComponent(JSON.stringify(t))}`

function Body({ tab, embedded, onNavigate }: { tab: Viewed; embedded?: boolean; onNavigate?: (path: string) => void }) {
  if (tab.kind === 'sketch') return <Sketches file={tab.file} session={tab.session} embedded={embedded} />
  if (tab.kind === 'storybook') return <Mockups story={tab.story} session={tab.session} embedded={embedded} />
  return <PrototypePane id={tab.id} path={tab.path} onNavigate={onNavigate} />
}

/** `embedded`: inside a page that already has a heading (a step's page), so the viewer shows only its controls. */
export function Viewer({ tab, embedded, onNavigate, detached: startDetached = false }: { tab: Viewed; embedded?: boolean; /** A prototype's page changed (its tab keeps the address). */ onNavigate?: (path: string) => void; /** For a story: start as detached. */ detached?: boolean }) {
  const key = viewKey(tab)
  const [detached, setDetached] = useState(startDetached)
  const [problem, setProblem] = useState<string | null>(null)
  const ch = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    const c = channel(); ch.current = c
    if (!c) return
    c.onmessage = (e: MessageEvent<Msg>) => { if (e.data.key !== key) return; if (e.data.type === 'here') setDetached(true); if (e.data.type === 'closed') setDetached(false) }
    c.postMessage({ type: 'who', key } satisfies Msg) // after a reload: is it still out there?
    return () => c.close()
  }, [key])
  const detach = () => {
    const w = window.open(viewUrl(tab), '_blank')
    if (!w) { setProblem('The browser blocked the new tab. Allow pop-ups for this site, or keep it here.'); return }
    setProblem(null); setDetached(true)
  }
  const back = () => { ch.current?.postMessage({ type: 'back', key } satisfies Msg); setDetached(false) }
  return (
    <div className={`viewer ${embedded ? 'embedded' : ''}`} data-component="Viewer">
      <div className="viewer-bar">
        {detached
          ? <button className="btn quiet small" onClick={back} title="Close its browser tab and show it here again">↙ Bring it back</button>
          : <button className="btn quiet small" onClick={detach} title="Open it in a browser tab of its own">↗ Detach</button>}
      </div>
      {problem && <div className="empty bad">{problem}</div>}
      {detached
        ? <div className="empty viewer-out">{NAME[tab.kind]} {tab.kind === 'prototype' ? 'is' : 'are'} open in a browser tab of {tab.kind === 'prototype' ? 'its' : 'their'} own. <button className="btn quiet small" onClick={back}>Bring {tab.kind === 'prototype' ? 'it' : 'them'} back</button></div>
        : <Body tab={tab} embedded={embedded} onNavigate={onNavigate} />}
    </div>
  )
}

/** The detached page: the same viewer, the whole browser tab, and the way back. */
export function ViewerWindow() {
  const tab = useMemo<Viewed | null>(() => { try { const t = JSON.parse(new URLSearchParams(window.location.search).get('tab') ?? 'null'); return t && ['sketch', 'storybook', 'prototype'].includes(t.kind) ? t : null } catch { return null } }, [])
  const [orphan, setOrphan] = useState(false)
  useEffect(() => {
    if (!tab) return
    const key = viewKey(tab)
    const c = channel()
    if (!c) return
    document.title = `${NAME[tab.kind]} · Self Evident`
    c.postMessage({ type: 'here', key } satisfies Msg)
    c.onmessage = (e: MessageEvent<Msg>) => {
      if (e.data.key !== key) return
      if (e.data.type === 'who') c.postMessage({ type: 'here', key } satisfies Msg)
      if (e.data.type === 'back') { c.postMessage({ type: 'closed', key } satisfies Msg); window.close(); setOrphan(true) } // a tab the person opened by hand can't close itself: say so
    }
    const bye = () => c.postMessage({ type: 'closed', key } satisfies Msg)
    window.addEventListener('pagehide', bye)
    return () => { window.removeEventListener('pagehide', bye); c.close() }
  }, [tab])
  if (!tab) return <div className="tab-page"><div className="empty">Nothing to show here. <a href="/">Go to Self Evident →</a></div></div>
  const putBack = () => { channel()?.postMessage({ type: 'closed', key: viewKey(tab) } satisfies Msg); window.close(); setOrphan(true) }
  return (
    <div className="viewer-window" data-component="ViewerWindow">
      <div className="viewer-bar">
        <span className="faint">{orphan ? 'It is showing in Self Evident again. You can close this tab.' : `Detached from Self Evident.`}</span>
        <button className="btn quiet small" onClick={putBack} title="Close this tab and show it in Self Evident again">↙ Put it back</button>
      </div>
      {tab.kind === 'prototype' ? <Body tab={tab} /> : <PagePane path="/mockups"><Body tab={tab} /></PagePane>}
    </div>
  )
}
