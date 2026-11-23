/** The faker: structure kept, values replaced, and what it makes passes the leak check. The "real" data here is made up. */
import { describe, expect, it } from 'vitest'
import { fake, parseLiteral } from './fake.js'
import { checkLeaks, parseCsv } from './mock-leaks.js'

// A made-up response in the shape of a vendor's results: what was sent echoed back, then what was found, some of it
// written out inside a cell the way Python prints a list, some as JSON, some as text with line breaks.
const head = 'tracking_id,work_email,full_name,status,risk_level,profiles,scams_found,person_summary,phone,last_seen,score'
const profiles = "[{'platform': 'linkedin', 'url': 'https://www.linkedin.com/in/rowan-vale-88', 'handle': 'rowan_vale88', 'verified': True, 'followers': 1243}, {'platform': 'x', 'url': 'https://x.com/rvale', 'handle': 'rvale', 'verified': False, 'followers': None}]"
const scams = JSON.stringify([{ title: 'Cloned profile selling fake tickets', url: 'https://tickets-northgate.com/offer?id=5521', reported: '2026-10-02', ids: [1, 2, 3, 4, 5, 6] }])
const summary = 'Rowan Vale is a regional director at Northgate Holdings in Denver.\nTwo impersonating accounts were found, one of them selling tickets.\n\nHome address appears on three broker sites.'
const cell = (c: string) => `"${c.replace(/"/g, '""')}"`
const recorded = [
  head,
  ['7c1e5f0a-2b3d-4e6f-8a9b-0c1d2e3f4a5b', 'rowan.vale@northgate-holdings.com', 'Rowan Vale', 'completed', 'high', cell(profiles), cell(scams), cell(summary), '+1 (303) 555-0188', '2026-11-18T15:20:00Z', '87.5'].join(','),
  ['9d2f6a1b-3c4e-4f70-9bac-1d2e3f4a5b6c', 'kit.marsh@northgate-holdings.com', 'Kit Marsh', 'completed', 'low', '[]', '[]', '', '', '11/02/2026', '0'].join(','),
].join('\r\n') + '\r\n'

describe('the faker', () => {
  const plan = { keep: ['status', 'risk_level', 'platform'], keepHosts: ['linkedin.com', 'x.com'], salt: 'test' }
  const { files, report } = fake([{ name: 'results.csv', text: recorded }], plan)
  const out = files['results.csv']
  const [h, a, b] = parseCsv(out)
  const col = (row: string[], name: string) => row[h.indexOf(name)]

  it('keeps every column in order, the line endings and the rows', () => {
    expect(h.join(',')).toBe(head)
    expect(out.endsWith('\r\n')).toBe(true)
    expect(parseCsv(out)).toHaveLength(3)
    expect(a).toHaveLength(h.length)
  })

  it('keeps what is structure: what the plan names, empties, booleans, small numbers', () => {
    expect(col(a, 'status')).toBe('completed')
    expect(col(a, 'risk_level')).toBe('high')
    expect(col(a, 'score')).toBe('87.5')
    expect(col(b, 'profiles')).toBe('[]')
    expect(col(b, 'person_summary')).toBe('')
    expect(col(b, 'phone')).toBe('')
    expect(col(a, 'profiles')).toContain("'platform': 'linkedin'")
    expect(col(a, 'profiles')).toContain("'verified': True")
    expect(col(a, 'profiles')).toContain("'followers': None")
    expect(report.keptValues).toEqual(expect.arrayContaining(['completed', 'high', 'low', 'linkedin', 'x']))
  })

  it('replaces every other value by its kind, in the same format', () => {
    expect(col(a, 'tracking_id')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(col(a, 'tracking_id')).not.toBe('7c1e5f0a-2b3d-4e6f-8a9b-0c1d2e3f4a5b')
    expect(col(a, 'work_email')).toMatch(/^[a-z]+\.[a-z]+@[a-z]+\.example$/)
    expect(col(a, 'full_name')).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
    expect(col(a, 'phone')).toMatch(/^\+\d \(\d{3}\) \d{3}-\d{4}$/)
    expect(col(a, 'phone')).not.toBe('+1 (303) 555-0188')
    expect(col(a, 'last_seen')).toMatch(/^\d{4}-\d{2}-\d{2}T15:20:00Z$/)
    expect(col(a, 'last_seen').slice(0, 10) < '2026-11-18').toBe(true)
    expect(col(b, 'last_seen')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })

  it('goes into what is written inside a cell, and writes it back the same way', () => {
    const p = parseLiteral(col(a, 'profiles'))
    expect(p).toMatchObject({ t: 'list', open: '[' })
    expect(col(a, 'profiles')).toMatch(/'url': 'https:\/\/www\.linkedin\.com\/in\/[a-z0-9-]+'/) // the site is structure; who is not
    expect(col(a, 'profiles')).not.toContain('rowan')
    const s = JSON.parse(col(a, 'scams_found')) as { title: string; url: string; reported: string; ids: number[] }[]
    expect(Object.keys(s[0])).toEqual(['title', 'url', 'reported', 'ids'])
    expect(s[0].url).toMatch(/^https:\/\/[a-z]+-[a-z]+\.example\/[a-z]+\?id=\d{4}$/)
    expect(s[0].ids.length).toBeLessThan(6) // the outline: a few fewer
    expect(s[0].ids.length).toBeGreaterThan(3)
  })

  it('replaces long text whole, with its lines', () => {
    const t = col(a, 'person_summary')
    expect(t.startsWith('Sample data:')).toBe(true)
    expect(t.split('\n')).toHaveLength(4)
    expect(t.split('\n')[2]).toBe('')
    expect(Math.abs(t.length - summary.length)).toBeLessThan(40)
  })

  it('replaces a column named as text whole, even where its cell holds a written-out object', () => {
    // Made up: a cell whose keys are themselves what was found (the sites someone is on), so going into it would keep them.
    const sources = JSON.stringify({ 'Northgate Staff Directory': { seen: 3 }, 'Denver Alumni Board': { seen: 1 } })
    const text = ['id,who,sources,detail', `1,Rowan Vale,${cell(sources)},${cell(JSON.stringify({ note: 'ok', found: { 'Northgate Staff Directory': ['a', 'b'] } }))}`].join('\n') + '\n'
    const kept = parseCsv(fake([{ name: 'r.csv', text }], { salt: 'test' }).files['r.csv'])[1]
    expect(kept[2]).toContain('Northgate Staff Directory') // gone into: its keys are kept as structure
    const made = parseCsv(fake([{ name: 'r.csv', text }], { salt: 'test', text: ['sources', 'detail.found'] }).files['r.csv'])[1]
    expect(made[2].startsWith('Sample data:')).toBe(true)
    expect(made[2]).not.toMatch(/Northgate|Denver|Alumni/)
    // A key inside a cell, named by its path: what it holds is replaced whole and the rest of the cell is still gone into.
    const detail = JSON.parse(made[3]) as { note: string; found: string }
    expect(Object.keys(detail)).toEqual(['note', 'found'])
    expect(detail.found.startsWith('Sample data:')).toBe(true)
    expect(made[3]).not.toContain('Northgate')
    expect(checkLeaks([{ name: 'r.csv', text }], [{ path: 'r.csv', text: made.join(',') }]).ok).toBe(true)
  })

  it('makes the same real value the same fake one everywhere, and the same again next time', () => {
    const both = fake([{ name: 'results.csv', text: recorded }, { name: 'a.json', text: JSON.stringify({ owner: 'Rowan Vale', people: [{ name: 'Rowan Vale', email: 'rowan.vale@northgate-holdings.com' }] }, null, 2) }], plan).files
    const twice = both['a.json']
    const j = JSON.parse(twice) as { owner: string; people: { name: string; email: string }[] }
    expect(j.owner).toBe(j.people[0].name)
    expect(j.owner).toBe(parseCsv(both['results.csv'])[1][2])
    expect(j.people[0].email).toBe(parseCsv(both['results.csv'])[1][1])
    expect(fake([{ name: 'results.csv', text: recorded }], plan).files['results.csv']).toBe(out)
    expect(twice).toContain('\n  "owner"') // written as it was
    expect(fake([{ name: 'results.csv', text: recorded }], { ...plan, salt: 'another' }).files['results.csv']).not.toBe(out)
  })

  it('makes something the leak check accepts', () => {
    const r = checkLeaks([{ name: 'results.csv', text: recorded }], [{ path: 'results.csv', text: out }], report.keptValues)
    expect(r.leaks).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('will not keep what is someone\'s, whatever the plan says, and names what may be structure', () => {
    const r = fake([{ name: 'results.csv', text: recorded }], { keep: ['work_email', 'status'], salt: 'test' })
    expect(parseCsv(r.files['results.csv'])[1][1]).toMatch(/\.example$/)
    expect(r.report.refusedKeep).toEqual(['work_email'])
    expect(r.report.maybeStructure).toEqual([]) // risk_level is words of state (high, low): kept without being asked, so nothing is left to suggest
    expect(r.report.keptValues).toEqual(expect.arrayContaining(['high', 'low']))
    expect(r.report.byKind).toMatchObject({ email: 2, id: 2 })
  })

  it('reads one JSON document, JSON lines and plain lines too', () => {
    const lines = fake([{ name: 'events.jsonl', text: '{"user": "rowan.vale@northgate-holdings.com", "n": 3}\n{"user": "kit.marsh@northgate-holdings.com", "n": 12345678}\n' }], { salt: 'test' }).files['events.jsonl']
    const [x, y] = lines.trim().split('\n').map((l) => JSON.parse(l) as { user: string; n: number })
    expect(x.user).toMatch(/\.example$/)
    expect(x.n).toBe(3)
    expect(String(y.n)).toHaveLength(8)
    expect(y.n).not.toBe(12345678)
    expect(lines).toContain('{"user": "') // its spacing kept
    expect(fake([{ name: 'note.txt', text: 'Rowan Vale\nrowan.vale@northgate-holdings.com' }], { salt: 'test' }).files['note.txt']).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+\n[a-z.]+@[a-z]+\.example$/)
  })

  describe('what a record says is kept, who it is about is not', () => {
    const finding = (n: number, status: string, kind: string, handle: string) => ({ status, kind, handle, name_shown: 'Rowan Vale', url: `https://social.example-site.com/u/${handle}/post/${n}`, note: 'Seen once' })
    const items = [finding(1, 'live', 'clone', 'rowanvale'), finding(2, 'reported', 'clone', 'rowanvale'), finding(3, 'live', 'parody', 'rvale'), finding(4, 'reported', 'clone', 'rowanvale'), finding(5, 'live', 'parody', 'rvale'), finding(6, 'live', 'clone', 'rowanvale')]
    const text = `work_email,profiles,Status\nrowan.vale@northgate-holdings.com,${cell(JSON.stringify(items))},completed\n`
    const made = () => { const r = fake([{ name: 'results.csv', text }], { salt: 'test', varyCounts: false }); return { r, out: JSON.parse(parseCsv(r.files['results.csv'])[1][1]) as ReturnType<typeof finding>[] } }

    it('keeps a word of state wherever it stands, with no plan', () => {
      const { r, out } = made()
      expect(out.map((f) => f.status)).toEqual(['live', 'reported', 'live', 'reported', 'live', 'live'])
      expect(r.report.keptValues).toEqual(expect.arrayContaining(['live', 'reported']))
      expect(parseCsv(r.files['results.csv'])[1][2]).toBe('completed') // said once, and still a word of state
    })
    it('keeps a key whose values are a small vocabulary said again and again, and says which', () => {
      const { r, out } = made()
      expect(out.map((f) => f.kind)).toEqual(['clone', 'clone', 'parody', 'clone', 'parody', 'clone'])
      expect(r.report.keptAsStructure).toEqual(['profiles.kind', 'profiles.status'])
    })
    it('still replaces a handle said again and again: its key is someone\'s, and it is in their web addresses', () => {
      const { r, out } = made()
      for (const f of out) { expect(f.handle).not.toMatch(/rowanvale|rvale/); expect(f.url).not.toMatch(/rowanvale|rvale/); expect(f.name_shown).not.toBe('Rowan Vale') }
      expect(r.files['results.csv']).not.toMatch(/rowan|northgate/i)
      expect(checkLeaks([{ name: 'results.csv', text }], [{ path: 'results.csv', text: r.files['results.csv'] }], r.report.keptValues).ok).toBe(true)
    })
    it('does not take a repeated lowercase word for a vocabulary when it is part of someone\'s address, whatever its key', () => {
      const rows = [1, 2, 3, 4].map((n) => ({ tag: 'rvale', url: `https://social.example-site.com/u/rvale/${n}` }))
      const r = fake([{ name: 'x.json', text: JSON.stringify(rows) }], { salt: 'test', varyCounts: false })
      expect(r.files['x.json']).not.toContain('rvale')
      expect(r.report.keptAsStructure).toBeUndefined()
    })
    it('does not keep a word of state inside a column the plan names as text', () => {
      const r = fake([{ name: 'x.json', text: JSON.stringify([{ status: 'live' }]) }], { salt: 'test', text: ['status'] })
      expect(r.files['x.json']).not.toContain('"live"')
    })
  })
})
