import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import './app.css'
import { CurrentAppProvider } from './current-app'
import { Workspace } from './components/Workspace'
import { AgentWindow } from './components/TalkDrawer'

// One page, the workspace: the agent on the left, tabs on the right. /agent is the agent popped out into its own window.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CurrentAppProvider>
      {window.location.pathname === '/agent' ? <AgentWindow /> : <Workspace />}
    </CurrentAppProvider>
  </StrictMode>,
)
