import type { Meta, StoryObj } from '@storybook/react-vite'
import { Brief } from './Brief'
import { plannedBrief } from '../stories/sample'

const meta = { title: 'Components/Brief', component: Brief, parameters: { layout: 'padded' } } satisfies Meta<typeof Brief>
export default meta
type Story = StoryObj<typeof meta>

/** A description for people, the brief folded for the builder. */
export const DescriptionAndBrief: Story = { args: { description: 'Address and payment sit on one page.', brief: plannedBrief } }
export const BriefOpen: Story = { args: { description: 'Address and payment sit on one page.', brief: plannedBrief, open: true } }
/** Written before descriptions existed: the brief's first sentence leads. */
export const BriefOnly: Story = { args: { brief: plannedBrief } }
export const DescriptionOnly: Story = { args: { description: 'Sample: the footer links go to the right pages.' } }
export const Empty: Story = { args: {} }
