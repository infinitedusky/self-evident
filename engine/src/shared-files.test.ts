/** The graph's file nodes follow the scheduler's overlap rule, so every file wait is drawn. */
import { describe, expect, it } from 'vitest'
import { sharedFiles } from './projects.js'

const ph = (id: string, status: string, files: string[]) => ({ id, status, files })

describe('sharedFiles', () => {
  it('a directory claim covers the file inside it: one node, named by the file, held by the running sub-issue', () => {
    const out = sharedFiles([
      ph('p31', 'running', ['web/stories', 'web/proxy.ts']),
      ph('p32', 'queued', ['web/stories/join.stories.tsx', 'web/lib/api.ts']),
    ])
    expect(out).toEqual([{ path: 'web/stories/join.stories.tsx', subIssues: ['p31', 'p32'], heldBy: 'p31' }])
  })
  it('exact matches still work; unrelated paths and finished sub-issues do not make nodes', () => {
    const out = sharedFiles([
      ph('a', 'queued', ['server/hg/api.py']),
      ph('b', 'queued', ['server/hg/api.py', 'server/hg/apiary.py']),
      ph('c', 'done', ['server/hg/api.py']),
      ph('d', 'queued', ['server/hg/apix.py']),
    ])
    expect(out).toEqual([{ path: 'server/hg/api.py', subIssues: ['a', 'b'], heldBy: null }])
  })
})
