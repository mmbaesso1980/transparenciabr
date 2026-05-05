import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RouteFallback from "./components/RouteFallback.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CameraFocusProvider } from "./context/CameraFocusContext.jsx";
import { CreditosGODProvider } from "./context/CreditosGODContext.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import MetodologiaPage from "./pages/MetodologiaPage.jsx";
import PartidoPage from "./pages/PartidoPage.jsx";
import PrivacidadePage from "./pages/PrivacidadePage.jsx";
import RadarJuridico from "./pages/RadarJuridico.jsx";
import SobrePage from "./pages/SobrePage.jsx";
import StatusPage from "./pages/StatusPage.jsx";
import TermosPage from "./pages/TermosPage.jsx";
import UniversePage from "./pages/UniversePage.jsx";

const DashboardLayout = lazy(() => import("./layouts/DashboardLayout.jsx"));
const DossiePage = lazy(() => import("./pages/DossiePage.jsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const MapaPage = lazy(() => import("./pages/MapaPage.jsx"));
const AlertasPage = lazy(() => import("./pages/AlertasPage.jsx"));
const PerfilPage = lazy(() => import("./pages/PerfilPage.jsx"));
const CreditosPage = lazy(() => import("./pages/CreditosPage.jsx"));
const SuccessPage = lazy(() => import("./pages/SuccessPage.jsx"));
const LogoutPage = lazy(() => import("./pages/LogoutPage.jsx"));
const BuscaPage = lazy(() => import("./pages/BuscaPage.jsx"));
const DossieGroundedPage = lazy(() => import("./pages/DossieGroundedPage.jsx"));

// Vite: BASE_URL costuma ser "/" ou "/subpath/" (com barra final). React Router: basename sem barra final;
// na raiz omitimos a prop.
const rawBase = String(import.meta.env.BASE_URL || "/").trim() || "/";
const trimmed =
  rawBase.length > 1 && rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;
const routerBasename = trimmed === "/" ? undefined : trimmed;

function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0B0F1A] px-6 text-center text-slate-200">
      <p className="text-lg font-semibold text-white">Página não encontrada</p>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        A rota não existe nesta versão do site, ou o bundle em produção ainda não inclui esta rota. Faça um
        deploy após o merge mais recente.
      </p>
      <Link to="/" className="mt-8 text-sm font-semibold text-[#22d3ee] hover:text-[#67e8f9]">
        Ir à página inicial
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <AuthProvider>
        <CreditosGODProvider>
          <CameraFocusProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/universo" element={<UniversePage />} />
                <Route path="/status" element={<StatusPage />} />
                <Route path="/partido" element={<PartidoPage />} />
                <Route path="/comercial" element={<Navigate to="/partido" replace />} />

                <Route path="/painel" element={<Navigate to="/universo" replace />} />
                <Route path="/alvos" element={<Navigate to="/universo" replace />} />
                <Route path="/dashboard" element={<Navigate to="/status" replace />} />
                <Route path="/ranking" element={<Navigate to="/universo" replace />} />
                <Route path="/radar/dossiers" element={<Navigate to="/radar-legal" replace />} />
                <Route path="/radar" element={<Navigate to="/radar-legal" replace />} />

                <Route path="/sobre" element={<SobrePage />} />
                <Route path="/metodologia" element={<MetodologiaPage />} />
                <Route path="/termos" element={<TermosPage />} />
                <Route path="/privacidade" element={<PrivacidadePage />} />
                <Route path="/radar-legal" element={<RadarJuridico />} />
                <Route path="/login" element={<LoginPage />} />

                <Route path="/politica/busca" element={<BuscaPage />} />
                <Route path="/busca" element={<Navigate to="/politica/busca" replace />} />
                <Route path="/politica/dossie/:nome" element={<DossieGroundedPage />} />
                <Route path="/dossie/:id" element={<DossiePage />} />
                <Route path="/sucesso" element={<SuccessPage />} />
                <Route path="/logout" element={<LogoutPage />} />

                <Route element={<ProtectedRoute />}>
                  <Route element={<DashboardLayout />}>
                    <Route path="/mapa" element={<MapaPage />} />
                    <Route path="/alertas" element={<AlertasPage />} />
                    <Route path="/perfil" element={<PerfilPage />} />
                    <Route path="/creditos" element={<CreditosPage />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </CameraFocusProvider>
        </CreditosGODProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
