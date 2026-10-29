/**
 * The workspace's tabs, as data: what a tab shows, the key two tabs are the same by, and its name. The workspace
 * (components/Workspace.tsx) holds the open ones; anything inside it reaches them with useWorkspace(). Outside it
 * (a story, the popped-out agent) there is none, and links stay plain links.
 */
import { createContext, useContext } from 'react'
import { findIdea } from './ideas'
import type { TalkContext } from './engine'

/** A page by its path, a prototype (by id; without one, the app's prototypes), its Storybook (at a story, by id), or a sub-issue's build as it happens. */
export type Tab = { kind: 'page'; path: string } | { kind: 'prototype'; id?: string; path?: string } | { kind: 'storybook'; story?: string } | { kind: 'build'; issueId: string }
export type Split = 'right' | 'below'
export interface OpenTab { id: string; title: string; key: string; tab: Tab; focused: boolean }

export interface WorkspaceApi {
  /** Focus the tab if it is open, else open it: in the group in front, or split beside or under it. */
  open: (tab: Tab, opts?: { split?: Split }) => void
  tabs: OpenTab[]
  focused: OpenTab | null
}

export const WorkspaceContext = createContext<WorkspaceApi | null>(null)
export const useWorkspace = () => useContext(WorkspaceContext)

/** Two tabs are the same tab when their keys match: a page by its path (without the query), a build or a prototype by its id, the rest by kind. */
export const tabKey = (t: Tab) => t.kind === 'page' ? t.path.split('?')[0] : t.kind === 'build' ? `build:${t.issueId}` : t.kind === 'prototype' && t.id ? `prototype:${t.id}` : t.kind

const PAGES: [RegExp, string][] = [
  [/^\/$/, 'My Stuff'], [/^\/summary/, 'Summary'], [/^\/observe/, 'Observe'], [/^\/learn/, 'Learn'],
  [/^\/ideas\/?$/, 'Ideas'], [/^\/ideas\//, 'Idea'], [/^\/projects\/new/, 'New project'], [/^\/projects\/?$/, 'Projects'], [/^\/projects\//, 'Project'],
  [/^\/plan\/?$/, 'Plan'], [/^\/tasks\/?$/, 'Tasks'], [/^\/tasks\//, 'Task'], [/^\/todos/, 'To-dos'], [/^\/mockups/, 'Mockups'],
  [/^\/build/, 'Build'], [/^\/graph/, 'Graph'], [/^\/settings/, 'Settings'],
]

/** A name to show at once; the workspace swaps in a better one (the project's, the task's) when it has it. */
export function tabTitle(t: Tab): string {
  if (t.kind === 'prototype') return t.id ? 'Prototype' : 'Prototypes'
  if (t.kind === 'storybook') return 'Storybook'
  if (t.kind === 'build') return 'Build log'
  const path = t.path.split('?')[0]
  const idea = path.match(/^\/ideas\/([^/]+)/)?.[1]
  if (idea) return idea.startsWith('idea_') ? 'Idea' : findIdea(idea)?.title ?? 'Idea'
  return PAGES.find(([re]) => re.test(path))?.[1] ?? path
}

/** What the agent is told about where the person is: the tab in front, and every tab open. */
export function tabContext(focused: OpenTab | null, tabs: OpenTab[], contextFor: (pathname: string, search: string) => TalkContext): TalkContext {
  const t = focused?.tab
  const here: TalkContext = !t ? { path: '/', label: 'an empty workspace' }
    : t.kind === 'page' ? contextFor(t.path.split('?')[0], t.path.includes('?') ? t.path.slice(t.path.indexOf('?')) : '')
    : t.kind === 'build' ? { path: `build:${t.issueId}`, issueId: t.issueId, label: 'the build log of this sub-task' }
    : t.kind === 'prototype' ? (t.id ? { path: `prototype:${t.id}`, label: `the prototype "${focused!.title}" (${t.id})` } : { path: 'prototypes', label: 'this app\'s prototypes' })
    : { path: t.story ? `storybook:${t.story}` : 'storybook', label: t.story ? `the story ${t.story} in the app's Storybook` : 'the app\'s Storybook' }
  return { ...here, tabs: tabs.map((x) => ({ title: x.title, path: x.key, ...(x.focused ? { focused: true } : {}) })) }
}
