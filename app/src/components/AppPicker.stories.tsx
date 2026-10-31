import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'
import { AppPicker } from './AppPicker'
import { withEngine } from '../stories/mock-engine'

// The apps, a square each, in a strip beside the rail. The sample engine has two made-up apps.
const meta = { title: 'Components/AppPicker', component: AppPicker, parameters: { router: false }, args: { onOpen: () => {} },
  render: (a) => <div style={{ height: 240, display: 'flex' }}><AppPicker {...a} /></div> } satisfies Meta<typeof AppPicker>
export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {}
/** Hovering a square names its app. */
export const Hovered: Story = { play: async ({ canvasElement }) => { await userEvent.hover(await within(canvasElement).findByRole('button', { name: 'Sample Shop' })) } }
export const NoApps: Story = { beforeEach: withEngine({ apps: [] }) }
