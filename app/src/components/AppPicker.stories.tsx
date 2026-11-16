import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, spyOn, userEvent, within } from 'storybook/test'
import { AppPicker } from './AppPicker'
import { withEngine } from '../stories/mock-engine'

// The apps, a square each, in a strip outside the rail. The sample engine has two made-up apps.
const meta = { title: 'Components/AppPicker', component: AppPicker, parameters: { router: false }, args: { onOpen: () => {} },
  render: (a) => <div style={{ height: 240, display: 'flex' }}><AppPicker {...a} /></div> } satisfies Meta<typeof AppPicker>
export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {}
/** Hovering a square names its app. */
export const Hovered: Story = { play: async ({ canvasElement }) => { await userEvent.hover(await within(canvasElement).findByRole('button', { name: 'Sample Shop' })) } }
export const NoApps: Story = { beforeEach: withEngine({ apps: [] }) }
/** ⌘-click (Ctrl-click, or the middle button) opens the app in a new browser tab and leaves this one where it is; a plain click switches here. */
export const InANewTab: Story = {
  play: async ({ canvasElement }) => {
    const opened = spyOn(window, 'open').mockImplementation(() => null)
    try {
      const square = await within(canvasElement).findByRole('button', { name: 'Sample Shop' })
      fireEvent.click(square, { metaKey: true })
      await expect(opened).toHaveBeenCalledTimes(1)
      await expect(String(opened.mock.calls[0][0])).toMatch(/\?app=app_/)
      await expect(opened.mock.calls[0][1]).toBe('_blank')
      fireEvent(square, new MouseEvent('auxclick', { bubbles: true, button: 1 }))
      await expect(opened).toHaveBeenCalledTimes(2)
      fireEvent.click(square) // plain: no new tab
      await expect(opened).toHaveBeenCalledTimes(2)
    } finally { opened.mockRestore() }
  },
}
