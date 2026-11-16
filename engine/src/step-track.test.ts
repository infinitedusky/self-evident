import { describe, expect, it } from 'vitest'
import { StepTracker } from './step-track.js'

describe('a builder\'s steps, from its task tools', () => {
  it('the whole list at once (TodoWrite)', () => {
    const t = new StepTracker()
    expect(t.use({ name: 'TodoWrite', input: { todos: [{ content: 'Write the migration', status: 'completed' }, { content: 'Wire the API', status: 'in_progress' }] } }))
      .toEqual([{ text: 'Write the migration', status: 'completed' }, { text: 'Wire the API', status: 'in_progress' }])
  })

  it('a step at a time (TaskCreate, TaskUpdate), found again by the id the tool gave it', () => {
    const t = new StepTracker()
    t.use({ id: 'use_a', name: 'TaskCreate', input: { subject: 'Write the migration', description: 'the schema (sample)' } })
    t.result('use_a', '{"task":{"id":"7","subject":"Write the migration"}}')
    t.use({ id: 'use_b', name: 'TaskCreate', input: { subject: 'Wire the API' } })
    t.result('use_b', 'Task #8 created successfully: Wire the API')
    expect(t.use({ name: 'TaskUpdate', input: { taskId: '7', status: 'in_progress' } })).toEqual([{ text: 'Write the migration', status: 'in_progress' }, { text: 'Wire the API', status: 'pending' }])
    expect(t.use({ name: 'TaskUpdate', input: { taskId: '7', status: 'completed' } })![0].status).toBe('completed')
    expect(t.use({ name: 'TaskUpdate', input: { taskId: '8', status: 'in_progress', subject: 'Wire the API and its tests' } })![1]).toEqual({ text: 'Wire the API and its tests', status: 'in_progress' })
    expect(t.use({ name: 'TaskUpdate', input: { taskId: '8', status: 'deleted' } })).toEqual([{ text: 'Write the migration', status: 'completed' }])
  })

  it('counts from one when the tool\'s result does not say an id, and leaves alone what it does not know', () => {
    const t = new StepTracker()
    t.use({ id: 'use_a', name: 'TaskCreate', input: { subject: 'First' } })
    t.use({ id: 'use_b', name: 'TaskCreate', input: { subject: 'Second' } })
    t.result('use_a', 'ok'); t.result('use_b', 'ok')
    expect(t.use({ name: 'TaskUpdate', input: { taskId: '2', status: 'completed' } })).toEqual([{ text: 'First', status: 'pending' }, { text: 'Second', status: 'completed' }])
    expect(t.use({ name: 'TaskUpdate', input: { taskId: '99', status: 'completed' } })).toBeNull()
    expect(t.use({ name: 'Bash', input: { command: 'ls' } })).toBeNull()
  })
})
