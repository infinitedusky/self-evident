import type { Meta, StoryObj } from '@storybook/react-vite'
import { WorkflowSettings } from './WorkflowSettings'
import { withEngine } from '../stories/mock-engine'
import { sampleApp } from '../stories/sample'

// Workflow rules in an app's settings: configuration, not something that runs. Made up: "UI change" is the default.
const meta = { title: 'Components/WorkflowSettings', component: WorkflowSettings, args: { appId: sampleApp.id },
  render: (a) => <div style={{ maxWidth: 1000 }}><WorkflowSettings {...a} /></div> } satisfies Meta<typeof WorkflowSettings>
export default meta
type Story = StoryObj<typeof meta>

export const TwoSets: Story = {}
/** None yet: every step but the brief is optional. */
export const NoneYet: Story = { beforeEach: withEngine({ workflows: [] }) }
