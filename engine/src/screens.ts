/**
 * Screens: every screen and every state, still, exactly as it will look (SHAPE.md, "Each step settles its own kind
 * of question"; Sandy, 2026-11-20: "something that looks exactly like what a static screen is going to look like …
 * if there are ten different screens, then we have ten sketches, and we go through them all"). The step between the
 * sketches and the mockups.
 *
 * Seen and rendered are two answers. A screen is rendered by the app's own Storybook, so it uses the components the
 * app has, through the app's own build: it is a story whose title starts with `Screens/`, one title per screen, one
 * story per state. It is seen on a page of Evident's own, all of a task's screens on one wall, each story framed
 * by its plain address (`iframe.html?id=`), with none of Storybook around it.
 *
 * A task's screens are the ones its branch made or changed, as with its sketches: the story's file is among what
 * differs from where the branch left main. The rest are counted and a press away.
 */
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app } from './db/schema.js'
import { ownFiles, placeOf } from './sketches.js'
import { storyIndex, storybookStatus } from './storybook.js'

/** What a screen's story title starts with: `Screens/Checkout`, and its stories are its states. */
export const SCREENS = 'Screens'
export interface ScreenState { id: string; name: string }
export interface Screen { title: string; file: string | null; states: ScreenState[] }

const isScreen = (title: string) => title.toLowerCase().startsWith(`${SCREENS.toLowerCase()}/`)

/** The stories under `Screens/`, by screen, in the index's order: the screen's name is its title without the lead. */
export function groupScreens(stories: { id: string; title: string; name: string; file?: string | null }[]): Screen[] {
  const by = new Map<string, Screen>()
  for (const s of stories) {
    if (!isScreen(s.title)) continue
    const title = s.title.slice(SCREENS.length + 1)
    const screen = by.get(title) ?? { title, file: s.file ?? null, states: [] }
    screen.states.push({ id: s.id, name: s.name })
    by.set(title, screen)
  }
  return [...by.values()]
}

/** Storybook names a story's file from where it runs (`./src/screens/Checkout.stories.tsx`); git names it from the checkout's top. */
export const madeHere = (file: string | null, own: Set<string>) => {
  if (!file) return false
  const f = file.replace(/^\.\//, '')
  for (const o of own) if (o === f || o.endsWith(`/${f}`)) return true
  return false
}

/**
 * The screens to show: `sessionId` is the conversation whose worktree's Storybook renders them (else the app's);
 * `all` brings back the ones earlier tasks left. With Storybook not answering there are none to list, and the
 * status says why and whether it can be started.
 */
export async function listScreens(appId: string, sessionId?: string | null, o: { all?: boolean } = {}) {
  const status = await storybookStatus(appId, sessionId)
  if (!status.up) return { ...status, screens: [] as Screen[], earlier: 0 }
  const every = groupScreens(await storyIndex(appId, sessionId))
  if (!sessionId) return { ...status, screens: every, earlier: 0 }
  const place = await placeOf(sessionId)
  const [a] = await db.select({ defaultBranch: app.defaultBranch }).from(app).where(eq(app.id, appId))
  // A conversation with no worktree of its own has made none; one whose branch cannot be read hides nothing.
  const own = place.main || !place.root ? new Set<string>() : await ownFiles(place.root, a?.defaultBranch ?? 'main')
  if (!own) return { ...status, screens: every, earlier: 0 }
  const mine = every.filter((s) => madeHere(s.file, own))
  return { ...status, screens: o.all ? every : mine, earlier: every.length - mine.length }
}
