import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RouteFallback from "./components/RouteFallback.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CameraFocusProvider } from "./context/CameraFocusContext.jsx";
import { CreditosGODProvider } from "./context/CreditosGODContext.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import MetodologiaPage from "./pages/MetodologiaPage.jsx";
import PainelPage from "./pages/PainelPage.jsx";
import PartidoPage from "./pages/PartidoPage.jsx";
import PrivacidadePage from "./pages/PrivacidadePage.jsx";
import SobrePage from "./pages/SobrePage.jsx";
import StatusPage from "./pages/StatusPage.jsx";
import TermosPage from "./pages/TermosPage.jsx";
import UniversePage from "./pages/UniversePage.jsx";

const DashboardLayout = lazy(() => import("./layouts/DashboardLayout.jsx"));
const PoliticoPage = lazy(() => import("./pages/PoliticoPage.jsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const MapaPage = lazy(() => import("./pages/MapaPage.jsx"));
const AlertasPage = lazy(() => import("./pages/AlertasPage.jsx"));
const PerfilPage = lazy(() => import("./pages/PerfilPage.jsx"));
const CreditosPage = lazy(() => import("./pages/CreditosPage.jsx"));
const SuccessPage = lazy(() => import("./pages/SuccessPage.jsx"));
const LogoutPage = lazy(() => import("./pages/LogoutPage.jsx"));
const BuscaPage = lazy(() => import("./pages/BuscaPage.jsx"));
const DossieGroundedPage = lazy(() => import("./pages/DossieGroundedPage.jsx"));
const GabinetePage = lazy(() => import("./pages/GabinetePage.jsx"));
const EmendasPage = lazy(() => import("./pages/EmendasPage.jsx"));
const PatrimonioPage = lazy(() => import("./pages/PatrimonioPage.jsx"));
const ViagensPage = lazy(() => import("./pages/ViagensPage.jsx"));
const NepotismoPage = lazy(() => import("./pages/NepotismoPage.jsx"));
const NepotismoCruzadoPage = lazy(() => import("./pages/NepotismoCruzadoPage.jsx"));
const EmpresasPrefeiturasPage = lazy(() => import("./pages/EmpresasPrefeiturasPage.jsx"));
const AnomaliesPage = lazy(() => import("./pages/AnomaliesPage.jsx"));
const RiscoPage = lazy(() => import("./pages/RiscoPage.jsx"));

// Vite: BASE_URL costuma ser "/" ou "/subpath/" (com barra final). React Router: basename sem barra final;
// na raiz omitimos a prop.
const rawBase = String(import.meta.env.BASE_URL || "/").trim() || "/";
const trimmed =
  rawBase.length > 1 && rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;
const routerBasename = trimmed === "/" ? undefined : trimmed;

function RedirectDossieToPolitico() {
  const { id } = useParams();
  const target = id != null && String(id).length ? `/politico/${encodeURIComponent(String(id))}` : "/politica/busca";
  return <Navigate to={target} replace />;
}

function NotFoundPage() {
  return (
    <div className="aurora-page flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-lg font-semibold text-[var(--text-primary)]">Página não encontrada</p>
      <p className="mt-2 max-w-md text-sm text-[var(--text-muted)]">
        A rota não existe nesta versão do site, ou o bundle em produção ainda não inclui esta rota. Faça um
        deploy após o merge mais recente.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="text-sm font-semibold text-[var(--accent-primary)] hover:brightness-110"
        >
          Página inicial
        </Link>
        <span className="text-[var(--text-muted)]">·</span>
        <Link to="/partido" className="text-sm font-semibold text-[var(--accent-primary)] hover:brightness-110">
          Partidos
        </Link>
        <span className="text-[var(--text-muted)]">·</span>
        <Link to="/status" className="text-sm font-semibold text-[var(--accent-primary)] hover:brightness-110">
          Status
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <AuthProvider>
        <CreditosGODProvider>
          <CameraFocusProvider>
            <div id="conteudo-principal" tabIndex={-1} className="outline-none">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/universo" element={<UniversePage />} />
                <Route path="/status" element={<StatusPage />} />
                <Route path="/partido" element={<PartidoPage />} />
                <Route path="/partido/:sigla" element={<PartidoPage />} />
                <Route path="/comercial" element={<Navigate to="/partido" replace />} />
                {/* Painel clássico 17 Bento cards — rota pública de vitrine. */}
                <Route path="/painel" element={<PainelPage />} />
                <Route path="/alvos" element={<Navigate to="/universo" replace />} />
                <Route path="/dashboard" element={<Navigate to="/status" replace />} />
                <Route path="/ranking" element={<Navigate to="/universo" replace />} />
                <Route path="/radar/dossiers" element={<Navigate to="/painel" replace />} />
                <Route path="/radar" element={<Navigate to="/painel" replace />} />
                
                {/* Análises especializadas */}
                <Route path="/gabinete" element={<GabinetePage />} />
                <Route path="/emendas" element={<EmendasPage />} />
                <Route path="/patrimonio" element={<PatrimonioPage />} />
                <Route path="/viagens" element={<ViagensPage />} />
                <Route path="/nepotismo" element={<NepotismoPage />} />
                <Route path="/nepotismo-cruzado" element={<NepotismoCruzadoPage />} />
                <Route path="/empresas-prefeituras" element={<EmpresasPrefeiturasPage />} />
                <Route path="/anomalias" element={<AnomaliesPage />} />
                <Route path="/risco" element={<RiscoPage />} />

                <Route path="/sobre" element={<SobrePage />} />
                <Route path="/metodologia" element={<MetodologiaPage />} />
                <Route path="/termos" element={<TermosPage />} />
                <Route path="/privacidade" element={<PrivacidadePage />} />
                {/* Radar jurídico (INSS / leads): oculto no lançamento — URLs antigas vão ao painel. */}
                <Route path="/radar-legal" element={<Navigate to="/painel" replace />} />
                <Route path="/radar-inss" element={<Navigate to="/painel" replace />} />
                <Route path="/login" element={<LoginPage />} />

                <Route path="/politica/busca" element={<BuscaPage />} />
                <Route path="/busca" element={<Navigate to="/politica/busca" replace />} />
                <Route path="/politica/dossie/:nome" element={<DossieGroundedPage />} />
                {/* /politico/:id — vitrine pública + funil comercial; /dossie/:id redireciona para o mesmo destino. */}
                <Route path="/politico/:id" element={<PoliticoPage />} />
                <Route path="/dossie/:id" element={<RedirectDossieToPolitico />} />
                <Route path="/sucesso" element={<SuccessPage />} />
                <Route path="/logout" element={<LogoutPage />} />

                {/* /creditos é pública: visitante vê os pacotes; login só ao clicar em Comprar */}
                <Route path="/creditos" element={<CreditosPage />} />

                <Route element={<ProtectedRoute />}>
                  <Route element={<DashboardLayout />}>
                    <Route path="/mapa" element={<MapaPage />} />
                    <Route path="/alertas" element={<AlertasPage />} />
                    <Route path="/perfil" element={<PerfilPage />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
            </div>
          </CameraFocusProvider>
        </CreditosGODProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
