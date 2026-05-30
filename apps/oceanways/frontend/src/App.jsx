/**
 * Ocean Ways — App Router
 *
 * Rotas da aplicação:
 *   /           → Home (landing page com hero + CTA)
 *   /search     → SearchForm (formulário de busca de award flights)
 *   /results    → ResultsPage (lista de AvailabilityResult)
 *   /pricing    → PricingPage (planos Free/Pro/Top-up)
 *   /dashboard  → Dashboard (histórico, alertas, saldo de créditos) — requer auth
 *   /login      → LoginPage (Firebase Auth: Google + e-mail)
 *
 * Proteção de rota: /dashboard requer autenticação (ProtectedRoute).
 * Usuário não autenticado em rota protegida → redirect para /login.
 *
 * TODO (Maestro):
 *   [ ] Implementar AuthContext com Firebase onAuthStateChanged
 *   [ ] Implementar ProtectedRoute component
 *   [ ] Adicionar Layout component (Navbar + Footer) como wrapper
 *   [ ] Implementar páginas (ver pages/)
 *   [ ] Adicionar loading state global durante verificação de auth
 *   [ ] Configurar react-router loader para pre-fetch de dados por rota
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// TODO: importar páginas reais quando implementadas
// import Home from './pages/Home.jsx'
// import SearchPage from './pages/SearchPage.jsx'
// import ResultsPage from './pages/ResultsPage.jsx'
// import PricingPage from './pages/PricingPage.jsx'
// import Dashboard from './pages/Dashboard.jsx'
// import LoginPage from './pages/LoginPage.jsx'
// import ProtectedRoute from './components/ProtectedRoute.jsx'

/**
 * Placeholder temporário para páginas não implementadas.
 * TODO (Maestro): remover após implementar páginas reais.
 */
function PagePlaceholder({ name }) {
  return (
    <div className="min-h-screen bg-ocean-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Ocean Ways</h1>
        <p className="text-ocean-300 text-lg mb-4">Página: {name}</p>
        <p className="text-neutral-400 text-sm">
          TODO: página não implementada — scaffold apenas
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      {/* TODO: adicionar AuthProvider wrapper aqui */}
      {/* TODO: adicionar Layout (Navbar + Footer) wrapper aqui */}
      <Routes>
        {/* Rota raiz — Home / Landing */}
        <Route
          path="/"
          element={<PagePlaceholder name="Home (Landing)" />}
          // TODO: element={<Home />}
        />

        {/* Busca de award flights */}
        <Route
          path="/search"
          element={<PagePlaceholder name="Search" />}
          // TODO: element={<SearchPage />}
        />

        {/* Resultados da busca — recebe search_id via query param ou state */}
        <Route
          path="/results"
          element={<PagePlaceholder name="Results" />}
          // TODO: element={<ResultsPage />}
        />

        {/* Planos e preços */}
        <Route
          path="/pricing"
          element={<PagePlaceholder name="Pricing" />}
          // TODO: element={<PricingPage />}
        />

        {/* Dashboard — requer autenticação */}
        <Route
          path="/dashboard"
          element={<PagePlaceholder name="Dashboard (requer auth)" />}
          // TODO: element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
        />

        {/* Login */}
        <Route
          path="/login"
          element={<PagePlaceholder name="Login" />}
          // TODO: element={<LoginPage />}
        />

        {/* Fallback — 404 */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
          // TODO: element={<NotFoundPage />}
        />
      </Routes>
    </BrowserRouter>
  )
}
