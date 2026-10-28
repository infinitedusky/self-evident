import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from '../components/Shell'
import { Mockups } from './Mockups'
import { engineDown, sampleData, withEngine } from '../stories/mock-engine'

// The app's Storybook inside Self Evident, in each state the engine reports for it.
const meta = { title: 'Pages/Mockups', component: Mockups, parameters: { layout: 'fullscreen' }, render: () => <Shell><Mockups /></Shell> } satisfies Meta<typeof Mockups>
export default meta
type Story = StoryObj<typeof meta>
const sb = sampleData.storybook

/** Configured but not running: Start Storybook. */
export const NotRunning: Story = {}
/** Starting: the engine launched it and shows its log. */
export const Starting: Story = { beforeEach: withEngine({ storybook: { ...sb, startedHere: true, log: ['> storybook dev -p 6007 --no-open', 'Starting… (sample log)'] } }) }
/** Running: framed in the page. The sample URL points nowhere, so the frame is blank here. */
export const Running: Story = { beforeEach: withEngine({ storybook: { ...sb, up: true, startedHere: true } }) }
/** A URL but no command to start it. */
export const NotStartable: Story = { beforeEach: withEngine({ storybook: { ...sb, startable: false } }) }
/** The app has no Storybook set. */
export const NotConfigured: Story = { beforeEach: withEngine({ storybook: { url: null, configured: false, startable: false, up: false, startedHere: false, log: [] } }) }
/** No app added yet. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }
