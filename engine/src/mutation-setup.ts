/**
 * How an app's mutation testing is set, read from its settings. Apart from mutation.ts because nothing here needs the
 * computer: Settings › Skills reads it in the browser (contracts.ts).
 */
export const MUTANTS_MAX = 150
export interface MutationSetup { off: boolean; tool: { cmd: string; report: string } | null; testCmd: string | null; max: number }

/** `setup.mutation`: off, its own tool, how the covering tests are run, how many breaks at most. */
export function mutationSetup(setup: unknown): MutationSetup {
  const v = ((setup ?? {}) as { mutation?: { off?: boolean; tool?: { cmd?: string; report?: string }; test_cmd?: string; max?: number } }).mutation ?? {}
  return { off: v.off === true, tool: v.tool?.cmd?.trim() && v.tool.report?.trim() ? { cmd: v.tool.cmd.trim(), report: v.tool.report.trim() } : null, testCmd: v.test_cmd?.trim() || null, max: Number.isFinite(v.max) && Number(v.max) > 0 ? Math.min(2000, Math.floor(Number(v.max))) : MUTANTS_MAX }
}
/** `setup.finalize.prepare`: what is run in the finalizing's own checkout before its tests, when they need something installed. */
export const finalizePrepare = (setup: unknown): string | null => ((setup ?? {}) as { finalize?: { prepare?: string } }).finalize?.prepare?.trim() || null

/** What the Skills page changes: the whole of the mutation settings and the prepare command, as they should be after. */
export interface FinalizeChange { off?: boolean; testCmd?: string; prepare?: string; max?: number | null; tool?: { cmd: string; report: string } | null }
/** A change as the two settings it is kept in; a setting left empty is null, so the patch removes it. Pure. */
export function applyFinalizeChange(setup: unknown, c: FinalizeChange): { mutation: Record<string, unknown> | null; finalize: Record<string, unknown> | null } {
  const now = mutationSetup(setup), s = (setup ?? {}) as { mutation?: Record<string, unknown>; finalize?: Record<string, unknown> }
  const off = c.off ?? now.off, testCmd = (c.testCmd ?? now.testCmd ?? '').trim(), tool = c.tool === undefined ? now.tool : c.tool?.cmd.trim() && c.tool.report.trim() ? { cmd: c.tool.cmd.trim(), report: c.tool.report.trim() } : null
  const max = c.max === undefined ? (now.max === MUTANTS_MAX ? null : now.max) : c.max && c.max > 0 && Math.floor(c.max) !== MUTANTS_MAX ? Math.min(2000, Math.floor(c.max)) : null
  const { off: _o, test_cmd: _t, tool: _l, max: _m, ...restM } = s.mutation ?? {}
  const mutation = { ...restM, ...(off ? { off: true } : {}), ...(testCmd ? { test_cmd: testCmd } : {}), ...(tool ? { tool } : {}), ...(max ? { max } : {}) }
  const { prepare: _p, ...restF } = s.finalize ?? {}
  const prepare = (c.prepare ?? finalizePrepare(setup) ?? '').trim()
  const finalize = { ...restF, ...(prepare ? { prepare } : {}) }
  return { mutation: Object.keys(mutation).length ? mutation : null, finalize: Object.keys(finalize).length ? finalize : null }
}
