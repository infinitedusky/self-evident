/**
 * Says when the page cannot hear the engine. Without it, a page that has lost its live connection looks exactly
 * like an agent that is not answering (Sandy, 2026-11-14: "none of the agents are responding … there's no error or
 * anything telling me what's going on"). Shown only once the connection has been down for a moment, so a blip says
 * nothing; gone the moment it is back. After Slack's "Connecting…" bar.
 */
import { useEffect, useState } from 'react'
import { engineDown, onEngineLink } from '../engine'

export function EngineLink() {
  const [down, setDown] = useState(engineDown)
  useEffect(() => onEngineLink(setDown), [])
  return <EngineLinkBar down={down} />
}

/** The bar itself, apart from the connection, so it can be shown in a story. */
export function EngineLinkBar({ down, after = 2500 }: { down: boolean; /** How long it must be down before it is said, in ms. */ after?: number }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!down) { setShow(false); return }
    const t = window.setTimeout(() => setShow(true), after)
    return () => window.clearTimeout(t)
  }, [down, after])
  if (!show) return null
  return (
    <div className="engine-link" role="status" data-component="EngineLink">
      <strong>Not connected to the engine.</strong> What agents say will not show until it is back. Reconnecting by itself… <button type="button" className="linkish" onClick={() => window.location.reload()}>Reload now</button>
    </div>
  )
}
