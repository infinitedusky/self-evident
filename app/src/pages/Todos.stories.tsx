import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shell } from '../components/Shell'
import { TodoCard, Todos } from './Todos'
import { engineDown, withEngine } from '../stories/mock-engine'
import { projects, todos } from '../stories/sample'
import type { Todo } from '../engine'

// The app's to-dos at /todos: the work around the code, each with a checklist.
const meta = { title: 'Pages/Todos', component: Todos, parameters: { layout: 'fullscreen', route: { path: '/todos', url: '/todos' } }, render: () => <Shell><Todos /></Shell> } satisfies Meta<typeof Todos>
export default meta
type Story = StoryObj<typeof meta>

// Made up: a to-do in each status, and one stalled on someone else.
const stalled: Todo = { ...todos[0], id: 'iss_sample30', identifier: 'SS-30', title: 'Sign the payment provider agreement (sample)', checklist: todos[0].checklist.filter((l) => !l.done) }
const done: Todo = { ...todos[1], id: 'iss_sample31', identifier: 'SS-31', title: 'Pick the checkout copy (sample)', status: 'done', state: 'done', checklist: [{ ...todos[0].checklist[0], done: true }] }
const dropped: Todo = { ...todos[1], id: 'iss_sample32', identifier: 'SS-32', title: 'Survey last month\'s buyers (sample)', status: 'dropped', state: 'canceled', reason: 'the analytics answer it' }
const every = [...todos, stalled, done, dropped]

/** Open to-dos: one for a person with a checklist half done, one for the agent with none yet. */
export const Typical: Story = {}
/** One of each status (the filters count them) and one stalled: every line left waits on someone else. */
export const EveryStatus: Story = { beforeEach: withEngine({ todos: every }) }
/** Nothing to do outside the code. */
export const Empty: Story = { beforeEach: withEngine({ todos: [] }) }
/** No app yet. */
export const NoApp: Story = { beforeEach: withEngine({ apps: [] }) }
/** Waiting on the engine. */
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }
/** The engine is down. */
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }

// TodoCard on its own, as the project page shows it (compact) and as the to-do list does.
const card = (todo: Todo, compact = false) => () => <div style={{ maxWidth: 720, padding: 16 }}><TodoCard todo={todo} projects={projects} compact={compact} onChange={() => undefined} onError={() => undefined} /></div>
/** A card with a checklist, one line waiting on someone. */
export const CardWithChecklist: Story = { render: card(todos[0]) }
/** A card for the agent with no checklist yet: Draft a checklist. */
export const CardEmptyChecklist: Story = { render: card(todos[1]) }
/** Stalled: every line left waits on someone else. */
export const CardStalled: Story = { render: card(stalled) }
/** Done. */
export const CardDone: Story = { render: card(done) }
/** Dropped, with the reason. */
export const CardDropped: Story = { render: card(dropped) }
/** Compact, as on the project page. */
export const CardCompact: Story = { render: card(todos[0], true) }
