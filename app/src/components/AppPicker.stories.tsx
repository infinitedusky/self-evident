import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'
import { AppPicker } from './AppPicker'
import { withEngine } from '../stories/mock-engine'

// Which app the workspace is on. The sample engine has two made-up apps.
const meta = { title: 'Components/AppPicker', component: AppPicker, parameters: { router: false } } satisfies Meta<typeof AppPicker>
export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {}
export const Open: Story = { play: async ({ canvasElement }) => { await userEvent.click(await within(canvasElement).findByRole('button', { name: /Sample Shop/ })) } }
export const NoApps: Story = { beforeEach: withEngine({ apps: [] }) }
