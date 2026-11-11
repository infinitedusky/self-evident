import type { Meta, StoryObj } from '@storybook/react-vite'
import { AgentWindow, TalkDrawer } from './TalkDrawer'
import { engineDown, withEngine } from '../stories/mock-engine'
import { otherApp, prototypeTalk, prototypeTranscript, talkSession, transcript } from '../stories/sample'

// The agent's column in the workspace. Which conversation is picked lives in localStorage, so each story sets it
// first and puts it back after.
const here = { path: '/projects/proj_checkout', projectId: 'proj_checkout', label: 'this project', tabs: [{ title: 'One-page checkout (sample)', path: '/projects/proj_checkout', focused: true }, { title: 'Build · SS-5', path: 'build:iss_sample5' }] }
const meta = { title: 'Components/TalkDrawer', component: TalkDrawer, parameters: { layout: 'fullscreen', router: false }, args: { context: here },
  decorators: [(Story) => <div style={{ width: 420, height: 640, borderRight: '1px solid var(--line)' }}><Story /></div>] } satisfies Meta<typeof TalkDrawer>
export default meta
type Story = StoryObj<typeof meta>

const KEYS = ['if.talk.session', 'if.talk.popped']
const stored = (values: Record<string, string>) => () => {
  try { KEYS.forEach((k) => localStorage.removeItem(k)); Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v)) } catch { /* the story still renders, closed */ }
  return () => { try { KEYS.forEach((k) => localStorage.removeItem(k)) } catch { /* fine */ } }
}
const open = { 'if.talk.session': talkSession.id }
const second = { ...talkSession, id: 'talk_sample2', subject: 'Draft the release note', busy: true }

export const Open: Story = { beforeEach: [stored(open), withEngine()] }
/** In a terminal: what's said there shows here; the command continues it there, with the engine's tools. */
export const InTheTerminal: Story = { beforeEach: [stored(open), withEngine({ talks: [{ ...talkSession, terminalSince: '2026-10-31T10:00:00.000Z' }] })],
  play: async ({ canvasElement }) => { for (let i = 0; i < 40; i++) { const b = [...canvasElement.querySelectorAll('button')].find((x) => x.textContent === 'Show the command'); if (b) { b.click(); return } await new Promise((r) => setTimeout(r, 50)) } } }
/** ⌨ lists the Claude Code sessions run on the app in a terminal or VS Code, to bring one in. */
export const FromClaudeCode: Story = { beforeEach: [stored(open), withEngine()],
  play: async ({ canvasElement }) => { for (let i = 0; i < 40; i++) { const b = canvasElement.querySelector<HTMLButtonElement>('button[aria-label="From Claude Code"]'); if (b) { b.click(); return } await new Promise((r) => setTimeout(r, 50)) } } }
/** Two conversations as tabs, one busy. */
export const TwoConversations: Story = { beforeEach: [stored(open), withEngine({ talks: [talkSession, second] })] }
const closedOne = { ...talkSession, id: 'talk_sample3', subject: 'Sample: tidy the footer', branch: 'talk/sample3', closedAt: '2026-11-11T09:00:00.000Z' }
const wait = async (what: () => boolean, why: string) => { for (let i = 0; i < 60; i++) { if (what()) return; await new Promise((r) => setTimeout(r, 50)) } throw new Error(why) }
/** The × closes a tab and nothing else: the conversation and its worktree stay, behind the ▾ that appears after the tabs. */
export const ClosesWithAnX: Story = { beforeEach: [stored(open), withEngine({ talks: [talkSession, second] })],
  play: async ({ canvas, canvasElement }) => {
    (await canvas.findByRole('button', { name: 'Close Draft the release note' })).click()
    await wait(() => !canvas.queryByRole('button', { name: 'Draft the release note' }), 'the closed tab still shows')
    await wait(() => !!canvasElement.querySelector('button[aria-label="Closed conversations"]'), 'nothing leads back to the closed conversation')
  } }
/** ▾ lists the closed conversations, each with its branch: pick one to put its tab back, or end it. */
export const ClosedConversations: Story = { beforeEach: [stored(open), withEngine({ talks: [talkSession, closedOne, { ...second, id: 'talk_sample4', branch: 'talk/sample4', closedAt: '2026-11-11T09:30:00.000Z' }] })],
  play: async ({ canvas }) => { (await canvas.findByRole('button', { name: 'Closed conversations' })).click(); await canvas.findByText('Sample: tidy the footer') } }
/** Reopened from the list: its tab is back and in front. */
export const Reopened: Story = { beforeEach: [stored(open), withEngine({ talks: [talkSession, closedOne] })],
  play: async ({ canvas }) => {
    (await canvas.findByRole('button', { name: 'Closed conversations' })).click()
    ;(await canvas.findByText('Sample: tidy the footer')).click()
    await canvas.findByRole('button', { name: 'Close Sample: tidy the footer' })
  } }
/** Every tab closed: the column says the conversations are kept and leads back to them. */
export const AllClosed: Story = { beforeEach: [stored({}), withEngine({ talks: [closedOne] })] }
/** A permission request waiting in the open conversation. */
export const AsksPermission: Story = { beforeEach: [stored(open), withEngine({ transcript: { ...transcript, pending: ['req_sample'], session: { ...talkSession, busy: true },
  messages: [...transcript.messages, { id: 9, sessionId: talkSession.id, author: 'agent', kind: 'permission', body: '', payload: { requestId: 'req_sample', tool: 'Bash', risk: 'expensive', why: 'runs the test suite', input: { command: 'pnpm test' } }, sentAt: null }] } })] }
/** Open with no conversation yet: press + to start one. */
/** A prototype's conversation: it starts from the brief, works in the prototype's worktree, and links to it. */
export const BuildingAPrototype: Story = { beforeEach: [stored({ 'if.talk.session': prototypeTalk.id }), withEngine({ talks: [prototypeTalk, talkSession], transcript: prototypeTranscript })] }
/** Another app's conversation isn't a tab here: conversations belong to the app in the nav. */
export const OtherAppsHidden: Story = { beforeEach: [stored(open), withEngine({ talks: [talkSession, { ...second, appId: otherApp.id, subject: 'Sample: about the blog' }] })],
  play: async ({ canvas }) => { await canvas.findByRole('button', { name: 'Why is SS-6 waiting?' }); if (canvas.queryByText('Sample: about the blog')) throw new Error('another app\'s conversation shows') } }
export const NoConversation: Story = { beforeEach: [stored({}), withEngine({ talks: [] })] }
/** Popped out into its own window: the column says so and offers to bring it back. */
export const PoppedOut: Story = { beforeEach: stored({ 'if.talk.popped': '1' }) }
export const EngineDown: Story = { beforeEach: [stored(open), withEngine(engineDown)] }
/** The agent in its own window, filling it. */
export const OwnWindow: StoryObj<typeof AgentWindow> = { render: () => <AgentWindow />, beforeEach: stored({ 'if.talk.session': talkSession.id }) }
