import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Workbench } from './Workbench'
import { withEngine } from '../stories/mock-engine'
import { workbenchFailedSample, workbenchNoneSample, workbenchSample } from '../stories/sample'

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
