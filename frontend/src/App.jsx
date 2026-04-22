import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import RouteFallback from "./components/RouteFallback.jsx";
import { CameraFocusProvider } from "./context/CameraFocusContext.jsx";
import { bootstrapAnonymousSession, getFirebaseApp } from "./lib/firebase.js";
import HomePage from "./pages/HomePage.jsx";

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

// Em GitHub Pages o app é servido em /transparenciabr/
// Em dev (Vite) roda na raiz /
const basename = import.meta.env.BASE_URL;

export default function App() {
  useEffect(() => {
    if (!getFirebaseApp()) return undefined;
    bootstrapAnonymousSession().catch(() => {});
    return undefined;
  }, []);

  return (
    <BrowserRouter basename={basename}>
      <CameraFocusProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<OperationsOverviewPage />} />
              <Route path="/mapa" element={<MapaPage />} />
              <Route path="/alertas" element={<AlertasPage />} />
              <Route path="/ranking" element={<RankingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/dossie/:id" element={<DossiePage />} />
              <Route path="/perfil" element={<PerfilPage />} />
              <Route path="/creditos" element={<CreditosPage />} />
              <Route path="/radar/dossiers" element={<RadarPage />} />
            </Route>
          </Routes>
        </Suspense>
      </CameraFocusProvider>
    </BrowserRouter>
  );
}
