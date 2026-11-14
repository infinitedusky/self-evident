import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { QuestionAsk } from './QuestionAsk'

// One unanswered question and the way to answer it. Made up: a sample shop's checkout.
const q = { id: 'q_sample1', text: 'The saved address can be shown **before** or **after** the card form. Which?', cost: 'expensive', reason: 'The prototype shows it first and the mockups were approved that way (sample).',
  options: [{ label: 'Before the card', description: 'As in the prototype.', recommended: true }, { label: 'After the card', description: 'Fewer fields on first sight; one more scroll.', recommended: false }] }
const meta = { title: 'Components/QuestionAsk', component: QuestionAsk, args: { q, onAnswer: fn(async () => {}) } } satisfies Meta<typeof QuestionAsk>
export default meta
type Story = StoryObj<typeof meta>

/** The question, its cost, and its options: one press answers it. */
export const Options: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'After the card' }))
    await expect(args.onAnswer).toHaveBeenCalledWith('After the card')
  },
}
/** None of the options fits: answer in your own words. */
export const OwnWords: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Answer in your own words' }))
    await userEvent.type(await c.findByLabelText('Your answer'), 'Before, but collapsed')
    await userEvent.click(await c.findByRole('button', { name: 'Answer' }))
    await expect(args.onAnswer).toHaveBeenCalledWith('Before, but collapsed')
  },
}
/** A cheap one with no recommendation. */
export const Cheap: Story = { args: { q: { ...q, cost: 'cheap', reason: null, options: q.options.map((o) => ({ ...o, recommended: false })) } } }
/** Being answered: the buttons wait. */
export const Busy: Story = { args: { busy: true } }
