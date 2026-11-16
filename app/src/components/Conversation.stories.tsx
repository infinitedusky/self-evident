import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Conversation, Message } from './Conversation'
import { engineDown, withEngine } from '../stories/mock-engine'
import { prototypeTranscript, talkSession, transcript } from '../stories/sample'
import type { TalkMessage, Transcript } from '../engine'

// One conversation with the agent, from the sample engine's transcript; messages here are made up.
const meta = { title: 'Components/Conversation', component: Conversation, parameters: { layout: 'padded' }, args: { sessionId: talkSession.id } } satisfies Meta<typeof Conversation>
export default meta
type Story = StoryObj<typeof meta>

const msg = (id: number, author: TalkMessage['author'], kind: TalkMessage['kind'], body: string, payload: TalkMessage['payload'] = null): TalkMessage => ({ id, sessionId: talkSession.id, author, kind, body, payload, sentAt: '2026-10-27T09:40:00.000Z' })
const working: TalkMessage[] = [
  msg(1, 'user', 'text', 'Why is SS-6 waiting?'),
  msg(2, 'agent', 'tool_call', '', { tool: 'mcp__engine__project_graph', input: {} }),
  msg(3, 'tool', 'tool_result', '{"subIssues": 4, "held": ["SS-6"]}', { ok: true }),
  msg(4, 'agent', 'auto', '', { tool: 'Bash', input: { command: 'git log --oneline -3' }, risk: 'cheap', why: 'reads the history' }),
  msg(5, 'agent', 'text', 'SS-6 and SS-5 both change `web/checkout/submit.ts`, so they take turns. SS-5 is building now.'),
  msg(6, 'engine', 'result', 'done', { costUsd: 0.04, turns: 3 }),
]
const asking = msg(7, 'agent', 'permission', '', { requestId: 'req_sample', tool: 'Edit', risk: 'moderate', why: 'changes a file in this checkout', input: { file: 'web/checkout/submit.ts', old: 'retries: 0', new: 'retries: 1' } })
const t = (extra: Partial<Transcript> & { busy?: boolean; status?: string } = {}): Transcript => ({ ...transcript, messages: working, pending: [], ...extra, session: { ...talkSession, busy: extra.busy ?? false, status: extra.status ?? 'open' } })

/** A message sent with pictures (made up): they show under what was said, and open full size. */
export const WithImages: Story = { beforeEach: withEngine({ transcript: t({ messages: [msg(1, 'user', 'text', 'Sample: the pay button overlaps the total on a phone. See the two screenshots.', { images: [{ id: 'img_sample1', name: 'checkout-phone.png (sample)', mediaType: 'image/png' }, { id: 'img_sample2', name: 'checkout-total.png (sample)', mediaType: 'image/png' }] }), ...working.slice(1)] }) }) }
/** An image dropped on the conversation waits above the box, with a way to take it off; Send works with no words. Not an image: it says so. */
export const DroppedImage: Story = {
  beforeEach: withEngine({ transcript: t() }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const box = await c.findByRole('textbox')
    const root = canvasElement.querySelector<HTMLElement>('[data-component="Conversation"]')!
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0))
    const drop = (file: File) => { const dt = new DataTransfer(); dt.items.add(file); root.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })) }
    await expect(c.getByRole('button', { name: 'Send' })).toBeDisabled()
    drop(new File([png], 'sample-screenshot.png', { type: 'image/png' }))
    await waitFor(() => expect(c.getByAltText('sample-screenshot.png')).toBeInTheDocument())
    await expect(c.getByRole('button', { name: 'Send' })).toBeEnabled()
    drop(new File(['sample notes, made up'], 'notes.txt', { type: 'text/plain' }))
    await waitFor(() => expect(c.getByText('Only images go here: PNG, JPEG, GIF or WebP.')).toBeInTheDocument())
    await expect(c.getAllByRole('img')).toHaveLength(1)
    await userEvent.click(c.getByRole('button', { name: 'Remove sample-screenshot.png' }))
    await expect(c.queryByAltText('sample-screenshot.png')).toBeNull()
    await expect(box).toBeInTheDocument()
  },
}
/** Tool calls, an automatic run, a result and an answer. */
export const Answered: Story = { beforeEach: withEngine({ transcript: t() }) }
/** The agent asks before an edit: Allow, allow for the conversation, or Deny. */
/**
 * An agent this task's agent has out (here the prototype's builder) asks for something above the threshold: its card
 * shows here, in the conductor's conversation, named for the agent, and is answered here.
 */
export const AgentItHasOutAsks: Story = {
  beforeEach: withEngine({ transcript: t({ messages: [...working, msg(8, 'engine', 'permission', 'The Prototype agent: Bash, may I?', { requestId: 'req_sample_out', of: 'talk_sample_proto', agent: 'Prototype', tool: 'Bash', risk: 'expensive', why: 'starts containers on this computer', input: { command: 'docker compose up -d db (sample)' } })], pending: ['req_sample_out'] }) }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('The Prototype agent asks')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Always allow Bash for the Prototype agent' })).toBeInTheDocument()
  },
}
export const AsksPermission: Story = { beforeEach: withEngine({ transcript: t({ messages: [...working, asking], pending: ['req_sample'], busy: true }) }) }
export const Thinking: Story = { beforeEach: withEngine({ transcript: t({ messages: working.slice(0, 1), busy: true }) }) }
export const Ended: Story = { beforeEach: withEngine({ transcript: t({ status: 'ended' }) }) }
export const Empty: Story = { beforeEach: withEngine({ transcript: t({ messages: [] }) }) }
export const Compact: Story = { args: { compact: true, context: { path: '/projects/proj_checkout', label: 'this project', projectId: 'proj_checkout' } }, beforeEach: withEngine({ transcript: t() }) }
export const Failed: Story = { beforeEach: withEngine({ transcript: t({ messages: [...working.slice(0, 1), msg(8, 'engine', 'error', 'Sample: the agent stopped: rate limited, retrying in a minute.', { waiting: true })] }) }) }
/** A prototype's conversation opens with its brief. */
export const PrototypeBrief: Story = { beforeEach: withEngine({ transcript: prototypeTranscript }) }
/**
 * The conductor directing an agent it has out: the person asks for a change here, the task's agent passes it on, and
 * the prototype's answer comes back as a card when it finishes. The person never leaves this conversation.
 */
export const DirectsItsAgents: Story = { args: { compact: true }, beforeEach: withEngine({ transcript: t({ messages: [
  msg(1, 'user', 'text', 'Make the pay button bigger in the prototype (sample).'),
  msg(2, 'agent', 'tool_call', 'tell_agent', { tool: 'mcp__engine__tell_agent', input: { input: 'prototype' } }),
  msg(3, 'agent', 'text', 'Passed on to the prototype\'s agent. I\'ll tell you when it is in.'),
  msg(4, 'engine', 'brief', 'The Prototype agent finished what you asked.\n\nThe pay button is full width on phones now (sample); look at the last step of checkout.', { back: 'talk_sample_proto', label: 'Back from the Prototype agent' }),
  msg(5, 'agent', 'text', 'It is in: the pay button is full width on phones. Look at the last step of checkout in the Prototype view.'),
] }) }) }
/** The same exchange seen from the prototype's side: what the task's agent asked is marked as coming from it. */
export const AskedByTheConductor: Story = { args: { compact: true }, beforeEach: withEngine({ transcript: t({ messages: [
  msg(1, 'engine', 'brief', 'Make the pay button bigger: full width on phones, as in the agreed mockup (sample).', { from: 'talk_sample', label: 'From this task\'s agent' }),
  msg(2, 'agent', 'text', 'The pay button is full width on phones now (sample); look at the last step of checkout.'),
] }) }) }
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
/** One message on its own: an answered permission card. */
export const AnsweredPermission: StoryObj<typeof Message> = { render: () => <Message m={asking} pending={false} sessionId={talkSession.id} /> }
/** Handed to the terminal and back: what was said there, copied in and marked. */
export const InTheTerminal: Story = { beforeEach: withEngine({ transcript: t({ messages: [...working,
  msg(8, 'engine', 'handoff', 'Continued in the terminal. What\'s said there shows here; send a message here to bring it back.', { to: 'terminal' }),
  msg(9, 'user', 'text', 'Sample: let SS-6 go first instead', { via: 'terminal' }),
  msg(10, 'agent', 'text', 'Swapped: SS-6 builds next, then SS-5.', { via: 'terminal' }),
  msg(11, 'engine', 'handoff', 'Back in Self Evident. Close the terminal session so the two don\'t talk over each other.', { to: 'ui' }),
] }) }) }
