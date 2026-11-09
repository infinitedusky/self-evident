import type { Meta, StoryObj } from '@storybook/react-vite'
import { Settings } from './Settings'
import { engineDown, withEngine } from '../stories/mock-engine'
import { appSettings, apps, factorySettings, repoNote, sampleApp } from '../stories/sample'
import type { PluginInfo } from '../engine'

// Settings: which settings across the top (All apps, each app), that scope's sections down the side.
const meta = { title: 'Pages/Settings', component: Settings, parameters: { layout: 'fullscreen' }, render: () => <div className="tab-page"><Settings /></div> } satisfies Meta<typeof Settings>
export default meta
type Story = StoryObj<typeof meta>
const all = { route: { path: '/settings', url: '/settings' } }
const allAt = (section: string) => ({ route: { path: '/settings/:section', url: `/settings/${section}` } })
const appPage = (id = sampleApp.id, section?: string) => (section
  ? { route: { path: '/settings/apps/:id/:section', url: `/settings/apps/${id}/${section}` } }
  : { route: { path: '/settings/apps/:id', url: `/settings/apps/${id}` } })

const toolsPlugin: PluginInfo = {
  id: 'sample-tools@sample', name: 'sample-tools', version: '0.3.1', description: 'A made-up plugin with an MCP server and rated tools.', source: 'example/sample-marketplace', builtIn: false,
  on: true, roles: ['talk'], mcpServers: ['sample-tools'], note: 'Sample: its server is started by the engine until the package ships it.', skills: [],
  tools: { count: 24, ratings: { free: 14, moderate: 8, expensive: 2 } },
}
const builtIn: PluginInfo = { ...factorySettings.plugins[0], id: 'self-evident@builtin', name: 'self-evident', builtIn: true, source: null, description: 'The engine’s own skills (sample).', skills: [] }

export const AllApps: Story = { parameters: all }
/** A plugin with rated tools, one switched off, and a built-in with no skills yet. */
export const AllAppsWithPlugins: Story = { parameters: all, beforeEach: withEngine({ settings: { ...factorySettings, plugins: [builtIn, ...factorySettings.plugins, toolsPlugin, { ...toolsPlugin, id: 'sample-off@sample', name: 'sample-off', on: false, tools: null, mcpServers: [] }] } }) }
/** No workspace yet: integrations wait for the first app. */
export const NoWorkspace: Story = { parameters: all, beforeEach: withEngine({ apps: [], settings: { ...factorySettings, workspace: null, plugins: [] } }) }
export const SettingsToday: Story = { parameters: appPage() }
/** An app whose repo has its own skills, a plugin overridden for it, and integration values from both levels. */
export const AppWithRepoSkills: Story = {
  parameters: appPage(),
  beforeEach: withEngine({
    apps: apps.map((a) => (a.id === sampleApp.id ? { ...a, setup: { ...a.setup, plugins: { 'sample-plugin@sample': { on: false } } } } : a)),
    appSettings: { ...appSettings, skills: [...appSettings.skills, { key: 'release-notes', name: 'release-notes', description: 'Writes the release note in the shop’s voice (sample).' }] },
  }),
}
/** An app with nothing set: no repo, no skills, every value inherited. */
export const AppBare: Story = { parameters: appPage('app_sample2'), beforeEach: withEngine({ appSettings: { integrations: {}, status: {}, plugins: [], skills: [] } }) }
export const NoSuchApp: Story = { parameters: appPage('app_missing') }
// New app, with its code: a GitHub repo picked from gh's list or typed, a folder on this machine, or both (Sandy, 2026-11-09).
export const NewApp: Story = { parameters: { route: { path: '/settings/new', url: '/settings/new' } } }
export const NewAppNoGh: Story = { parameters: { route: { path: '/settings/new', url: '/settings/new' } }, beforeEach: withEngine({ githubRepos: { repos: [], problem: 'To get started with GitHub CLI, please run:  gh auth login; type owner/name.' } }) }
// Straight after New app made the folder a repository: the Repo page says what the engine did.
export const AppRepoSetUp: Story = { parameters: { route: { path: '/settings/apps/:id', url: '/settings/apps/app_sample2', state: { note: repoNote } } } }
export const Loading: Story = { parameters: all, beforeEach: withEngine({}, { latency: 'infinite' }) }
export const EngineDown: Story = { parameters: all, beforeEach: withEngine(engineDown) }
/** All apps: every integration and where it stands. */
export const AllAppsIntegrations: Story = { parameters: allAt('integrations') }
/** One integration's page under All apps. */
export const AllAppsLinear: Story = { parameters: { route: { path: '/settings/:section/:item', url: '/settings/integrations/linear' } } }
/** An app's integrations: its overrides and what it inherits. */
export const AppIntegrations: Story = { parameters: appPage(sampleApp.id, 'integrations') }
/** One integration's page for an app. */
export const AppLinear: Story = { parameters: { route: { path: '/settings/apps/:id/:section/:item', url: `/settings/apps/${sampleApp.id}/integrations/linear` } } }
/** tkt for an app, on and working: the check ran by itself, and the tracker guide to copy into the repo. */
export const AppTkt: Story = { parameters: { route: { path: '/settings/apps/:id/:section/:item', url: `/settings/apps/${sampleApp.id}/integrations/tkt` } }, beforeEach: withEngine({ check: { ok: true, detail: 'tkt v0.21.0; doctor passes in /code/sample-shop; the tracker guide points at SS here.' } }) }
/** tkt on but broken: tkt doctor's own line, then "get tkt working"; Self Evident does nothing else about it. */
export const AppTktBroken: Story = { parameters: { route: { path: '/settings/apps/:id/:section/:item', url: `/settings/apps/${sampleApp.id}/integrations/tkt` } }, beforeEach: withEngine({ check: { ok: false, detail: 'tkt doctor: fail  herdr  herdr is not installed. Get tkt working: https://gitlab.com/rogs/tkt' } }) }
/** tkt off for an app: its tasks go to Self Evident's own planner; nothing is checked. */
export const AppTktOff: Story = { parameters: { route: { path: '/settings/apps/:id/:section/:item', url: `/settings/apps/${sampleApp.id}/integrations/tkt` } }, beforeEach: withEngine({ appSettings: { ...appSettings, integrations: { ...appSettings.integrations, tkt: { on: { value: null, from: null } } }, status: { ...appSettings.status, tkt: { state: 'off', missing: [], keyVar: null } } } }) }
/** tkt under All apps: switched on per app, so this page only says what it does. */
export const AllAppsTkt: Story = { parameters: { route: { path: '/settings/:section/:item', url: '/settings/integrations/tkt' } } }
/** An app's prototype settings: how its server starts and where its throwaway databases go. */
export const AppPrototype: Story = { parameters: appPage(sampleApp.id, 'prototype') }
/** An app's workflow rules: configuration, not something that runs. */
export const AppWorkflowRules: Story = { parameters: appPage(sampleApp.id, 'workflows') }
