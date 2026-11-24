/**
 * Accepting a task's smoke test (Sandy, 2026-11-23: "Smoke test: the person tries the built code and accepts it.
 * Before merge only"; "Accepting the smoke test starts the Pull request finalizing"). One press, the person's: it
 * says the built code, at this commit, is what goes to review. It waits on their own checks and on nothing else:
 * what is owed at deploy is said here and marked on the pull request step.
 *
 * After a release sign-off: who, when, and the commit it was said on; said again when the code has moved.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import type { ReleaseCheck, SmokeAccepted } from '../engine'

export function SmokeAccept({ base, accepted, canAccept, waits, release = [], onAccept }: {
  /** The task's address, for the link to its pull request step. */ base: string
  accepted: SmokeAccepted | null
  canAccept: boolean
  /** What it waits on, when it cannot be accepted yet. */ waits?: string | null
  /** What is owed at deploy: never here, and it holds nothing here. */ release?: ReleaseCheck[]
  onAccept: () => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const accept = async () => { setBusy(true); setError(null); try { await onAccept() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) } }
  const owed = release.filter((r) => r.done !== true).length
  const standing = accepted && !accepted.stale
  return (
    <div className={`smoke-accept ${standing ? 'accepted' : ''}`} data-component="SmokeAccept" role="group" aria-label="Accept the smoke test">
      {standing ? (
        <p style={{ margin: 0 }}>✓ <strong>Accepted by {accepted.by === 'user' ? 'you' : accepted.by}</strong> <span className="faint" title={new Date(accepted.at).toLocaleString()}>on {accepted.sha ? <span className="mono">{accepted.sha.slice(0, 7)}</span> : 'the build as it was'}</span>. What is sent for review is on <Link to={`${base}/pr`}>the pull request step</Link>.</p>
      ) : (
        <>
          {accepted?.stale && <p className="smoke-stale" role="note" style={{ margin: '0 0 6px' }}>You accepted it on an earlier commit{accepted.sha ? <> (<span className="mono">{accepted.sha.slice(0, 7)}</span>)</> : ''}, and the branch has moved since. Look again, then accept what is there now.</p>}
          <button className="btn" disabled={busy || !canAccept} onClick={() => void accept()} title={canAccept ? 'You have tried the built code and it is what goes to review. Nothing is pushed or marked ready by this.' : waits ?? undefined}>{busy ? 'Accepting…' : accepted?.stale ? 'Accept it again' : 'Accept the smoke test'}</button>
          {!canAccept && waits && <span className="faint" style={{ marginLeft: 8 }}>{waits}.</span>}
          {canAccept && <span className="faint" style={{ marginLeft: 8 }}>You have tried it and it is what goes to review. Nothing is pushed by this.</span>}
        </>
      )}
      {owed > 0 && <p className="faint" style={{ margin: '6px 0 0', fontSize: 13 }}>{owed} release check{owed === 1 ? ' is' : 's are'} owed at deploy, by whoever deploys. {owed === 1 ? 'It is' : 'They are'} not checked here and {owed === 1 ? 'does' : 'do'} not hold this: see <Link to={`${base}/pr`}>the pull request step</Link>.</p>}
      {error && <p className="bad" role="alert" style={{ margin: '6px 0 0' }}>{error}</p>}
    </div>
  )
}
