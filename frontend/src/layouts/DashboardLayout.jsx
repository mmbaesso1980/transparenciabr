import {
  Activity,
  Coins,
  Hexagon,
  LayoutDashboard,
  Radar,
  Shield,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import BrandLogo from "../components/BrandLogo.jsx";
import CreditosGOD from "../components/CreditosGOD.jsx";
import GlobalSearch from "../components/GlobalSearch.jsx";

const navTabClass = ({ isActive }) =>
  [
    "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] ring-1 ring-[var(--border-subtle)]"
      : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/80 hover:text-[var(--text-primary)]",
  ].join(" ");

export default function DashboardLayout() {
  return (
    <div className="flex min-h-dvh bg-[var(--bg-void)] text-[var(--text-primary)]">
      <aside
        className="fixed left-0 top-0 z-40 flex h-full w-14 shrink-0 flex-col items-center gap-3 border-r border-[var(--border-subtle)] bg-[var(--bg-deep)]/95 py-6 backdrop-blur-md md:w-16"
        aria-label="Navegação principal"
      >
        <NavLink
          to="/dashboard"
          title="Operações"
          className={({ isActive }) =>
            [
              "flex size-10 items-center justify-center rounded-xl border transition-colors",
              isActive
                ? "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]"
                : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
            ].join(" ")
          }
          end={false}
        >
          <LayoutDashboard className="size-[1.35rem]" strokeWidth={1.75} />
        </NavLink>
        <NavLink
          to="/creditos"
          title="Créditos"
          className={({ isActive }) =>
            [
              "flex size-10 items-center justify-center rounded-xl border transition-colors",
              isActive
                ? "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]"
                : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
            ].join(" ")
          }
        >
          <Coins className="size-[1.35rem]" strokeWidth={1.75} />
        </NavLink>
        <NavLink
          to="/ranking"
          title="Entidades"
          className={({ isActive }) =>
            [
              "flex size-10 items-center justify-center rounded-xl border transition-colors",
              isActive
                ? "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]"
                : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
            ].join(" ")
          }
        >
          <Radar className="size-[1.35rem]" strokeWidth={1.75} />
        </NavLink>
        <NavLink
          to="/login"
          title="Sessão"
          className={({ isActive }) =>
            [
              "flex size-10 items-center justify-center rounded-xl border transition-colors",
              isActive
                ? "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]"
                : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
            ].join(" ")
          }
        >
          <Shield className="size-[1.35rem]" strokeWidth={1.75} />
        </NavLink>
        <div className="mt-auto flex flex-col gap-3 opacity-80">
          <span className="flex size-10 items-center justify-center rounded-xl text-[var(--text-muted)]">
            <Hexagon className="size-[1.15rem]" strokeWidth={1.5} />
          </span>
          <span className="flex size-10 items-center justify-center rounded-xl text-[var(--text-muted)]">
            <Activity className="size-[1.15rem]" strokeWidth={1.5} />
          </span>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col overflow-x-hidden pl-14 md:pl-16">
        <header className="sticky top-0 z-30 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-deep)]/92 px-4 py-2 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <BrandLogo
              to="/dashboard"
              variant="dark"
              size="md"
              withGlow
              className="hidden md:flex"
            />
            <div className="min-w-0 max-w-xl flex-1">
              <GlobalSearch />
            </div>
          </div>
          <nav
            className="flex flex-wrap items-center gap-2 sm:gap-3"
            aria-label="Secções do painel"
          >
            <CreditosGOD />
            <NavLink to="/dashboard" className={navTabClass}>
              Operações
            </NavLink>
            <NavLink to="/ranking" className={navTabClass}>
              Entidades
            </NavLink>
            <NavLink to="/mapa" className={navTabClass}>
              Mapa
            </NavLink>
            <NavLink to="/alertas" className={navTabClass}>
              Alertas
            </NavLink>
            <NavLink to="/creditos" className={navTabClass}>
              Financeiro
            </NavLink>
            <NavLink to="/radar/dossiers" className={navTabClass}>
              Análise de risco
            </NavLink>
            <NavLink to="/dashboard" className={navTabClass}>
              Relatórios
            </NavLink>
          </nav>
        </header>

        <main className="min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
