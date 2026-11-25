import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Phone } from './Phone'
import { withEngine } from '../stories/mock-engine'
import { plannerLog, quietNow, talkSession, transcript } from '../stories/sample'
import type { TalkMessage } from '../engine'

// Evident on a phone: you are at a place in the app (a task, a project, My Stuff), and flip between its chat and its
// page. The tray from the left is the place's nav (a task's steps, a project's tasks) and the chats; the grid goes
// anywhere in the app. Everything here is made up: the sample engine's task SS-20, its transcript, its agents.
const forget = () => {
  const clear = () => { try { Object.keys(localStorage).filter((k) => k.startsWith('se.phone')).forEach((k) => localStorage.removeItem(k)) } catch { /* fine */ } }
  clear()
  return clear
}
const TASK = '/tasks/iss_sample20'
/** The chat's side of the phone: a task's page under it has the task's agent too, folded away. */
const chatOf = (el: HTMLElement) => within(el.querySelector<HTMLElement>('.phone-pane')!)
const meta = { title: 'Components/Phone', component: Phone, parameters: { layout: 'fullscreen', router: false },
  args: { address: false, initial: { path: TASK, view: 'chat' } },
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

/** At a task, on its chat: the task's name at the top, Chat and its page as two tabs, the tray's button on the left and the grid on the right. */
export const TaskChat: Story = {
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/SS-20 Address and payment on one page/)).toBeInTheDocument()
    await expect(await chatOf(canvasElement).findByText('Moved. The brief is ready for you to read.')).toBeVisible()
    await expect(c.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
  },
}

/** The same task, on its page: the chat is one press away and is still this task's. */
export const TaskPage: Story = {
  args: { initial: { path: `${TASK}/brief`, view: 'page' } },
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('tab', { name: 'Brief' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(c.getByRole('tab', { name: 'Chat' }))
    await expect(await chatOf(canvasElement).findByText('Moved. The brief is ready for you to read.')).toBeVisible()
  },
}

/** The task has agents out: each is a tab in its chat, beside the task's own agent. */
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

/** The tray at a task: what needs you, the project's tasks with this task's steps under it, and the chats. */
export const TrayAtATask: Story = {
  args: { initial: { path: TASK, view: 'chat', tray: true } },
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('heading', { name: 'Chats' })).toBeInTheDocument()
    await expect(await c.findByRole('button', { name: /The brief/ })).toBeInTheDocument()
  },
}

/** A step pressed in the tray: the task's page goes to it, and the page is what shows. */
export const StepGoesToItsPage: Story = {
  args: { initial: { path: TASK, view: 'chat', tray: true } },
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /The brief/ }))
    await expect(await c.findByRole('tab', { name: 'Brief' })).toHaveAttribute('aria-selected', 'true')
  },
}

/** At a project: its page, its own chat, and its tasks in the tray. Going to one of them moves the chat with you. */
export const AtAProject: Story = {
  args: { initial: { path: '/projects/proj_checkout', view: 'page', tray: true } },
  beforeEach: [forget(), withEngine()],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('heading', { name: 'Its tasks' })).toBeInTheDocument()
    await userEvent.click(await c.findByRole('button', { name: /SS-1 / }))
    await expect(c.queryByRole('heading', { name: 'Its tasks' })).toBeNull()
  },
}

/** The grid: anywhere in the app, from anywhere. */
export const Places: Story = {
  args: { initial: { path: TASK, view: 'chat', shelf: true } },
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /Projects/ }))
    await expect(await c.findByRole('tab', { name: 'Projects' })).toHaveAttribute('aria-selected', 'true')
  },
}

/** First visit: My Stuff, not a task picked for you. */
export const FirstVisit: Story = {
  args: { initial: {} },
  beforeEach: [forget(), withEngine()],
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('tab', { name: 'My Stuff' })).toHaveAttribute('aria-selected', 'true')
  },
}

/** Away from any task or project, the chat is one about the app as a whole. */
export const AppChat: Story = {
  args: { initial: { path: '/', view: 'chat' } },
  beforeEach: [forget(), withEngine({ talks: [{ ...talkSession, subject: 'What should we build next? (sample)', subjectRef: { app: true } }] })],
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
  },
}

/** Nothing to talk to yet: the way to start. */
export const NoChats: Story = {
  args: { initial: { path: '/', view: 'chat' } },
  beforeEach: [forget(), withEngine({ talks: [], now: quietNow })],
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('button', { name: 'New chat' })).toBeInTheDocument()
  },
}
