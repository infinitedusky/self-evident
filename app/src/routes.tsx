/** Every page by its path. Each tab in the workspace renders these inside its own router, so a tab navigates on its own. */
import { Navigate, Route, Routes, useParams } from 'react-router'
import { findIdea, ideas } from './ideas'
import { Board } from './pages/Board'
import { IdeaPage } from './pages/IdeaPage'
import { Settings } from './pages/Settings'
import { Projects } from './pages/Projects'
import { ProjectPage } from './pages/ProjectPage'
import { NewProject } from './pages/NewProject'
import { AppGraph } from './pages/AppGraph'
import { Now } from './pages/Now'
import { Learn } from './pages/Learn'
import { Mockups } from './pages/Mockups'
import { Issues } from './pages/Issues'
import { IssuePage } from './pages/IssuePage'
import { Observe } from './pages/Observe'
import { Todos } from './pages/Todos'
import { Summary } from './pages/Summary'

/** Links from before projects were called projects. */
function OldPlanLink() { return <Navigate to={`/projects/${useParams().id}`} replace /> }

function IdeaRoute() {
  const idea = findIdea(useParams().slug ?? '')
  return idea ? <IdeaPage idea={idea} /> : <p>No such idea.</p>
}

export function PageRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Now />} />
      <Route path="/summary" element={<Summary />} />
      <Route path="/observe" element={<Observe />} />
      <Route path="/learn" element={<Learn />} />
      <Route path="/projects" element={<Projects mode="project" />} />
      <Route path="/plan" element={<Navigate to="/projects" replace />} />
      <Route path="/plans" element={<Navigate to="/projects" replace />} />
      <Route path="/plans/:id" element={<OldPlanLink />} />
      <Route path="/issues" element={<Issues />} />
      <Route path="/issues/:id" element={<IssuePage />} />
      <Route path="/tasks" element={<Navigate to="/issues" replace />} />
      <Route path="/todos" element={<Todos />} />
      <Route path="/validate" element={<Navigate to="/mockups" replace />} />
      <Route path="/mockups" element={<Mockups />} />
      <Route path="/build" element={<Projects mode="build" />} />
      <Route path="/ideas" element={<Board ideas={ideas} />} />
      <Route path="/ideas/:slug" element={<IdeaRoute />} />
      <Route path="/graph" element={<AppGraph />} />
      <Route path="/projects/new" element={<NewProject />} />
      <Route path="/projects/:id" element={<ProjectPage />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/settings/apps/:id" element={<Settings />} />
      <Route path="*" element={<p className="muted">No such page.</p>} />
    </Routes>
  )
}
