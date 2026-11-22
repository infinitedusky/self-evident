import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Sources } from './MockPlaces'
import { mockPlaces, mockPlacesForTask, sampleApp } from '../stories/sample'

// What a prototype, a smoke test and a reviewer are given for one service: the real service, or the mock. Made up: invented services.
const meta = { title: 'Components/MockPlaces', component: Sources, args: { appId: sampleApp.id, row: mockPlaces[0], onChanged: () => {} },
  render: (a) => <div style={{ maxWidth: 900 }}><Sources {...a} /></div> } satisfies Meta<typeof Sources>
export default meta
type Story = StoryObj<typeof meta>

/** The app's defaults, in its settings: every place on the mock, and the person's own smoke test answered with recorded responses as they are. A reviewer has nothing to choose: always the mock. */
export const AppDefaults: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const options = (name: string) => within(c.getByRole('combobox', { name })).getAllByRole('option').map((o) => o.textContent)
    await expect(options('Fraud scan vendor (sample), Prototype')).toEqual(['The mock', 'The real service'])
    await expect(c.queryByRole('combobox', { name: 'Fraud scan vendor (sample), Reviewer' })).toBeNull() // nothing to choose: always the mock
    await expect(c.getByRole('checkbox', { name: 'Fraud scan vendor (sample), Smoke test: recorded responses as they are' })).toBeChecked()
    await expect(c.queryByRole('checkbox', { name: /Reviewer: recorded/ })).toBeNull()
    await expect(canvasElement.textContent).not.toMatch(/Record and/)
  },
}
/** One task: its smoke test calls the real vendor, by its own choice. Its prototype follows the app, with an Override. */
export const ForATask: Story = {
  args: { issueId: 'iss_sample2', row: mockPlacesForTask[0] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('button', { name: 'Override Fraud scan vendor (sample), Prototype' })).toBeInTheDocument()
    await expect(c.getByRole('combobox', { name: 'Fraud scan vendor (sample), Smoke test' })).toHaveValue('real')
    await expect(c.getByText(/Every run is a real call/)).toBeInTheDocument()
  },
}
/** An endpoint has a real response and no fake of it yet: nothing of it is served, and a reviewer's copy cannot be made until it is faked. */
export const ReviewerBlocked: Story = { args: { row: { ...mockPlaces[0], places: { ...mockPlaces[0].places,
  prototype: { ...mockPlaces[0].places.prototype, how: 'own', says: 'The mock, answering with what its server makes up', note: 'the real response of GET /workflows/runs/{id}/cost is not faked yet, so nothing of it is served: the task\'s agent makes the fake' },
  review: { ...mockPlaces[0].places.review, how: 'own', says: 'The mock, answering with what its server makes up', blocked: 'the real response of Fraud scan vendor (sample)\'s GET /workflows/runs/{id}/cost has no fake yet, and a reviewer is never given a real one' } } } } }
/** A service whose mock is not built yet. */
export const NotBuilt: Story = { args: { row: mockPlaces[2] } }
