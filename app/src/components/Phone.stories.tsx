import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Phone } from './Phone'
import { withEngine } from '../stories/mock-engine'
import { plannerLog, talkSession, transcript } from '../stories/sample'
import type { TalkMessage } from '../engine'

// Evident on a phone: one chat, a tray from the left (the project, its tasks, this task's steps, the other chats), a
// shelf from the bottom (what to look at), and a page over the chat when something is looked at. Everything here is
// made up: the sample engine's task SS-20, its transcript, its agents.
const forget = () => {
  const clear = () => { try { Object.keys(localStorage).filter((k) => k.startsWith('se.phone')).forEach((k) => localStorage.removeItem(k)) } catch { /* fine */ } }
  clear()
  return clear
}
const TASK = { kind: 'task' as const, id: 'iss_sample20' }
const meta = { title: 'Components/Phone', component: Phone, parameters: { layout: 'fullscreen', router: false },
  args: { address: false, initial: { chat: TASK } },
  render: (a) => <div className="phone-frame" style={{ width: 390, height: 844, margin: '0 auto', border: '1px solid var(--line)' }}><Phone {...a} /></div>,
} satisfies Meta<typeof Phone>
export default meta
type Story = StoryObj<typeof meta>

const msg = (id: number, author: TalkMessage['author'], body: string): TalkMessage => ({ id, sessionId: talkSession.id, author, kind: 'text', body, payload: null, sentAt: '2026-11-25T09:40:00.000Z' })
const talking = { transcript: { ...transcript, pending: [], session: { ...talkSession, subject: 'SS-20 Address and payment on one page (sample)' }, messages: [
  msg(1, 'user', 'Put the address and the payment on one page. (sample)'),
  msg(2, 'agent', 'The sketch is done and named in the brief. The order summary sits under payment on a phone.'),
  msg(3, 'user', 'Move the summary above the pay button.'),
  msg(4, 'agent', 'Moved. The brief is ready for you to read.'),
] } }

/** A task's chat: its name at the top, its one conversation under it, the tray's button on the left and Look on the right. */
export const TaskChat: Story = {
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/SS-20 Address and payment on one page/)).toBeInTheDocument()
    await expect(await c.findByText('Moved. The brief is ready for you to read.')).toBeInTheDocument()
  },
}

/** The task has agents out: each is a tab under the task's name, beside the task's own agent. */
export const AgentsAsTabs: Story = {
  beforeEach: [forget(), withEngine({ ...talking, runLog: plannerLog, taskAgents: [
    { sessionId: 'talk_sample_proto', kind: 'prototype', what: 'Prototype', icon: '🛠️', title: 'Checkout in one page (sample)', busy: true },
    { sessionId: null, runId: 'run_sample_plan', kind: 'planner', what: 'Planner', icon: '🗺️', title: 'Planning SS-20 (sample)', busy: false, detail: '3 sub-tasks' },
  ] })],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('tab', { name: /Prototype/ })).toBeInTheDocument()
    await expect(await c.findByRole('tab', { name: /Planner/ })).toBeInTheDocument()
  },
}

/** The tray, from the left: what needs you, the project's tasks with this task's steps under it, and the other chats. */
export const Tray: Story = {
  args: { initial: { chat: TASK, tray: true } },
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('heading', { name: 'Other chats' })).toBeInTheDocument()
    await expect(await c.findByRole('button', { name: /The brief/ })).toBeInTheDocument()
  },
}

/** A step pressed in the tray: its page opens over the chat, and Chat at the top goes back. */
export const StepOpensItsPage: Story = {
  args: { initial: { chat: TASK, tray: true } },
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /The brief/ }))
    await expect(await c.findByRole('button', { name: 'Back to the chat' })).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Back to the chat' }))
    await expect(c.queryByRole('button', { name: 'Back to the chat' })).toBeNull()
  },
}

/** Look, from the bottom: this task's pages, then everything else in the app. */
export const Shelf: Story = {
  args: { initial: { chat: TASK, shelf: true } },
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('button', { name: /My Stuff/ })).toBeInTheDocument()
  },
}

/** A conversation about the app as a whole, not a task's: no agent tabs, no steps. */
export const AppChat: Story = {
  args: { initial: { chat: { kind: 'talk', id: talkSession.id } } },
  beforeEach: [forget(), withEngine()],
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Why is SS-6 waiting?')).toBeInTheDocument()
  },
}

/** Nothing to talk to yet: the way to start. */
export const NoChats: Story = {
  args: { initial: {} },
  beforeEach: [forget(), withEngine({ talks: [], now: { hold: null, running: [], needsYou: [], recent: [], counts: { projects: 0, running: 0, needsYou: 0 } } })],
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('button', { name: 'New chat' })).toBeInTheDocument()
  },
}
