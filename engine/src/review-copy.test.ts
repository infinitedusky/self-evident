/** A review copy's parts, as text: its name, its mocks' settings, its fixture, what a reviewer reads. Everything here is made up. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withReview } from './pr.js'
import { fixtureSql, kitDirOf, mocksCompose, mocksEnv, NOT_A_KEY, readKit, readme, reviewBranch, reviewSection, type Made, type ReviewMock, type Vars } from './review-copy.js'

const vars: Vars = { ticket: 'ENT-1', task: 'ABC-9', project: 'ent-1-review', pr: '12', branch: 'ABC-9-ent-1-a-change', review_branch: 'REVIEW-ent-1-a-change-ABC-9' }
const mocks: ReviewMock[] = [
  { key: 'vendor', name: 'Vendor', cmd: 'python3 server.py', env: { VENDOR_BASE_URL: '{container_url}', VENDOR_API_KEY: 'mock-key', VENDOR_WORKFLOW: 'w-1' }, files: { 'server.py': '' }, data: { 'run.json': '{}' } },
  { key: 'other', name: 'Other', cmd: 'node server.mjs', env: { OTHER_URL: '{url}' }, files: {}, data: {} },
]
const made: Made = { by: 'Evident', task: 'ABC-9', ticket: 'ENT-1', pr: 12, branch: vars.branch, reviewBranch: vars.review_branch, from: 'abcdef0123456789', fixture: null, try: '- [ ] **Import** the file\n2. Open the person\n\n**See** the card', services: [{ key: 'vendor', name: 'Vendor', files: 1 }], files: ['x.csv'], at: '2026-11-23T10:00:00.000Z' }

describe('the review branch\'s name', () => {
  it('puts REVIEW up front and the task\'s id at the end', () => {
    expect(reviewBranch('CEB-90-ent-322-third-build', 'CEB-90')).toBe('REVIEW-ent-322-third-build-CEB-90')
    expect(reviewBranch('ent-322-third-build-ceb-90', 'CEB-90')).toBe('REVIEW-ent-322-third-build-CEB-90')
    expect(reviewBranch('feat/CEB-90/scan', 'CEB-90')).toBe('REVIEW-feat/scan-CEB-90')
  })
  it('keeps a branch that does not name the task whole', () => {
    expect(reviewBranch('some-work', 'CEB-90')).toBe('REVIEW-some-work-CEB-90')
    expect(reviewBranch('CEB-901-other', 'CEB-90')).toBe('REVIEW-CEB-901-other-CEB-90')
  })
})

describe('the mocks of a review copy', () => {
  it('points each service at its mock, with a key that is not one', () => {
    const env = mocksEnv(mocks)
    expect(env).toContain('VENDOR_BASE_URL=http://vendor-mock:8080\n')
    expect(env).toContain(`VENDOR_API_KEY=${NOT_A_KEY}\n`)
    expect(env).toContain('VENDOR_WORKFLOW=w-1\n')
    expect(env).toContain('OTHER_URL=http://other-mock:8080\n')
    expect(env).not.toContain('mock-key')
  })
  it('runs each as a Compose service from the review folder', () => {
    const y = mocksCompose(mocks)
    expect(y).toContain('  vendor-mock:\n    image: python:3.12-alpine')
    expect(y).toContain('command: ["sh", "-c", "python3 server.py"]')
    expect(y).toContain('  other-mock:\n    image: node:22-alpine')
    expect(y).toContain('/mocks/vendor:/mock:ro')
    expect(y).toContain('${REVIEW_DATA:-${REVIEW_DIR}/mocks}/vendor/data:/mock/data:ro')
    expect(mocksCompose([])).toContain('services: {}')
  })
  it('refuses a server it cannot run', () => {
    expect(() => mocksCompose([{ ...mocks[0], cmd: './serve' }])).toThrow(/python or node/)
  })
})

describe('a fixture as a file', () => {
  it('writes each table\'s rows for a database that has the schema, skipping empty tables', () => {
    const sql = fixtureSql('Meridian', { employees: [{ id: 1, name: "O'Neil" }], empty: [], companies: [{ id: 'c1' }] })
    expect(sql.indexOf("'companies'")).toBeGreaterThan(-1)
    expect(sql.indexOf("'companies'")).toBeLessThan(sql.indexOf("'employees'"))
    expect(sql).toContain(`table_name = 'employees' and is_generated = 'NEVER'; execute format('insert into %I (%s) overriding system value select %s from jsonb_populate_recordset(null::%I, %L::jsonb) on conflict do nothing', 'employees', cols, cols, 'employees', $fx$[{"id":1,"name":"O'Neil"}]$fx$); end $load$;`)
    expect(sql).not.toContain("'empty'")
    expect(sql).toContain("set local session_replication_role = 'replica';")
  })
  it('quotes rows that hold its own quoting', () => {
    expect(fixtureSql('f', { t: [{ a: '$fx$' }] })).toContain('$fxx$[{"a":"$fx$"}]$fxx$')
  })
})

describe('the app\'s kit', () => {
  it('is named in the app\'s settings', () => {
    expect(kitDirOf({ review: { kit: ' /somewhere/kit ' } })).toBe('/somewhere/kit')
    expect(kitDirOf({})).toBeNull()
  })
  it('is read with the task\'s names filled in', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kit-'))
    try {
      writeFileSync(join(dir, 'kit.json'), JSON.stringify({ start: './review/start.sh', stop: './review/stop.sh', about: 'Project {{project}} for #{{pr}}, from "{{fixture}}".', cannot: ['Sign-in.'], files: { 'start.sh, stop.sh': 'The one command, and its undo' } }))
      const k = readKit(dir, vars)
      expect(k.about).toBe('Project ent-1-review for #12, from "{{fixture}}".')
      expect(readKit(dir, { ...vars, fixture: 'Meridian' }).about).toBe('Project ent-1-review for #12, from "Meridian".')
      expect(readKit(dir, { ...vars, fixture: '' }).about).toBe('Project ent-1-review for #12, from "".')
      expect(k.stop).toBe('./review/stop.sh')
      expect(() => readKit(join(dir, 'nowhere'), vars)).toThrow(/not at/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('what a reviewer reads', () => {
  const kit = { dir: '/k', start: './review/start.sh', stop: './review/stop.sh', about: 'It needs Docker only.', cannot: ['Sign-in: you are signed in already.'], files: { 'start.sh, stop.sh': 'The one command, and its undo' } }
  it('the folder\'s README says how to start it, what to try and that nothing is real', () => {
    const r = readme(made, kit, 'A change')
    expect(r).toContain('# Review copy of ENT-1 (pull request #12)')
    expect(r).toContain('git fetch origin\ngit checkout REVIEW-ent-1-a-change-ABC-9\n./review/start.sh')
    expect(r).toContain('1. **Import** the file\n2. Open the person\n3. **See** the card')
    expect(r).toContain('Nothing. Vendor is answered by a mock')
    expect(r).toContain('Its database starts empty.')
    expect(r).toContain('| `start.sh`, `stop.sh` | The one command, and its undo |')
    expect(readme({ ...made, fixture: 'Meridian' }, kit, '')).toContain('starts from the fixture "Meridian"')
  })
  it('the pull request\'s section has Run it yourself, then how it works folded shut', () => {
    const s = reviewSection(made, kit, 'acme/app')
    expect(s.startsWith('## Review\n\n### Run it yourself')).toBe(true)
    expect(s).toContain('- [ ] **Import** the file\n- [ ] Open the person\n- [ ] **See** the card')
    expect(s).toContain('<details>\n<summary><b>How the review copy works</b>')
    expect(s).toContain('https://github.com/acme/app/compare/ABC-9-ent-1-a-change...REVIEW-ent-1-a-change-ABC-9')
    expect(s).toContain('this branch at `abcdef012`')
    expect(s).toContain('```\ngit fetch origin\ngit checkout REVIEW-ent-1-a-change-ABC-9\n./review/start.sh\n```')
    expect(s).toContain('git checkout -B REVIEW-ent-1-a-change-ABC-9 origin/REVIEW-ent-1-a-change-ABC-9')
    expect(s).toContain('| `review/start.sh`, `review/stop.sh` | The one command, and its undo |')
    expect(s).toContain('- Sign-in: you are signed in already.')
    expect(s.indexOf('### Run it yourself')).toBeLessThan(s.indexOf('<details>'))
  })
  it('takes the place of a section the writer gave that name, and of nothing else', () => {
    const written = '## Summary\n\nWhat.\n\n## Run it yourself\n\nA guess.\n\n```\n## not a heading\n```\n\n## After\n\nKept.'
    expect(withReview(written, '## Review\n\nOurs.')).toBe('## Summary\n\nWhat.\n\n## Review\n\nOurs.\n\n## After\n\nKept.')
    expect(withReview('## Summary\n\nWhat.\n\n## Review\n\nOld.', '## Review\n\nOurs.')).toBe('## Summary\n\nWhat.\n\n## Review\n\nOurs.')
    expect(withReview('## Summary\n\nWhat.', '## Review\n\nOurs.')).toBe('## Summary\n\nWhat.\n\n## Review\n\nOurs.')
  })
})
