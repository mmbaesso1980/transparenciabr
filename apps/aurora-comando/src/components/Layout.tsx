import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/dossies', label: 'Dossiês' },
  { to: '/revisao', label: 'Revisão' },
  { to: '/hq', label: 'Escritório HQ' }
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="bg-teal text-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-display text-xl">AURORA Comando</Link>
          <nav className="hidden md:flex gap-4">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `text-sm ${isActive ? 'text-white font-semibold border-b-2 border-white' : 'text-white/80 hover:text-white'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline opacity-80">{user?.email}</span>
            <button onClick={logout} className="px-3 py-1 rounded bg-teal-dark hover:bg-black/20">Sair</button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
      <nav className="md:hidden sticky bottom-0 bg-teal text-white border-t border-teal-dark">
        <div className="grid grid-cols-4">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `py-2 text-center text-xs ${isActive ? 'bg-teal-dark font-semibold' : ''}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
