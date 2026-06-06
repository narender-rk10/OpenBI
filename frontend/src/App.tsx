import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import { LayoutProvider } from './lib/layout'
import { BrandingProvider } from './lib/branding'
import { ErrorModalProvider } from './lib/errorModal'

import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ProjectsPage from './pages/ProjectsPage'
import ChatPage from './pages/ChatPage'
import ConnectionsPage from './pages/ConnectionsPage'
import KnowledgeBasesPage from './pages/KnowledgeBasesPage'
import AgentsPage from './pages/AgentsPage'
import DashboardsPage from './pages/DashboardsPage'
import DashboardViewPage from './pages/DashboardViewPage'
import SchedulesPage from './pages/SchedulesPage'
import SettingsPage from './pages/SettingsPage'
import PublicDashboardPage from './pages/PublicDashboardPage'
import ObservabilityPage from './pages/ObservabilityPage'

import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BrandingProvider>
          <ThemeProvider>
            <LayoutProvider>
              <ErrorModalProvider>
              <Routes>
                {/* Public */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/public/:token" element={<PublicDashboardPage />} />

                {/* Protected */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/projects" element={<ProjectsPage />} />
                    <Route path="/projects/:projectId/chat" element={<ChatPage />} />
                    <Route path="/projects/:projectId/connections" element={<ConnectionsPage />} />
                    <Route path="/projects/:projectId/knowledge-bases" element={<KnowledgeBasesPage />} />
                    <Route path="/projects/:projectId/agents" element={<AgentsPage />} />
                    <Route path="/projects/:projectId/dashboards" element={<DashboardsPage />} />
                    <Route path="/projects/:projectId/dashboards/:dashboardId" element={<DashboardViewPage />} />
                    <Route path="/projects/:projectId/schedules" element={<SchedulesPage />} />
                    <Route path="/projects/:projectId/analytics" element={<ObservabilityPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                </Route>
              </Routes>
              </ErrorModalProvider>
            </LayoutProvider>
          </ThemeProvider>
        </BrandingProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

