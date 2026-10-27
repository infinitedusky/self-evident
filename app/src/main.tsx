import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router'
import './tokens.css'
import './app.css'
import { findIdea, ideas } from './ideas'
import { modules } from './providers'
import { CurrentAppProvider } from './current-app'
import { Shell } from './components/Shell'
import { AgentWindow } from './components/TalkDrawer'
import { Board } from './pages/Board'
import { IdeaPage } from './pages/IdeaPage'
import { Settings } from './pages/Settings'
import { Projects } from './pages/Projects'
import { ProjectPage } from './pages/ProjectPage'
import { NewProject } from './pages/NewProject'
import { AppGraph } from './pages/AppGraph'
import { Now } from './pages/Now'
import { Learn } from './pages/Learn'
import { Validate } from './pages/Validate'
import { Mockups } from './pages/Mockups'
import { Tasks } from './pages/Tasks'
import { Observe } from './pages/Observe'
import { Todos } from './pages/Todos'
import { Summary } from './pages/Summary'

/** Links from before projects were called projects. */
function OldPlanLink() { return <Navigate to={`/projects/${useParams().id}`} replace /> }

function IdeaRoute() {
  const idea = findIdea(useParams().slug ?? '')
  return idea ? <IdeaPage idea={idea} /> : <p>No such idea.</p>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CurrentAppProvider>
        <Routes>
          <Route path="/agent" element={<AgentWindow />} />
          <Route path="*" element={<Shell>
          <Routes>
            <Route path="/" element={<Now />} />
            <Route path="/summary" element={<Summary />} />
            <Route path="/observe" element={<Observe />} />
            <Route path="/learn" element={<Learn />} />
            <Route path="/projects" element={<Projects mode="project" />} />
            <Route path="/plan" element={<Navigate to="/projects" replace />} />
            <Route path="/plans" element={<Navigate to="/projects" replace />} />
            <Route path="/plans/:id" element={<OldPlanLink />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/validate" element={<Validate />} />
            <Route path="/mockups" element={<Mockups />} />
            <Route path="/build" element={<Projects mode="build" />} />
            <Route path="/ideas" element={<Board ideas={ideas} />} />
            <Route path="/ideas/:slug" element={<IdeaRoute />} />
            <Route path="/graph" element={<AppGraph />} />
            <Route path="/projects/new" element={<NewProject />} />
            <Route path="/projects/:id" element={<ProjectPage />} />
            <Route path="/settings" element={<Settings modules={modules} />} />
          </Routes>
          </Shell>} />
        </Routes>
      </CurrentAppProvider>
    </BrowserRouter>
  </StrictMode>,
)
