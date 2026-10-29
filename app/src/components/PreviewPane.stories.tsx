import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { PreviewPane } from './PreviewPane'
import { withEngine } from '../stories/mock-engine'
import { apps, sampleApp } from '../stories/sample'

// The app running, in a tab. The sample "running app" is one of these stories, served by Storybook itself.
const withPreview = withEngine({ apps: apps.map((a) => a.id === sampleApp.id ? { ...a, setup: { ...a.setup, preview_url: window.location.origin } } : a) })
const running = '/iframe.html?id=pages-now--quiet&viewMode=story'
const meta = { title: 'Components/PreviewPane', component: PreviewPane, parameters: { layout: 'fullscreen', router: false }, decorators: [(Story) => <div style={{ height: 640 }}><Story /></div>] } satisfies Meta<typeof PreviewPane>
export default meta
type Story = StoryObj<typeof meta>

export const Running: Story = { args: { path: running }, beforeEach: withPreview }
/** At a phone's width. */
export const Phone: Story = {
  args: { path: running }, beforeEach: withPreview,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Phone' }))
    await expect(canvasElement.querySelector('iframe')?.style.width).toBe('390px')
  },
}
/** No address set: says where to set it. */
export const NotSet: Story = {}
