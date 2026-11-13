import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { RunLogView } from './RunLogView'
import { withEngine } from '../stories/mock-engine'
import { plannerLog, plannerLogDone } from '../stories/sample'

// What a run read and said, as the planner's tab shows it. All made up: the planner's run on the sample checkout task.
const meta = { title: 'Components/RunLogView', component: RunLogView, args: { runId: 'run_sample_plan' }, beforeEach: withEngine({ runLog: plannerLog }),
  render: (a) => <div className="task-agent" style={{ width: 340, height: 420, display: 'flex', flexDirection: 'column' }}><RunLogView {...a} /></div> } satisfies Meta<typeof RunLogView>
export default meta
type Story = StoryObj<typeof meta>

/** At work: what it has read, what it has said, and that it is still going. */
export const Working: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Started planning')).toBeInTheDocument()
    await expect(c.getByText('savedCard')).toBeInTheDocument()
    await expect(c.getByText(/Working out the sub-tasks/)).toBeInTheDocument()
  },
}
/** Back: how many sub-tasks, where they are, and what the run cost. */
export const Planned: Story = {
  beforeEach: withEngine({ runLog: plannerLogDone }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/Planned 3 sub-tasks/)).toBeInTheDocument()
    await expect(c.getByText(/Run cost estimate: \$0\.42/)).toBeInTheDocument()
  },
}
/** Nothing from it yet: the run has only just started. */
export const NothingYet: Story = { beforeEach: withEngine({}) }
