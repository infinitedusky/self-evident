import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { ReviewCopy } from './ReviewCopy'
import { withEngine } from '../stories/mock-engine'
import { reviewCopyMadeSample, reviewCopySample } from '../stories/sample'

/** A task's review copy, on its pull request step: the branch a reviewer runs. Made-up task, service, files and fixtures (sample). */
const meta = { title: 'Components/ReviewCopy', component: ReviewCopy, parameters: { layout: 'padded' }, args: { issueId: 'iss_sample20', appId: 'app_sample' },
  beforeEach: withEngine({ reviewCopy: reviewCopySample }), render: (a) => <div style={{ maxWidth: 860 }}><ReviewCopy {...a} /></div> } satisfies Meta<typeof ReviewCopy>
export default meta
type Story = StoryObj<typeof meta>

/** Not made yet: what it would hold, the fixture it starts from, what to try, and one press (asked once more) makes and pushes it. */
export const NotMadeYet: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Not made')).toBeInTheDocument()
    await expect(c.getByText('REVIEW-edges-that-tunnel-SS-20')).toBeInTheDocument()
    await expect(c.getByText(/Sample Vendor/)).toBeInTheDocument()
    await userEvent.selectOptions(c.getByLabelText('Its database starts from'), 'Meridian (sample)')
    await userEvent.type(c.getByLabelText(/What to try/), 'Import the file and start a scan (sample).')
    await userEvent.click(c.getByRole('button', { name: 'Make the review copy' }))
    await expect(c.getByText(/pushes REVIEW-edges-that-tunnel-SS-20 to GitHub/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Make and push it' }))
    await expect(await c.findByText('In step with the pull request')).toBeInTheDocument()
    await expect(c.getByText(/the fixture "Meridian \(sample\)"/)).toBeInTheDocument()
  },
}

/** Made and pushed, on the pull request's head: what a reviewer runs is what would merge. Its form is folded away. */
export const InStep: Story = {
  beforeEach: withEngine({ reviewCopy: reviewCopyMadeSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('In step with the pull request')).toBeInTheDocument()
    await expect(c.getByText(/starts empty/)).toBeInTheDocument()
    await expect(c.getByRole('link', { name: /What it adds/ })).toHaveAttribute('href', reviewCopySample.compare)
    await expect(c.queryByLabelText('Its database starts from')).toBeNull()
    await userEvent.click(c.getByRole('button', { name: 'Make it again' }))
    await expect(c.getByLabelText(/What to try/)).toHaveValue(reviewCopyMadeSample.made!.try)
  },
}

/** The pull request moved on since it was made: it says so, and it is made again on the next update or by a press. */
export const BehindThePullRequest: Story = {
  beforeEach: withEngine({ reviewCopy: { ...reviewCopyMadeSample, made: { ...reviewCopyMadeSample.made!, from: '1111111aa9d0b7e6c5a4f3e2d1c0b9a8f7e6d5c4', inStep: false } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Behind the pull request')).toBeInTheDocument()
    await expect(c.getByText('1111111aa')).toBeInTheDocument()
    await expect(c.getByText('4f1c2aa9d')).toBeInTheDocument()
    await expect(c.getByText(/a reviewer would run older code than they read/)).toBeInTheDocument()
  },
}

/** A branch of that name was made by hand, before the tool: making it here replaces it. */
export const MadeByHand: Story = {
  beforeEach: withEngine({ reviewCopy: { ...reviewCopySample, byHand: true } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Made by hand')).toBeInTheDocument()
    await expect(c.getByText(/Making it here replaces it/)).toBeInTheDocument()
  },
}

/** It cannot be made: a service would answer a reviewer with a real response, and the app has no kit. It says why, and nothing can be pressed. */
export const CannotBeMade: Story = {
  beforeEach: withEngine({ reviewCopy: { ...reviewCopySample, kit: null, services: [{ key: 'vendor', name: 'Sample Vendor', says: 'The mock, with faked data', blocked: '1 call has a real response that is not faked yet, and a reviewer is never given a real one (GET /results)' }], waits: ['This app has no review kit: the folder that holds its own part of a review copy (how it starts, a sign-in for a reviewer). Name it in the app\'s settings as review.kit.', '1 call has a real response that is not faked yet, and a reviewer is never given a real one (GET /results).'] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/has no review kit/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Make the review copy' })).toBeDisabled()
  },
}

/** Making it was refused: it says why, in the engine's words, and stays as it was. */
export const Refused: Story = {
  beforeEach: withEngine({ reviewCopy: reviewCopySample, reviewCopyError: 'the pull request\'s own branch already has a review/ folder, and a review copy would write over it' }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Make the review copy' }))
    await userEvent.click(c.getByRole('button', { name: 'Make and push it' }))
    await expect(await c.findByRole('alert')).toHaveTextContent(/already has a review\/ folder/)
    await expect(c.getByText('Not made')).toBeInTheDocument()
  },
}
