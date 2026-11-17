import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Integrations } from './Integrations'
import { withEngine } from '../stories/mock-engine'
import { appSettings, factorySettings } from '../stories/sample'
import type { EffectiveValues } from '../engine'

// Settings → Integrations, from made-up values: a list, then a page per integration, read first and edited on asking.
const workspaceValues: EffectiveValues = Object.fromEntries(factorySettings.integrations.map((i) => [i.key,
  Object.fromEntries(i.fields.map((f) => { const v = factorySettings.values[i.key]?.[f.key]; return [f.key, { value: v ?? null, from: v ? 'workspace' : null }] }))]))
const meta = { title: 'Components/Integrations', component: Integrations,
  args: { base: '/settings/integrations', integrations: factorySettings.integrations, values: workspaceValues, status: factorySettings.status, scope: 'workspace', onSave: async () => {} },
  render: (a) => <div style={{ maxWidth: 760 }}><Integrations {...a} /></div> } satisfies Meta<typeof Integrations>
export default meta
type Story = StoryObj<typeof meta>
const click = (label: string) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  for (let i = 0; i < 20; i++) {
    const b = [...canvasElement.querySelectorAll('button')].find((x) => x.textContent === label)
    if (b) { b.click(); return }
    await new Promise((r) => setTimeout(r, 50))
  }
}

/** Every integration, with where it stands: PostHog set, Linear connected, Confluence missing its key. */
export const List: Story = {}
/** Linear's page: its values, where its key lives, a check, and what a workflow step can do with it. */
export const Linear: Story = { args: { item: 'linear' } }
/** Checked: signed in and the team found. */
export const LinearChecked: Story = { args: { item: 'linear' }, play: click('Check the connection') }
/** Checked, and refused. */
export const LinearCheckFailed: Story = { args: { item: 'linear' }, beforeEach: withEngine({ check: { ok: false, detail: 'Signed in as Sample Owner, but there is no team with key SHOP.' } }), play: click('Check the connection') }
/** Confluence set, but its key's variable isn't in the engine's environment. */
export const ConfluenceNoKey: Story = { args: { item: 'confluence' } }
/** PostHog: read by each app, so nothing for the engine to check, and no actions. */
export const PostHog: Story = { args: { item: 'posthog' } }
/** Editing, once asked: the fields, and the variable's name, never the key. */
export const Editing: Story = { args: { item: 'confluence' }, play: click('Edit') }
/** An app's page: its own values override All apps'; the rest are inherited and say so. */
export const AppLinear: Story = { args: { item: 'linear', scope: 'app', appId: 'app_sample', base: '/settings/apps/app_sample/integrations', values: appSettings.integrations, status: appSettings.status } }
/** An app overriding, once asked: an empty field shows the inherited value and keeps it. */
export const AppEditing: Story = { args: { ...AppLinear.args, item: 'linear' }, play: click('Edit') }
/** An integration this version doesn't know. */
export const Unknown: Story = { args: { item: 'jira' } }

// Made up: Linear's key for the sample app, kept in the app's own file on this computer.
const appLinear = { item: 'linear', scope: 'app' as const, appId: 'app_sample', base: '/settings/apps/app_sample/integrations', values: appSettings.integrations, status: { ...appSettings.status, linear: { state: 'ready' as const, missing: [], keyVar: 'LINEAR_API_KEY' } } }
/** The key is kept for this app on this computer: said, with its last four characters, and never shown again. */
export const KeyKept: Story = {
  args: { ...appLinear, keys: { linear: { name: 'LINEAR_API_KEY', set: true, from: 'app', last4: 'abcd' } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText(/Set, and kept for this app on this computer/)).toHaveTextContent('ending abcd')
    await expect(c.getByRole('button', { name: 'Replace' })).toBeInTheDocument(); await expect(c.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  },
}
/** Only in the terminal the engine was started from: it works now, and is gone the next time. Keep it here to make it stay. */
export const KeyOnlyInTheEnvironment: Story = {
  args: { ...appLinear, keys: { linear: { name: 'LINEAR_API_KEY', set: true, from: 'environment', last4: '2222' } } },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByText(/only in the terminal the engine was started from/)).toBeInTheDocument() },
}
/** No key anywhere: paste it once and it is kept. */
export const KeepAKey: Story = {
  args: { ...appLinear, status: { ...appSettings.status, linear: { state: 'no-key', missing: [], keyVar: 'LINEAR_API_KEY' } }, keys: { linear: { name: 'LINEAR_API_KEY', set: false, from: null, last4: null } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.type(c.getByLabelText('The key for LINEAR_API_KEY'), 'lin_api_sample_key_wxyz')
    await userEvent.click(c.getByRole('button', { name: 'Keep it' }))
    await expect(await c.findByText(/Set, and kept for this app on this computer/)).toHaveTextContent('ending wxyz')
    await expect(c.queryByDisplayValue('lin_api_sample_key_wxyz')).not.toBeInTheDocument() // the box is emptied: it is not shown again
  },
}
/** Taking a kept key away. */
export const RemoveAKey: Story = {
  args: { ...appLinear, keys: { linear: { name: 'LINEAR_API_KEY', set: true, from: 'app', last4: 'abcd' } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Remove' }))
    await expect(await c.findByText(/Not set/)).toBeInTheDocument()
  },
}
