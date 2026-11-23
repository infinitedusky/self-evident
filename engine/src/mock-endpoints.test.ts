/** A mock's endpoints: which response answers which, read from file names and from what a live run recorded. Made up. */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanEndpoints, endpointFor, endpointOfFile, endpointViews, exchangesOf, keyed, keepingWhatWasSet } from './mock-endpoints.js'

const endpoints = cleanEndpoints([
  { key: 'Start', method: 'post', path: '/runs', what: 'a job id' },
  { key: 'status', method: 'GET', path: '/runs/{id}/status' },
  { key: 'links', method: 'GET', path: '/runs/:id/links' },
  { key: 'results', method: 'GET', path: 'the results file, by the link the service sends', file: 'export_2026-11-18.csv' },
  { key: 'status', method: 'GET', path: '/again' }, // the same key twice: the first stands
  { key: '', method: 'GET', path: '/nameless' },
])
const home = mkdtempSync(join(tmpdir(), 'endpoints-'))
afterAll(() => rmSync(home, { recursive: true, force: true }))

describe('a mock\'s endpoints', () => {
  it('are kept clean: a key each, the method in capitals, no key twice', () => {
    expect(endpoints.map((e) => [e.key, e.method])).toEqual([['start', 'POST'], ['status', 'GET'], ['links', 'GET'], ['results', 'GET']])
  })

  it('know a call by its method and path, a part that varies standing for any', () => {
    expect(endpointFor(endpoints, 'get', '/runs/job-7/status?x=1')?.key).toBe('status')
    expect(endpointFor(endpoints, 'GET', '/runs/job-7/links')?.key).toBe('links')
    expect(endpointFor(endpoints, 'POST', '/runs')?.key).toBe('start')
    expect(endpointFor(endpoints, 'GET', '/runs')).toBeNull() // another method
    expect(endpointFor(endpoints, 'GET', '/runs/job-7/cost')).toBeNull() // a call the mock does not have
  })

  it('know a data file by its name: the endpoint\'s own, more added beside it, or the one it names', () => {
    expect(endpointOfFile(endpoints, 'status.json')?.key).toBe('status')
    expect(endpointOfFile(endpoints, 'results.nothing-found.csv')?.key).toBe('results')
    expect(endpointOfFile(endpoints, 'export_2026-11-18.csv')?.key).toBe('results')
    expect(endpointOfFile(endpoints, 'sample-people.csv')).toBeNull()
  })

  it('say what is behind each from a folder of files a person gave, and which data files are nobody\'s', () => {
    const dir = join(home, 'given')
    mkdirSync(dir)
    writeFileSync(join(dir, 'export_2026-11-18.csv'), 'a,b\n1,2\n'); writeFileSync(join(dir, 'given.meta.json'), '{}')
    const v = endpointViews(endpoints, dir, ['export_2026-11-18.csv', 'results.added.csv', 'sample-people.csv'])
    expect(v.endpoints.map((e) => [e.key, e.real?.how ?? null, e.files])).toEqual([['start', null, []], ['status', null, []], ['links', null, []], ['results', 'given', ['export_2026-11-18.csv', 'results.added.csv']]])
    expect(v.unlinked).toEqual(['sample-people.csv'])
  })

  it('say what is behind each from a live run, and give its responses under their endpoints\' names', () => {
    const dir = join(home, 'recorded')
    mkdirSync(dir)
    const call = (no: string, method: string, address: string, ext: string, body: string) => { writeFileSync(join(dir, `${no}-x.meta.json`), JSON.stringify({ method, address, status: 200 })); writeFileSync(join(dir, `${no}.response.${ext}`), body) }
    call('001', 'POST', 'https://api.vendor.example/v1/runs?workflow=w', 'json', '{"job_id":"job-7"}')
    call('002', 'GET', 'https://api.vendor.example/v1/runs/job-7/status', 'json', '{"status":"running"}')
    call('003', 'GET', 'https://api.vendor.example/v1/runs/job-7/status', 'json', '{"status":"completed"}')
    call('004', 'GET', 'https://files.vendor.example/signed/abc.csv?sig=1', 'csv', 'a,b\n1,2\n')
    call('005', 'GET', 'https://api.vendor.example/v1/runs/job-7/cost', 'json', '{"credits":250}')
    expect(exchangesOf(dir).map((x) => x.no)).toEqual(['001', '002', '003', '004', '005'])
    const v = endpointViews(endpoints, dir, [], 'https://api.vendor.example/v1')
    expect(v.endpoints.map((e) => [e.key, e.real?.how ?? null])).toEqual([['start', 'recorded'], ['status', 'recorded'], ['links', null], ['results', 'recorded']])
    const view = keyed(dir, endpoints, 'https://api.vendor.example/v1')
    expect(readdirSync(view).filter((f) => !f.startsWith('.')).sort()).toEqual(['results.csv', 'start.json', 'status.1.json', 'status.json'])
    expect(readFileSync(join(view, 'status.json'), 'utf8')).toBe('{"status":"completed"}') // the last answer is the endpoint's; the earlier one is beside it
    expect(keyed(dir, endpoints, 'https://api.vendor.example/v1')).toBe(view) // made once
    expect(keyed(join(home, 'given'), endpoints)).toBe(join(home, 'given')) // given files are already under their own names
  })

describe('a service\'s endpoints said again whole', () => {
  const was = [{ key: 'links', method: 'GET', path: '/runs/{id}/links' }, { key: 'file', method: 'GET', path: 'the link in download_url', follows: 'links', linkField: 'download_url', what: 'One row a person' }, { key: 'profile', method: 'GET', path: '/me', sensitive: true }]
  it('keeps that an endpoint is a next step, what it is, and that it is sensitive, when the new list does not say', () => {
    const next = keepingWhatWasSet([{ key: 'links', method: 'GET', path: '/runs/{id}/links' }, { key: 'file', method: 'GET', path: 'the link in download_url' }, { key: 'profile', method: 'GET', path: '/me', sensitive: false }, { key: 'new', method: 'POST', path: '/runs' }], was)
    expect(next.find((e) => e.key === 'file')).toMatchObject({ follows: 'links', linkField: 'download_url', what: 'One row a person' })
    expect(next.find((e) => e.key === 'profile')?.sensitive).toBe(true) // never taken off by a list
    expect(next.find((e) => e.key === 'new')).toMatchObject({ method: 'POST', path: '/runs' })
  })
  it('lets the new list say otherwise where it does say: a step made to stand alone, or to follow another', () => {
    expect(keepingWhatWasSet([{ key: 'links', method: 'GET', path: '/runs/{id}/links' }, { key: 'file', method: 'GET', path: '/files/{id}', follows: null }], was).find((e) => e.key === 'file')?.follows).toBeUndefined()
  })
})

})
