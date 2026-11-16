/** The engine stays up: which failures are a connection dropping, and that one nobody awaited does not end the process. */
import { describe, expect, it } from 'vitest'
import { dropped, said, stayUp } from './stay-up.js'

describe('a dropped connection', () => {
  it('is known by its code or its words, on the error or on what caused it', () => {
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', errno: -54, syscall: 'read' })
    expect(dropped(reset)).toBe(true)
    expect(dropped(Object.assign(new Error('Failed query: select "seq" from "event"'), { cause: reset }))).toBe(true) // as drizzle wraps it: what took the engine down
    expect(dropped(new Error('Connection terminated unexpectedly'))).toBe(true)
    expect(dropped(Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }))).toBe(true)
    expect(dropped(new Error('timeout exceeded when trying to connect'))).toBe(true)
  })
  it('is not a mistake in a query, or anything else', () => {
    expect(dropped(Object.assign(new Error('column "nope" does not exist'), { code: '42703' }))).toBe(false)
    expect(dropped(new TypeError('x is not a function'))).toBe(false)
    expect(dropped(null)).toBe(false); expect(dropped('ECONNRESET')).toBe(false)
    const loop: { cause?: unknown; message: string } = { message: 'round and round' }; loop.cause = loop
    expect(dropped(loop)).toBe(false) // a cause that points at itself ends
  })
  it('is said in a line', () => {
    expect(said(Object.assign(new Error('Failed query: select 1\nparams: 2'), { cause: new Error('read ECONNRESET') }))).toBe('Failed query: select 1 (read ECONNRESET)')
  })
})

describe('staying up', () => {
  it('a rejection nobody awaited is logged and the process carries on: quietly for a dropped connection, loudly for a bug', async () => {
    const lines: string[] = []
    stayUp({ warn: (m: string) => { lines.push(`warn ${m}`) }, error: (m: string) => { lines.push(`error ${m}`) } })
    void Promise.reject(Object.assign(new Error('Failed query'), { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) }))
    void Promise.reject(new TypeError('sample bug: x is not a function'))
    await new Promise((r) => setTimeout(r, 30))
    expect(lines).toHaveLength(2) // and this line ran: the process did not end
    expect(lines[0]).toMatch(/^warn .*a connection dropped.*Failed query \(read ECONNRESET\)/)
    expect(lines[1]).toMatch(/^error .*UNHANDLED REJECTION.*sample bug/)
  })
})
