/**
 * Images a person drops on a conversation (Sandy, 2026-11-16: "add drag and drop files (images) to the task and
 * project level agent prompt"). Each is kept as a file on this computer, under ~/.self-evident/uploads/<conversation>,
 * and never in the database: a conversation's row carries only its id, name and type. The agent sees the picture
 * in the message and is told the file's path, so it can also use the file itself (copy it into the repo as an asset).
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PlanError } from './projects.js'

export const uploadsHome = () => process.env.UPLOADS_HOME ?? join(homedir(), '.self-evident', 'uploads')

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
export const MAX_IMAGES = 6
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // what the model takes for one image

export interface ImageIn { name?: string; mediaType: string; data: string } // data: base64, no data: prefix
export interface ImageSaved { id: string; name: string; mediaType: string; path: string; data: string }

const safe = (id: string) => /^[A-Za-z0-9_-]+$/.test(id)

export async function saveImages(sessionId: string, images: ImageIn[] | undefined): Promise<ImageSaved[]> {
  if (!images?.length) return []
  if (!safe(sessionId)) throw new PlanError('no such conversation')
  if (images.length > MAX_IMAGES) throw new PlanError(`${MAX_IMAGES} images at most in one message`)
  const dir = join(uploadsHome(), sessionId)
  await mkdir(dir, { recursive: true })
  const out: ImageSaved[] = []
  for (const [n, i] of images.entries()) {
    const ext = EXT[i.mediaType]
    if (!ext) throw new PlanError(`${i.name ?? 'that file'} is not an image this takes (PNG, JPEG, GIF or WebP)`)
    const data = String(i.data ?? '').replace(/^data:[^,]*,/, '')
    const bytes = Buffer.from(data, 'base64')
    if (!bytes.length) throw new PlanError(`${i.name ?? 'that image'} is empty`)
    if (bytes.length > MAX_IMAGE_BYTES) throw new PlanError(`${i.name ?? 'that image'} is over 5 MB`)
    const id = `img_${Date.now().toString(36)}${n}${Math.random().toString(36).slice(2, 8)}`
    const path = join(dir, `${id}.${ext}`)
    await writeFile(path, bytes)
    out.push({ id, name: (i.name ?? `image.${ext}`).replace(/[\r\n]/g, ' ').slice(0, 120), mediaType: i.mediaType, path, data })
  }
  return out
}

/** The file of one image of a conversation, for showing it in the transcript; null when there is none. */
export async function imageFile(sessionId: string, id: string): Promise<{ path: string; mediaType: string } | null> {
  if (!safe(sessionId) || !/^img_[a-z0-9]+$/.test(id)) return null
  const dir = join(uploadsHome(), sessionId)
  const name = (await readdir(dir).catch(() => [] as string[])).find((f) => f.startsWith(`${id}.`))
  const mediaType = name && Object.entries(EXT).find(([, e]) => name.endsWith(`.${e}`))?.[0]
  return name && mediaType ? { path: join(dir, name), mediaType } : null
}
