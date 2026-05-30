/**
 * App.jsx — Radar Jurídico INSS
 *
 * Roteamento principal do app isolado.
 * Design system: paleta teal #01696F, DM Sans/Inter
 * (mesmo padrão de frontend/src/pages/ConsentForm/ConsentForm.tsx)
 *
 * Rotas:
 *   /                  → DashboardPage (KPIs globais, acesso rápido)
 *   /leads             → LeadsPage (Paywall 1 — listagem + filtros)
 *   /alertas           → AlertasPage (Paywall 2 — publicou-pegamos)
 *   /login             → LoginPage (Firebase Auth Google + email)
 *   /creditos          → Redireciona para CreditosPage do app principal
 *                        (ou implementar versão local — TODO Maestro decidir)
 *
 * TODO(maestro): implementar AuthContext e ProtectedRoute
 * Referência: frontend/src/context/AuthContext.jsx
 *             frontend/src/components/ProtectedRoute.jsx
 */

import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";

// TODO(maestro): implementar AuthProvider
// import { AuthProvider } from "./context/AuthContext.jsx";
// import ProtectedRoute from "./components/ProtectedRoute.jsx";

// Lazy load das páginas (melhor performance de bundle)
// TODO(maestro): implementar as páginas abaixo:
// const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
// const LeadsPage     = lazy(() => import("./pages/LeadsPage.jsx"));
// const AlertasPage   = lazy(() => import("./pages/AlertasPage.jsx"));
// const LoginPage     = lazy(() => import("./pages/LoginPage.jsx"));

// -------------------------------------------------------------------------
// Paleta de cores — design system teal #01696F
// -------------------------------------------------------------------------
const TEAL    = "#01696F";
const TEAL_DK = "#014f54";
const GOLD    = "#d4af37";
const MIDNIGHT = "#0a1628";

// -------------------------------------------------------------------------
// Scaffold temporário — exibido até o Maestro implementar as páginas reais
// -------------------------------------------------------------------------
function ScaffoldPage({ title, description, paywall }) {
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center text-slate-100 p-8"
      style={{ background: `linear-gradient(165deg, ${MIDNIGHT} 0%, #0c1a32 100%)` }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border p-8"
        style={{ borderColor: "rgba(1,105,111,0.4)", background: "rgba(1,105,111,0.06)" }}
      >
        <p
          className="font-mono text-[11px] uppercase tracking-[0.28em] mb-3"
          style={{ color: TEAL }}
        >
          radar-juridico · scaffold · aguardando maestro
        </p>
        <h1 className="font-serif text-3xl font-semibold text-white mb-2">{title}</h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-6">{description}</p>

        {paywall && (
          <div
            className="rounded-xl border px-4 py-3 mb-4 text-xs font-mono"
            style={{ borderColor: `${GOLD}44`, background: `${GOLD}0a`, color: GOLD }}
          >
            {paywall}
          </div>
        )}

        <div
          className="rounded-xl border px-4 py-4 text-xs font-mono text-slate-500"
          style={{ borderColor: "rgba(148,163,184,0.15)" }}
        >
          <p className="font-bold text-slate-400 mb-2">TODO(maestro): implementar</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Conectar ao backend Cloud Run via <code>src/lib/api.js</code></li>
            <li>Verificar autenticação Firebase via <code>context/AuthContext.jsx</code></li>
            <li>Renderizar dados do BigQuery (sem PII direto)</li>
            <li>Implementar PaywallGate com débito de créditos</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Componente de loading (Suspense fallback)
// -------------------------------------------------------------------------
function PageLoading() {
  return (
    <div
      className="min-h-dvh flex items-center justify-center"
      style={{ background: MIDNIGHT }}
    >
      <div
        className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: TEAL, borderTopColor: "transparent" }}
        role="status"
        aria-label="Carregando"
      />
    </div>
  );
}

// -------------------------------------------------------------------------
// App principal
// -------------------------------------------------------------------------
export default function App() {
  return (
    // TODO(maestro): envolver com <AuthProvider>
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#0a1628",
            color: "#e2e8f0",
            border: `1px solid ${TEAL}44`,
            fontFamily: "DM Sans, Inter, sans-serif",
            fontSize: "13px",
          },
          success: { iconTheme: { primary: TEAL, secondary: "#fff" } },
          error:   { iconTheme: { primary: "#ef4444", secondary: "#fff" } },
        }}
      />

      <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* Dashboard — TODO(maestro): substituir por <DashboardPage /> */}
          <Route
            path="/"
            element={
              <ScaffoldPage
                title="Dashboard — Radar Jurídico INSS"
                description="KPIs globais: pool de indeferimentos, leads qualificados, alertas ativos."
              />
            }
          />

          {/* Leads — Paywall 1 */}
          {/* TODO(maestro): substituir por <ProtectedRoute><LeadsPage /></ProtectedRoute> */}
          <Route
            path="/leads"
            element={
              <ScaffoldPage
                title="Leads — Indeferimentos INSS Qualificados"
                description="Listagem paginada de indeferimentos INSS com score ICP, filtros avançados e tese recomendada."
                paywall="Paywall 1 — 1 crédito por consulta. CPF nunca exibido em claro."
              />
            }
          />

          {/* Alertas — Paywall 2 */}
          {/* TODO(maestro): substituir por <ProtectedRoute><AlertasPage /></ProtectedRoute> */}
          <Route
            path="/alertas"
            element={
              <ScaffoldPage
                title="Alertas — Publicou-Pegamos"
                description="Configure monitores por número de processo ou CPF-hash. O sistema notifica quando há publicação no DOU/PJe."
                paywall="Paywall 2 — 2 créditos por alerta. Anti-waste PJe TRF3 incluído."
              />
            }
          />

          {/* Login */}
          {/* TODO(maestro): substituir por <LoginPage /> */}
          <Route
            path="/login"
            element={
              <ScaffoldPage
                title="Login — Radar Jurídico"
                description="Autenticação Firebase (Google + email/senha). Mesmo sistema de créditos do TransparênciaBR."
              />
            }
          />

          {/* Catch-all → dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
