import type { Preview } from '@storybook/react-vite'
import { MemoryRouter, Route, Routes } from 'react-router'
import { mswLoader } from 'msw-storybook-addon/csf3'
import { configure } from 'storybook/test'
import { CurrentAppProvider } from '../src/current-app'
import { mockEngine } from '../src/stories/mock-engine'
import { sampleApp } from '../src/stories/sample'
import '../src/tokens.css'
import '../src/app.css'
import './story-flow.css' // the screen map: titles stay in their strip when zoomed out, a line under each

// A story waits for what it looks for (findBy…, waitFor) up to ten seconds, not the usual one: the story tests run many
// files at once in one browser, often while other checkouts test too, and a wait that is generous costs a passing run nothing.
// And text is never looked for inside a text box. A box that was typed into holds that text, so a story that saves a
// form and then waits for what it typed to show would find it at once, in the form itself, before the save had
// landed; then the form closed under its next step, whenever the save was the slower of the two.
configure({ asyncUtilTimeout: 10_000, defaultIgnore: 'script, style, textarea' })

// The engine is faked with MSW: stories render the real pages, which fetch /api as they do in the app. A story
// changes what the engine says with `beforeEach: withEngine({...})`; its handlers go in front of these.

/** Where a story stands (`router: false` for a story that brings its own): a page that reads the URL says `parameters: { route: { path: '/issues/:id', url: '/issues/iss_sample5' } }`. */
export interface RouteParam { path: string; url: string; state?: unknown } // `state`: what a page carried here with navigate(), like New app's note

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'todo' },
  },
  loaders: [mswLoader()],
  beforeEach({ msw }) { msw.use(...mockEngine()) },
  globalTypes: {
    theme: { description: 'Colour scheme', toolbar: { title: 'Theme', icon: 'mirror', items: ['system', 'light', 'dark'], dynamicTitle: true } },
  },
  initialGlobals: { theme: 'system' },
  decorators: [
    (Story, { globals, parameters }) => {
      const root = document.documentElement
      if (globals.theme === 'system') delete root.dataset.theme
      else root.dataset.theme = globals.theme
      try { localStorage.setItem('if.app', sampleApp.id) } catch { /* the sample app is picked anyway, as the newest */ }
      const route = parameters.route as RouteParam | undefined
      // The workspace and a tab bring their own routers (a tab keeps its own history); they say `router: false`.
      if (parameters.router === false) return <CurrentAppProvider><Story /></CurrentAppProvider>
      return (
        <MemoryRouter initialEntries={[route?.state !== undefined ? { pathname: route.url, state: route.state } : route?.url ?? '/']}>
          <CurrentAppProvider>
            {route ? <Routes><Route path={route.path} element={<Story />} /></Routes> : <Story />}
          </CurrentAppProvider>
        </MemoryRouter>
      )
    },
  ],
}

export default preview
