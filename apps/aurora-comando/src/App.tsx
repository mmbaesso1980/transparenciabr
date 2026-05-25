import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DossieListPage from './pages/DossieListPage'
import DossieDetailPage from './pages/DossieDetailPage'
import ReviewPage from './pages/ReviewPage'
import HQPage from './pages/HQPage'
import Layout from './components/Layout'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, allowed, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-teal font-display text-xl">Carregando…</div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl text-teal mb-3">Acesso restrito</h1>
          <p className="text-info">
            Comandante Baesso, este painel está restrito apenas a você no momento.
            Caso queira adicionar membros da equipe, entre em contato com a engenharia.
          </p>
        </div>
      </div>
    )
  }
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/dossies" element={<ProtectedRoute><DossieListPage /></ProtectedRoute>} />
      <Route path="/dossies/:slug" element={<ProtectedRoute><DossieDetailPage /></ProtectedRoute>} />
      <Route path="/revisao" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
      <Route path="/hq" element={<ProtectedRoute><HQPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
