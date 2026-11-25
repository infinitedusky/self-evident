import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Context, FOLDED } from './Context'
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
    await expect(ask.getByText('Which saved cards are offered? (sample)', { selector: '.context-q' })).toBeVisible() // the agent proposes an answer
    await expect(ask.getByText('Only the ones used in the last 12 months')).toBeVisible()
    await expect(ask.getByText('What is shown when a saved card has expired? (sample)', { selector: '.context-q' })).toBeVisible() // asked, not answered
    const rows = [...canvasElement.querySelectorAll('[data-section="decisions"] > .context-row')].map((r) => r.getAttribute('data-unanswered'))
    await expect(rows).toEqual(['proposed', 'open', 'waiting', null, null, null]) // unanswered first, the one waiting on someone last of them, then the answered and the project's
    const docs = section(canvasElement, 'docs')
    await expect(docs.getByText(/From Linear, SHOP-41 · the work came from it/)).toBeVisible()
    await expect(docs.getAllByText('Every agent, in full')).toHaveLength(2) // the ticket, and the project's principles
    await expect(docs.getAllByText('Listed, opened when needed')).toHaveLength(3)
    await expect(docs.getByText(/Imported file, support-export.md/)).toBeVisible()
    await expect(docs.getByText(/From the project/)).toBeVisible()
    const order = [...canvasElement.querySelectorAll('.context-fold-name')].map((h) => h.textContent)
    await expect(order).toEqual(['Reference docs', 'Decisions', 'Notes'])
    const decisions = section(canvasElement, 'decisions')
    await expect(decisions.getByText('What happens to a card when it is removed? (sample)', { selector: '.context-q' })).toBeVisible() // the question
    await expect(decisions.getByText('It is deleted at the provider, not hidden here')).toBeVisible() // and its answer
    await expect(decisions.getByText(/Recorded by the agent once you agreed/)).toBeVisible()
    await expect(decisions.getByText('1 answer proposed and rejected')).toBeVisible()
    const notes = section(canvasElement, 'notes')
    await expect(notes.getByRole('link', { name: 'SS-5' })).toBeVisible()
    await expect(notes.getByText(/added by the agent/)).toBeVisible()
  },
}

/** Each section folds to its heading, which keeps its counts and marks: how many docs and how many in full, how many decisions are unanswered or waiting on someone, how many notes. It stays folded on the next visit. */
export const SectionsFolded: Story = {
  beforeEach: () => { localStorage.removeItem(FOLDED); return () => localStorage.removeItem(FOLDED) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByText('2 unanswered')
    for (const name of ['reference docs', 'decisions', 'notes']) await userEvent.click(c.getByRole('button', { name: `Hide ${name}` }))
    await expect(c.queryByText('Saved cards at checkout (sample)')).toBeNull()
    await expect(c.queryByText('Which saved cards are offered? (sample)')).toBeNull()
    await expect(c.queryByText('Talked with Em about mobile (sample)')).toBeNull()
    await expect(c.queryByRole('button', { name: 'Add a decision' })).toBeNull()
    await expect(section(canvasElement, 'docs').getByText('2 in full')).toBeVisible()
    await expect(section(canvasElement, 'decisions').getByText('2 unanswered')).toBeVisible()
    await expect(section(canvasElement, 'decisions').getByText('1 waiting on someone')).toBeVisible()
    await expect(JSON.parse(localStorage.getItem(FOLDED) ?? '{}')).toEqual({ docs: true, decisions: true, notes: true })
    await userEvent.click(c.getByRole('button', { name: 'Show decisions' }))
    await expect(c.getByText('Which saved cards are offered? (sample)')).toBeVisible()
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

/** A decision that needs someone else: marked as waiting on them, with what to ask them written down, so it is there to copy into an email and is not forgotten. It leaves the count of what is unanswered and yours, says who it waits on and for how long, and can still be answered when they reply. */
export const WaitingOnSomeone: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByText('2 unanswered')
    const ask = section(canvasElement, 'decisions')
    await expect(ask.getByText('Waiting on Em')).toBeVisible() // one already asked of someone
    await expect(ask.getByText('1 waiting on someone')).toBeVisible()
    await expect(ask.getByText('To ask Em:')).toBeVisible() // what to ask them, as it was written
    await expect(ask.getByText(/Can the web checkout read the cards the app saved/)).toBeVisible()
    await expect(c.getByRole('button', { name: 'Copy what to ask Em' })).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'Waiting on someone: What is shown when a saved card has expired? (sample)' }))
    const mark = c.getByRole('button', { name: 'Mark it as waiting' })
    await expect(mark).toBeDisabled() // until it says who
    await userEvent.type(c.getByRole('textbox', { name: 'Who it is' }), 'the vendor')
    await userEvent.type(c.getByRole('textbox', { name: 'What you want to ask them' }), 'Does the vault tell us when a card expires? (sample)')
    await userEvent.click(mark)
    await expect(await ask.findByText('Waiting on the vendor')).toBeVisible()
    await expect(ask.getByText('To ask the vendor:')).toBeVisible()
    await expect(ask.getByText('Does the vault tell us when a card expires? (sample)')).toBeVisible()
    await waitFor(() => expect(c.queryByRole('button', { name: 'Mark it as waiting' })).toBeNull())
    // Who it is and what to ask can be changed after.
    await userEvent.click(c.getByRole('button', { name: 'Who and what to ask: What is shown when a saved card has expired? (sample)' }))
    await waitFor(() => expect(c.getByRole('textbox', { name: 'What you want to ask them' })).toHaveValue('Does the vault tell us when a card expires? (sample)'))
    await userEvent.type(c.getByRole('textbox', { name: 'What you want to ask them' }), ' And how far ahead?')
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    await expect(await ask.findByText('Does the vault tell us when a card expires? (sample) And how far ahead?')).toBeVisible()
    await expect(ask.getByText('2 waiting on someone')).toBeVisible()
    await expect(ask.getByText('1 unanswered')).toBeVisible() // only the proposed answer is left for the person now
    // One with an answer the agent proposed can wait on someone too.
    await userEvent.click(c.getByRole('button', { name: 'Waiting on someone: Which saved cards are offered? (sample)' }))
    await userEvent.type(c.getByRole('textbox', { name: 'Who it is' }), 'legal') // what to ask is optional
    await userEvent.click(c.getByRole('button', { name: 'Mark it as waiting' }))
    await expect(await ask.findByText('Waiting on legal')).toBeVisible()
    await expect(c.getByRole('button', { name: 'Accept: Which saved cards are offered? (sample)' })).toBeVisible() // and still be accepted
    await expect(ask.queryByText(/\d unanswered/)).toBeNull()
    await expect(c.getByRole('button', { name: 'Answer: What is shown when a saved card has expired? (sample)' })).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'No longer waiting: Can a card saved in the app be used on the web? (sample)' }))
    await expect(await ask.findByText('2 waiting on someone')).toBeVisible()
    await expect(ask.queryByText('To ask Em:')).toBeNull() // what to ask goes with it
  },
}

/** A decision's background: the story of why it is a question. Open to read while the decision is unanswered, folded once it is answered. Its options (what there is to choose between, a recommendation) sit below the question the same way. The form is always the same five fields: background, the question, options, the answer, why that answer. */
export const TheStoryBehindAQuestion: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByText('2 unanswered')
    await expect(c.getByText(/The ticket does not say. Support is asked about it most weeks/)).toBeVisible() // unanswered: its background in full, above the question
    await expect(c.getByText(/Recommendation: \(b\) for this task/)).toBeVisible() // and its options, below it
    const parts = [...(canvasElement.querySelector('[data-note="note_ctx8"]') as HTMLElement).children].map((e) => e.getAttribute('data-component') ?? e.className)
    await expect(parts).toEqual(['ContextBackground', 'context-q', '', 'ContextOptions'])
    await expect(c.getByText(/Design first drew the whole number/)).not.toBeVisible() // answered: folded
    await userEvent.click(c.getByRole('button', { name: 'Add a decision' }))
    await userEvent.type(c.getByRole('textbox', { name: 'The question' }), 'Do we keep cards of closed accounts? (sample)')
    await userEvent.type(c.getByRole('textbox', { name: /^Background/ }), 'Legal asked last spring and nobody answered.')
    await expect([...canvasElement.querySelectorAll('[data-component="ContextDecisionForm"] label')].map((l) => l.firstChild?.textContent?.split(/[ (:]/)[0])).toEqual(['Background', 'The', 'Options', 'The', 'Why']) // always the same five, in this order, with what it depends on between the options and the answer
    await userEvent.type(c.getByRole('textbox', { name: /^Options/ }), '(a) Keep them. (b) Delete them.')
    await userEvent.click(c.getByRole('button', { name: 'Add it, unanswered' }))
    await expect(await c.findByText('Legal asked last spring and nobody answered.')).toBeVisible()
    await expect(await c.findByText('(a) Keep them. (b) Delete them.')).toBeVisible()
    // The story can be added to a question already asked, without answering it.
    await userEvent.click(c.getByRole('button', { name: 'Edit the question: What is shown when a saved card has expired? (sample)' }))
    for (const name of ['The question', /^Background/, /^Options/, /^The answer/, 'Why this answer (optional)']) await expect(c.getByRole('textbox', { name })).toBeVisible()
    await userEvent.type(c.getByRole('textbox', { name: /^Background/ }), 'The vault still returns expired cards.')
    await userEvent.click(c.getByRole('button', { name: 'Save it, unanswered' }))
    await expect(await c.findByText('The vault still returns expired cards.')).toBeVisible()
    await expect(await c.findByRole('button', { name: 'Answer: What is shown when a saved card has expired? (sample)' })).toBeVisible() // still unanswered
  },
}

/** A decision that depends on others says so, with how each stands, and the one it waits for says what needs it. In the form, what it depends on is chosen from the decisions here or written as a new question, which is asked when the decision is saved. */
export const DependsOnAnotherDecision: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByText('2 unanswered')
    const row = within(canvasElement.querySelector('[data-note="note_ctx7"]') as HTMLElement)
    await expect(row.getByText(/Depends on:/)).toBeVisible()
    await expect(row.getByText('(unanswered)')).toBeVisible() // one it waits for is not made
    await expect(row.getByText('(Its last four digits and its expiry, nothing more)')).toBeVisible() // the other is, and says its answer
    await expect(within(canvasElement.querySelector('[data-note="note_ctx8"]') as HTMLElement).getByText(/Needed for:/)).toBeVisible()
    // A new decision that depends on one here and on a question not asked yet.
    await userEvent.click(c.getByRole('button', { name: 'Add a decision' }))
    await userEvent.type(c.getByRole('textbox', { name: 'The question' }), 'Who can set someone as protected? (sample)')
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'Depends on' }), 'note_ctx3')
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'Depends on' }), 'new')
    await userEvent.type(c.getByRole('textbox', { name: 'The question it depends on' }), 'Does the backend use the core permissions? (sample)')
    await userEvent.click(c.getByRole('button', { name: 'Add it' }))
    await expect(c.getByText(/A new question is added to the decisions, unanswered/)).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'Add it, unanswered' }))
    await expect(await c.findByRole('button', { name: 'Answer: Does the backend use the core permissions? (sample)' })).toBeVisible() // asked, as a decision of its own
    const made = within([...canvasElement.querySelectorAll('[data-note]')].find((e) => e.textContent?.includes('Who can set someone as protected? (sample)') && e.getAttribute('data-unanswered')) as HTMLElement)
    await expect(made.getByRole('button', { name: 'Does the backend use the core permissions? (sample)' })).toBeVisible()
    await expect(made.getByRole('button', { name: 'What happens to a card when it is removed? (sample)' })).toBeVisible()
    await expect(c.getByText('4 unanswered')).toBeVisible()
  },
}

/** The open questions as one document to share: a list of them, then each in full with its background, its options and what it depends on, those waiting on someone first. Copied as Markdown, downloaded, or printed (which is how it becomes a PDF). */
export const OpenQuestionsDoc: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Open questions doc' }))
    const doc = within(await waitFor(() => { const el = canvasElement.querySelector('[data-component="ContextOpenQuestions"]'); if (!el) throw new Error('not yet'); return el as HTMLElement }))
    await expect(doc.getByRole('heading', { level: 1, name: /Open questions: SS-20/ })).toBeVisible()
    await expect(doc.getByText(/as of 24 Nov 2026 · 3 open/)).toBeVisible()
    await expect(doc.getByRole('table')).toBeVisible()
    await expect(doc.getByRole('heading', { level: 2, name: 'Waiting on Em' })).toBeVisible()
    await expect(doc.getByRole('heading', { level: 3, name: /1\. Can a card saved in the app be used on the web/ })).toBeVisible()
    await expect(doc.getByText(/Recommendation: \(b\) for this task/)).toBeVisible()
    await expect(doc.getByText(/Only the ones used in the last 12 months/)).toBeVisible() // an answer the agent proposed, said as not decided
    for (const name of ['Copy as Markdown', 'Download', 'Print or save as PDF']) await expect(doc.getByRole('button', { name })).toBeVisible()
    await userEvent.click(doc.getByRole('button', { name: 'Close' }))
    await expect(canvasElement.querySelector('[data-component="ContextOpenQuestions"]')).toBeNull()
  },
}
/** With nothing unanswered there is no document to make, and no button for it. */
export const NoOpenQuestions: Story = {
  beforeEach: withEngine({ context: { issues: { ...taskContext, notes: taskContext.notes.filter((n) => n.status === 'settled') } } }),
  play: async ({ canvasElement }) => { const c = within(canvasElement); await c.findByRole('button', { name: 'Add a decision' }); await expect(c.queryByRole('button', { name: 'Open questions doc' })).toBeNull() },
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

// Made up: a task under SHOP-323 in a project whose Context holds three tickets.
const underATicket = { ...taskContext,
  docs: [...taskContext.docs, { ...taskContext.docs.find((d) => d.ticket)!, id: 'cdoc_under', title: 'Protected people (sample)', fromProject: true, under: true, inFull: true, ticket: { originating: false, origin: { ...taskContext.docs.find((d) => d.ticket)!.ticket!.origin, id: 'orig_sample323', ref: 'SHOP-323', title: 'Protected people (sample)' } } }],
  otherTickets: [
    { id: 'orig_sample331', ref: 'SHOP-331', sourceName: 'Linear', title: 'Executive authorization (sample)', url: 'https://linear.app/sample-shop/issue/SHOP-331' },
    { id: 'orig_sample332', ref: 'SHOP-332', sourceName: 'Linear', title: 'Deepfake checks on suspect media (sample)', url: null },
  ] }
/**
 * A task in a project with several tickets: it gets the docs about the whole project and its own ticket, which its
 * agents read whole. The project's other tickets are folded away by title: other tasks' work, not given to this task's agents.
 */
export const ItsOwnTicketNotEveryTicket: Story = {
  beforeEach: withEngine({ context: { issues: underATicket } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/From Linear, SHOP-323 · this task is under it/)).toBeInTheDocument()
    const others = canvasElement.querySelector('[data-component="ContextOtherTickets"]') as HTMLDetailsElement
    await expect(others.open).toBe(false) // collapsed
    await expect(within(others).getByText('The project\'s other tickets')).toBeVisible()
    await userEvent.click(within(others).getByText('The project\'s other tickets'))
    await expect(within(others).getByText('Executive authorization (sample)')).toBeVisible()
    await expect(within(others).getByText('Deepfake checks on suspect media (sample)')).toBeVisible()
  },
}
/** One of the others is pulled in: it joins this task's own docs, the same ticket and not a copy, and leaves the list. */
export const PullInAnotherTicket: Story = {
  beforeEach: withEngine({ context: { issues: underATicket } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByText('The project\'s other tickets'))
    await userEvent.click(c.getByRole('button', { name: 'Pull in SHOP-331' }))
    await expect(await c.findByText(/From Linear, SHOP-331/)).toBeInTheDocument()
    await waitFor(() => expect(c.queryByRole('button', { name: 'Pull in SHOP-331' })).toBeNull())
    await expect(c.getByRole('button', { name: 'Pull in SHOP-332' })).toBeInTheDocument()
  },
}
