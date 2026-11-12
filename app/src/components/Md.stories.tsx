import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Md } from './Md'

// Text someone wrote, as Markdown. Made up: a ticket's description as a tracker would hand it over.
const ticket = `From Linear SHOP-41: https://linear.app/example/issue/SHOP-41

## What this is

The checkout asks for a card **every time**. Returning customers should pick a saved one. See the [hand-off doc](https://example.com/handoff).

## Requirements

1. **Show saved cards** above the card form.
2. Keep \`card_token\` only; never the number.
   * One default card per customer.

| Field | Kept |
|---|---|
| last4 | yes |
| number | no |

## Done when

A returning customer pays without typing a card (sample).`

const meta = { title: 'Components/Md', component: Md, args: { text: ticket }, render: (a) => <div style={{ maxWidth: 720 }}><Md {...a} /></div> } satisfies Meta<typeof Md>
export default meta
type Story = StoryObj<typeof meta>

/** A whole description: headings, bold, a numbered list with a nested one, code, a table, links that open in a new tab. */
export const Block: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('heading', { name: 'Requirements' })).toBeVisible()
    await expect(c.getByRole('link', { name: 'hand-off doc' })).toHaveAttribute('target', '_blank')
    await expect(c.getByRole('table')).toBeVisible()
    await expect(c.queryByText(/##/)).toBeNull() // no raw marks
  },
}
/** In a list row: the first three lines, the rest on the thing's own page. */
export const Clamped: Story = { args: { clamp: 3 }, render: (a) => <div className="muted" style={{ maxWidth: 720, fontSize: 14 }}><Md {...a} /></div> }
/** Inside a sentence: no paragraph break around it. */
export const Inline: Story = { args: { text: 'keeps `card_token` only, **never** the number', inline: true }, render: (a) => <p style={{ maxWidth: 720 }}>Why A: <Md {...a} /></p> }
/** Plain words with no Markdown in them read as they always did. */
export const PlainWords: Story = { args: { text: 'Returning customers pick a saved card (sample).' } }
/** Nothing written: nothing shown. */
export const Empty: Story = { args: { text: '' } }
