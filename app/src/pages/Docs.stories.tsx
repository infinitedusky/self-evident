import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Docs } from './Docs'
import { withEngine } from '../stories/mock-engine'
import { docsAgentSample, docsSiteSample } from '../stories/sample'

// Docs: the app's docs site (VitePress, in its workbench folder) framed inside Evident. Everything here is made up;
// the frame is an empty page, since no docs site runs beside Storybook.
const meta = { title: 'Pages/Docs', component: Docs, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><Docs /></div> } satisfies Meta<typeof Docs>
export default meta
type Story = StoryObj<typeof meta>

const off = { ...docsSiteSample, up: false, frame: 'http://localhost:6912' }

/** Running: the site fills the page, with a way to open it on its own. */
export const Running: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByTitle(/docs$/)).toBeInTheDocument()
    await expect(c.getByRole('link', { name: /Open the docs on their own/ })).toHaveAttribute('href', 'http://localhost:6912')
    await expect(c.getByText('/Users/sample/code/shop-workbench/docs')).toBeInTheDocument() // where the files are
  },
}
/** The docs agent has written: the page says how much is in each section and what it last did, without being opened. */
export const AgentHasWritten: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/4 pages in How the system works, 7 in Our work/)).toBeInTheDocument()
    await expect(c.getByText(/SHOP-12 was closed/)).toBeInTheDocument()
    await expect(c.getByText(/3 pages, committed as/)).toBeInTheDocument()
    await expect(c.getByText('a1b2c3d')).toBeInTheDocument()
    await expect(c.queryByLabelText('The docs agent')).toBeNull() // closed until asked for: the docs have the page
  },
}
/** Opened: its conversation is beside the docs, to ask it for a page or a correction. */
export const AgentOpen: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: /Docs agent/ }))
    const panel = await c.findByLabelText('The docs agent')
    await expect(within(panel).getByText(/It alone writes these docs/)).toBeInTheDocument()
    await expect(c.getByTitle(/docs$/)).toBeInTheDocument() // the docs stay beside it
  },
}
/** Never asked yet: opening it offers one box, and asking starts it. */
export const AgentNeverAsked: Story = {
  beforeEach: withEngine({ docsAgent: { ...docsAgentSample, sessionId: null, asked: null, wrote: null, pages: { system: 0, work: 0 } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/Nothing is written yet/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: /Docs agent/ }))
    const panel = await c.findByLabelText('The docs agent')
    await expect(within(panel).getByRole('button', { name: 'Ask' })).toBeDisabled()
    await userEvent.type(within(panel).getByRole('textbox', { name: 'What to ask the docs agent' }), 'Write down how sign-in works.')
    await userEvent.click(within(panel).getByRole('button', { name: 'Ask' }))
    await waitFor(() => expect(c.getByRole('button', { name: /Docs agent · writing/ })).toBeInTheDocument())
  },
}
/** It is writing now. */
export const AgentWriting: Story = {
  beforeEach: withEngine({ docsAgent: { ...docsAgentSample, busy: true, asked: { why: 'learned', label: 'The codebase was learned', at: '2026-11-25T09:00:00Z' } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('button', { name: /Docs agent · writing/ })).toBeInTheDocument()
    await expect(c.getByText(/The codebase was learned/)).toBeInTheDocument()
  },
}
/** Its last pages did not pass their check: they are in the folder, not committed, and the page says what was wrong. */
export const AgentPagesRefused: Story = {
  beforeEach: withEngine({ docsAgent: { ...docsAgentSample, wrote: { files: [], commit: null, problems: ['docs/work/SHOP-12-sessions-last-a-day.md, under "What it changed in the system", links to no page of How the system works (sample)'], at: '2026-11-24T16:09:00Z' } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/did not pass their check and are not committed/)).toBeInTheDocument()
    await expect(c.getByText(/links to no page of How the system works/)).toBeInTheDocument()
  },
}
/** Not running: one press starts it, and the page says it is starting. */
export const NotRunning: Story = {
  beforeEach: withEngine({ docsSite: off }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Start the docs' }))
    await waitFor(() => expect(c.getByText(/Starting it/)).toBeInTheDocument())
    await expect(c.queryByRole('button', { name: 'Start the docs' })).toBeNull()
    await expect(c.queryByTitle(/docs$/)).toBeNull() // nothing framed until it answers
  },
}
/** It was started and has not answered yet: its last lines show. */
export const Starting: Story = {
  beforeEach: withEngine({ docsSite: { ...off, startedHere: true, log: ['> vitepress dev docs --port 6912', 'vitepress v1.6.4 (sample)'] } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/vitepress v1\.6\.4/)).toBeInTheDocument() },
}
/** The folder's dependencies are not installed: the page says what to run, and offers no press that would fail. */
export const NotInstalled: Story = {
  beforeEach: withEngine({ docsSite: { ...off, problem: 'VitePress is not installed in /Users/sample/code/shop-workbench: run `pnpm install` there, then start it here.' } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/VitePress is not installed/)).toBeInTheDocument()
    await expect(c.queryByRole('button', { name: 'Start the docs' })).toBeNull()
  },
}
/** Starting it failed: the engine's reason shows. */
export const StartRefused: Story = {
  beforeEach: withEngine({ docsSite: off, docsSiteError: 'the port is taken (sample)' }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Start the docs' }))
    await expect(await c.findByText(/the port is taken/)).toBeInTheDocument()
  },
}
/** The app has no workbench folder: where to name one. */
export const NoWorkbenchFolder: Story = {
  beforeEach: withEngine({ docsSite: { ...off, dir: null, found: false, has: false, url: null, frame: null } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByRole('link', { name: 'Settings › Workbench' })).toBeInTheDocument() },
}
/** The folder named is not on this computer. */
export const FolderGone: Story = {
  beforeEach: withEngine({ docsSite: { ...off, found: false, has: false, url: null, frame: null } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/There is no folder at/)).toBeInTheDocument() },
}
/** A workbench folder with no docs site in it yet. */
export const NoSiteYet: Story = {
  beforeEach: withEngine({ docsSite: { ...off, has: false, url: null, frame: null } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/There is no docs site in/)).toBeInTheDocument() },
}
/** No app added yet. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
