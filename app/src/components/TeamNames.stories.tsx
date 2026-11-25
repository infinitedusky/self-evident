import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { TeamNames } from './TeamNames'

/** A task's team ticket and its name for the team, on the task's head. Made-up tickets and titles (sample). */
const saved = fn()
const meta = { title: 'Components/TeamNames', component: TeamNames, parameters: { layout: 'padded' },
  args: { issueId: 'iss_sample20', ticket: 'ENT-322', from: 'link', set: null, title: null, ourTitle: 'ENT-322, third build: brand fields (sample)', onSaved: fn() },
  beforeEach: ({ msw }: any) => { saved.mockClear(); msw.use(http.put('/api/issues/:id/team', async ({ request }) => { const b = await request.json() as { ticket?: string; title?: string }; saved(b); return /^[A-Za-z][A-Za-z0-9]+-\d+$|^$/.test((b.ticket ?? '').trim()) ? HttpResponse.json({ teamTicket: b.ticket || null, teamTitle: b.title || null, ticket: b.ticket || null, ticketFrom: 'set', ticketMissing: false }) : HttpResponse.json({ error: `a team ticket is its key, like ENT-322 (got "${b.ticket}")` }, { status: 400 }) })) } } satisfies Meta<typeof TeamNames>
export default meta
type Story = StoryObj<typeof meta>

/** Read from a link in the description: shown, with where it came from on hover; one press opens both fields. */
export const ReadFromALink: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    const badge = await c.findByRole('button', { name: /ENT-322/ })
    await expect(badge).toHaveAttribute('title', expect.stringContaining('read from a link in its description'))
    await userEvent.click(badge)
    await userEvent.type(c.getByRole('textbox', { name: 'Its name for the team' }), 'Brand fields from the employee scan (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toHaveBeenCalledWith({ ticket: '', title: 'Brand fields from the employee scan (sample)' }))
    await waitFor(() => expect(args.onSaved).toHaveBeenCalled()) // the save answers a moment after the press
  },
}
/** Set by hand, with its name for the team beside it. */
export const SetWithAName: Story = { args: { from: 'set', set: 'ENT-322', title: 'Brand fields from the employee scan (sample)' }, play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: /ENT-322 · Brand fields from the employee scan/ })).toBeInTheDocument() } }
/** The app requires one and there is none: a warning, since its branch and pull request wait for it; a ticket that is not a key is refused and said. */
export const Required: Story = {
  args: { ticket: null, from: null, missing: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /needs a team ticket/ }))
    await userEvent.type(c.getByRole('textbox', { name: 'Team ticket' }), 'the brand one')
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    await expect(await c.findByRole('alert')).toHaveTextContent('a team ticket is its key, like ENT-322')
  },
}
/** None, and none required: said quietly; its branch and pull request carry our id. */
export const None: Story = { args: { ticket: null, from: null }, play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: /no team ticket/ })).toBeInTheDocument() } }
/** Under more than one ticket: the first names its branch and pull request; the rest are said beside it and set in "Also under", by key. */
export const AlsoUnderOthers: Story = {
  args: { from: 'set', set: 'ENT-322', also: ['ENT-324'] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /ENT-322 · also ENT-324/ }))
    const also = c.getByRole('textbox', { name: 'Also under' })
    await expect(also).toHaveValue('ENT-324')
    await userEvent.type(also, ', ent-325')
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toHaveBeenCalledWith({ ticket: 'ENT-322', title: '', also: ['ENT-324', 'ent-325'] }))
  },
}
