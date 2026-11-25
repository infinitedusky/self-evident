import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Workbench } from './Workbench'
import { withEngine } from '../stories/mock-engine'
import { workbenchFailedSample, workbenchInstallingSample, workbenchLackingSample, workbenchNoneSample, workbenchSample } from '../stories/sample'

/** An app's workbench folder and its hooks, in the app's settings. Made-up folder, script and runs (sample). */
const meta = { title: 'Components/Workbench', component: Workbench, parameters: { layout: 'padded' }, args: { appId: 'app_sample' },
  beforeEach: withEngine({ workbench: workbenchSample }), render: (a) => <div style={{ maxWidth: 860 }}><Workbench {...a} /></div> } satisfies Meta<typeof Workbench>
export default meta
type Story = StoryObj<typeof meta>

/** A folder named, one point hooked: every point Evident has is listed, hooked or not, with what its script is given; the hooked one's script can be read, and its last run says what it gave the start script by name only. */
export const OneHooked: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('On this computer')).toBeInTheDocument()
    const hooks = within(c.getByRole('list', { name: 'Hooks' }))
    await expect(hooks.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['before-start', 'after-stop', 'task-closed'])
    const first = within(hooks.getByRole('listitem', { name: 'before-start' }))
    await expect(first.getByText('Hooked')).toBeInTheDocument()
    await expect(first.getByText('hooks/before-start.sh')).toBeInTheDocument()
    await expect(first.getByText('$FIXTURE')).toBeInTheDocument()
    await expect(first.getByLabelText('before-start last run')).toHaveTextContent(/for SS-20 \(smoke test\): it ran, and gave the start script DEMO_COMPANY_ID/)
    await userEvent.click(first.getByRole('button', { name: 'Read the script' }))
    await expect(first.getByLabelText('before-start script')).toHaveTextContent(/Sign the tester in as the one company/)
    const second = within(hooks.getByRole('listitem', { name: 'after-stop' }))
    await expect(second.getByText('Not hooked')).toBeInTheDocument()
    await expect(second.getByText('hooks/after-stop.sh')).toBeInTheDocument()
    await expect(c.getByText('tools/review')).toBeInTheDocument()
  },
}

/** No folder named yet: the points are still listed, so a person sees what could be hooked; a typed path that is not there is refused; the computer's folder dialog chooses and saves one. */
export const NoFolderYet: Story = {
  beforeEach: withEngine({ workbench: workbenchNoneSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Name the folder to hook into any of these.')).toBeInTheDocument()
    await expect(c.getAllByText('Not hooked')).toHaveLength(3)
    await expect(c.queryByRole('button', { name: 'Save' })).toBeNull() // nothing typed: only the dialog is offered
    await userEvent.type(c.getByLabelText('The folder'), '/Users/sample/nowhere')
    await userEvent.click(c.getByRole('button', { name: 'Save' }))
    await expect(await c.findByRole('alert')).toHaveTextContent('there is no folder at /Users/sample/nowhere on this computer')
    // The computer's folder dialog: what is chosen there is saved at once.
    await userEvent.click(c.getByRole('button', { name: 'Choose a folder…' }))
    await expect(await c.findByText('On this computer')).toBeInTheDocument()
    await expect(c.getByLabelText('The folder')).toHaveValue('/code')
    await expect(await c.findByText('Hooked')).toBeInTheDocument()
  },
}

/** No folder yet, as it is first seen: Evident offers to make one, saying where and what it starts with. */
export const NoneYetOffered: Story = {
  beforeEach: withEngine({ workbench: workbenchNoneSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('There is none yet.')).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Create the workbench' })).toBeEnabled()
  },
}

/** No folder yet, and Evident makes it: the place it would go is offered (beside the app's code) and can be changed; one inside the app's code is refused; made, it is the app's workbench and its dependencies are being installed. */
export const MadeFromTheTemplate: Story = {
  beforeEach: withEngine({ workbench: workbenchNoneSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const where = await c.findByLabelText('Where to make it')
    await expect(where).toHaveValue('/Users/sample/code/sample-shop-workbench')
    await expect(c.getByText(/It starts with the docs site, the docs agent's skills, the hooks folder and the mockups folder/)).toBeInTheDocument()
    await userEvent.clear(where); await userEvent.type(where, '/Users/sample/code/inside/bench')
    await userEvent.click(c.getByRole('button', { name: 'Create the workbench' }))
    await expect(await c.findByRole('alert')).toHaveTextContent(/inside the app's own code/)
    await userEvent.clear(where); await userEvent.type(where, '/Users/sample/code/sample-shop-workbench')
    await userEvent.click(c.getByRole('button', { name: 'Create the workbench' }))
    await expect(await c.findByText('On this computer')).toBeInTheDocument()
    await expect(c.getByLabelText('The folder')).toHaveValue('/Users/sample/code/sample-shop-workbench')
    await expect(c.getByRole('status')).toHaveTextContent(/Installing what the docs site needs/)
    await expect(c.queryByLabelText('Where to make it')).toBeNull()
  },
}

/** A folder somebody made by hand, with a hook and no docs: what it lacks is said, and one press puts that in without touching what is there. */
export const LacksTheDocs: Story = {
  beforeEach: withEngine({ workbench: workbenchLackingSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/This folder does not have the docs site, the docs agent's skills or the mockups folder/)).toBeInTheDocument()
    await expect(c.getByText('Hooked')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Add what is missing' }))
    await expect(await c.findByRole('status')).toHaveTextContent(/Installing what the docs site needs/)
    await expect(c.queryByRole('button', { name: 'Add what is missing' })).toBeNull()
    await expect(c.getByText('Hooked')).toBeInTheDocument()
  },
}

/** Just made, still installing: said, and nothing else is asked of the person. */
export const Installing: Story = {
  beforeEach: withEngine({ workbench: workbenchInstallingSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('status')).toHaveTextContent(/Installing what the docs site needs/)
  },
}

/** The install failed: its last lines, and the press to try again. */
export const InstallFailed: Story = {
  beforeEach: withEngine({ workbench: { ...workbenchInstallingSample, seed: { ...workbenchInstallingSample.seed, installing: false, problem: 'ERR_PNPM_FETCH_404  GET https://registry.example/vitepress: Not Found (sample)' } } }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText(/ERR_PNPM_FETCH_404/)).toBeInTheDocument()
    await expect(c.getByRole('button', { name: 'Install again' })).toBeInTheDocument()
  },
}

/** A hook that failed: said on its point, with its last lines, and that nothing was started. */
export const AHookFailed: Story = {
  beforeEach: withEngine({ workbench: workbenchFailedSample }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Failed last time')).toBeInTheDocument()
    await expect(c.getByLabelText('before-start last run')).toHaveTextContent(/it failed, so nothing was started/)
    await expect(c.getByLabelText('before-start last run')).toHaveTextContent(/relation "companies" does not exist \(sample\)/)
  },
}
