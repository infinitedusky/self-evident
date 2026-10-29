import type { Meta, StoryObj } from '@storybook/react-vite'
import { IdeaDetail } from './IdeaDetail'
import { withEngine } from '../stories/mock-engine'
import { ideaRows } from '../stories/sample'

// One idea from the inbox, with its steps and converting it. Made up: the sample engine's first idea.
const meta = { title: 'Pages/IdeaDetail', component: IdeaDetail, parameters: { layout: 'fullscreen' }, args: { id: ideaRows[0].id }, render: (a) => <div className="tab-page"><IdeaDetail {...a} /></div> } satisfies Meta<typeof IdeaDetail>
export default meta
type Story = StoryObj<typeof meta>

/** In the inbox: research done, mockups started, ready to convert. */
export const InTheInbox: Story = { beforeEach: withEngine({ ideas: ideaRows.map((i) => ({ ...i, lane: 'inbox' })) }) }
/** Already converted: its steps went with it. */
export const Converted: Story = { beforeEach: withEngine({ ideas: ideaRows.map((i) => ({ ...i, lane: 'build' })) }) }
/** No such idea. */
export const Missing: Story = { args: { id: 'idea_nothing' } }
