import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test'
import { Workspace } from './Workspace'
import { specific, tabThing } from '../workspace'
import { engineDown, eventStream, withEngine } from '../stories/mock-engine'
import { buildEvents, prototypes, talkSession } from '../stories/sample'

// The whole app: the rail, the agent's column, tabs that split. What it keeps between visits (the layout, whether
// the agent's column is open, the conversation) lives in localStorage, so each story starts clean.
const forget = (values: Record<string, string> = {}) => () => {
  const clear = () => { try { Object.keys(localStorage).filter((k) => k.startsWith('se.') || k.startsWith('if.talk')).forEach((k) => localStorage.removeItem(k)) } catch { /* fine */ } }
  clear()
  try { localStorage.setItem('if.talk.session', talkSession.id); Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v)) } catch { /* fine */ }
  return clear
}
const meta = { title: 'Components/Workspace', component: Workspace, parameters: { layout: 'fullscreen', router: false }, args: { address: false } } satisfies Meta<typeof Workspace>
export default meta
type Story = StoryObj<typeof meta>

/** First visit: My Stuff, the agent beside it. */
export const FirstVisit: Story = { beforeEach: [forget(), withEngine()] }
const tabsOf = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.ws-dock .dv-tab')]
/**
 * One tab per thing: Settings pressed again after moving about inside it goes to the Settings tab already open, and
 * only the tab's own Duplicate (right-click) makes a second.
 */
export const OneTabPerThing: Story = {
  beforeEach: [forget(), withEngine()],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const settings = await c.findByRole('button', { name: 'Settings' })
    await waitFor(() => expect(tabsOf(canvasElement).length).toBeGreaterThan(0)) // the first tab is there
    const before = tabsOf(canvasElement).map((t) => t.textContent)
    await userEvent.click(settings)
    await waitFor(() => { const now = tabsOf(canvasElement).map((t) => t.textContent); if (now.length !== before.length + 1) throw new Error(`before ${JSON.stringify(before)} now ${JSON.stringify(now)}`) })
    await userEvent.click(await c.findByRole('link', { name: 'Skills by job' })) // somewhere else inside Settings
    await userEvent.click(await c.findByRole('button', { name: 'My Stuff' }))
    await userEvent.click(settings) // asked for again: the tab that is open, where it was left
    await new Promise((r) => setTimeout(r, 300))
    await expect(tabsOf(canvasElement)).toHaveLength(before.length + 1) // no second Settings tab
    await expect(await c.findByRole('link', { name: 'Skills by job' })).toHaveClass('active')
    const tab = tabsOf(canvasElement).find((t) => /Settings/.test(t.textContent ?? ''))!
    fireEvent.contextMenu(tab.querySelector('.dv-default-tab') ?? tab) // right-click on the tab
    await userEvent.click(await c.findByRole('menuitem', { name: 'Duplicate' }))
    await waitFor(() => expect(tabsOf(canvasElement)).toHaveLength(before.length + 2)) // a second one, on purpose
  },
}
/** What counts as the same thing: Settings whatever page of it, a task whatever section; and when an open tab is moved. */
export const WhatIsTheSameThing: Story = {
  beforeEach: [forget(), withEngine()],
  play: async () => {
    const page = (path: string) => tabThing({ kind: 'page', path })
    await expect(page('/settings/apps/app_x/landing')).toBe('/settings')
    await expect(page('/settings')).toBe('/settings')
    await expect(page('/tasks/iss_1/build')).toBe(page('/tasks/iss_1'))
    await expect(page('/tasks/iss_1')).not.toBe(page('/tasks/iss_2'))
    await expect(page('/ideas/a-slug/sketch')).toBe('/ideas/a-slug')
    await expect(page('/projects/new')).toBe('/projects/new')
    await expect(page('/plan')).toBe('/plan')
    await expect(tabThing({ kind: 'build', issueId: 'iss_1' })).toBe('build:iss_1')
    await expect(specific('/tasks/iss_1')).toBe(false) // the thing alone: an open tab stays where it was left
    await expect(specific('/tasks/iss_1/build')).toBe(true) // a place inside it: the tab goes there
    await expect(specific('/settings')).toBe(false)
    await expect(specific('/settings/apps/app_x/landing')).toBe(true)
  },
}
/** A project with a sub-task's build log split beside it, and the task behind it in the same group. */
export const ProjectBesideItsBuild: Story = {
  args: { address: false, initial: [{ tab: { kind: 'page', path: '/tasks/iss_sample5' } }, { tab: { kind: 'page', path: '/projects/proj_checkout' } }, { tab: { kind: 'build', issueId: 'iss_sample5' }, split: 'right' }] },
  beforeEach: [forget(), withEngine([eventStream(buildEvents)])],
}
/** A prototype running, under the page being worked on. (The sample "running prototype" is a story.) */
export const WithAPrototype: Story = {
  args: { address: false, initial: [{ tab: { kind: 'page', path: '/tasks' } }, { tab: { kind: 'prototype', id: prototypes[0].id, path: '/iframe.html?id=pages-now--quiet&viewMode=story' }, split: 'below' }] },
  beforeEach: [forget(), withEngine({ prototypes: [{ ...prototypes[0], url: window.location.origin }] })],
}
/** The agent's column folded away (⌘J, or the S. at the top of the rail). */
export const AgentFolded: Story = { beforeEach: [forget({ 'se.agent.open': '0' }), withEngine()] }
export const NoApps: Story = { beforeEach: [forget(), withEngine({ apps: [] })] }
export const EngineDown: Story = { beforeEach: [forget(), withEngine(engineDown)] }
/**
 * Following the agent: it changed two tasks of a project (made up), so a tab opens beside My Stuff on the project,
 * with a pulsing dot in the conversation's colour. Its tab in the agent's column wears the same colour.
 */
const follows = ['iss_sample1', 'iss_sample2'].map((id, i) => ({ seq: 900 + i, type: 'ui.follow', payload: { sessionId: talkSession.id, tool: 'update_task', tab: { kind: 'page', path: `/tasks/${id}` }, projectId: 'proj_checkout' } }))
const followTab = (el: HTMLElement) => el.querySelector<HTMLElement>('.dv-default-tab[data-follow]')
export const FollowingTheAgent: Story = {
  beforeEach: [forget(), withEngine([eventStream(follows)])],
  play: async ({ canvasElement }) => { // two tasks of one project land once, on the project
    for (let i = 0; i < 60; i++) { const t = followTab(canvasElement); if (t?.textContent?.includes('One-page checkout')) return; await new Promise((r) => setTimeout(r, 50)) }
    throw new Error(`no following tab on the project (${followTab(canvasElement)?.textContent ?? 'none'})`)
  },
}
/** Not following (switched off in the agent's column): the same changes open nothing. */
export const NotFollowing: Story = {
  beforeEach: [forget({ 'se.follow': '0' }), withEngine([eventStream(follows)])],
  play: async ({ canvasElement }) => { await new Promise((r) => setTimeout(r, 1200)); if (followTab(canvasElement)) throw new Error('a following tab opened while not following') },
}
