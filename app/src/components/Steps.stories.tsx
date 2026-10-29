import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Steps } from './Steps'
import { ideaSteps, quickWorkflow, taskSteps, uiWorkflow } from '../stories/sample'

// The steps on one idea, task or project. Made up: a sample checkout idea and its task.
const meta = { title: 'Components/Steps', component: Steps, args: { on: 'idea', states: ideaSteps, resolved: { workflow: null, from: null }, onStart: fn() },
  render: (a) => <div style={{ maxWidth: 900 }}><Steps {...a} /></div> } satisfies Meta<typeof Steps>
export default meta
type Story = StoryObj<typeof meta>

/** An idea with no workflow: any step, any order, nothing committed. Its brief is a rough draft. */
export const OnAnIdea: Story = {}
/** A task with no workflow: only the brief is required; it's written and waits for approval. */
export const OnATaskFree: Story = { args: { on: 'task', states: taskSteps } }
/** A task under its project's "UI change" workflow, in order, converted from an idea: the brief is approved, so nothing waits. */
export const OnATaskInherited: Story = { args: { on: 'task', fromIdea: 'Sample: checkout in one go', states: taskSteps.map((s) => (s.key === 'brief' ? { ...s, approved: { by: 'Sam (sample)', at: '2026-10-28' } } : s)), resolved: { workflow: uiWorkflow, from: 'project' } } }
/** Just converted from an idea, under "UI change": the mockup is required before the brief, so the brief waits. */
export const OnATaskWaiting: Story = { args: { on: 'task', states: [], fromIdea: 'Sample: checkout in one go', resolved: { workflow: uiWorkflow, from: 'project' } } }
/** Its own "Quick fix" workflow: only the brief, required. */
export const OnATaskQuickFix: Story = { args: { on: 'task', states: [{ key: 'brief', status: 'started', detail: 'draft' }], resolved: { workflow: quickWorkflow, from: 'task' } } }
/** A project: no brief of its own, but mockups and a prototype can be done on it. */
export const OnAProject: Story = { args: { on: 'project', states: [{ key: 'prototype', status: 'done', detail: 'the whole flow, made-up orders' }] } }
