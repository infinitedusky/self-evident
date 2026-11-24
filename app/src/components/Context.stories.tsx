import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Context } from './Context'
import { withEngine } from '../stories/mock-engine'
import { contextLimits, emptyContext, taskContext } from '../stories/sample'

// The Context of a made-up task, idea and project of the sample shop: its reference docs, decisions and notes, and how
// the agents are given each. Every name, ticket and word in it is invented.
const meta = { title: 'Components/Context', component: Context, args: { subject: { kind: 'issues', id: 'iss_sample20' } },
  render: (a) => <div style={{ maxWidth: 900 }}><Context {...a} /></div> } satisfies Meta<typeof Context>
export default meta
type Story = StoryObj<typeof meta>

const section = (el: HTMLElement, name: string) => within(el.querySelector(`[data-section="${name}"]`) as HTMLElement)

/**
 * The whole section, on a task in a project: the reference docs, the ticket the work came from at their head; the
 * decisions, the unanswered ones first among them; the notes. Each part says how the agents get it, and
 * what comes from the project is marked and not changed here.
 */
export const OnATask: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByText('Reference docs')
    const ask = section(canvasElement, 'decisions') // unanswered ones are decisions like the rest, first among them
    await expect(c.queryByText('For you to decide')).toBeNull()
    await expect(await ask.findByText('2 unanswered')).toBeVisible()
    await expect(ask.getByText('Which saved cards are offered? (sample)')).toBeVisible() // the agent proposes an answer
    await expect(ask.getByText('Only the ones used in the last 12 months')).toBeVisible()
    await expect(ask.getByText('What is shown when a saved card has expired? (sample)')).toBeVisible() // asked, not answered
    const rows = [...canvasElement.querySelectorAll('[data-section="decisions"] > .context-row')].map((r) => r.getAttribute('data-unanswered'))
    await expect(rows).toEqual(['proposed', 'open', 'waiting', null, null, null]) // unanswered first, the one waiting on someone last of them, then the answered and the project's
    const docs = section(canvasElement, 'docs')
    await expect(docs.getByText(/From Linear, SHOP-41 · the work came from it/)).toBeVisible()
    await expect(docs.getAllByText('Every agent, in full')).toHaveLength(2) // the ticket, and the project's principles
    await expect(docs.getAllByText('Listed, opened when needed')).toHaveLength(3)
    await expect(docs.getByText(/Imported file, support-export.md/)).toBeVisible()
    await expect(docs.getByText(/From the project/)).toBeVisible()
    const order = [...canvasElement.querySelectorAll('.context-h')].map((h) => h.firstChild?.textContent?.trim())
    await expect(order).toEqual(['Reference docs', 'Decisions', 'Notes'])
    const decisions = section(canvasElement, 'decisions')
    await expect(decisions.getByText('What happens to a card when it is removed? (sample)')).toBeVisible() // the question
    await expect(decisions.getByText('It is deleted at the provider, not hidden here')).toBeVisible() // and its answer
    await expect(decisions.getByText(/Recorded by the agent once you agreed/)).toBeVisible()
    await expect(decisions.getByText('1 answer proposed and rejected')).toBeVisible()
    const notes = section(canvasElement, 'notes')
    await expect(notes.getByRole('link', { name: 'SS-5' })).toBeVisible()
    await expect(notes.getByText(/added by the agent/)).toBeVisible()
  },
}

/** Nothing in it yet: a task made here, from no ticket. Each part says what it is for. */
export const Empty: Story = {
  beforeEach: withEngine({ context: { issues: emptyContext } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/None yet. A design note, a spec/)).toBeVisible()
    await expect(c.queryByText(/\d unanswered/)).toBeNull()
  },
}

/** An idea that came in from Linear: the ticket is its one reference doc, and what is added here goes with it when it becomes a task or a project. */
export const AnIdeaFromATicket: Story = {
  args: { subject: { kind: 'ideas', id: 'idea_sample1' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/it goes with the idea when it becomes a task or a project/)).toBeVisible()
    await expect(c.getByText(/From Linear, SHOP-41/)).toBeVisible()
  },
}

/** A project's own: what each of its tasks sees as "from the project". */
export const OnAProject: Story = {
  args: { subject: { kind: 'projects', id: 'proj_checkout' } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Checkout design principles (sample)')).toBeVisible()
    await expect(c.queryByText(/From the project/)).toBeNull()
    await expect(c.getByRole('button', { name: 'Edit: Is the checkout one page on a phone too? (sample)' })).toBeVisible()
  },
}

/** The ticket, opened: word for word, with its comments, and brought up to date from Linear by a press. It is never edited here and cannot be taken out. */
export const TheTicketOpen: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByText('2 unanswered')
    const row = within(canvasElement.querySelector('[data-doc="origin_sample1"]') as HTMLElement)
    await userEvent.click(row.getByText('Saved cards at checkout (sample)', { selector: '.context-title' }))
    await expect(row.getByText(/Returning customers should be able to pay/)).toBeVisible()
    await expect(row.getByText(/Never edited here: it stays as Linear has it/)).toBeVisible()
    await expect(row.queryByRole('button', { name: 'Take out SHOP-41' })).toBeNull()
    await expect(c.getByRole('button', { name: 'Take out SHOP-37', hidden: true })).toBeInTheDocument() // another ticket can be
    await userEvent.click(row.getByRole('button', { name: 'Refresh SHOP-41 from Linear' }))
    await expect(await c.findByText('Added since it was last read (sample).')).toBeVisible()
  },
}

/** A pasted doc, opened: its line of description, who added it and how long it is, and the mark that gives it to every agent in full. */
export const GiveADocInFull: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByText('Card vault API notes (sample)'))
    const row = within(canvasElement.querySelector('[data-doc="cdoc_sample1"]') as HTMLElement)
    await expect(row.getByText('Listed, opened when needed')).toBeVisible()
    await userEvent.click(row.getByRole('checkbox', { name: /Give it to every agent in full/ }))
    await waitFor(() => expect(within(canvasElement.querySelector('[data-doc="cdoc_sample1"]') as HTMLElement).getByText('Every agent, in full')).toBeInTheDocument())
  },
}

/** A long doc stays listed: it is over the size that may be put in front of every agent, and says so. */
export const TooLongToGiveInFull: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByText('Support requests about saved cards (sample)'))
    const row = within(canvasElement.querySelector('[data-doc="cdoc_sample2"]') as HTMLElement)
    await expect(row.getByRole('checkbox', { name: /Give it to every agent in full/ })).toBeDisabled()
    await expect(row.getByText(new RegExp(`too long for that: over ${contextLimits.inFull.toLocaleString('en-US')} characters`))).toBeVisible()
    await expect(row.getByText(/Added by the agent/)).toBeVisible()
  },
}

/** Text pasted in: a title, the line an agent reads in the list, the text. */
export const PasteADoc: Story = {
  beforeEach: withEngine({ context: { issues: emptyContext } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Paste text' }))
    const add = c.getByRole('button', { name: 'Add the doc' })
    await expect(add).toBeDisabled()
    await userEvent.type(c.getByRole('textbox', { name: 'Title' }), 'Refund rules (sample)')
    await userEvent.type(c.getByRole('textbox', { name: 'What it is, in a line' }), 'When a saved card may be refunded to.')
    await userEvent.type(c.getByRole('textbox', { name: 'The text' }), 'A refund goes to the card that paid.')
    await expect(c.getByText(`36 of ${contextLimits.doc.toLocaleString('en-US')} characters`)).toBeVisible()
    await userEvent.click(add)
    await expect(await c.findByText('Refund rules (sample)')).toBeVisible()
    await expect(c.getByText('Pasted text')).toBeVisible()
  },
}

/** A text or Markdown file brought in: its text is kept, and can be edited after. */
export const ImportAFile: Story = {
  beforeEach: withEngine({ context: { issues: emptyContext } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByRole('button', { name: 'Import a file' })
    await userEvent.upload(c.getByLabelText('A file to import'), new File(['made up'], 'pricing-notes.md', { type: 'text/markdown' }))
    await expect(await c.findByText('pricing-notes')).toBeVisible()
    await expect(c.getByText(/Imported file, pricing-notes.md/)).toBeVisible()
  },
}

/** A PDF brought in is kept as the file it was: the agent that needs it opens it, and it is never put in front of every agent. */
export const ImportAPdf: Story = {
  beforeEach: withEngine({ context: { issues: emptyContext } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByRole('button', { name: 'Import a file' })
    await userEvent.upload(c.getByLabelText('A file to import'), new File(['%PDF made up'], 'contract.pdf', { type: 'application/pdf' }))
    await userEvent.click(await c.findByText('contract'))
    await expect(c.getByText(/A PDF, kept on this computer as the file it was/)).toBeVisible()
    await expect(c.queryByRole('checkbox', { name: /Give it to every agent in full/ })).toBeNull()
  },
}

/** An HTML page (a mock-up, an artifact saved from Claude) is kept as the file too: an agent reads its markup when it needs it. */
export const ImportAnHtmlPage: Story = {
  beforeEach: withEngine({ context: { issues: emptyContext } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByRole('button', { name: 'Import a file' })
    await userEvent.upload(c.getByLabelText('A file to import'), new File(['<h1>Made up</h1>'], 'checkout-mockup.html', { type: 'text/html' }))
    await userEvent.click(await c.findByText('checkout-mockup'))
    await expect(c.getByText(/An HTML page, kept on this computer as the file it was/)).toBeVisible()
    await expect(c.queryByRole('checkbox', { name: /Give it to every agent in full/ })).toBeNull()
  },
}

/** Another ticket, by its id: kept like the first, and this one can be taken out again. */
export const AddATicket: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a ticket' }))
    await userEvent.type(c.getByRole('textbox', { name: 'The ticket\'s id in Linear' }), 'shop-52')
    await userEvent.click(c.getByRole('button', { name: 'Bring it in' }))
    await expect(await c.findByText(/From Linear, SHOP-52/)).toBeVisible()
  },
}

/** A ticket that can't be read: Linear's reason is said, and the form stays. */
export const ATicketThatCannotBeRead: Story = {
  beforeEach: withEngine({ context: { issues: taskContext }, contextProblem: 'Linear has no ticket SHOP-999 that this key can read.' }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a ticket' }))
    await userEvent.type(c.getByRole('textbox', { name: 'The ticket\'s id in Linear' }), 'SHOP-999')
    await userEvent.click(c.getByRole('button', { name: 'Bring it in' }))
    await expect(await c.findByText('Linear has no ticket SHOP-999 that this key can read.')).toBeVisible()
    await expect(c.getByRole('button', { name: 'Bring it in' })).toBeVisible()
  },
}

/** Accepting the answer the agent proposed: the decision is answered, and one is left unanswered. */
export const AcceptAProposal: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Accept: Which saved cards are offered? (sample)' }))
    await waitFor(() => expect(c.queryByRole('button', { name: /^Accept:/ })).toBeNull())
    await expect(section(canvasElement, 'decisions').getByText('Only the ones used in the last 12 months')).toBeVisible()
    await expect(c.getByText('1 unanswered')).toBeVisible() // the open question is still there
  },
}

/** Rejecting it: kept, folded under the decisions, so the agents are told it was turned down and do not propose it again. It can be accepted after all, the question asked again with no answer, or deleted. */
export const RejectAProposal: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Reject: Which saved cards are offered? (sample)' }))
    const decisions = section(canvasElement, 'decisions')
    await userEvent.click(await decisions.findByText('2 answers proposed and rejected'))
    await expect(decisions.getByText(/does not propose it again/)).toBeVisible()
    await expect(decisions.getByRole('button', { name: 'Accept after all: Is a card saved without asking? (sample)' })).toBeVisible()
    await userEvent.click(decisions.getByRole('button', { name: 'Ask again: Which saved cards are offered? (sample)' }))
    await expect(await c.findByRole('button', { name: 'Answer: Which saved cards are offered? (sample)' })).toBeVisible()
  },
}

/** An open decision answered: the answer is asked for, with why; it then sits with the decisions, and nothing is left to decide once the other is accepted. */
export const AnswerAnOpenDecision: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Answer: What is shown when a saved card has expired? (sample)' }))
    const save = c.getByRole('button', { name: 'Save the decision' })
    await expect(save).toBeDisabled() // until it has an answer
    await userEvent.type(c.getByRole('textbox', { name: 'The answer' }), 'It is shown, greyed out')
    await userEvent.type(c.getByRole('textbox', { name: 'Why this answer (optional)' }), 'So nobody wonders where it went.')
    await userEvent.click(save)
    const decisions = section(canvasElement, 'decisions')
    await expect(await decisions.findByText('It is shown, greyed out')).toBeVisible()
    await expect(c.queryByRole('button', { name: 'Answer: What is shown when a saved card has expired? (sample)' })).toBeNull()
  },
}

/** A decision that needs someone else: marked as waiting on them. It leaves the count of what is unanswered and yours, says who it waits on and for how long, and can still be answered when they reply. */
export const WaitingOnSomeone: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByText('2 unanswered')
    const ask = section(canvasElement, 'decisions')
    await expect(ask.getByText('Waiting on Em')).toBeVisible() // one already asked of someone
    await expect(ask.getByText('1 waiting on someone')).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'Waiting on someone: What is shown when a saved card has expired? (sample)' }))
    const mark = c.getByRole('button', { name: 'Mark it as waiting' })
    await expect(mark).toBeDisabled() // until it says who
    await userEvent.type(c.getByRole('textbox', { name: 'Who you asked' }), 'the vendor')
    await userEvent.click(mark)
    await expect(await ask.findByText('Waiting on the vendor')).toBeVisible()
    await expect(ask.getByText('2 waiting on someone')).toBeVisible()
    await expect(ask.getByText('1 unanswered')).toBeVisible() // only the proposed answer is left for the person now
    // One with an answer the agent proposed can wait on someone too.
    await userEvent.click(c.getByRole('button', { name: 'Waiting on someone: Which saved cards are offered? (sample)' }))
    await userEvent.type(c.getByRole('textbox', { name: 'Who you asked' }), 'legal')
    await userEvent.click(c.getByRole('button', { name: 'Mark it as waiting' }))
    await expect(await ask.findByText('Waiting on legal')).toBeVisible()
    await expect(c.getByRole('button', { name: 'Accept: Which saved cards are offered? (sample)' })).toBeVisible() // and still be accepted
    await expect(ask.queryByText(/\d unanswered/)).toBeNull()
    await expect(c.getByRole('button', { name: 'Answer: What is shown when a saved card has expired? (sample)' })).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'No longer waiting: Can a card saved in the app be used on the web? (sample)' }))
    await expect(await ask.findByText('2 waiting on someone')).toBeVisible()
  },
}

/** A decision's background: the story of why it is a question. Open to read while the decision is unanswered, folded once it is answered. The form is always the same four fields: the question, its background, the answer, why that answer. */
export const TheStoryBehindAQuestion: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByText('2 unanswered')
    await expect(c.getByText(/The app saves cards with one vendor and the web checkout with another/)).toBeVisible() // unanswered: in full
    await expect(c.getByText(/Design first drew the whole number/)).not.toBeVisible() // answered: folded
    await userEvent.click(c.getByRole('button', { name: 'Add a decision' }))
    await userEvent.type(c.getByRole('textbox', { name: 'The question' }), 'Do we keep cards of closed accounts? (sample)')
    await userEvent.type(c.getByRole('textbox', { name: /^Background/ }), 'Legal asked last spring and nobody answered.')
    for (const name of ['The question', /^Background/, /^The answer/, 'Why this answer (optional)']) await expect(c.getByRole('textbox', { name })).toBeVisible() // always the same four
    await userEvent.click(c.getByRole('button', { name: 'Add it, unanswered' }))
    await expect(await c.findByText('Legal asked last spring and nobody answered.')).toBeVisible()
    // The story can be added to a question already asked, without answering it.
    await userEvent.click(c.getByRole('button', { name: 'Edit the question: What is shown when a saved card has expired? (sample)' }))
    for (const name of ['The question', /^Background/, /^The answer/, 'Why this answer (optional)']) await expect(c.getByRole('textbox', { name })).toBeVisible()
    await userEvent.type(c.getByRole('textbox', { name: /^Background/ }), 'The vault still returns expired cards.')
    await userEvent.click(c.getByRole('button', { name: 'Save it, unanswered' }))
    await expect(await c.findByText('The vault still returns expired cards.')).toBeVisible()
    await expect(c.getByRole('button', { name: 'Answer: What is shown when a saved card has expired? (sample)' })).toBeVisible() // still unanswered
  },
}

/** A decision put in to answer later: a question with no answer. It is a decision like the rest, marked Unanswered. */
export const AddOneToDecideLater: Story = {
  beforeEach: withEngine({ context: { issues: emptyContext } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a decision' }))
    await userEvent.type(c.getByRole('textbox', { name: 'The question' }), 'Do we support gift cards? (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Add it, unanswered' }))
    await expect(await c.findByText('1 unanswered')).toBeVisible()
    await expect(c.getByRole('button', { name: 'Answer: Do we support gift cards? (sample)' })).toBeVisible()
    await expect(section(canvasElement, 'decisions').getByText('Do we support gift cards? (sample)')).toBeVisible()
    await expect(c.getByRole('button', { name: 'Not needed: Do we support gift cards? (sample)' })).toBeVisible() // or it is dropped
  },
}

/** A decision made on the spot: the question and its answer together, and why if there is a why. */
export const AddADecision: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a decision' }))
    await userEvent.type(c.getByRole('textbox', { name: 'The question' }), 'Can a card be renamed? (sample)')
    await userEvent.type(c.getByRole('textbox', { name: /^The answer/ }), 'No')
    await userEvent.type(c.getByRole('textbox', { name: 'Why this answer (optional)' }), 'Nobody asked for it.')
    await userEvent.click(c.getByRole('button', { name: 'Save the decision' }))
    const decisions = section(canvasElement, 'decisions')
    await expect(await decisions.findByText('Can a card be renamed? (sample)')).toBeVisible()
    await expect(decisions.getByText('Nobody asked for it.')).toBeVisible()
  },
}

/** A note: what it is about, what was said, and its day, which is what puts it in a report. */
export const AddANote: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Add a note' }))
    await expect(c.getByLabelText('Day')).toHaveValue(new Date().toLocaleDateString('en-CA'))
    await userEvent.type(c.getByRole('textbox', { name: 'What it is about' }), 'Asked the vendor about limits (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Save the note' }))
    await expect(await section(canvasElement, 'notes').findByText('Asked the vendor about limits (sample)')).toBeVisible()
  },
}

/** A decision's answer changed, from its Edit. What comes from the project has no Edit here. */
export const EditADecision: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Is the checkout one page on a phone too? (sample)')).toBeVisible()
    await expect(c.queryByRole('button', { name: 'Edit: Is the checkout one page on a phone too? (sample)' })).toBeNull()
    await userEvent.click(c.getByRole('button', { name: 'Edit: What happens to a card when it is removed? (sample)' }))
    const t = c.getByRole('textbox', { name: 'The answer' })
    await userEvent.clear(t); await userEvent.type(t, 'It is deleted everywhere')
    await userEvent.click(c.getByRole('button', { name: 'Save the decision' }))
    await expect(await c.findByText('It is deleted everywhere')).toBeVisible()
  },
}
