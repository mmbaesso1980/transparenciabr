import { Coins, Lock } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { useCreditosGOD } from "../context/CreditosGODContext.jsx";

/**
 * HUD global de créditos A.S.M.O.D.E.U.S. — Modo GOD.
 * Não autenticado: cadeado. Autenticado: saldo de créditos.
 */
export default function CreditosGOD({ className = "" }) {
  const { isAuthenticated, loading } = useAuth();
  const { saldo } = useCreditosGOD();

  if (loading) {
    return (
      <div
        className={`inline-flex h-9 min-w-[7rem] items-center justify-center rounded-lg border border-[#30363D]/80 bg-[#0D1117]/60 px-3 text-xs text-[#8B949E] ${className}`}
        aria-hidden
      >
        …
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Link
        to="/login"
        className={`inline-flex h-9 items-center gap-2 rounded-lg border border-amber-500/40 bg-[#0D1117]/75 px-3 text-xs font-semibold uppercase tracking-wide text-amber-200/90 shadow-[0_0_20px_rgba(245,158,11,0.12)] backdrop-blur-md transition hover:border-amber-400/60 hover:text-amber-100 ${className}`}
        title="Inicie sessão para aceder ao Modo GOD e créditos"
      >
        <Lock className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
        <span className="hidden sm:inline">Créditos</span>
      </Link>
    );
  }

  return (
    <div
      className={`inline-flex h-9 items-center gap-2 rounded-lg border border-[#58A6FF]/35 bg-[#0D1117]/80 px-3 text-xs font-data font-semibold text-[#E6EDF3] shadow-[0_0_24px_rgba(88,166,255,0.15)] backdrop-blur-md ${className}`}
      title="Saldo de créditos — protocolo A.S.M.O.D.E.U.S."
    >
      <Coins className="size-3.5 shrink-0 text-[#FBD87F]" strokeWidth={2} aria-hidden />
      <span>
        {saldo.toLocaleString("pt-BR")} <span className="text-[#8B949E]">Cr</span>
      </span>
    </div>
  );
}
