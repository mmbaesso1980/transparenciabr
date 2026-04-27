import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { signOut } from "../lib/firebase.js";

/**
 * Bloco de autenticação para barras de navegação:
 * - Não logado: botão "Acesso Restrito" → /login.
 * - Logado: botão "Ir para o Painel" + botão discreto "Sair".
 *
 * Estilo alinhado ao Dark Mode SOC do projeto (paleta #0D1117 / #58A6FF).
 */
export default function AuthNavButtons({ panelTo = "/dashboard" }) {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <span
        className="inline-flex h-9 w-32 animate-pulse items-center justify-center rounded-xl border border-[#30363D] bg-[#0D1117]/60"
        aria-hidden
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <Link
        to="/login"
        className="inline-flex items-center gap-2 rounded-xl border border-[#58A6FF]/40 bg-[#58A6FF]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#9CCBFF] transition hover:border-[#58A6FF]/70 hover:bg-[#58A6FF]/20 hover:text-[#F0F4FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58A6FF]"
        title="Entrar com Google ou e-mail/senha"
      >
        <ShieldCheck className="size-3.5" strokeWidth={1.9} />
        <span>Acesso Restrito</span>
      </Link>
    );
  }

  async function handleLogout() {
    try {
      await signOut();
    } catch {
      /* ignore */
    }
    navigate("/", { replace: true });
  }

  const displayName =
    user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "operador";

  return (
    <div className="flex items-center gap-2">
      <Link
        to={panelTo}
        className="inline-flex items-center gap-2 rounded-xl border border-[#30363D] bg-[#21262D] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F0F4FC] transition hover:border-[#58A6FF]/50 hover:bg-[#30363D]"
        title={`Continuar como ${displayName}`}
      >
        <LogIn className="size-3.5" strokeWidth={1.9} />
        <span>Ir para o Painel</span>
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="inline-flex items-center gap-1.5 rounded-xl border border-transparent px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8B949E] transition hover:border-[#30363D] hover:bg-[#0D1117] hover:text-[#F0F4FC]"
        title={`Sair (${user?.email || "sessão atual"})`}
      >
        <LogOut className="size-3.5" strokeWidth={1.9} />
        <span className="hidden sm:inline">Sair</span>
      </button>
    </div>
  );
}
