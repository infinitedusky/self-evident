import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Phone } from './Phone'
import { withEngine } from '../stories/mock-engine'
import { plannerLog, quietNow, talkSession, transcript } from '../stories/sample'
import type { TalkMessage } from '../engine'

// Evident on a phone: you are at a place in the app (a task, a project, My Stuff), with three tabs under its name:
// Nav (the place's own left nav), the page that is open, and Chat (the chat of that place). The grid goes anywhere:
// the app's places, what needs you, every chat. Everything here is made up: the sample engine's task SS-20, its
// transcript, its agents.
const forget = () => {
  const clear = () => { try { Object.keys(localStorage).filter((k) => k.startsWith('se.phone')).forEach((k) => localStorage.removeItem(k)) } catch { /* fine */ } }
  clear()
  return clear
}
const TASK = '/tasks/iss_sample20'
/** The chat's side of the phone: a task's page under it has the task's agent too, folded away. */
const chatOf = (el: HTMLElement) => within(el.querySelector<HTMLElement>('.phone-chat-pane')!)
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

/** At a task, on its chat: the task's name at the top, then three tabs: Nav, the page that is open, Chat. */
export const TaskChat: Story = {
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/SS-20 Address and payment on one page/)).toBeInTheDocument()
    await expect(await chatOf(canvasElement).findByText('Moved. The brief is ready for you to read.')).toBeVisible()
    await expect(c.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
    const tabs = within(canvasElement.querySelector<HTMLElement>('.phone-views')!).getAllByRole('tab')
    await expect(tabs[tabs.length - 1]).toHaveTextContent('Chat') // Chat is the last tab, at the right
  },
}

/** Nav, the first tab: the task's own left nav, as its page has it on the computer. Pressing a row goes to that page, and the middle tab takes its name. */
export const NavTab: Story = {
  args: { initial: { path: TASK, view: 'nav' } },
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('tab', { name: 'Nav' })).toHaveAttribute('aria-selected', 'true')
    const nav = within(await c.findByRole('navigation', { name: 'This task' }))
    for (const name of [/Overview/, /Context/, /The brief/, /Sketches/]) await expect(await nav.findByRole('link', { name })).toBeVisible()
    await userEvent.click(nav.getByRole('link', { name: /Research/ }))
    await expect(await c.findByRole('tab', { name: 'Research', selected: true })).toBeInTheDocument()
  },
}

/** The same task, on its page: the chat is one press away and is still this task's. */
export const TaskPage: Story = {
  args: { initial: { path: `${TASK}/brief`, view: 'page' } },
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('tab', { name: 'Brief', selected: true })).toBeInTheDocument()
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
    const c = chatOf(canvasElement) // the task's Prototype step is a tab at the top too
    await expect(await c.findByRole('tab', { name: /Prototype/ })).toBeInTheDocument()
    await expect(await c.findByRole('tab', { name: /Planner/ })).toBeInTheDocument()
  },
}

/** At a project, on Nav: the project's own left nav, with Tickets in it. */
export const AtAProject: Story = {
  args: { initial: { path: '/projects/proj_checkout', view: 'nav' } },
  beforeEach: [forget(), withEngine()],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const nav = within(await c.findByRole('navigation', { name: 'This project' }))
    await expect(await nav.findByRole('link', { name: /Tickets/ })).toBeVisible()
    await userEvent.click(nav.getByRole('link', { name: /Tickets/ }))
    await expect(await c.findByRole('tab', { name: 'Tickets', selected: true })).toBeInTheDocument()
  },
}

/** The grid: the app's places, what needs you and every chat, from anywhere. */
export const Places: Story = {
  args: { initial: { path: TASK, view: 'chat', shelf: true } },
  beforeEach: [forget(), withEngine(talking)],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('heading', { name: 'Chats' })).toBeInTheDocument()
    await expect(await c.findByRole('heading', { name: 'Needs you' })).toBeInTheDocument()
    await userEvent.click(await c.findByRole('button', { name: /Projects/ }))
    await expect(await c.findByRole('tab', { name: 'Projects' })).toHaveAttribute('aria-selected', 'true')
  },
}

/** A place with no nav of its own: Nav lists the app's places. */
export const NavAwayFromATask: Story = {
  args: { initial: { path: '/', view: 'nav' } },
  beforeEach: [forget(), withEngine()],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Tasks' }))
    await expect(await c.findByRole('tab', { name: 'Tasks', selected: true })).toBeInTheDocument()
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
