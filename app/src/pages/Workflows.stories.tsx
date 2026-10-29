import type { Meta, StoryObj } from '@storybook/react-vite'
import { Workflows } from './Workflows'
import { withEngine } from '../stories/mock-engine'

// The app's workflows, at /plan/workflows. Made up: "UI change" is the app's default, "Quick fix" one task uses.
const meta = { title: 'Pages/Workflows', component: Workflows, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><Workflows /></div> } satisfies Meta<typeof Workflows>
export default meta
type Story = StoryObj<typeof meta>

export const TwoWorkflows: Story = {}
/** None yet: every step but the brief is optional. */
export const NoneYet: Story = { beforeEach: withEngine({ workflows: [] }) }
