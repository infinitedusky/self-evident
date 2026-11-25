import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import './app.css'
import { CurrentAppProvider } from './current-app'
import { Workspace } from './components/Workspace'
import { AgentWindow } from './components/TalkDrawer'
import { ViewerWindow } from './components/Viewer'
import { Phone, useIsPhone } from './components/Phone'

// One page, the workspace: the agent on the left, tabs on the right. /agent is the agent popped out into its own window;
// /view is a viewer (sketches, mockups, a prototype) detached into a browser tab of its own. A narrow screen gets the
// phone's layout instead of the workspace: one chat, the rest pulled out over it (Phone.tsx).
function Home() { return useIsPhone() ? <Phone /> : <Workspace /> }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CurrentAppProvider>
      {window.location.pathname === '/agent' ? <AgentWindow /> : window.location.pathname === '/view' ? <ViewerWindow /> : <Home />}
    </CurrentAppProvider>
  </StrictMode>,
)
