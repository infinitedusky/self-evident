/**
 * The smoke test's terminal (Sandy, 2026-11-18: "a terminal where it runs commands and you see it working"): a real
 * shell on this computer, in the build's checkout or in a new empty folder, shown in the page. What is typed goes to
 * it; a check's command can be sent to it with a press (`send`).
 *
 * After the terminal in VS Code and in a cloud console (xterm.js, which both use): the thing itself, not a log of it.
 * It is opened when the person asks, never by itself. Someone who comes back to the page sees what was said before.
 */
import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { API, engine } from '../engine'

export function SmokeTerminal({ issueId, setup, send, tall }: { issueId: string; setup: string; /** A command to type in, from a check: `n` makes each press a new one. */ send?: { n: number; text: string } | null; /** It is the whole view, not a strip under the build. */ tall?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const type = useRef<(data: string) => void>(() => {})
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false) // it is listening: what is sent before that waits
  const sent = useRef(0)
  const [where, setWhere] = useState<{ cwd: string; folder: 'build' | 'temp' } | null>(null)

  useEffect(() => {
    if (!box.current) return
    const term = new Terminal({ fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', cursorBlink: true, scrollback: 5000 })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(box.current)
    try { fit.fit() } catch { /* not laid out yet */ }
    let es: EventSource | null = null, gone = false
    const post = (what: 'input' | 'resize', body: Record<string, unknown>) => fetch(`${API}/issues/${issueId}/smoke/terminal/${what}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ setup, ...body }) }).catch(() => {})
    type.current = (data) => void post('input', { data })
    const typing = term.onData((data) => type.current(data))
    engine.openSmokeTerminal(issueId, setup, term.cols, term.rows).then((o) => {
      if (gone) return
      setWhere({ cwd: o.cwd, folder: o.folder })
      es = new EventSource(`${API}/issues/${issueId}/smoke/terminal/stream?setup=${encodeURIComponent(setup)}`)
      es.onopen = () => { term.reset(); setReady(true) } // each time it connects it is told everything said so far
      es.addEventListener('data', (e) => term.write(JSON.parse((e as MessageEvent).data) as string))
      es.addEventListener('exit', () => { term.write('\r\n[the shell ended]\r\n'); es?.close() })
      es.addEventListener('gone', () => { es?.close() })
    }).catch((e) => setError(String(e.message ?? e)))
    let timer: number | undefined
    const sized = new ResizeObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(() => { try { fit.fit(); void post('resize', { cols: term.cols, rows: term.rows }) } catch { /* gone */ } }, 150) })
    sized.observe(box.current)
    return () => { gone = true; setReady(false); window.clearTimeout(timer); sized.disconnect(); typing.dispose(); es?.close(); term.dispose() }
  }, [issueId, setup])

  useEffect(() => { if (ready && send?.text && send.n !== sent.current) { sent.current = send.n; type.current(send.text) } }, [send?.n, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`smoke-term ${tall ? 'tall' : ''}`} data-component="SmokeTerminal">
      {error ? <div className="empty bad">{error}</div> : null}
      {where && <div className="faint smoke-term-where">{where.folder === 'temp' ? 'A new empty folder, thrown away when you close this' : 'The build\'s checkout'}: <code>{where.cwd}</code></div>}
      <div ref={box} className="smoke-term-box" role="group" aria-label="Terminal" />
    </div>
  )
}
