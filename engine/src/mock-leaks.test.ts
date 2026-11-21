import { describe, expect, it } from 'vitest'
import { checkLeaks, keptRefused, parseCsv, readRecorded } from './mock-leaks.js'

// Made-up data throughout: these stand for a recording, and are invented like everything else in tests.
const csv = [
  'work_email,full_name,scams_found,doxxing_posts,status',
  'dana.rivers@acme-sample.com,Dana Rivers,"[{\'title\': \'Fake recruiter page using her photo\', \'url\': \'https://social.example.net/p/889912\'}]",[],completed',
  'lee.okafor@acme-sample.com,Lee Okafor,[],"[""Posted home street of Lee with 4415 Birchwood Lane""]",completed',
].join('\n')
const json = JSON.stringify({ job_id: '0b8f4e7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b', status: 'completed', profiles: [{ handle: 'drivers_88', phone: '+1 (415) 555-0199', bio: 'Runs a bakery in Portland since 2009' }] })
const recorded = [{ name: '003.response.csv', text: csv }, { name: '002.response.json', text: json }]

describe('parseCsv', () => {
  it('reads quotes, doubled quotes and newlines inside a cell', () => {
    expect(parseCsv('a,b\n"x, ""y""","line\nbreak"\n')).toEqual([['a', 'b'], ['x, "y"', 'line\nbreak']])
  })
})

describe('readRecorded', () => {
  it('keeps the column names and keys as shape, and looks inside a cell', () => {
    const r = readRecorded(csv)
    expect(r.shape).toContain('work_email')
    expect(r.values).toContain('Fake recruiter page using her photo')
    expect(readRecorded(json).shape).toEqual(expect.arrayContaining(['job_id', 'profiles', 'handle']))
  })
})

describe('checkLeaks', () => {
  const clean = { path: 'data/results.csv', text: 'work_email,full_name,scams_found,doxxing_posts,status\nsam.sample@acme.example,Sample Person,[],[],completed\n' }

  it('passes a mock that keeps the shape and invents the values', () => {
    const r = checkLeaks(recorded, [clean, { path: 'server.py', text: 'STATUS = "completed"\nJOB = "11111111-2222-4333-8444-555555555555"\n' }], ['completed'])
    expect(r).toMatchObject({ ok: true, count: 0 })
    expect(r.read.files).toBe(2)
  })

  it('finds an email, an address, an id and a phone number anywhere', () => {
    const r = checkLeaks(recorded, [{ path: 'server.py', text: '# copied from dana.rivers@acme-sample.com\nURL = "https://social.example.net/p/889912"\nJOB = "0b8f4e7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b"\nPHONE = "415.555.0199 x"' }], ['completed'])
    expect(r.ok).toBe(false)
    expect(r.leaks.map((l) => l.kind)).toEqual(expect.arrayContaining(['address', 'email', 'id', 'number']))
  })

  it('finds a name inside prose, and four words of a longer value', () => {
    const r = checkLeaks(recorded, [{ path: 'PROVENANCE.md', text: 'Sample data: a scan of lee okafor, who runs a bakery in a small town.' }], ['completed'])
    expect(r.leaks.map((l) => l.excerpt)).toEqual(expect.arrayContaining(['lee okafor', 'runs a bakery in']))
  })

  it('finds a handle inside prose, and a one-word value as a whole value only', () => {
    expect(checkLeaks(recorded, [{ path: 'a.md', text: 'see drivers_88 for more' }], ['completed']).leaks[0]).toMatchObject({ kind: 'value', excerpt: 'drivers_88' })
    expect(checkLeaks(recorded, [{ path: 'a.json', text: '{"status":"completed"}' }]).ok).toBe(false) // a status is a value until it is kept
    expect(checkLeaks(recorded, [{ path: 'a.md', text: 'The scan completed.' }]).ok).toBe(true) // a short word in prose is not a hit
  })

  it('never counts a key or a column name', () => {
    expect(checkLeaks(recorded, [{ path: 'a.py', text: 'row["work_email"]; row["doxxing_posts"]; "full_name"' }], ['completed']).ok).toBe(true)
  })
})

describe('keptRefused', () => {
  it('refuses to keep anything that is a person\'s or an account\'s', () => {
    expect(keptRefused(['completed', 'dana@acme-sample.com', 'https://x.example/a', '4155550199'])).toEqual(['dana@acme-sample.com', 'https://x.example/a', '4155550199'])
  })
})
