import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { user, allowed, loading, login } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando…</div>
  if (user && allowed) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="bg-white rounded-lg shadow-md p-8 max-w-sm w-full text-center">
        <h1 className="font-display text-2xl text-teal mb-2">AURORA Comando</h1>
        <p className="text-info text-sm mb-6">
          Centro de comando do pipeline TransparênciaBR. Acesso restrito ao Comandante Baesso.
        </p>
        <button
          onClick={login}
          className="w-full py-3 bg-teal text-white rounded font-display hover:bg-teal-dark transition-colors"
        >
          Entrar com Google
        </button>
        {user && !allowed && (
          <p className="mt-4 text-sm text-critica">
            Acesso restrito. A conta {user.email} não está na allowlist.
          </p>
        )}
      </div>
    </div>
  )
}
