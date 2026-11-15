import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SpeedChoice } from './SpeedChoice'

// A task's speed on its page. Made up: a task in a sample app.
const meta = { title: 'Components/SpeedChoice', component: SpeedChoice, args: { speed: { value: 'careful', from: 'app' }, onChange: fn(async () => {}) } } satisfies Meta<typeof SpeedChoice>
export default meta
type Story = StoryObj<typeof meta>

/** Following its app, which goes carefully: a sentence, and Change. */
export const CarefulFromTheApp: Story = {}
/** Its own: this one goes fast whatever its app does. */
export const FastItsOwn: Story = { args: { speed: { value: 'fast', from: 'task' } } }
/** Change pressed: follow the app, careful or fast, each saying what it means. Choosing saves at once. */
export const Changing: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Change' }))
    await userEvent.selectOptions(await c.findByRole('combobox', { name: /Speed/ }), 'fast')
    await expect(args.onChange).toHaveBeenCalledWith('fast')
  },
}
/** Its own, set back to follow the app. */
export const BackToTheApp: Story = {
  args: { speed: { value: 'fast', from: 'task' } },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Change' }))
    await userEvent.selectOptions(await c.findByRole('combobox', { name: /Speed/ }), '')
    await expect(args.onChange).toHaveBeenCalledWith(null)
  },
}
