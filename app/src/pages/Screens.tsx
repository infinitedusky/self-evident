/**
 * Screens: every screen of a task and every state, still, exactly as it will look, all on one wall (Sandy,
 * 2026-11-20: "if there are ten different screens, then we have ten … and we go through them all and say, 'No, the
 * spacing here is wrong. No, this is wrong'"). The step between the sketches and the mockups: what can be seen is
 * settled here, where a change is still cheap.
 *
 * Each one is a story under Screens/ in the app's Storybook, so it is made from the app's own components, and is
 * framed here by its plain address with none of Storybook around it. The wall is after Figma's frames on a canvas
 * and Chromatic's review grid: everything at once, small, and one press to see a screen large and step to the next.
 * Widths after the device toolbar in browser dev tools, as on Sketches. Light and dark beside them, after the same
 * toolbar's colour scheme switch and Storybook's own theme toolbar: the page asks each story for the global `theme`
 * (Sandy, 2026-11-24: "the same way I can do phone, tablet, desktop, there should be a light or dark mode there").
 * The way on is Mockups: the same screens, clickable.
 */
import { useEffect, useState } from 'react'
import { useCurrentApp } from '../current-app'
import { engine } from '../engine'
import { useCurrentTalk, useWorkspace } from '../workspace'
import { StorybookOff } from './Mockups'

type List = Awaited<ReturnType<typeof engine.screens>>
/** The size a screen is drawn at; the wall shows it scaled down to a tile. */
const WIDTHS = [{ key: 'phone', label: 'Phone', px: 390, high: 780 }, { key: 'tablet', label: 'Tablet', px: 820, high: 1000 }, { key: 'desktop', label: 'Desktop', px: 1280, high: 800 }] as const
const THEMES = [{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }] as const
type Theme = (typeof THEMES)[number]['key']
const THEME_KEY = 'if.screens.theme'
/** What was last picked on this computer, else what the person's system is set to. */
const startTheme = (): Theme => {
  try { const kept = localStorage.getItem(THEME_KEY); if (kept === 'light' || kept === 'dark') return kept } catch { /* no storage: the system's */ }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
const TILE = { phone: 200, tablet: 300, desktop: 380 } as const // a tile's width on the wall

/** `story`: the one to open large (else the wall); `session`: the conversation whose worktree's Storybook draws them (else the one in front). */
export function Screens({ story, session, embedded }: { story?: string; session?: string; /** Inside a page with its own heading: only the controls. */ embedded?: boolean }) {
  const { app } = useCurrentApp()
  const ws = useWorkspace()
  const inFront = useCurrentTalk()
  const talk = session ?? inFront
  const [list, setList] = useState<List | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(story ?? null)
  const [all, setAll] = useState(false) // with the screens earlier tasks left in the repository
  const [starting, setStarting] = useState(false)
  const [width, setWidth] = useState<(typeof WIDTHS)[number]['key']>('desktop')
  const [theme, setTheme] = useState<Theme>(startTheme)
  const pick = (t: Theme) => { setTheme(t); try { localStorage.setItem(THEME_KEY, t) } catch { /* it lasts for this page */ } }
  useEffect(() => { setOpen(story ?? null) }, [story])
  useEffect(() => {
    setError(null)
    if (!app) { setList(null); return }
    let gone = false
    const poll = () => engine.screens(app.id, talk, all).then((x) => { if (!gone) { setList(x); setError(null) } }).catch((e) => { if (!gone) setError(String(e.message ?? e)) })
    void poll()
    const t = window.setInterval(poll, 2000) // a screen the agent just wrote shows by itself; the frames reload themselves (Storybook's own)
    return () => { gone = true; window.clearInterval(t) }
  }, [app?.id, talk, all])
  useEffect(() => { setAll(false) }, [app?.id, talk])
  const start = async () => { if (!app) return; setStarting(true); try { await engine.startStorybook(app.id, talk) } catch (e: any) { setError(String(e.message ?? e)) } finally { setStarting(false) } }

  const w = WIDTHS.find((x) => x.key === width)!
  const base = (list?.frame ?? list?.url)?.replace(/\/$/, '') ?? null // framed at the address the engine gives, as Mockups is
  const src = (id: string) => `${base}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=theme:${theme}` // Storybook's own way to set a toolbar's global
  const screens = list?.screens ?? []
  const states = screens.flatMap((s) => s.states.map((st) => ({ ...st, screen: s.title })))
  const at = open ? states.findIndex((s) => s.id === open) : -1
  const one = at >= 0 ? states[at] : null
  const scale = TILE[width] / w.px

  return (
    <div className="mockups screens" data-component="Screens">
      <div className="page-head" style={{ marginBottom: 10 }}>
        {embedded ? <span /> : <div>
          <h1>🖼️ Screens{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Every screen and state, still, exactly as it will look{list?.branch && <>, from the Storybook on <code>{list.branch}</code>{list.main ? '' : ', this conversation\'s branch'}</>}.
          </p>
        </div>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {states.length > 0 && <span className="faint" style={{ fontSize: 13 }}>{screens.length} {screens.length === 1 ? 'screen' : 'screens'}, {states.length} {states.length === 1 ? 'state' : 'states'}</span>}
          {states.length > 0 && <div className="seg" role="group" aria-label="Width">{WIDTHS.map((x) => <button key={x.key} className={x.key === width ? 'on' : ''} onClick={() => setWidth(x.key)}>{x.label}</button>)}</div>}
          {states.length > 0 && <div className="seg" role="group" aria-label="Colour scheme">{THEMES.map((x) => <button key={x.key} className={x.key === theme ? 'on' : ''} aria-pressed={x.key === theme} onClick={() => pick(x.key)}>{x.label}</button>)}</div>}
          {!embedded && ws && <button className="btn quiet" onClick={() => ws.open({ kind: 'storybook', session })}>Mockups →</button>}
        </div>
      </div>
      {error && <div className="empty bad">{error}</div>}
      {!app && <div className="empty">Pick an app in the nav.</div>}
      <StorybookOff s={list} starting={starting} start={start} />
      {list?.up && list.themed === false && states.length > 0 && (
        <p className="faint screens-unthemed" role="note" style={{ margin: '0 0 8px', fontSize: 13 }}>This app's Storybook has no light and dark to switch, so every screen looks the same in both. Ask the agent to add a theme switch to its Storybook.</p>
      )}

      {list?.up && !screens.length && (
        <div className="empty">
          <p style={{ marginTop: 0 }}>{list.earlier ? 'No screens for this task yet.' : <>No screens{list.branch ? <> on <code>{list.branch}</code></> : ''} yet.</>}</p>
          <p className="muted" style={{ marginBottom: 0 }}>Ask the agent to draw the screens: one story per state, under <code>Screens/</code> in the app's Storybook, made from the app's own components. When nothing you can see is left to change, they become clickable under Mockups.</p>
        </div>
      )}
      {list?.up && (all || !!list.earlier) && !one && (
        <p className="faint" style={{ margin: '8px 0' }}>
          <button className="btn quiet small" onClick={() => setAll(!all)}>{all ? 'Hide earlier tasks\' screens' : `Show ${list.earlier} from earlier tasks`}</button>
        </p>
      )}

      {base && one && (
        <>
          <div className="screen-bar">
            <button className="btn quiet small" onClick={() => setOpen(null)}>← All screens</button>
            <strong>{one.screen}</strong> <span className="muted">{one.name}</span>
            <span style={{ marginLeft: 'auto' }} className="faint">{at + 1} of {states.length}</span>
            <button className="btn quiet small" disabled={at === 0} onClick={() => setOpen(states[at - 1].id)}>← Previous</button>
            <button className="btn quiet small" disabled={at === states.length - 1} onClick={() => setOpen(states[at + 1].id)}>Next →</button>
          </div>
          <div className="sketch-stage">
            <iframe key={`${one.id}:${theme}`} className="sb-frame sketch-frame" style={{ width: w.px, maxWidth: '100%' }} src={src(one.id)} title={`${one.screen}, ${one.name}`} />
          </div>
        </>
      )}

      {base && !one && screens.length > 0 && (
        <div className="screen-wall">
          {screens.map((s) => (
            <section key={s.title} className="screen-row" aria-label={s.title}>
              <h2>{s.title} <span className="faint">{s.states.length} {s.states.length === 1 ? 'state' : 'states'}</span></h2>
              <div className="screen-tiles">
                {s.states.map((st) => (
                  <figure key={st.id} className="screen-tile" style={{ width: TILE[width] }}>
                    <button type="button" aria-label={`Open ${s.title}, ${st.name}`} onClick={() => setOpen(st.id)} style={{ height: Math.round(w.high * scale) }}>
                      <iframe key={theme} loading="lazy" tabIndex={-1} aria-hidden src={src(st.id)} title={`${s.title}, ${st.name}, small`} style={{ width: w.px, height: w.high, transform: `scale(${scale})` }} />
                    </button>
                    <figcaption>{st.name}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
