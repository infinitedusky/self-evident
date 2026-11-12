/** Every agent is pointed at Self Evident's own guide to running it; the file it is pointed at has to be there, and say what it is asked about. */
import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from './db/client.js'
import { GUIDE } from './talk.js'

afterAll(async () => { await pool.end() })

describe('the guide to running Self Evident', () => {
  it('is where the agents are told it is, and covers what they are told it covers', () => {
    const text = readFileSync(GUIDE, 'utf8')
    for (const heading of ['## Way 1: its own database', '## Way 2: a shared database', '## Moving between computers', '## Computers and paths', '## Adding an app', '## Two GitHub accounts on one computer', '## A product in two repositories', '## When something goes wrong'])
      expect(text).toContain(heading)
  })
})
