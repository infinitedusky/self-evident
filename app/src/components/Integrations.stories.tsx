import type { Meta, StoryObj } from '@storybook/react-vite'
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
