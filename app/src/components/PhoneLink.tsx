/**
 * The page on a phone (Sandy, 2026-11-18: "we need some indicator that shows that a phone is connected" and "a
 * button to send the link to the phone"). In the rail: a code to scan with the phone's camera, which opens the page
 * at its address on the private network, and a dot while another device has the page open, with its name. Shown only
 * when the page is served over Tailscale (docs/running-it.md, "From a phone") or a device is here.
 * The code to scan is WhatsApp Web's way of joining a phone to a computer; the dot is Figma's "who else is here".
 */
import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { devicesHere, type Device, type DevicesHere } from '../engine'

export function PhoneLink() {
  const [d, setD] = useState<DevicesHere | null>(null)
  useEffect(() => {
    let on = true
    const ask = () => devicesHere().then((v) => { if (on) setD(v) }, () => {})
    ask()
    const t = window.setInterval(ask, 10_000)
    return () => { on = false; window.clearInterval(t) }
  }, [])
  return d ? <PhoneLinkView {...d} /> : null
}

const icon = (d: Device) => (d.kind === 'phone' ? '📱' : '💻')

/** The view, apart from the asking, so it can be shown in a story. `open` holds the panel open (a story). */
export function PhoneLinkView({ address, remote, devices, open }: DevicesHere & { open?: boolean }) {
  const [copied, setCopied] = useState(false)
  const scan = address && !remote ? address : null
  if (!scan && devices.length === 0) return null
  const copy = () => { navigator.clipboard.writeText(scan!).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }, () => {}) }
  const label = devices.length ? `${devices.map((x) => x.name).join(' and ')} ${devices.length > 1 ? 'have' : 'has'} this open` : 'Open on a phone'
  return (
    <div className="rail-item" data-component="PhoneLink">
      <button className={`rail-btn ${devices.length ? 'phone-here' : ''}`} aria-label={label}><span aria-hidden="true">📱</span>{devices.length > 0 && <i className="phone-dot" aria-hidden="true" />}</button>
      <div className={`rail-fly phone-fly ${open ? 'open' : ''}`}>
        {devices.length > 0 && (
          <ul className="phone-here-list">
            {devices.map((x) => <li key={x.ip}><span aria-hidden="true">{icon(x)}</span> <strong>{x.name}</strong> has this open</li>)}
          </ul>
        )}
        {scan && (
          <div className="phone-scan">
            <QRCodeSVG value={scan} size={148} marginSize={2} role="img" aria-label={`A code that opens ${scan}`} title="" />
            <p>Scan with the phone's camera. Tailscale must be on.</p>
            <code>{scan.replace(/^https:\/\//, '')}</code>
            <button type="button" onClick={copy} aria-label="Copy the address">{copied ? 'Copied' : 'Copy the address'}</button>
          </div>
        )}
      </div>
    </div>
  )
}
