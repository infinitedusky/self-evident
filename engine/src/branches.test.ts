/** Stacked PRs: where a task's branch starts and what its PR is against. */
import { describe, expect, it } from 'vitest'
import { landingBranch, prMode, stackBase, taskStart } from './branches.js'

const tasks = [{ id: 'a', number: 4, position: 0 }, { id: 'b', number: 5, position: 1 }, { id: 'c', number: 6, position: 2 }]

describe('stacked PRs', () => {
  it('lands on the project branch by default, on the task branch in task mode', () => {
    expect(prMode({})).toBe('project'); expect(prMode({ pr_mode: 'task' })).toBe('task')
    expect(landingBranch('project', 'project/p1', tasks[1])).toBe('project/p1')
    expect(landingBranch('task', 'project/p1', tasks[1])).toBe('project/p1--t5')
  })
  it('a task branch starts from the nearest earlier task branch, else the project branch', () => {
    expect(taskStart('project/p1', tasks[0], tasks, new Set())).toBe('project/p1')
    expect(taskStart('project/p1', tasks[2], tasks, new Set(['project/p1--t4']))).toBe('project/p1--t4')
    expect(taskStart('project/p1', tasks[2], tasks, new Set(['project/p1--t4', 'project/p1--t5']))).toBe('project/p1--t5')
  })
  it('a task PR is against the nearest earlier open PR, else main', () => {
    const prs = [{ taskId: 'a', status: 'merged', headBranch: 'project/p1--t4', number: 1 }, { taskId: 'b', status: 'open', headBranch: 'project/p1--t5', number: 2 }]
    expect(stackBase('main', tasks[0], tasks, prs)).toEqual({ base: 'main', on: null })
    expect(stackBase('main', tasks[1], tasks, prs)).toEqual({ base: 'main', on: null }) // the one below merged
    expect(stackBase('main', tasks[2], tasks, prs)).toEqual({ base: 'project/p1--t5', on: 2 })
  })
})
