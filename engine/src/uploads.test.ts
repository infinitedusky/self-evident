/** Images dropped on a conversation: kept as files on this computer, found again by id, and refused when they are not images. */
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { imageFile, saveImages } from './uploads.js'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('uploads', () => {
  beforeAll(async () => { process.env.UPLOADS_HOME = await mkdtemp(join(tmpdir(), 'uploads-')) })
  it('keeps an image as a file under its conversation and finds it again by id', async () => {
    const [a] = await saveImages('sess_sample1', [{ name: 'shot.png', mediaType: 'image/png', data: `data:image/png;base64,${PNG}` }])
    expect(a).toMatchObject({ name: 'shot.png', mediaType: 'image/png' })
    expect(a.path.startsWith(join(process.env.UPLOADS_HOME!, 'sess_sample1'))).toBe(true)
    expect((await readFile(a.path)).toString('base64')).toBe(PNG)
    expect(await imageFile('sess_sample1', a.id)).toEqual({ path: a.path, mediaType: 'image/png' })
    expect(await imageFile('sess_other', a.id)).toBeNull() // another conversation's: not found
    expect(await imageFile('sess_sample1', '../../etc/passwd')).toBeNull()
    expect(await imageFile('../..', a.id)).toBeNull()
  })
  it('refuses what is not an image, too many, too big, or empty', async () => {
    await expect(saveImages('sess_sample1', [{ name: 'notes.txt', mediaType: 'text/plain', data: 'aGk=' }])).rejects.toThrow(/not an image/)
    await expect(saveImages('sess_sample1', Array(7).fill({ mediaType: 'image/png', data: PNG }))).rejects.toThrow(/6 images at most/)
    await expect(saveImages('sess_sample1', [{ name: 'big.png', mediaType: 'image/png', data: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }])).rejects.toThrow(/over 5 MB/)
    await expect(saveImages('sess_sample1', [{ mediaType: 'image/png', data: '' }])).rejects.toThrow(/empty/)
    await expect(saveImages('../x', [{ mediaType: 'image/png', data: PNG }])).rejects.toThrow()
    expect(await saveImages('sess_sample1', undefined)).toEqual([])
  })
})
