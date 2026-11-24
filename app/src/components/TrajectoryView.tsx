/**
 * A task's test trajectory, on its Test plan step (Sandy, 2026-11-23: "a Test Trajectory, one table of every test
 * the build commits to"; "each row shows its red and green runs"). Before approval it is the plan to read: what each
 * test proves, its level, the criterion it proves, where it is written and where it turns green, what is not written
 * up front and why, and the guards. Once the build is under way each row carries what the engine saw when it ran the
 * test itself, in order: a row is proven when it failed on its assertion before its code and passed after.
 *
 * After a test report's table and a CI run's history of one check: the latest state in words, the runs as marks.
 */
import type { RowOutcome, RowRun, RowState, Trajectory } from '../engine'

const MARK: Record<RowOutcome, { icon: string; says: string }> = {
  red: { icon: '🔴', says: 'failed on an assertion' }, fake: { icon: '⚠️', says: 'failed to load' }, green: { icon: '🟢', says: 'passed' },
  none: { icon: '◌', says: 'no test was found' }, unclear: { icon: '❔', says: 'failed, and the output does not say how' },
}
const TONE: Record<RowState, string> = { planned: 'faint', red: '', green: 'ok', 'never-red': 'bad', fake: 'bad', unwritten: 'bad', unclear: 'bad', failing: 'bad' }
const LEVEL: Record<string, string> = { unit: 'a rule, fed its inputs', integration: 'several parts together, against the real database', component: 'one piece of the screen, rendered', browser: 'the app in a real browser', contract: 'that we still fit something we do not own', live: 'the whole story against the real system, once' }

export function TrajectoryView({ view: v }: { view: Trajectory }) {
  if (!v.plan) return <p className="muted" data-component="TrajectoryView">No test plan is written yet. Its agent writes it once the brief is approved and the prototype's reports are in; you approve it here, and the build is made from it.</p>
  const where = (key: string) => (key === 'tests' ? 'Test phase' : v.plan!.slices.find((s) => s.key === key)?.title ?? key)
  const at = (r: RowRun) => where(r.at.replace(/:red$/, ''))
  const early = v.plan.rows.filter((r) => r.writableAt === 'tests').length
  const deferred = v.plan.rows.filter((r) => r.deferred), guards = v.plan.rows.filter((r) => r.guard)
  const refused = v.rows.flatMap((r) => { const last = r.runs[r.runs.length - 1]; return last?.tail && r.state !== 'green' && r.state !== 'red' ? [{ id: r.id, tail: last.tail }] : [] })
  return (
    <section className="trajectory" data-component="TrajectoryView" aria-label="Test trajectory">
      <p className="trajectory-lead">{v.approved
        ? `${v.proven} of ${v.total} proven: seen to fail before their code, and to pass after.`
        : `${v.total} test${v.total === 1 ? '' : 's'}, ${early} written up front. Not approved yet: the build is made from it once you approve.`}</p>
      {v.changed && <p className="smoke-stale" role="note">It has changed since you approved it. The build stays held to the plan you approved, shown here, until you approve the new one.</p>}
      {!v.canRun && <p className="smoke-stale" role="note">This app has no test command (Settings › Landing), so the engine cannot run a row's test: nothing here can be seen red or green until it has one.</p>}
      {v.stray.length > 0 && <div className="smoke-stale" role="note">{v.stray.length} test file{v.stray.length === 1 ? '' : 's'} on the branch {v.stray.length === 1 ? 'is' : 'are'} in no row of the plan. Each is added with its row, or explained:<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{v.stray.map((f) => <li key={f} className="mono">{f}</li>)}</ul></div>}
      <table className="trajectory-table">
        <thead><tr><th>ID</th><th>What it proves</th><th>Written at</th><th>Passes at</th><th>{v.approved ? 'What the engine saw' : 'Runs'}</th></tr></thead>
        <tbody>
          {v.rows.map((r) => (
            <tr key={r.id} aria-label={`${r.id} ${r.asserts}`}>
              <td className="mono">{r.id}</td>
              <td>
                <div>{r.asserts}</div>
                <div className="faint trajectory-meta"><span title={LEVEL[r.level]}>{r.level}</span>{r.criteria.length ? <> · proves {r.criteria.join(', ')}</> : r.guard ? <> · regression guard</> : null} · <span className="mono">{r.test}</span>{r.name ? <> › {r.name}</> : null}</div>
              </td>
              <td>{where(r.writableAt)}</td>
              <td>{r.guard ? <>{where(r.passesAt)} <span className="faint">(guard)</span></> : where(r.passesAt)}</td>
              <td>
                {r.runs.length > 0 && <span className="trajectory-runs">{r.runs.map((x, n) => <span key={n} title={`${at(x)}: ${MARK[x.outcome].says}`} aria-label={`${at(x)}: ${MARK[x.outcome].says}`}>{MARK[x.outcome].icon}</span>)} </span>}
                <span className={TONE[r.state]}>{r.says}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {refused.length > 0 && <details className="checklist-output"><summary>What the run printed</summary>{refused.map((x) => <div key={x.id}><strong className="mono">{x.id}</strong><pre>{x.tail}</pre></div>)}</details>}
      {deferred.length > 0 && <>
        <h3 className="settings-h3">Not written in the test phase <span className="faint" style={{ fontWeight: 400 }}>{deferred.length}</span></h3>
        <ul className="trajectory-list">{deferred.map((r) => <li key={r.id}><strong className="mono">{r.id}</strong>, written at {where(r.writableAt)}: {r.deferred!.why}{r.deferred!.code && <details><summary>Its code, as planned</summary><pre>{r.deferred!.code}</pre></details>}</li>)}</ul>
      </>}
      {guards.length > 0 && <>
        <h3 className="settings-h3">Regression guards <span className="faint" style={{ fontWeight: 400 }}>green when written</span></h3>
        <ul className="trajectory-list">{guards.map((r) => <li key={r.id}><strong className="mono">{r.id}</strong>: {r.guard}</li>)}</ul>
      </>}
      <h3 className="settings-h3">The build, in order</h3>
      <ol className="trajectory-list" aria-label="The build, in order">
        <li><strong>Test phase</strong>: every test writable now, written and seen to fail ({early} of {v.total}).</li>
        {v.plan.slices.map((s) => <li key={s.key}><strong>{s.title}</strong>: {s.what}{s.none ? <span className="faint"> No test turns green here: {s.none}.</span> : null}</li>)}
      </ol>
      {v.plan.notes && <><h3 className="settings-h3">Notes</h3><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{v.plan.notes}</p></>}
    </section>
  )
}
