import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Reviews } from './Reviews'
import { engineDown, withEngine } from '../stories/mock-engine'
import { reviewDoneSample, reviewNoneSample, reviewOtherRepoSample, reviewPullsSample, reviewRunningSample, reviewUnrunSample } from '../stories/sample'

// Reviews of other people's pull requests. Every repository, person, pull request and finding here is made up.
const meta = { title: 'Pages/Reviews', component: Reviews, parameters: { layout: 'fullscreen' }, beforeEach: (ctx) => withEngine({ reviewPulls: reviewPullsSample, review: reviewDoneSample })(ctx as never), render: (a) => <div className="tab-page"><Reviews {...a} /></div> } satisfies Meta<typeof Reviews>
export default meta
type Story = StoryObj<typeof meta>
const shop = { repo: 'sample-org/sample-shop' }

/** The app's open pull requests: other people's first, yours marked, and where each one's review stands. */
export const OpenPullRequests: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('button', { name: 'Open #212, Free delivery over a limit (sample)' })).toBeVisible()
    const rows = c.getAllByRole('row').slice(1)
    await expect(rows.map((r) => r.querySelector('td:nth-child(2)')?.textContent)).toEqual(['robin-sample', 'kim-sample', 'you-sample yours'])
    await expect(within(rows[0]).getByText('3 comments drafted')).toBeVisible()
    await expect(within(rows[1]).getByText('not reviewed')).toBeVisible()
    await expect(c.getByText(/nothing is posted from here/)).toBeVisible()
    await expect(c.getByText(/Read from GitHub 2 minutes ago/)).toBeVisible(); await expect(c.getByRole('button', { name: 'Refresh' })).toBeVisible() // kept, not asked for on every look
    // A long list is found by who wrote it.
    await userEvent.type(c.getByRole('searchbox', { name: 'Find a pull request' }), 'kim')
    await expect(c.getAllByRole('row').slice(1)).toHaveLength(1)
    await expect(c.getByText('1 of 3 open')).toBeVisible()
    await userEvent.type(c.getByRole('searchbox', { name: 'Find a pull request' }), ' nobody')
    await expect(c.getByText('None of the open pull requests match.')).toBeVisible()
  },
}

/** GitHub has not answered with the list yet: one is opened by its number or link without waiting. */
export const OpenedByNumber: Story = {
  beforeEach: withEngine({ reviewPullsSlow: true, review: reviewDoneSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/To go straight to one, paste its number or link above/)).toBeVisible()
    const box = c.getByRole('searchbox', { name: 'Find a pull request' })
    await userEvent.type(box, 'robin'); await expect(c.queryByRole('button', { name: /^Open #/ })).toBeNull() // words only find
    await userEvent.clear(box); await userEvent.type(box, 'https://github.com/someone/else/pull/3'); await expect(c.queryByRole('button', { name: /^Open #/ })).toBeNull() // not this app's
    await userEvent.clear(box); await userEvent.type(box, 'https://github.com/sample-org/sample-shop/pull/212')
    await userEvent.click(await c.findByRole('button', { name: 'Open #212' }))
    await expect(await c.findByRole('region', { name: 'Suggested comments' })).toBeVisible()
  },
}

/** One not run yet: the warning is beside the press, and nothing has been run. */
export const BeforeItIsRun: Story = {
  args: { open: { ...shop, number: 209 } },
  beforeEach: withEngine({ reviewPulls: reviewPullsSample, review: reviewNoneSample, reviewStarted: reviewRunningSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const note = within(await c.findByRole('note', { name: 'Before you run it' }))
    await expect(note.getByText('This is unreviewed code.')).toBeVisible()
    await expect(note.getByText(/Nobody here has reviewed that code yet/)).toBeVisible()
    await expect(c.queryByRole('list', { name: 'What was run' })).toBeNull()
    await userEvent.click(note.getByRole('button', { name: 'Run the review' }))
    // Running: the steps show as they go, and there is no second press to make.
    await expect(await c.findByText('15 of 40 breaks tried…')).toBeVisible()
    await expect(c.queryByRole('button', { name: /Run/ })).toBeNull()
  },
}

/** Run: the comments drafted, each to copy with its line a press away, then what they came from. */
export const Reviewed: Story = {
  args: { open: { ...shop, number: 212 } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const drafts = within(await c.findByRole('region', { name: 'Suggested comments' }))
    await expect(drafts.getAllByRole('article')).toHaveLength(3)
    const first = within(drafts.getByRole('article', { name: 'Comment on src/checkout/delivery.ts, line 18' }))
    await expect(first.getByText(/^Changing `>=` to `>` on this line doesn't fail any of the tests/)).toBeVisible()
    await expect(first.getByRole('link', { name: 'Open the line ↗' })).toHaveAttribute('href', expect.stringContaining('/pull/212/files#diff-'))
    await expect(first.getByRole('button', { name: 'Copy the comment on src/checkout/delivery.ts, line 18' })).toBeVisible()
    await expect(drafts.getByRole('article', { name: 'A general comment' })).toBeVisible()
    await expect(c.queryByRole('button', { name: /Post|Send|Submit|Approve/ })).toBeNull() // nothing here writes to GitHub
    await expect(within(c.getByRole('region', { name: 'Breaks no test caught' })).getByText(/Of 11 small breaks made to the lines it changed, its tests catch 9 \(82%\)/)).toBeVisible()
    const commands = within(c.getByRole('region', { name: 'Commands' }))
    await expect(commands.getByText('2 of 3 pass')).toBeVisible()
    await expect(commands.getByText(/is assigned a value but never used \(sample\)/)).toBeVisible()
    await expect(c.getByRole('link', { name: 'Open on GitHub ↗' })).toHaveAttribute('href', 'https://github.com/sample-org/sample-shop/pull/212')
    await expect(within(c.getByRole('note', { name: 'Before you run it' })).getByRole('button', { name: 'Run it again' })).toBeVisible()
  },
}

/** The pull request has moved since it was reviewed: the page says what is shown is of the earlier commit. */
export const MovedSince: Story = {
  args: { open: { ...shop, number: 212 } },
  beforeEach: withEngine({ reviewPulls: reviewPullsSample, review: { ...reviewDoneSample, stale: true } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/The pull request has moved since/)).toBeVisible() },
}

/** Nothing found: the page does not call that a review. */
export const NothingFound: Story = {
  args: { open: { ...shop, number: 212 } },
  beforeEach: withEngine({ reviewPulls: reviewPullsSample, review: { ...reviewDoneSample, suggestions: [], mutation: { ...reviewDoneSample.mutation!, caught: 11, percent: 100, survivors: [] }, commands: reviewDoneSample.commands.map((x) => ({ ...x, pass: true, output: '' })), steps: reviewDoneSample.steps.map((s) => ({ ...s, state: 'pass' as const })) } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/That is not a review/)).toBeVisible() },
}

/** It did not finish: why, and the press to run it again. */
export const DidNotFinish: Story = {
  args: { open: { ...shop, number: 209 } },
  beforeEach: withEngine({ reviewPulls: reviewPullsSample, review: { ...reviewNoneSample, state: 'failed', problem: 'Its code could not be fetched from GitHub (sample).', steps: reviewNoneSample.steps.map((s, n) => (n ? s : { ...s, state: 'fail' as const, says: 'Its code could not be fetched from GitHub (sample).' })) } }),
  play: async ({ canvasElement }) => { const c = within(canvasElement); await expect((await c.findAllByText(/could not be fetched from GitHub \(sample\)/)).length).toBeGreaterThan(0); await expect(c.getByRole('button', { name: 'Run it again' })).toBeVisible() },
}

/** A pull request in a second repository Evident has not been told how to run: nothing of the home repository's is run in it, no comment is drafted, and the page asks how. */
export const AnotherRepository: Story = {
  args: { open: { repo: 'sample-org/sample-api', number: 88 } },
  beforeEach: withEngine({ reviewPulls: reviewPullsSample, review: reviewOtherRepoSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const form = within(await c.findByRole('form', { name: 'How sample-org/sample-api is run' }))
    await expect(c.getByText(/not set yet, so nothing is run on its pull requests/)).toBeVisible()
    await expect(c.getByText('Nothing was run on it, so there is nothing to suggest.')).toBeVisible()
    await expect(c.queryAllByRole('article')).toHaveLength(0)
    await userEvent.type(form.getByLabelText('Run first in its checkout'), 'uv sync')
    await userEvent.type(form.getByLabelText('How its tests are run'), 'uv run pytest -q {{files}')
    await userEvent.type(form.getByLabelText('Commands it is held to'), 'Lint: uv run ruff check .{enter}just a command')
    await expect(form.getByText(/1 line is not read/)).toBeVisible(); await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(form.getByLabelText('Commands it is held to'), '{backspace}'.repeat('just a command'.length))
    await userEvent.click(form.getByRole('button', { name: 'Save' }))
    await expect(await c.findByText(/· prepared, tests, 1 command/)).toBeVisible()
  },
}

/** A command that could not be run here: said as that, and not drafted as a comment on someone's pull request. */
export const CouldNotBeRunHere: Story = {
  args: { open: { ...shop, number: 212 } },
  beforeEach: withEngine({ reviewPulls: reviewPullsSample, review: reviewUnrunSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const commands = within(await c.findByRole('region', { name: 'Commands' }))
    await expect(commands.getByText('2 of 3 pass, 1 could not be run here')).toBeVisible()
    await expect(commands.getByLabelText('could not be run here')).toBeVisible()
    await expect(commands.getByText(/no comment is drafted from it/)).toBeVisible()
    await expect(within(c.getByRole('region', { name: 'Suggested comments' })).getAllByRole('article')).toHaveLength(2) // the two breaks only
    await expect(c.queryByRole('form')).toBeNull() // the home repository is set in Settings, not here
  },
}

/** No open pull requests. */
export const NoneOpen: Story = { beforeEach: withEngine({ reviewPulls: { ...reviewPullsSample, pulls: [] } }) }
/** GitHub cannot be read for a repository: the page says which. */
export const GitHubUnreadable: Story = { beforeEach: withEngine({ reviewPulls: { ...reviewPullsSample, pulls: [], problems: ['sample-org/sample-shop could not be read from GitHub: not signed in (sample)'] } }) }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
