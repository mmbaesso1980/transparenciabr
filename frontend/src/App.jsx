import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RouteFallback from "./components/RouteFallback.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CameraFocusProvider } from "./context/CameraFocusContext.jsx";
import { CreditosGODProvider } from "./context/CreditosGODContext.jsx";
import AlvosPage from "./pages/AlvosPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import PainelMestrePage from "./pages/PainelMestrePage.jsx";
import MetodologiaPage from "./pages/MetodologiaPage.jsx";
import PrivacidadePage from "./pages/PrivacidadePage.jsx";
import SobrePage from "./pages/SobrePage.jsx";
import TermosPage from "./pages/TermosPage.jsx";
import UniversePage from "./pages/UniversePage.jsx";

const DashboardLayout = lazy(() => import("./layouts/DashboardLayout.jsx"));
const OperationsOverviewPage = lazy(() => import("./pages/OperationsOverviewPage.jsx"));
const RankingPage = lazy(() => import("./pages/RankingPage.jsx"));
const DossiePage = lazy(() => import("./pages/DossiePage.jsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const MapaPage = lazy(() => import("./pages/MapaPage.jsx"));
const AlertasPage = lazy(() => import("./pages/AlertasPage.jsx"));
const PerfilPage = lazy(() => import("./pages/PerfilPage.jsx"));
const CreditosPage = lazy(() => import("./pages/CreditosPage.jsx"));
const RadarPage = lazy(() => import("./pages/RadarPage.jsx"));
const SuccessPage = lazy(() => import("./pages/SuccessPage.jsx"));
const LogoutPage = lazy(() => import("./pages/LogoutPage.jsx"));

// Em GitHub Pages o app é servido em /transparenciabr/
// Em dev (Vite) roda na raiz /
const basename = import.meta.env.BASE_URL;

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <CreditosGODProvider>
          <CameraFocusProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/universo" element={<UniversePage />} />
                <Route path="/painel" element={<PainelMestrePage />} />
                <Route path="/alvos" element={<AlvosPage />} />
                <Route path="/sobre" element={<SobrePage />} />
                <Route path="/metodologia" element={<MetodologiaPage />} />
                <Route path="/termos" element={<TermosPage />} />
                <Route path="/privacidade" element={<PrivacidadePage />} />
                <Route path="/login" element={<LoginPage />} />

                <Route path="/dossie/:id" element={<DossiePage />} />
                <Route path="/sucesso" element={<SuccessPage />} />
                <Route path="/logout" element={<LogoutPage />} />

                <Route element={<ProtectedRoute />}>
                  <Route element={<DashboardLayout />}>
                    <Route path="/dashboard" element={<OperationsOverviewPage />} />
                    <Route path="/mapa" element={<MapaPage />} />
                    <Route path="/alertas" element={<AlertasPage />} />
                    <Route path="/ranking" element={<RankingPage />} />
                    <Route path="/perfil" element={<PerfilPage />} />
                    <Route path="/creditos" element={<CreditosPage />} />
                    <Route path="/radar/dossiers" element={<RadarPage />} />
                  </Route>
                </Route>
              </Routes>
            </Suspense>
          </CameraFocusProvider>
        </CreditosGODProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
