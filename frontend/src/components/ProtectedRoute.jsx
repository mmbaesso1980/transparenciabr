import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import RouteFallback from "./RouteFallback.jsx";

/**
 * Guarda de rota: bloqueia rotas internas até que o utilizador esteja
 * autenticado de forma não-anónima (Google ou email/senha).
 *
 * Sessões anónimas legadas são tratadas como não autenticadas para efeitos
 * de UI: continuam válidas para Firestore (alguns endpoints públicos
 * dependem delas) mas não dão acesso a /deputy, /dossie, etc.
 */
export default function ProtectedRoute() {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return <RouteFallback />;
  }

  if (!isAuthenticated) {
    const redirectTo = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: redirectTo }}
      />
    );
  }

  return <Outlet />;
}
