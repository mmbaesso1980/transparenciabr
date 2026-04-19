import {
  Activity,
  Hexagon,
  LayoutDashboard,
  Radar,
  Shield,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import GlobalSearch from "../components/GlobalSearch.jsx";

const navTabClass = ({ isActive }) =>
  [
    "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-[#21262D] text-[#F0F4FC]"
      : "text-[#8B949E] hover:bg-[#21262D]/60 hover:text-[#F0F4FC]",
  ].join(" ");

export default function DashboardLayout() {
  return (
    <div className="flex min-h-dvh bg-[#080B14] text-[#F0F4FC]">
      <aside
        className="fixed left-0 top-0 z-40 flex h-full w-14 flex-col items-center gap-3 border-r border-[#30363D] bg-[#0D1117]/95 py-6 backdrop-blur-md md:w-16"
        aria-label="Navegação principal"
      >
        <NavLink
          to="/dossie/teste"
          title="Painel operacional"
          className={({ isActive }) =>
            [
              "flex size-10 items-center justify-center rounded-xl border transition-colors",
              isActive
                ? "border-[#30363D] bg-[#21262D] text-[#58A6FF]"
                : "border-transparent text-[#8B949E] hover:bg-[#21262D] hover:text-[#F0F4FC]",
            ].join(" ")
          }
          end={false}
        >
          <LayoutDashboard className="size-[1.35rem]" strokeWidth={1.75} />
        </NavLink>
        <NavLink
          to="/ranking"
          title="Inteligência aberta"
          className={({ isActive }) =>
            [
              "flex size-10 items-center justify-center rounded-xl border transition-colors",
              isActive
                ? "border-[#30363D] bg-[#21262D] text-[#58A6FF]"
                : "border-transparent text-[#8B949E] hover:bg-[#21262D] hover:text-[#F0F4FC]",
            ].join(" ")
          }
        >
          <Radar className="size-[1.35rem]" strokeWidth={1.75} />
        </NavLink>
        <NavLink
          to="/login"
          title="Acesso restrito"
          className={({ isActive }) =>
            [
              "flex size-10 items-center justify-center rounded-xl border transition-colors",
              isActive
                ? "border-[#30363D] bg-[#21262D] text-[#58A6FF]"
                : "border-transparent text-[#8B949E] hover:bg-[#21262D] hover:text-[#F0F4FC]",
            ].join(" ")
          }
        >
          <Shield className="size-[1.35rem]" strokeWidth={1.75} />
        </NavLink>
        <div className="mt-auto flex flex-col gap-3 opacity-80">
          <span className="flex size-10 items-center justify-center rounded-xl text-[#484F58]">
            <Hexagon className="size-[1.15rem]" strokeWidth={1.5} />
          </span>
          <span className="flex size-10 items-center justify-center rounded-xl text-[#484F58]">
            <Activity className="size-[1.15rem]" strokeWidth={1.5} />
          </span>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col pl-14 md:pl-16">
        <header className="sticky top-0 z-30 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[#30363D] bg-[#080B14]/90 px-4 py-2 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <span className="hidden shrink-0 font-semibold tracking-tight text-[#F0F4FC] md:inline">
              Centro de Operações
            </span>
            <div className="min-w-0 max-w-xl flex-1">
              <GlobalSearch />
            </div>
          </div>
          <nav
            className="flex flex-wrap items-center gap-1 sm:gap-2"
            aria-label="Secções do painel"
          >
            <NavLink to="/dossie/teste" className={navTabClass}>
              Overview
            </NavLink>
            <NavLink to="/ranking" className={navTabClass}>
              Entities
            </NavLink>
            <NavLink to="/login" className={navTabClass}>
              Financials
            </NavLink>
            <NavLink to="/dossie/teste" className={navTabClass}>
              Risk Analysis
            </NavLink>
          </nav>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
