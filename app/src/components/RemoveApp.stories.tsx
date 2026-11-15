import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { RemoveApp, RemovedApps, type AppHolds } from './RemoveApp'

// Removing an app. All made up: a sample shop and a sample blog, neither a real app.
const shop: AppHolds = { id: 'app_sample_shop', name: 'Sample Shop', key: 'SS', removedAt: '2026-11-12T10:00:00Z', tasks: 14, projects: 3, ideas: 5, conversations: 22, kept: ['sample/shop on GitHub', '~/code/sample-shop', '~/code/sample-shop-worktrees'] }
const blog: AppHolds = { id: 'app_sample_blog', name: 'Sample Blog', key: 'SB', removedAt: '2026-11-02T10:00:00Z', tasks: 0, projects: 0, ideas: 0, conversations: 1, kept: [] }

const meta = { title: 'Components/RemoveApp', component: RemovedApps, args: { apps: [shop, blog], onRestore: fn(async () => {}), onDelete: fn(async () => {}) } } satisfies Meta<typeof RemovedApps>
export default meta
type Story = StoryObj<typeof meta>

/** On an app's own settings: one press puts it away. Nothing is asked first, since it can be brought back. */
export const Remove: Story = {
  render: () => <section className="panel"><RemoveApp name="Sample Shop" onRemove={fn(async () => {})} /></section>,
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: 'Remove Sample Shop' })).toBeEnabled() },
}
/** It is building, so the engine refuses: the reason shows and the app stays. */
export const RemoveRefused: Story = {
  render: () => <section className="panel"><RemoveApp name="Sample Shop" onRemove={fn(async () => { throw new Error(JSON.stringify({ error: 'Sample Shop is building (2 running): pause its project first' })) })} /></section>,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Remove Sample Shop' }))
    await expect(await c.findByText(/pause its project first/)).toBeInTheDocument()
  },
}
/** Under All apps: the apps put away, with what each holds. Each can be brought back. */
export const Removed: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/14 tasks · 3 projects · 5 ideas · 22 conversations/)).toBeInTheDocument()
    await userEvent.click((await c.findAllByRole('button', { name: 'Bring back' }))[0])
    await expect(args.onRestore).toHaveBeenCalledWith('app_sample_shop')
  },
}
/** Deleting for good asks for the app's name, says what goes and what stays, and does nothing until the name matches. */
export const DeleteForGood: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click((await c.findAllByRole('button', { name: 'Delete for good…' }))[0])
    const go = await c.findByRole('button', { name: 'Delete for good' })
    await expect(go).toBeDisabled()
    await expect(await c.findByText(/Stays where it is/)).toBeInTheDocument()
    await userEvent.type(await c.findByLabelText('Type Sample Shop to delete it'), 'Sample Sho')
    await expect(go).toBeDisabled()
    await userEvent.type(await c.findByLabelText('Type Sample Shop to delete it'), 'p')
    await userEvent.click(go)
    await expect(args.onDelete).toHaveBeenCalledWith('app_sample_shop', 'Sample Shop')
  },
}
/** No app is removed: where removing is done. */
export const NoneRemoved: Story = { args: { apps: [] } }
