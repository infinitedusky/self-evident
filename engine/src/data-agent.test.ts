/** A task's data agent: where a round stands, read from events, and who may change a task's data when. Everything here is made up. */
import { describe, expect, it } from 'vitest'
import { dataPrompt, DATA_TOOLS, reduce, refusal, type Caller, type Round } from './data-agent.js'

const at = (n: number) => new Date(Date.UTC(2026, 10, 23, 10, n))
const ev = (type: string, payload: Record<string, unknown>, n: number) => ({ type: `data_agent.${type}`, payload, ts: at(n) })
const asked = ev('asked', { text: 'The change calls Vendor for a scan.', from: 'session_task' }, 0)
const round = (...more: ReturnType<typeof ev>[]): Round => reduce([asked, ...more])
const data = (r: Round): Caller => ({ kind: 'data', round: r })

describe('where a round stands', () => {
  it('is nothing until it is asked, then step 1', () => {
    expect(reduce([]).state).toBe('none')
    const r = round()
    expect(r).toMatchObject({ state: 'working', step: 1, asked: { text: 'The change calls Vendor for a scan.', by: 'the task\'s agent' } })
    expect(reduce([ev('asked', { text: 'x' }, 0)]).asked?.by).toBe('you')
  })
  it('stops when a step is proposed, and goes on only when it is approved', () => {
    const p = round(ev('proposed', { step: 1, summary: 'POST /scan' }, 1))
    expect(p).toMatchObject({ state: 'proposed', step: 1, proposal: { summary: 'POST /scan' } })
    const a = round(ev('proposed', { step: 1, summary: 'POST /scan' }, 1), ev('approved', { step: 1 }, 2))
    expect(a).toMatchObject({ state: 'working', step: 2, proposal: null })
    expect(a.approved.map((x) => x.step)).toEqual([1])
  })
  it('does a step again when the person asks for a change', () => {
    const r = round(ev('proposed', { step: 1, summary: 'one call' }, 1), ev('change', { step: 1, text: 'There are two calls.' }, 2))
    expect(r).toMatchObject({ state: 'working', step: 1, proposal: null, change: 'There are two calls.' })
    expect(round(ev('proposed', { step: 1, summary: 'one' }, 1), ev('change', { step: 1, text: 'two' }, 2), ev('proposed', { step: 1, summary: 'two calls' }, 3)).change).toBeNull()
  })
  it('ignores a proposal or an approval of a step it is not on', () => {
    expect(round(ev('proposed', { step: 2, summary: 'early' }, 1)).state).toBe('working')
    expect(round(ev('approved', { step: 1 }, 1)).step).toBe(1)
    expect(round(ev('proposed', { step: 1, summary: 's' }, 1), ev('approved', { step: 2 }, 2)).state).toBe('proposed')
  })
  it('is done after the third step is approved, and asked again starts over', () => {
    const all = [1, 2, 3].flatMap((s, i) => [ev('proposed', { step: s, summary: `step ${s}`, services: s === 2 ? ['vendor'] : [] }, i * 2 + 1), ev('approved', { step: s }, i * 2 + 2)])
    const done = round(...all)
    expect(done.state).toBe('done')
    expect(done.approved.map((x) => x.step)).toEqual([1, 2, 3])
    const again = reduce([asked, ...all, ev('asked', { text: 'It now calls a second service.' }, 9)])
    expect(again).toMatchObject({ state: 'working', step: 1, approved: [] })
  })
  it('is not started over by being asked in the middle of a round', () => {
    expect(round(ev('proposed', { step: 1, summary: 's' }, 1), ev('asked', { text: 'also this' }, 2))).toMatchObject({ state: 'proposed', step: 1 })
  })
})

describe('who may change a task\'s data', () => {
  const s1 = round(), s1p = round(ev('proposed', { step: 1, summary: 's' }, 1))
  const s2 = round(ev('proposed', { step: 1, summary: 's' }, 1), ev('approved', { step: 1 }, 2))
  const s3 = round(ev('proposed', { step: 1, summary: 's' }, 1), ev('approved', { step: 1 }, 2), ev('proposed', { step: 2, summary: 's', services: ['vendor'] }, 3), ev('approved', { step: 2 }, 4))
  it('lets anyone read', () => {
    for (const c of [{ kind: 'task' } as Caller, data(s1p), data(reduce([]))]) {
      expect(refusal(c, 'task_calls', { op: 'list' })).toBeNull()
      expect(refusal(c, 'service', { op: 'list' })).toBeNull()
      expect(refusal(c, 'test_files', { op: 'list' })).toBeNull()
      expect(refusal(c, 'now', {})).toBeNull()
    }
  })
  it('sends a task\'s own agent to the data agent for every change', () => {
    for (const [tool, op] of [['task_calls', 'set'], ['service', 'endpoint_add'], ['mock', 'save'], ['mock_data', 'fake'], ['test_files', 'add']]) expect(refusal({ kind: 'task' }, tool, { op })).toMatch(/data_agent/)
  })
  it('leaves everyone else as they were: the app\'s own agent, a prototype\'s, a person\'s own session', () => {
    expect(refusal({ kind: 'other' }, 'service', { op: 'endpoint_add' })).toBeNull()
  })
  it('holds the data agent to its step', () => {
    expect(refusal(data(s1), 'task_calls', { op: 'set' })).toBeNull()
    expect(refusal(data(s1), 'service', { op: 'endpoint_add', service: 'vendor' })).toMatch(/Step 1 only lists/)
    expect(refusal(data(s1p), 'task_calls', { op: 'set' })).toMatch(/has not answered yet/)
    expect(refusal(data(s2), 'task_calls', { op: 'set' })).toMatch(/Step 2 changes nothing/)
    expect(refusal(data(s2), 'mock_data', { op: 'fake', mock: 'vendor' })).toMatch(/Step 2 changes nothing/)
    expect(refusal(data(s3), 'mock_data', { op: 'fake', mock: 'vendor' })).toBeNull()
    expect(refusal(data(s3), 'service', { op: 'endpoint_add', service: 'Vendor' })).toBeNull()
    expect(refusal(data(s3), 'test_files', { op: 'add' })).toBeNull()
  })
  it('refuses to build for a service the person did not approve', () => {
    expect(refusal(data(s3), 'service', { op: 'add', key: 'other-vendor' })).toMatch(/not one of the services the person approved/)
    expect(refusal(data(s3), 'mock_data', { op: 'write', mock: 'other' })).toMatch(/"other" is not one/)
  })
  it('refuses once the round is over', () => {
    const done = reduce([asked, ...[1, 2, 3].flatMap((s, i) => [ev('proposed', { step: s, summary: 's', services: ['vendor'] }, i * 2 + 1), ev('approved', { step: s }, i * 2 + 2)])])
    expect(refusal(data(done), 'mock_data', { op: 'fake', mock: 'vendor' })).toMatch(/Wait to be asked/)
  })
  it('walls every tool that changes a task\'s data', () => {
    expect(Object.keys(DATA_TOOLS).sort()).toEqual(['mock', 'mock_data', 'service', 'task_calls', 'test_files'])
  })
})

describe('what the data agent is told', () => {
  it('says its three steps, that it stops after each, and where it stands', () => {
    const p = dataPrompt({ id: 'iss_1', title: 'A scan (sample)' }, 'ABC-9', round(ev('proposed', { step: 1, summary: 's' }, 1)))
    expect(p).toContain('You are the data agent of one task, ABC-9 "A scan (sample)"')
    for (const s of ['Step 1, what the task calls.', 'Step 2, where the data comes from.', 'Step 3, build it.']) expect(p).toContain(s)
    expect(p).toContain('you stop after each')
    expect(p).toContain('you proposed step 1 and are waiting for the person')
    expect(p).toContain('never enters a message')
  })
  it('knows an endpoint has a response per fixture, and that setting who one answers for makes no response', () => {
    const p = dataPrompt({ id: 'iss_1', title: 'A scan (sample)' }, 'ABC-9', round())
    expect(p).toContain('a default response and may have a different one for any fixture')
    expect(p).toContain('say which fixtures this task will be tried from')
    expect(p).toContain('a response for one fixture (the same ops with response: the fixture\'s name')
    expect(p).toContain('an override of who, not a way to make a response')
  })
})
