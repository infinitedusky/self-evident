import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Assets } from './Assets'
import { withEngine } from '../stories/mock-engine'
import { sampleApp } from '../stories/sample'

// What an app or a project is worked from: a name, a link or a path, a line on what it is. Made up: the sample shop's.
const meta = { title: 'Components/Assets', component: Assets, args: { appId: sampleApp.id },
  render: (a) => <div style={{ maxWidth: 1000 }}><Assets {...a} /></div> } satisfies Meta<typeof Assets>
export default meta
type Story = StoryObj<typeof meta>

/** The app's: a link (opens in a new tab) and a file on this computer (a path, shown as one). */
export const OfTheApp: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('link', { name: 'Designs (sample)' })).toHaveAttribute('target', '_blank')
    await expect(c.getByText('/code/sample-shop/docs/architecture.md')).toBeVisible()
  },
}
/** A project's own, on its page: the app's are not repeated here. */
export const OfAProject: Story = { args: { projectId: 'proj_checkout' } }
/** Adding one: a name and where it is are needed; the note is optional. It joins the list. */
export const Adding: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add an asset' }))
    await expect(c.getByRole('button', { name: 'Add' })).toBeDisabled()
    await userEvent.type(c.getByLabelText('Name'), 'Build order (sample)')
    await userEvent.type(c.getByLabelText('Link or path'), 'https://example.com/docs/build-order')
    await userEvent.type(c.getByLabelText('What it is'), 'which ticket comes first')
    await userEvent.click(c.getByRole('button', { name: 'Add' }))
    await expect(await c.findByRole('link', { name: 'Build order (sample)' })).toBeVisible()
  },
}
/** Removed: it leaves the list. The thing itself is not touched. */
export const Removing: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Remove Architecture (sample)' }))
    await waitFor(() => expect(c.queryByText('/code/sample-shop/docs/architecture.md')).toBeNull())
  },
}
/** None yet: says what belongs here. */
export const NoneYet: Story = { beforeEach: withEngine({ assets: [] }) }
