import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import Markdown from 'react-markdown'
import { rows } from '@self-evident/engine/steps'
import { TaskAgent } from './TaskAgent'
import { TaskNav } from './TaskNav'
import { withEngine } from '../stories/mock-engine'
import { taskStepsView, talkSession, transcript } from '../stories/sample'
import type { TalkMessage } from '../engine'

// A task's own agent, in a column of the task's page. Everything here is made up: the sample engine's transcript,
// a sample task. The real page is Pages/TaskPage.
const meta = { title: 'Components/TaskAgent', component: TaskAgent, parameters: { layout: 'padded' },
  args: { sessionId: talkSession.id, taskId: 'iss_sample20', stage: 'Sketches', state: 'idle', open: true, onToggle: () => {} },
  render: (a) => <div style={{ width: 340 }}><TaskAgent {...a} /></div> } satisfies Meta<typeof TaskAgent>
export default meta
type Story = StoryObj<typeof meta>

const msg = (id: number, author: TalkMessage['author'], body: string): TalkMessage => ({ id, sessionId: talkSession.id, author, kind: 'text', body, payload: null, sentAt: '2026-10-27T09:40:00.000Z' })
const sketching = withEngine({ transcript: { ...transcript, pending: [], session: { ...talkSession, subject: 'Address and payment on one page (sample)' }, messages: [
  msg(1, 'user', 'Sketch the one-page checkout. Address on the left, payment on the right. (sample)'),
  msg(2, 'agent', 'Done: `sketches/checkout.html` is open beside us. The order summary sits under payment on a phone.'),
  msg(3, 'user', 'Move the summary above the pay button.'),
  msg(4, 'agent', 'Moved. I have named the sketch in the brief.'),
] } })

/** The task's one conversation: it has heard everything said about this task. */
export const Talking: Story = { beforeEach: sketching }
/** The prototype approved: it has fresh agents out on the ADR and the blast radius, and keeps talking. */
export const AgentsOut: Story = { beforeEach: sketching, args: { stage: 'Brief', state: 'working', deployed: [
  { what: 'Draft ADR', icon: '🏛️', state: 'back', detail: 'back: one decision, two options weighed' },
  { what: 'Blast radius', icon: '💥', state: 'out' },
] } }
/** A prototype under way: its own agent is a second tab in the column, its dot pulsing while it works; press it to read that conversation. */
export const PrototypeAgentOut: Story = { beforeEach: sketching, args: { stage: 'Brief', deployed: [{ what: 'Prototype', icon: '🛠️', title: 'Checkout in one page (sample)', sessionId: 'talk_sample_proto', state: 'out' }] } }
/**
 * The prototype is approved: the checks run by themselves, one fresh agent after the other, each a tab. The analysis is
 * back, the ADR's agent is on it; the blast radius and the audit have not started, so they have no tab yet.
 */
export const ChecksRunning: Story = { beforeEach: sketching, args: { stage: 'Brief', deployed: [
  { what: 'Prototype', icon: '🛠️', title: 'Checkout in one page (sample)', sessionId: 'talk_sample_proto', state: 'back' },
  { what: 'Prototype analysis', icon: '🔬', title: 'Prototype analysis: SS-20 (sample)', sessionId: 'talk_sample_analysis', state: 'back' },
  { what: 'Draft ADR', icon: '🏛️', title: 'Draft ADR: SS-20 (sample)', sessionId: 'talk_sample_adr', state: 'out' },
] } }
/** Waiting on the person: the dot turns amber. */
export const WaitingOnYou: Story = { beforeEach: sketching, args: { stage: 'Brief', state: 'waiting' } }
/** A task nobody has talked to an agent about yet: one button starts its agent. */
export const NoAgentYet: Story = { args: { sessionId: null, stage: 'Not started', onStart: () => {} } }
/** Folded to a strip, out of the way; the dot still shows its state. */
export const Folded: Story = { args: { open: false, state: 'working' } }

const BRIEF = '#### What (sample)\nAddress and payment on one page.\n\n#### Done when\n- A paid order takes one page.'
function Page({ here }: { here: string }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="tab-page">
      <h1><span className="mono faint" style={{ fontWeight: 400 }}>SS-20</span> Address and payment on one page (sample)</h1>
      <div className={`task-layout with-agent ${open ? '' : 'agent-folded'}`} style={{ marginTop: 16 }}>
        <TaskNav base="/tasks/iss_sample20" here={here} rows={rows('task', taskStepsView.states, taskStepsView.resolved.workflow)} workflow={{ name: 'UI change (sample)', from: ', from its project' }} build={{ done: 0, total: 0, waitingOn: 'the brief\'s approval' }} />
        <div className="task-main"><section className="panel"><h2>📝 Brief</h2><div className="md"><Markdown>{BRIEF}</Markdown></div></section></div>
        <TaskAgent sessionId={talkSession.id} taskId="iss_sample20" stage="Brief" state="working" open={open} onToggle={() => setOpen(!open)}
          deployed={[{ what: 'Blast radius', icon: '💥', state: 'out' }]} />
      </div>
    </div>
  )
}
/** The whole task page with its agent: the nav on the left, the step in the middle, the agent on the right, staying put as the step changes. Its fold button works. */
export const OnTheTaskPage: Story = { beforeEach: sketching, parameters: { layout: 'fullscreen' }, render: () => <Page here="brief" /> }
