import type { Meta, StoryObj } from '@storybook/react-vite'
import { Screens } from './Screens'
import { expect, userEvent, within } from 'storybook/test'
import { engineDown, sampleData, withEngine } from '../stories/mock-engine'

// A task's screens on one wall, in each state the engine reports. The screens themselves are made-up pages, labelled.
const meta = { title: 'Pages/Screens', component: Screens, parameters: { layout: 'fullscreen' }, render: (a) => <div className="tab-page"><Screens {...a} /></div> } satisfies Meta<typeof Screens>
export default meta
type Story = StoryObj<typeof meta>
const sc = sampleData.screens

/** Every screen of the task and every state, side by side: go through them and say what is wrong. */
export const Wall: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('heading', { name: /Checkout/ })).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Open Checkout, Card declined' })).toBeInTheDocument()
    await expect(c.getByText('3 screens, 7 states')).toBeInTheDocument()
  },
}
/** One opened large, with the way to the next and back to the wall. */
export const OneOpen: Story = {
  args: { story: 'screens-checkout--empty' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByTitle('Checkout, Empty')).toBeInTheDocument()
    await expect(c.getByText('2 of 7')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Next →' }))
    await expect(await c.findByTitle('Checkout, Card declined')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: '← All screens' }))
    await expect(await c.findByRole('button', { name: 'Open Cart, Empty' })).toBeInTheDocument()
  },
}
/** From the wall to one screen by pressing it. */
export const OpenFromTheWall: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Open Receipt, Paid' }))
    await expect(await c.findByText('7 of 7')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Next →' })).toBeDisabled()
  },
}
/** At a phone's width: the same wall, each screen drawn narrow. */
export const AtPhoneWidth: Story = {
  play: async ({ canvasElement }) => { const c = within(canvasElement); await userEvent.click(await c.findByRole('button', { name: 'Phone' })); await expect(c.getByRole('button', { name: 'Phone' })).toHaveClass('on') },
}
/** Nothing drawn yet: what to do next. */
export const None: Story = { beforeEach: withEngine({ screens: { ...sc, screens: [] } }) }
/** A new task: the screens merged with earlier tasks are not its own, so they are counted, not shown. */
export const NewTask: Story = {
  beforeEach: withEngine({ screens: { ...sc, screens: [], earlier: 3, all: sc.screens } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/No screens for this task yet/)).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Show 3 from earlier tasks' }))
    await expect(await c.findByRole('button', { name: 'Open Cart, Empty' })).toBeInTheDocument()
  },
}
/** The app's Storybook is not running: it can be started here. */
export const StorybookStopped: Story = { beforeEach: withEngine({ screens: { ...sc, up: false, startedHere: false, screens: [] } }) }
/** The app has no Storybook: where to set one up. */
export const NoStorybook: Story = { beforeEach: withEngine({ screens: { ...sc, url: null, frame: null, configured: false, startable: false, up: false, screens: [] } }) }
/** Inside the task's Screens step: only the controls and the wall. */
export const Embedded: Story = { args: { embedded: true } }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
