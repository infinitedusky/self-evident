import type { Preview } from '@storybook/react-vite'
import { MemoryRouter, Route, Routes } from 'react-router'
import { mswLoader } from 'msw-storybook-addon/csf3'
import { CurrentAppProvider } from '../src/current-app'
import { mockEngine } from '../src/stories/mock-engine'
import { sampleApp } from '../src/stories/sample'
import '../src/tokens.css'
import '../src/app.css'

// The engine is faked with MSW: stories render the real pages, which fetch /api as they do in the app. A story
// changes what the engine says with `beforeEach: withEngine({...})`; its handlers go in front of these.

/** Where a story stands: a page that reads the URL says `parameters: { route: { path: '/issues/:id', url: '/issues/iss_sample5' } }`. */
export interface RouteParam { path: string; url: string }

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
      return (
        <MemoryRouter initialEntries={[route?.url ?? '/']}>
          <CurrentAppProvider>
            {route ? <Routes><Route path={route.path} element={<Story />} /></Routes> : <Story />}
          </CurrentAppProvider>
        </MemoryRouter>
      )
    },
  ],
}

export default preview
