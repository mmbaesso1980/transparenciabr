import { Helmet } from "react-helmet-async";
import { Navigate } from "react-router-dom";

import IncidentLog from "../components/IncidentLog.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useUserCredits } from "../hooks/useUserCredits.js";
import RouteFallback from "../components/RouteFallback.jsx";

/**
 * M11 — visualização restrita do log de incidentes (Firestore ``maestro_incident_log``).
 * Requer sessão autenticada com ``god_mode`` (claims) — alinhado às regras Firestore.
 */
export default function IncidentLogPage() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { godMode, credits } = useUserCredits();

  if (authLoading || credits === null) {
    return <RouteFallback />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!godMode) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Acesso reservado à operação privilegiada (god_mode).</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Helmet>
        <title>Incident log — TransparênciaBR</title>
      </Helmet>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Log de incidentes (M11)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ordenação por severidade (CRITICAL primeiro). Filtro por estado.
        </p>
      </header>
      <IncidentLog />
    </div>
  );
}
