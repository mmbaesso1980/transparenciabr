/**
 * Ocean Ways — Component: Navbar
 *
 * Barra de navegação principal.
 *
 * Itens (usuário não autenticado):
 *   Logo | Links: Buscar, Preços | Botão: Entrar
 *
 * Itens (usuário autenticado):
 *   Logo | Links: Buscar, Alertas, Dashboard | CreditBadge | Avatar (dropdown: conta, sair)
 *
 * Responsivo: mobile → hamburger menu
 *
 * TODO (Maestro):
 *   [ ] Implementar lógica de auth (useAuth hook)
 *   [ ] Implementar CreditBadge integrado
 *   [ ] Implementar dropdown de avatar com logout
 *   [ ] Implementar mobile menu com hamburger
 *   [ ] Adicionar indicador de rota ativa (sublinhado ou highlight)
 */

import { Link } from 'react-router-dom'
import CreditBadge from './CreditBadge.jsx'
import { Waves } from 'lucide-react'

export default function Navbar() {
  // TODO: const { user, signOut } = useAuth()
  const user = null // placeholder

  return (
    <nav className="bg-ocean-900 border-b border-ocean-700 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 text-white font-bold text-lg hover:text-ocean-300 transition-colors">
          <Waves size={22} className="text-ocean-300" aria-hidden="true" />
          <span>Ocean<span className="text-gold-400">Ways</span></span>
        </Link>

        {/* Links */}
        <div className="hidden md:flex items-center gap-6">
          <Link to="/search" className="text-ocean-100 hover:text-white text-sm transition-colors">
            Buscar
          </Link>
          <Link to="/pricing" className="text-ocean-100 hover:text-white text-sm transition-colors">
            Preços
          </Link>
          {user && (
            <Link to="/dashboard" className="text-ocean-100 hover:text-white text-sm transition-colors">
              Dashboard
            </Link>
          )}
        </div>

        {/* Auth / Credits */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <CreditBadge balance={0} loading={false} />
              {/* TODO: avatar dropdown */}
              <div className="w-8 h-8 rounded-full bg-ocean-700 flex items-center justify-center text-xs text-white cursor-pointer">
                {/* TODO: user initials ou foto */}
                U
              </div>
            </>
          ) : (
            <Link
              to="/login"
              className="bg-ocean-500 hover:bg-ocean-300 text-white hover:text-ocean-950 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
