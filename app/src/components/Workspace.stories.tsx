import type { Meta, StoryObj } from '@storybook/react-vite'
import { Workspace } from './Workspace'
import { engineDown, eventStream, withEngine } from '../stories/mock-engine'
import { apps, buildEvents, sampleApp, talkSession } from '../stories/sample'

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
/** A project with a sub-issue's build log split beside it, and the issue behind it in the same group. */
export const ProjectBesideItsBuild: Story = {
  args: { address: false, initial: [{ tab: { kind: 'page', path: '/issues/iss_sample5' } }, { tab: { kind: 'page', path: '/projects/proj_checkout' } }, { tab: { kind: 'build', issueId: 'iss_sample5' }, split: 'right' }] },
  beforeEach: [forget(), withEngine([eventStream(buildEvents)])],
}
/** The app running in Preview, under the page being worked on. (The sample "running app" is a story.) */
export const WithPreview: Story = {
  args: { address: false, initial: [{ tab: { kind: 'page', path: '/issues' } }, { tab: { kind: 'preview', path: '/iframe.html?id=pages-now--quiet&viewMode=story' }, split: 'below' }] },
  beforeEach: [forget(), withEngine({ apps: apps.map((a) => a.id === sampleApp.id ? { ...a, setup: { ...a.setup, preview_url: window.location.origin } } : a) })],
}
/** The agent's column folded away (⌘J, or the S. at the top of the rail). */
export const AgentFolded: Story = { beforeEach: [forget({ 'se.agent.open': '0' }), withEngine()] }
export const NoApps: Story = { beforeEach: [forget(), withEngine({ apps: [] })] }
export const EngineDown: Story = { beforeEach: [forget(), withEngine(engineDown)] }
