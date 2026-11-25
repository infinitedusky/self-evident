import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { RepoRuns } from './RepoRuns'
import { withEngine } from '../stories/mock-engine'
import { repoRunsSample } from '../stories/sample'

// How each repository of a made-up app is run. Every repository, folder and output here is a sample.
const meta = { title: 'Components/RepoRuns', component: RepoRuns, args: { appId: 'app_sample' }, beforeEach: (ctx) => withEngine({ repoRuns: repoRunsSample })(ctx as never) } satisfies Meta<typeof RepoRuns>
export default meta
type Story = StoryObj<typeof meta>

/** Three repositories: one whose scripts work, one whose `up` fails (with why), and one with no scripts yet. */
export const EachRepository: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const shop = within(await c.findByRole('article', { name: 'sample-org/sample-shop' }))
    await expect(shop.getByText('works on main')).toBeVisible(); await expect(shop.getByText('home')).toBeVisible()
    await expect(shop.getByText('~/code/sample-workbench/repos/sample-shop')).toBeVisible()
    await expect(shop.getByText('Lint, Types')).toBeVisible()
    const api = within(c.getByRole('article', { name: 'sample-org/sample-api' }))
    await expect(api.getByText('does not work on main')).toBeVisible()
    await expect(api.getByText(/port 5434 is already allocated \(sample\)/)).toBeVisible()
    await expect(api.getAllByText('not there')).toHaveLength(1) // it has no down script
    const jobs = within(c.getByRole('article', { name: 'sample-org/sample-jobs' }))
    await expect(jobs.getByText('no scripts yet')).toBeVisible()
    await expect(jobs.getByText(/Nothing is run on this repository's pull requests/)).toBeVisible()
  },
}

/** Check it: every script is run on the default branch, and the steps show as they go. */
export const Checking: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: "Check sample-org/sample-shop's scripts" }))
    await expect(await within(c.getByRole('article', { name: 'sample-org/sample-shop' })).findByText('checking…')).toBeVisible()
  },
}

/** A repository with none: one press starts its folder with a stub of each script. */
export const StartingAFolder: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: "Start sample-org/sample-jobs's folder with stubs" }))
    const jobs = within(c.getByRole('article', { name: 'sample-org/sample-jobs' }))
    await expect(await jobs.findByText('not checked')).toBeVisible()
    await expect(jobs.getByRole('button', { name: "Check sample-org/sample-jobs's scripts" })).toBeVisible()
  },
}

/** The app has no workbench folder: where to give it one. */
export const NoWorkbench: Story = {
  beforeEach: withEngine({ repoRuns: { ...repoRunsSample, workbench: null } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/no workbench folder to keep the scripts in/)).toBeVisible() },
}
