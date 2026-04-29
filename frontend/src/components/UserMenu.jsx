import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, User, ChevronDown, LogIn } from "lucide-react";

import { useAuth } from "../context/AuthContext.jsx";
import { signOut } from "../lib/firebase.js";

/**
 * UserMenu — botão com avatar/inicial no header.
 * - Não logado → botão "Entrar"
 * - Logado     → menu suspenso com "Perfil" e "Sair"
 */
export default function UserMenu() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isAuthenticated) {
    return (
      <Link
        to="/login"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
      >
        <LogIn className="size-4" strokeWidth={1.75} />
        Entrar
      </Link>
    );
  }

  const initial = (user?.displayName || user?.email || "?").trim()[0]?.toUpperCase() || "?";
  const label = user?.displayName || user?.email || "Conta";

  async function handleLogout() {
    setOpen(false);
    try {
      await signOut();
    } finally {
      navigate("/", { replace: true });
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-[#7DD3FC]/15 font-mono text-xs font-bold text-[#7DD3FC]">
          {initial}
        </span>
        <span className="hidden max-w-[140px] truncate sm:inline">{label}</span>
        <ChevronDown className="size-3.5" strokeWidth={2} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-56 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-deep)] shadow-[0_18px_60px_rgba(0,0,0,0.5)]"
        >
          <div className="border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {label}
            </div>
            {user?.email && user?.displayName ? (
              <div className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-muted)]">
                {user.email}
              </div>
            ) : null}
          </div>
          <Link
            to="/perfil"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            role="menuitem"
          >
            <User className="size-4" strokeWidth={1.75} />
            Perfil
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[#fb7185] transition hover:bg-[#fb7185]/10"
            role="menuitem"
          >
            <LogOut className="size-4" strokeWidth={1.75} />
            Sair da conta
          </button>
        </div>
      ) : null}
    </div>
  );
}
