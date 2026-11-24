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
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { app } from './db/schema.js'
import { ownFiles, placeOf } from './sketches.js'
import { storyIndex, storybookPlace, storybookStatus } from './storybook.js'

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
 * The page asks a screen for light or dark the way Storybook's own toolbar does: a global named `theme`
 * (`iframe.html?id=…&globals=theme:dark`), which is what @storybook/addon-themes and a hand-written toolbar both
 * use. A Storybook that declares none draws every screen one way whatever is asked, and the page has to say so.
 */
export const THEME_GLOBAL = 'theme'
/** Whether a Storybook's preview declares a theme to switch: a `theme` global, or the themes addon's decorator. Pure. */
export function declaresTheme(preview: string): boolean {
  if (/\bwithThemeBy(ClassName|DataAttribute)?\b|withThemeFromJSXProvider/.test(preview)) return true
  const at = preview.search(/globalTypes\s*[:=]\s*\{/)
  if (at < 0) return false
  const open = preview.indexOf('{', at)
  let depth = 0, end = open
  for (; end < preview.length; end++) { if (preview[end] === '{') depth++; else if (preview[end] === '}' && --depth === 0) break }
  return /(^|[\s{,'"])theme['"]?\s*:/.test(preview.slice(open, end)) // inside globalTypes' own braces, not a parameter beside them
}
/** Read from the Storybook's own folder under `cwd` (or a package's, one level down); null when there is no preview file to read. */
export async function themedAt(cwd: string | null | undefined): Promise<boolean | null> {
  if (!cwd) return null
  const dirs = [cwd, ...(await readdir(cwd, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules').map((d) => join(cwd, d.name))]
  for (const dir of dirs) for (const name of await readdir(join(dir, '.storybook')).catch(() => [] as string[])) {
    if (!/^preview\.[cm]?[jt]sx?$/.test(name)) continue
    return declaresTheme(await readFile(join(dir, '.storybook', name), 'utf8').catch(() => ''))
  }
  return null
}

/**
 * The screens to show: `sessionId` is the conversation whose worktree's Storybook renders them (else the app's);
 * `all` brings back the ones earlier tasks left. With Storybook not answering there are none to list, and the
 * status says why and whether it can be started.
 */
export async function listScreens(appId: string, sessionId?: string | null, o: { all?: boolean } = {}) {
  const found = await storybookStatus(appId, sessionId)
  if (!found.up) return { ...found, screens: [] as Screen[], earlier: 0 }
  /** `themed`: its Storybook has a light and dark to switch (null: its settings could not be read, so the page does not say). */
  const status = { ...found, themed: await themedAt(await storybookPlace(appId, sessionId)) }
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
