/**
 * Where a builder is, from its own list of steps (Sandy, 2026-11-15: "they seem to be stuck on the first step of
 * each, or the node drawing is wrong"). A builder keeps its steps with whichever task tool it has: `TodoWrite`, which
 * sends the whole list each time, or `TaskCreate` and `TaskUpdate`, which add one step and change one. The engine
 * only read the first, and from 2026-11-01 agents used the second, so no build reported a step.
 *
 * One tracker per run. It is fed the builder's tool calls and their results, and gives back the whole list each time
 * it changes.
 */
export interface TrackedStep { text: string; status: string }
interface Kept extends TrackedStep { id: string; use?: string }

export class StepTracker {
  private list: Kept[] = []
  private made = 0

  private out(): TrackedStep[] { return this.list.map(({ text, status }) => ({ text, status })) }

  /** A tool call of the builder's. The list when it changed, else null. */
  use(block: { id?: string; name?: string; input?: any }): TrackedStep[] | null {
    const input = block.input ?? {}
    if (block.name === 'TodoWrite') {
      const todos = Array.isArray(input.todos) ? input.todos : []
      this.list = todos.map((t: any, i: number) => ({ id: String(i + 1), text: String(t.content ?? t.activeForm ?? ''), status: String(t.status ?? 'pending') }))
      return this.out()
    }
    if (block.name === 'TaskCreate') {
      // Its id comes with the result; until then it is the next number, which is what the tool gives a fresh list.
      this.list.push({ id: String(++this.made), text: String(input.subject ?? input.description ?? '').trim(), status: 'pending', use: block.id })
      return this.out()
    }
    if (block.name === 'TaskUpdate') {
      const step = this.list.find((s) => s.id === String(input.taskId ?? ''))
      if (!step) return null
      if (input.status === 'deleted') this.list = this.list.filter((s) => s !== step)
      else { if (typeof input.status === 'string') step.status = input.status; if (typeof input.subject === 'string' && input.subject.trim()) step.text = input.subject.trim() }
      return this.out()
    }
    return null
  }

  /** The result of a tool call: a created step learns the id the tool gave it, so later changes find it. */
  result(toolUseId: string | undefined, text: string): void {
    const step = toolUseId ? this.list.find((s) => s.use === toolUseId) : undefined
    if (!step) return
    step.use = undefined
    const id = text.match(/"id"\s*:\s*"?([A-Za-z0-9_-]+)"?/)?.[1] ?? text.match(/[Tt]ask #?([A-Za-z0-9_-]+)/)?.[1]
    if (id) step.id = id
  }
}
