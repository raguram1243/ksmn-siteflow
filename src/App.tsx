import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import AdminDashboard from './pages/AdminDashboard'
import RepDashboard from './pages/RepDashboard'
import ContactsPage from './pages/ContactsPage'
import LeadsPage from './pages/LeadsPage'
import SiteVisitsPage from './pages/SiteVisitsPage'
import QuotationsPage from './pages/QuotationsPage'
import CatalogPage from './pages/CatalogPage'
import ProjectsPage from './pages/ProjectsPage'
import ExpensesPage from './pages/ExpensesPage'
import PaymentsPage from './pages/PaymentsPage'
import UserManagementPage from './pages/UserManagementPage'
import ForcePasswordChange from './pages/ForcePasswordChange'
import Layout from './components/Layout'
import { setupAutoSync } from './utils/sync'
import { useEffect } from 'react'
import { ToastProvider } from './contexts/ToastContext'
import { DarkModeProvider } from './contexts/DarkModeContext'
import { WhatsNewProvider } from './contexts/WhatsNewContext'
import { ConfirmProvider } from './contexts/ConfirmContext'
import ErrorBoundary from './components/ErrorBoundary'

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  }

  if (!user) return <Navigate to="/login" replace />
  
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/rep'} replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const { role, mustChangePassword } = useAuth()

  useEffect(() => {
    setupAutoSync()
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      
      {/* Force password change route - accessible when mustChangePassword is true */}
      <Route path="/force-password-change" element={
        <ProtectedRoute>
          <ForcePasswordChange />
        </ProtectedRoute>
      } />

      {/* Redirect to force password change if needed */}
      {mustChangePassword && (
        <Route path="*" element={<Navigate to="/force-password-change" replace />} />
      )}
      
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <Layout>
            <AdminDashboard />
          </Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/rep" element={
        <ProtectedRoute allowedRoles={['rep']}>
          <Layout>
            <RepDashboard />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/contacts" element={
        <ProtectedRoute>
          <Layout>
            <ContactsPage />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/leads" element={
        <ProtectedRoute>
          <Layout>
            <LeadsPage />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/visits" element={
        <ProtectedRoute>
          <Layout>
            <SiteVisitsPage />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/quotations" element={
        <ProtectedRoute>
          <Layout>
            <QuotationsPage />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/catalog" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <Layout>
            <CatalogPage />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/users" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <Layout>
            <UserManagementPage />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/projects" element={
        <ProtectedRoute>
          <Layout>
            <ProjectsPage />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/expenses" element={
        <ProtectedRoute>
          <Layout>
            <ExpensesPage />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/payments" element={
        <ProtectedRoute>
          <Layout>
            <PaymentsPage />
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/" element={
        role === 'admin' ? <Navigate to="/admin" replace /> :
        role === 'rep' ? <Navigate to="/rep" replace /> :
        <Navigate to="/login" replace />
      } />
    </Routes>
  )
}

export default function App() {
  // Globally prevent mouse-wheel scrolling from changing <input type="number"> values.
  // Applies to every numeric input across the app (Rate, Amount, Discount, etc.)
  // without needing to touch each individual field.
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      const target = e.target as HTMLElement | null
      if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
        // Only block the scroll-from-changing-value behavior when the field is focused.
        // When not focused, the value doesn't change on scroll anyway, so let the page scroll normally.
        if (document.activeElement === target) {
          e.preventDefault()
          target.blur()
        }
      }
    }
    // Capture phase + passive:false so preventDefault() works.
    document.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    return () => document.removeEventListener('wheel', handleWheel, { capture: true } as EventListenerOptions)
  }, [])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <DarkModeProvider>
              <WhatsNewProvider>
                <ConfirmProvider>
                  <AppRoutes />
                </ConfirmProvider>
              </WhatsNewProvider>
            </DarkModeProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
