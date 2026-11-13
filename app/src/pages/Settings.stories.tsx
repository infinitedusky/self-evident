import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Settings } from './Settings'
import { engineDown, withEngine } from '../stories/mock-engine'
import { appSettings, apps, factorySettings, otherApp, repoNote, sampleApp, storybookCheck } from '../stories/sample'
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
/** Your skills, a section of its own in All apps: skills kept in a folder outside every repo. One made-up skill there, and the form that writes another. */
const shared: PluginInfo = { ...builtIn, id: 'shared', name: 'shared', description: 'Your own skills, for every app. One folder per skill under skills/.', skillsDir: '/Users/sample/.self-evident/shared/skills',
  skills: [{ key: 'shared/decision-record', name: 'decision-record', description: 'How this team writes a decision record: where it goes, its sections (sample).', category: null, on: true }] }
export const AllAppsSharedSkills: Story = {
  parameters: allAt('yours'), beforeEach: withEngine({ settings: { ...factorySettings, plugins: [shared, ...factorySettings.plugins] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('written here')).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'Write a skill' }))
    await expect(c.getByRole('button', { name: 'Write the skill' })).toBeDisabled()
    await userEvent.type(c.getByLabelText('Skill name'), 'shop-voice')
    await userEvent.type(c.getByLabelText('When to use it'), 'Use when writing words a shopper reads (sample).')
    await userEvent.type(c.getByLabelText('What it says'), 'Short sentences. No exclamation marks.')
    await userEvent.click(c.getByRole('button', { name: 'Write the skill' }))
    await expect(await c.findByText('/Users/sample/.self-evident/shared/skills/shop-voice/SKILL.md')).toBeVisible()
  },
}
/** Skills pulled from a repository: one source already there (made up); Update says what changed, and a new repository is pulled. */
export const AllAppsSkillsFromARepo: Story = {
  parameters: allAt('yours'),
  beforeEach: withEngine({ settings: { ...factorySettings, plugins: [shared, ...factorySettings.plugins] }, skillSources: [{ url: 'git@example.com:sample/team-skills.git', commit: '0a1b2c3d4e5f6071', pulledAt: '2026-11-12T09:00:00.000Z', skills: ['decision-record', 'review-notes'] }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('pulled from git@example.com:sample/team-skills.git')).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'Update git@example.com:sample/team-skills.git' }))
    await expect(await c.findByText(/Updated decision-record\./)).toBeVisible()
    await userEvent.type(c.getByLabelText('Repository'), '/Users/sample/code/shop-skills')
    await userEvent.click(c.getByRole('button', { name: 'Pull skills' }))
    await expect(await c.findByText(/Added shop-design, shop-voice\./)).toBeVisible()
    await expect(c.getByRole('button', { name: 'Update /Users/sample/code/shop-skills' })).toBeVisible()
  },
}
/** Plugins no longer lists your own skills: they have their own section. */
export const AllAppsPluginsWithoutYours: Story = {
  parameters: all, beforeEach: withEngine({ settings: { ...factorySettings, plugins: [shared, ...factorySettings.plugins] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('sample-plugin')).toBeVisible()
    await expect(c.queryByRole('button', { name: 'Write a skill' })).toBeNull()
  },
}
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
/** Skills: at the top, a skill for a step of the workflow. The mockup step uses the shop's design skill; the ADR names one the repo no longer has (made up). */
export const AppStepSkills: Story = {
  parameters: appPage(sampleApp.id, 'skills'),
  beforeEach: withEngine({ apps: apps.map((a) => (a.id === sampleApp.id ? { ...a, setup: { ...a.setup, step_skills: { mockup: ['shop-design'], adr: ['decision-record'] } } } : a)) }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('button', { name: 'Remove shop-design from Mockups' })).toBeVisible()
    await expect(c.getByText(/decision-record · missing/)).toBeVisible()
    await userEvent.selectOptions(c.getByLabelText('Add a skill to Sketches'), 'shop-design')
    await expect(c.getByRole('button', { name: 'Remove shop-design from Sketches' })).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'Remove shop-design from Mockups' }))
    await expect(c.queryByRole('button', { name: 'Remove shop-design from Mockups' })).toBeNull()
  },
}
/** An app whose conversations get no skills at all: the steps are listed, and it says why there is nothing to choose. */
export const AppStepSkillsNone: Story = {
  parameters: appPage(sampleApp.id, 'skills'),
  beforeEach: withEngine({ appSettings: { ...appSettings, usable: [] } }),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText(/This app's conversations get no skills/)).toBeVisible() },
}
/** Skills by job, a section of its own: every job, grouped. One with skills filed follows All apps until this app picks another filed there, or none; one with none says so (made-up skills). */
export const AppSkillsByJob: Story = {
  parameters: appPage(sampleApp.id, 'skills'),
  beforeEach: withEngine({ apps: apps.map((a) => (a.id === sampleApp.id ? { ...a, setup: { ...a.setup, skills_by_job: { review: null } } } : a)) }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const testing = await c.findByLabelText('Skill for Testing')
    await expect(testing).toHaveValue('')
    await expect(within(testing).getByRole('option', { name: 'As All apps (write-tests)' })).toBeInTheDocument()
    await expect(c.getByLabelText('Skill for Review')).toHaveValue('-')
    await userEvent.selectOptions(testing, 'other-plugin/test-first')
    await expect(c.getAllByText('override').length).toBe(2)
      await expect(c.getByText('No skill filed.')).toBeVisible()
  },
}
/** No skill filed under any job yet, as on a new install: the jobs are still listed, and it says how to get something to choose. */
export const AppSkillsByJobNoneFiled: Story = {
  parameters: appPage(sampleApp.id, 'skills'),
  beforeEach: withEngine({ appSettings: { ...appSettings, jobs: (appSettings.jobs ?? []).map((j) => ({ ...j, skills: [], factory: null })) } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Nothing to choose yet')).toBeVisible()
    await expect(c.getAllByText('No skill filed.').length).toBe(3)
  },
}
/** Agents: the Claude account this app's agents run on. Nothing chosen: the engine's default, and who that is (made up). */
export const AppAccountDefault: Story = {
  parameters: appPage(sampleApp.id, 'agents'),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/The engine's default, the Claude Code login on this machine/)).toBeVisible()
    await userEvent.selectOptions(c.getByLabelText('Claude account'), 'key')
    await userEvent.type(c.getByLabelText('Key variable'), 'WORK_ANTHROPIC_KEY')
    await expect(c.getByText('Save to check this account.')).toBeVisible()
  },
}
/** The app's own login, in a folder of its own, and who is logged in there (made up). */
export const AppAccountLogin: Story = {
  parameters: appPage(sampleApp.id, 'agents'),
  beforeEach: withEngine({
    apps: apps.map((a) => (a.id === sampleApp.id ? { ...a, setup: { ...a.setup, account: { config_dir: '~/.claude-work' } } } : a)),
    account: { kind: 'login', ok: true, note: 'The Claude login in /Users/sample/.claude-work: owner@work.example · Sample Works · team.' },
  }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/owner@work.example/)).toBeVisible()
    await expect(c.getByLabelText('Login folder')).toHaveValue('~/.claude-work')
  },
}
/** The app's own key, named but not set where the engine runs: said plainly, and its agents won't start on the default instead. */
export const AppAccountKeyMissing: Story = {
  parameters: appPage(sampleApp.id, 'agents'),
  beforeEach: withEngine({
    apps: apps.map((a) => (a.id === sampleApp.id ? { ...a, setup: { ...a.setup, account: { key_env: 'WORK_ANTHROPIC_KEY' } } } : a)),
    account: { kind: 'key', ok: false, note: "This app's agents run on the API key in WORK_ANTHROPIC_KEY, and WORK_ANTHROPIC_KEY isn't set in the engine's environment. Export it where the engine starts and restart the engine, or change the account under Settings › Agents." },
  }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Not usable')).toBeVisible()
    await expect(c.getByText(/never fall back to the default/)).toBeVisible()
  },
}
/** An app with nothing set: no repo, no skills, every value inherited. */
/** Made-up apps: a frontend that reads its backend. One reference on, with its note; another app offered; one with no checkout on this computer. */
const apiApp = { ...otherApp, id: 'app_sample_api', name: 'Sample Shop API', key: 'SA', repos: [{ id: 'repo_sample_api', appId: 'app_sample_api', fullName: 'example/sample-shop-api', localPath: '/code/sample-shop-api', baseBranch: 'main' }] }
export const AppReferences: Story = {
  parameters: appPage(sampleApp.id, 'repo'),
  beforeEach: withEngine({ apps: [apiApp, otherApp, { ...sampleApp, setup: { ...sampleApp.setup, references: [{ appId: apiApp.id, note: 'the backend this app calls' }, { appId: otherApp.id }] } }] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByLabelText('What Sample Shop API is to Sample Shop')).toHaveValue('the backend this app calls')
    await expect(c.getByText('no checkout set: nothing to read yet')).toBeVisible() // Sample Blog has no checkout on this computer
    await userEvent.click(c.getByLabelText('Sample Blog')) // unticked: its note and its warning go
    await expect(c.queryByLabelText('What Sample Blog is to Sample Shop')).toBeNull()
    await userEvent.click(c.getByLabelText('Sample Blog'))
    await expect(c.getByLabelText('What Sample Blog is to Sample Shop')).toHaveValue('')
  },
}
/** Made up: an app of two repositories, the frontend as home and its backend cut from develop. */
const shopApi = { id: 'repo_sample_api', appId: sampleApp.id, fullName: 'example/sample-shop-api', localPath: '/code/sample-shop-api', baseBranch: 'develop' }
const twoRepos = { ...sampleApp, repos: [...sampleApp.repos!, shopApi], setup: { ...sampleApp.setup, home_repo: sampleApp.repos![0].id } }
export const AppRepos: Story = {
  parameters: appPage(sampleApp.id, 'repo'),
  beforeEach: withEngine({ apps: [otherApp, twoRepos] }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('example/sample-shop-api')).toBeVisible()
    await expect(c.getByText('from develop')).toBeVisible()
    await expect(c.getByLabelText('Home: example/sample-shop')).toBeChecked()
    await userEvent.click(c.getByLabelText('Home: example/sample-shop-api')) // the backend becomes home: something to save
    await expect(c.getByLabelText('Home: example/sample-shop')).not.toBeChecked()
    await userEvent.click(c.getByRole('button', { name: 'Remove example/sample-shop' }))
    await expect(c.queryByText('/code/sample-shop')).toBeNull()
    await expect(c.queryByLabelText('Home: example/sample-shop-api')).toBeNull() // one repository left: nothing to choose
  },
}
/** A folder chosen: the repositories in it, the app's own already ticked; ticking one adds it with its remote's name, and its branch when it isn't the app's. */
export const AppReposFolderChosen: Story = {
  parameters: appPage(sampleApp.id, 'repo'),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Choose folder…' }))
    await expect(await c.findByText('Repositories in')).toBeVisible()
    await expect(c.getByLabelText('sample-shop')).toBeChecked()
    await expect(c.getByText('no GitHub remote')).toBeVisible() // old-site
    await userEvent.click(c.getByLabelText('sample-shop-api'))
    await expect(c.getByLabelText('Home: example/sample-shop-api')).not.toBeChecked()
    await expect(c.getByText('from develop')).toBeVisible()
    await userEvent.click(c.getByLabelText('sample-shop-api')) // unticked: it goes again
    await expect(c.queryByLabelText('Home: example/sample-shop-api')).toBeNull()
  },
}
/** A folder with no repository in it, and the dialog closed without a pick (nothing changes). */
export const AppReposEmptyFolder: Story = {
  parameters: appPage(sampleApp.id, 'repo'), beforeEach: withEngine({ folder: { path: '/code/notes', repos: [] } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(await c.findByRole('button', { name: 'Choose folder…' }))
    await expect(await c.findByText(/No git repository in/)).toBeVisible()
  },
}
/** No repository yet: the folder chooser is the way in. */
export const AppReposNone: Story = { parameters: appPage('app_sample2', 'repo') }
/** The only app: nothing to refer to yet, and the way on is to add the other repo as an app. */
export const AppReferencesNoOthers: Story = { parameters: appPage(sampleApp.id, 'repo'), beforeEach: withEngine({ apps: [sampleApp] }) }
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
// Storybook as an integration, per app (Sandy, 2026-11-09): its command and URL, the check reading the repo for the screen-map standard, the actions as buttons.
export const AppStorybook: Story = { parameters: { route: { path: '/settings/apps/:id/:section/:item', url: `/settings/apps/${sampleApp.id}/integrations/storybook` } }, beforeEach: withEngine({ check: storybookCheck }) }
export const AppStorybookNoMap: Story = { parameters: { route: { path: '/settings/apps/:id/:section/:item', url: `/settings/apps/${sampleApp.id}/integrations/storybook` } }, beforeEach: withEngine({ check: { ok: false, detail: "Storybook is there (web), the screen map isn't: @zigbang/storybook-addon-story-flow isn't installed. Set up Storybook (the button below) does it." } }) }
export const AppStorybookNotSet: Story = { parameters: { route: { path: '/settings/apps/:id/:section/:item', url: `/settings/apps/${sampleApp.id}/integrations/storybook` } }, beforeEach: withEngine({ appSettings: { ...appSettings, integrations: { ...appSettings.integrations, storybook: { on: { value: null, from: null }, cmd: { value: null, from: null }, url: { value: null, from: null } } }, status: { ...appSettings.status, storybook: { state: 'off', missing: [], keyVar: null } } } }) }
export const AllAppsStorybook: Story = { parameters: { route: { path: '/settings/:section/:item', url: '/settings/integrations/storybook' } } }
/** An app's prototype settings: how its server starts and where its throwaway databases go. */
export const AppPrototype: Story = {
  parameters: appPage(sampleApp.id, 'prototype'),
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByLabelText(/Stop command/)).toBeInTheDocument(); await expect(within(canvasElement).getByLabelText(/Discard command/)).toBeInTheDocument() }, // for what the start command leaves running, and what is removed when a prototype is thrown away
}
/** An app's workflow rules: configuration, not something that runs. */
export const AppWorkflowRules: Story = { parameters: appPage(sampleApp.id, 'workflows') }
