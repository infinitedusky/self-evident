import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { CompareWith, comparedSays } from './CompareMain'
import { useCompare } from '../main-running'
import { MAIN_OFF, withEngine } from '../stories/mock-engine'

/** The control alone, with what it is comparing with said beside it. Made-up app and task (sample). */
function Sample({ forId }: { forId: string }) {
  const c = useCompare('app_sample', forId)
  return <div className="smoke-bar"><CompareWith c={c} beside="smoke:iss_sample20:main" /><span>{c.which ? `comparing: ${comparedSays(c)}` : 'not comparing'}</span></div>
}
const meta = { title: 'Components/CompareMain', component: Sample, args: { forId: 'iss_sample20' }, parameters: { layout: 'padded' }, beforeEach: withEngine({ main: { ...MAIN_OFF, database: 'proto_main_sample' } }) } satisfies Meta<typeof Sample>
export default meta
type Story = StoryObj<typeof meta>

/** Three things to compare with: the app's main, or a new main for this task on a copy of the data or on the same database. */
export const ThreeChoices: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.selectOptions(await c.findByRole('combobox', { name: 'Compare with main' }), 'shared')
    await expect(await c.findByText('comparing: on the same database')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Stop comparing' }))
    await expect(await c.findByText('not comparing')).toBeInTheDocument()
  },
}

/** An app with no database of its own: the app's main, or a new one for this task; there is no data to choose. */
export const NoDatabase: Story = {
  beforeEach: withEngine({ main: MAIN_OFF }),
  play: async ({ canvasElement }) => {
    const pick = await within(canvasElement).findByRole('combobox', { name: 'Compare with main' })
    await expect(within(pick).getAllByRole('option').map((o) => o.textContent)).toEqual(['Compare with main…', "The app's main (standard data)", 'A new main for this task'])
  },
}

/** It stopped by itself (made up): said, with its last lines. */
export const StoppedByItself: Story = {
  beforeEach: withEngine({ main: { ...MAIN_OFF, database: 'proto_main_sample' }, mainDies: ['the port was taken (sample)', 'exited with 1'] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.selectOptions(await c.findByRole('combobox', { name: 'Compare with main' }), 'copy')
    await expect(await c.findByRole('alert')).toHaveTextContent('Main stopped by itself (exit 1). Its last lines:the port was taken (sample)')
  },
}
