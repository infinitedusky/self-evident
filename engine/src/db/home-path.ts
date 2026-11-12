/**
 * A path on this computer, stored so another computer can use it (Sandy, 2026-11-12: "computers should register
 * their username, their root folder"). The database is shared between Macs, and a full path names one of them:
 * `/Users/the_dusky/code/x` is nowhere on a Mac whose user is someone else. So a path under the computer's root (its
 * home folder, or MACHINE_ROOT) is stored from the root, as `~/code/x`, and each computer puts its own root back when
 * it reads. The engine's code sees full paths, as before. A path outside the root is stored as it is.
 */
import { homedir } from 'node:os'
import { customType } from 'drizzle-orm/pg-core'

export const machineRoot = () => (process.env.MACHINE_ROOT ?? homedir()).replace(/\/+$/, '')

export function toStored(path: string, root = machineRoot()): string {
  return path === root ? '~' : path.startsWith(root + '/') ? '~' + path.slice(root.length) : path
}
export function fromStored(stored: string, root = machineRoot()): string {
  return stored === '~' ? root : stored.startsWith('~/') ? root + stored.slice(1) : stored
}

export const homePath = customType<{ data: string; driverData: string }>({
  dataType: () => 'text',
  toDriver: (v) => toStored(v),
  fromDriver: (v) => fromStored(v),
})
