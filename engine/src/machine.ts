/** This computer, as the database knows it: its name, its user and its root folder (db/home-path.ts). */
import { execFileSync } from 'node:child_process'
import { hostname, userInfo } from 'node:os'
import { db } from './db/client.js'
import { machineRoot } from './db/home-path.js'
import { machine } from './db/schema.js'

/** The Mac's own name, which stays the same on every network (`hostname` follows the network: mac.lan here, mac.local there). */
export const machineName = (): string => {
  if (process.env.MACHINE_NAME) return process.env.MACHINE_NAME
  try { return execFileSync('/usr/sbin/scutil', ['--get', 'LocalHostName'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return hostname().split('.')[0] }
}

/** Registers this computer, or notes that it was seen again; a changed user or root replaces the old one. */
export async function registerMachine(d: Pick<typeof db, 'insert'> = db) {
  const row = { name: machineName(), userName: userInfo().username, root: machineRoot(), seenAt: new Date() }
  const [m] = await d.insert(machine).values(row).onConflictDoUpdate({ target: machine.name, set: { userName: row.userName, root: row.root, seenAt: row.seenAt } }).returning()
  return m
}

export const machines = () => db.select().from(machine).orderBy(machine.name)
