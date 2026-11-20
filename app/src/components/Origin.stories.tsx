import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Origin } from './Origin'
import { sampleOrigin } from '../stories/sample'

// Where a piece of work came from, word for word: a made-up Linear ticket, as every agent on the idea or task reads it.
const meta = { title: 'Components/Origin', component: Origin, args: { origin: sampleOrigin }, render: (a) => <div style={{ maxWidth: 900 }}><Origin {...a} /></div> } satisfies Meta<typeof Origin>
export default meta
type Story = StoryObj<typeof meta>

/** Folded, as it sits on the page: which ticket, how much it holds. */
export const Folded: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/Linear SHOP-41 · 2 comments · 1 image/)).toBeVisible()
  },
}
/** Open: the ticket's text, its comments oldest first, its links, and its image kept for the agents. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('Where this came from'))
    await expect(c.getByText(/Returning customers should be able to pay/)).toBeVisible()
    await expect(c.getByText(/Keep the "use a new card" button/)).toBeVisible()
    await expect(c.getByRole('link', { name: 'Checkout design (made up)' })).toBeVisible()
    await expect(c.getByText(/kept on this computer; the agents open it/)).toBeVisible()
  },
}
/** An image that could not be fetched: said plainly, since the agents can't see it. */
export const ImageMissing: Story = {
  args: { origin: { ...sampleOrigin, files: [...sampleOrigin.files, { url: 'https://uploads.linear.app/example/mobile.png', kept: false, note: '403 Forbidden' }] } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('Where this came from'))
    await expect(c.getByText(/1 of its 2 images could not be fetched/)).toBeVisible()
  },
}
/** Only a title: nothing more was written on the ticket. */
export const OnlyATitle: Story = { args: { origin: { ...sampleOrigin, body: null, comments: [], links: [], files: [] } } }
