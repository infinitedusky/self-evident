import type { Meta, StoryObj } from '@storybook/react-vite'
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

/** Tool calls, an automatic run, a result and an answer. */
export const Answered: Story = { beforeEach: withEngine({ transcript: t() }) }
/** The agent asks before an edit: Allow, allow for the conversation, or Deny. */
export const AsksPermission: Story = { beforeEach: withEngine({ transcript: t({ messages: [...working, asking], pending: ['req_sample'], busy: true }) }) }
export const Thinking: Story = { beforeEach: withEngine({ transcript: t({ messages: working.slice(0, 1), busy: true }) }) }
export const Ended: Story = { beforeEach: withEngine({ transcript: t({ status: 'ended' }) }) }
export const Empty: Story = { beforeEach: withEngine({ transcript: t({ messages: [] }) }) }
export const Compact: Story = { args: { compact: true, context: { path: '/projects/proj_checkout', label: 'this project', projectId: 'proj_checkout' } }, beforeEach: withEngine({ transcript: t() }) }
export const Failed: Story = { beforeEach: withEngine({ transcript: t({ messages: [...working.slice(0, 1), msg(8, 'engine', 'error', 'Sample: the agent stopped: rate limited, retrying in a minute.', { waiting: true })] }) }) }
/** A prototype's conversation opens with its brief. */
export const PrototypeBrief: Story = { beforeEach: withEngine({ transcript: prototypeTranscript }) }
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
