import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { EngineLinkBar } from './EngineLink'

// The bar that says the page cannot hear the engine.
const meta = { title: 'Components/EngineLink', component: EngineLinkBar, parameters: { layout: 'fullscreen' }, args: { down: true, after: 0 } } satisfies Meta<typeof EngineLinkBar>
export default meta
type Story = StoryObj<typeof meta>

/** The connection has been down for a moment: it says so, and that it is reconnecting. */
export const Down: Story = { play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText('Not connected to the engine.')).toBeInTheDocument() } }
/** Connected: nothing is shown. */
export const Connected: Story = { args: { down: false } }
