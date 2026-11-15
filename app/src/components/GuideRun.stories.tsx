import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { GuideRun, GuideRuns } from './GuideRun'
import { withEngine } from '../stories/mock-engine'

// A prototype with no screen, tried by running the commands of its guide. All made up: a sample collector.
const command = 'python collector/test.py'
const passed = { step: 0, command, status: 'passed' as const, exitCode: 0, startedAt: '2026-11-15T10:00:00Z', endedAt: '2026-11-15T10:00:48Z',
  lines: ['no token: 401, wrong token: 401 (sample)', 'both write tokens accepted', 'attributes stripped at the resource, scope and log level', '20 lines held across a restart, each arriving once', 'OK'] }
const guide = { intro: 'A collector has no screens: it is tried by running it (sample).', steps: [
  { title: 'The collector, end to end', run: command, try: 'About a minute. It should end with OK.' },
  { title: 'The config is valid', run: 'collector validate --config=collector/config.yaml', try: 'It prints nothing and exits 0.' },
  { title: 'The settings page', path: '/settings/telemetry' },
] }

const meta = { title: 'Components/GuideRun', component: GuideRun, args: { command, onRun: fn(), onStop: fn() }, render: (a) => <div style={{ maxWidth: 720 }}><GuideRun {...a} /></div> } satisfies Meta<typeof GuideRun>
export default meta
type Story = StoryObj<typeof meta>

/** Not run yet: the command as written, and Run. */
export const NotRun: Story = { play: async ({ canvasElement, args }) => { await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Run' })); await expect(args.onRun).toHaveBeenCalled() } }
/** Running: what it has printed so far, and Stop. */
export const Running: Story = {
  args: { run: { ...passed, status: 'running', exitCode: null, endedAt: null, lines: passed.lines.slice(0, 2) } },
  play: async ({ canvasElement, args }) => { await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Stop' })); await expect(args.onStop).toHaveBeenCalled() },
}
/** Finished: everything it printed, and Run again. */
export const Finished: Story = { args: { run: passed }, play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByLabelText('What it printed')).toHaveTextContent('OK') } }
/** Failed: its exit code beside the word, and what it printed. */
export const Failed: Story = { args: { run: { ...passed, status: 'failed', exitCode: 1, lines: ['no token: 401', 'wrong token: 200 (sample)', 'AssertionError: a wrong token was accepted'] } }, play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText('Failed (exit 1)')).toBeInTheDocument() } }
/** In the small panel over a running prototype: the last lines only, with the rest a press away. */
export const CompactLongOutput: Story = {
  args: { compact: true, run: { ...passed, lines: Array.from({ length: 30 }, (_, i) => `line ${i + 1} of the sample output`) } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.queryByText(/line 1 of the sample output/)).toBeNull()
    await userEvent.click(await c.findByRole('button', { name: 'Show all 30 lines' }))
    await expect(await c.findByLabelText('What it printed')).toHaveTextContent('line 1 of the sample output')
  },
}
/** The whole guide as the prototype's page: each command with its button, the first one already run. A step that is a page says its server is needed. */
export const AGuideOfCommands: Story = {
  render: () => <div style={{ maxWidth: 760 }}><GuideRuns id="proto_sample1" guide={guide} /></div>,
  beforeEach: withEngine({ prototypeRuns: [passed] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Finished')).toBeInTheDocument()
    await expect(await c.findAllByRole('button', { name: 'Run' })).toHaveLength(1)
    await expect(await c.findByText(/start its server to open it/)).toBeInTheDocument()
  },
}
