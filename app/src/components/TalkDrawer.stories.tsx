import type { Meta, StoryObj } from '@storybook/react-vite'
import { AgentWindow, TalkDrawer } from './TalkDrawer'
import { engineDown, withEngine } from '../stories/mock-engine'
import { talkSession, transcript } from '../stories/sample'

// The agent on every page. Whether it is open and which conversation is picked live in localStorage, so each story
// sets them first and puts them back after.
const meta = { title: 'Components/TalkDrawer', component: TalkDrawer, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof TalkDrawer>
export default meta
type Story = StoryObj<typeof meta>

const KEYS = ['if.talk.open', 'if.talk.session', 'if.talk.popped']
const stored = (values: Record<string, string>) => () => {
  try { KEYS.forEach((k) => localStorage.removeItem(k)); Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v)) } catch { /* the story still renders, closed */ }
  return () => { try { KEYS.forEach((k) => localStorage.removeItem(k)) } catch { /* fine */ } }
}
const open = { 'if.talk.open': '1', 'if.talk.session': talkSession.id }
const second = { ...talkSession, id: 'talk_sample2', subject: 'Draft the release note', busy: true }

/** Closed: the floating Talk button. */
export const Closed: Story = { beforeEach: stored({}) }
export const Open: Story = { beforeEach: [stored(open), withEngine()] }
/** Two conversations as tabs, one busy. */
export const TwoConversations: Story = { beforeEach: [stored(open), withEngine({ talks: [talkSession, second] })] }
/** A permission request waiting in the open conversation. */
export const AsksPermission: Story = { beforeEach: [stored(open), withEngine({ transcript: { ...transcript, pending: ['req_sample'], session: { ...talkSession, busy: true },
  messages: [...transcript.messages, { id: 9, sessionId: talkSession.id, author: 'agent', kind: 'permission', body: '', payload: { requestId: 'req_sample', tool: 'Bash', risk: 'expensive', why: 'runs the test suite', input: { command: 'pnpm test' } }, sentAt: null }] } })] }
/** Open with no conversation yet: press + to start one. */
export const NoConversation: Story = { beforeEach: [stored({ 'if.talk.open': '1' }), withEngine({ talks: [] })] }
/** Popped out into its own window: two small buttons stay in the page. */
export const PoppedOut: Story = { beforeEach: stored({ 'if.talk.popped': '1' }) }
export const EngineDown: Story = { beforeEach: [stored(open), withEngine(engineDown)] }
/** The agent in its own window, filling it. */
export const OwnWindow: StoryObj<typeof AgentWindow> = { render: () => <AgentWindow />, beforeEach: stored({ 'if.talk.session': talkSession.id }) }
