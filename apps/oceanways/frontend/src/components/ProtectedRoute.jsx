/**
 * Ocean Ways — Component: ProtectedRoute
 *
 * Wrapper de rota que exige autenticação.
 * Redireciona para /login se usuário não autenticado.
 *
 * Uso:
 *   <ProtectedRoute><Dashboard /></ProtectedRoute>
 *
 * TODO (Maestro):
 *   [ ] Implementar useAuth hook com Firebase onAuthStateChanged
 *   [ ] Mostrar loading spinner enquanto verifica auth state
 *   [ ] Preservar rota original no redirect (state: { from: location })
 *       para redirecionar de volta após login
 */

import { Navigate, useLocation } from 'react-router-dom'

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 *
 * TODO (Maestro): implementar lógica real de auth
 */
export default function ProtectedRoute({ children }) {
  const location = useLocation()

  // TODO: const { user, loading } = useAuth()
  const user = null  // placeholder — SEMPRE redireciona para login
  const loading = false

  if (loading) {
    return (
      <div className="min-h-screen bg-ocean-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-ocean-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}
