/**
 * The way from one Evident on this computer to the other (engine instance.ts; Sandy, 2026-11-25: "we can create a
 * button to switch between the 2"). An Evident reads one database: this computer's own, or one shared with the
 * person's other computers. With both running, each on its own address, this button in the rail says which one this
 * is and goes to the other in the same window. It is the account switcher of a mail client, where each account is a
 * database.
 *
 * Shown only when there is another: it answers, or this one was started beside it, or this browser has seen it
 * before. Then, when the other is not running, the button says what starts it.
 */
import { useEffect, useState } from 'react'
import { engine, type Instances } from '../engine'

const SEEN = 'evident.other-seen'
const about = (kind: 'local' | 'shared') => (kind === 'local' ? 'its own database, on this computer' : 'a database shared with your other computers')

export function InstanceSwitch() {
  const [v, setV] = useState<Instances | null>(null)
  const [known, setKnown] = useState(() => { try { return localStorage.getItem(SEEN) === '1' } catch { return false } })
  useEffect(() => {
    let on = true
    const ask = () => engine.instances().then((x) => { if (!on) return; setV(x); if (x.other.up) { setKnown(true); try { localStorage.setItem(SEEN, '1') } catch { /* a browser that keeps nothing */ } } }, () => {})
    ask()
    const t = window.setInterval(ask, 15_000)
    return () => { on = false; window.clearInterval(t) }
  }, [])
  // The tab's title says which one it is, so two tabs can be told apart.
  useEffect(() => { if (v && (v.other.up || v.here.beside || known)) document.title = `Evident · ${v.here.name}` }, [v, known])
  return v ? <InstanceSwitchView {...v} known={known} /> : null
}

/** The view, apart from the asking. `open` holds the panel open (a story); `known`: this browser has seen the other up. */
export function InstanceSwitchView({ here, other, known, open }: Instances & { known?: boolean; open?: boolean }) {
  if (!other.up && !here.beside && !known) return null
  const label = `This Evident: ${here.name}. ${other.up ? `Switch to ${other.name}` : `${other.name} is not running`}`
  return (
    <div className="rail-item" data-component="InstanceSwitch">
      <button className={`rail-btn instance-btn ${here.kind}`} aria-label={label}><span aria-hidden="true">{here.kind === 'local' ? '💻' : '☁️'}</span></button>
      <div className={`rail-fly instance-fly ${open ? 'open' : ''}`}>
        <p><strong>{here.name}</strong><br /><span className="faint">This Evident uses {about(here.kind)}.</span></p>
        {other.up && other.same && <p className="bad" role="alert">Both are on the same database. Stop one of them: two engines on one database both schedule and build.</p>}
        {other.up
          ? <a className="instance-go" href={other.url}>Switch to {other.name}</a>
          : <p className="faint">{other.name} is not running. To start it, in the Evident folder: <code>{other.start}</code></p>}
        {other.up && <p className="faint">{other.name} uses {about(other.kind)}. Each keeps running while you are in the other.</p>}
      </div>
    </div>
  )
}
