import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { PrStep } from './PrStep'
import { withEngine } from '../stories/mock-engine'
import { prDraftSample, prSample } from '../stories/sample'

/** A task's pull request as a step of its own, after the smoke test. Made-up task, people and pull request (sample). */
const meta = { title: 'Components/PrStep', component: PrStep, parameters: { layout: 'padded' }, args: { issueId: 'iss_sample20', appId: 'app_sample', base: '/tasks/iss_sample20' },
  beforeEach: withEngine({ prView: prSample }), render: (a) => <div style={{ maxWidth: 860 }}><PrStep {...a} /></div> } satisfies Meta<typeof PrStep>
export default meta
type Story = StoryObj<typeof meta>

/** Built and not submitted: what it will open with, and one press (asked once more) opens it as a draft. */
export const NotSubmitted: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Not submitted')).toBeInTheDocument()
    await expect(c.getByText('As it will open')).toBeInTheDocument()
    await expect(c.getByText('feat(SS-20): edges that tunnel and portal (sample)')).toBeInTheDocument()
    await expect(c.getByText('Comments show here once it is submitted.')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Submit pull request' }))
    await userEvent.click(c.getByRole('button', { name: 'Submit it' }))
    await expect(await c.findByText('Draft')).toBeInTheDocument()
    await expect(await c.findByRole('button', { name: 'Ready for review' })).toBeInTheDocument()
  },
}

/** What is owed at deploy and what is watched after (made up): on the step, in order, and said done by whoever deploys. */
export const OwedAtDeploy: Story = {
  beforeEach: withEngine({ prView: { ...prDraftSample, release: [{ id: 'ac_r1', text: 'EXPORT_BUCKET is set in each environment (sample)', how: 'the deploy config has it (sample)' }], watch: [{ id: 'ac_w1', text: 'export.finished appears in production within a day (sample)' }] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('At deploy')).toBeInTheDocument()
    await expect(c.getByText('1 owed')).toBeInTheDocument()
    await expect(c.getByText('Watched after the deploy')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Done' }))
    await expect(await c.findByText('all done')).toBeInTheDocument()
    await expect(c.getByText(/Done, said you/)).toBeInTheDocument()
  },
}

/** Still building, with checks of the person's own waiting: it says what it waits on and cannot be submitted. */
export const NotReadyYet: Story = {
  beforeEach: withEngine({ prView: { ...prSample, landed: 1, total: 3, byHand: 2, canSubmit: false, waits: ['2 of its 3 sub-tasks have still to land.'] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/2 checks of yours still wait/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Submit pull request' })).toBeDisabled()
  },
}

/** A draft on GitHub: its review and checks, what was said on it oldest first, and the press that takes it out of draft. */
export const Draft: Story = {
  beforeEach: withEngine({ prView: prDraftSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('1 of 3 checks failing')).toBeInTheDocument()
    await expect(c.getByText('Failing: lint (sample).')).toBeInTheDocument()
    await expect(c.getByText('On GitHub now')).toBeInTheDocument()
    const said = within(c.getByRole('list', { name: 'Comments' })).getAllByRole('listitem')
    await expect(said).toHaveLength(3)
    await expect(said[1]).toHaveTextContent('reviewer-a on a line src/edges/portal.ts:41')
    await userEvent.click(c.getByRole('button', { name: 'Ready for review' }))
    await expect(c.getByText(/takes #412 out of draft/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Mark it ready' }))
    await expect(await c.findByText('Open, ready for review')).toBeInTheDocument()
    await waitFor(() => expect(c.queryByRole('button', { name: 'Ready for review' })).toBeNull())
  },
}

/** GitHub's message is an earlier one: it says so, what will be sent can be looked at, and Update pull request sends it now. */
export const MessageBehind: Story = {
  beforeEach: withEngine({ prView: { ...prDraftSample, behind: true, pr: { ...prDraftSample.pr!, body: 'An earlier message, from the first landing (sample).' } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('An earlier message, from the first landing (sample).')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Show what will be sent' }))
    await expect(c.getByText('What the next update sends')).toBeInTheDocument()
    await expect(c.getByText(/Edges can dip under a node/)).toBeInTheDocument()
    // One press sends it as it stands: GitHub's is then the same, with no new commit.
    await userEvent.click(c.getByRole('button', { name: 'Update pull request' }))
    await expect(await c.findByRole('status')).toHaveTextContent('Updated.')
    await expect(c.getByText('On GitHub now')).toBeInTheDocument()
    await expect(c.queryByText('An earlier message, from the first landing (sample).')).toBeNull()
  },
}

/** GitHub cannot be reached: what was last known, and said plainly. */
export const GithubNotReached: Story = {
  beforeEach: withEngine({ prView: { ...prDraftSample, comments: [], problem: 'GitHub could not be asked just now, so this is what was last known: could not resolve host (sample)', pr: { ...prDraftSample.pr!, title: '', body: '', review: null, checks: [] } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('note')).toHaveTextContent('GitHub could not be asked just now')
    await expect(c.getByText('They could not be read just now.')).toBeInTheDocument()
  },
}

/** Closed by a person: it stays closed until it is submitted again. Merged: nothing more to press. */
export const Closed: Story = {
  beforeEach: withEngine({ prView: { ...prDraftSample, canReady: false, canSubmit: true, pr: { ...prDraftSample.pr!, status: 'closed' } } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('button', { name: 'Submit pull request again' })).toBeEnabled() },
}
export const Merged: Story = {
  beforeEach: withEngine({ prView: { ...prDraftSample, canReady: false, pr: { ...prDraftSample.pr!, status: 'merged', review: 'approved' } } }),
  play: async ({ canvasElement }) => { const c = within(canvasElement); await expect(await c.findByText('It is merged. Nothing more is sent to it.')).toBeInTheDocument(); await expect(c.queryByRole('button', { name: /Ready|Submit/ })).toBeNull() },
}

const findings = `### Scan summary (sample)

| Scanner | Findings |
|:--------|---------:|
| <a><picture><source media="(prefers-color-scheme: dark)" srcset="data:image/gif;base64,R0lGODlhAQABAAAAACw="><img align="top" alt="Secret Finding" title="Secret Finding" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></picture></a>&ensp;Secrets | <b>1</b> |
| Vulnerabilities | - |

<details><summary>:x: 1 secret (sample)</summary>

\`config/sample.env\` line 3: a made-up key.

</details>

<script>window.__got_through = true</script><img src="x" onerror="window.__got_through = true" alt="broken (sample)">`
/** A scanner's findings, as its bot writes them on GitHub (made up): the table, its icons and the folded section are shown as they would be there, not as their source; a script or a handler in a comment does not get through. */
export const ScannerFindings: Story = {
  beforeEach: withEngine({ prView: { ...prDraftSample, comments: [{ id: 'c_9', kind: 'comment', author: 'scanner-bot', body: findings, at: '2026-11-20T09:40:00Z', url: 'https://example.com/pull/412#issuecomment-9' }] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const said = await c.findByRole('list', { name: 'Comments' })
    await expect(within(said).getByRole('table')).toBeInTheDocument()
    await expect(within(said).getByRole('img', { name: 'Secret Finding' })).toBeInTheDocument()
    await expect(within(said).getByText('❌ 1 secret (sample)')).toBeInTheDocument()
    await expect(said).not.toHaveTextContent('<picture>'); await expect(said).not.toHaveTextContent('srcset')
    await expect(said.querySelector('script')).toBeNull(); await expect(said.querySelector('[onerror]')).toBeNull()
    await expect((window as unknown as { __got_through?: boolean }).__got_through).toBeUndefined()
  },
}

/** The app has its own form for a description (Settings › Landing): writing one here starts from its sections. Made-up (sample). */
export const StartsFromTheAppsTemplate: Story = {
  beforeEach: withEngine({ prView: { ...prSample, template: '## Why\n\n## What changed\n\n## How to test (sample)' } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Write it' }))
    await expect(c.getByRole('textbox')).toHaveValue('## Why\n\n## What changed\n\n## How to test (sample)')
  },
}

/** Not written for the team yet: it says so, and it can be written here; once it is, that leads and our record is folded under it. Made-up text (sample). */
export const WrittenForTheTeam: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/has not been written for the team/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Write it' }))
    await userEvent.type(c.getByRole('textbox'), '## What changed and why{Enter}{Enter}Edges can tunnel under a node (sample).')
    await userEvent.click(c.getByRole('button', { name: 'Save it' }))
    await expect(await c.findByText(/was written for the team/)).toBeInTheDocument()
    await expect(c.getByText('Edges can tunnel under a node (sample).')).toBeInTheDocument()
    await expect(c.getByText('How this was built (sample)')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Edit it' })).toBeInTheDocument()
  },
}

