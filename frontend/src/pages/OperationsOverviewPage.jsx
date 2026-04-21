import { Activity, Bell, LayoutGrid, Shield } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Centro de operações (SOC) — vista resumo; dados reais entram via Firestore/BQ nos próximos ciclos.
 */
export default function OperationsOverviewPage() {
  return (
    <div className="min-h-full bg-[#080B14] px-4 py-6 text-[#F0F4FC] sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#30363D] pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
              Motor Forense TransparênciaBR
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Centro de Operações
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[#8B949E]">
              Painel situacional para ranking, dossiês e alertas forenses. Integração completa com
              BigQuery e Firestore na pipeline noturna.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[#30363D] bg-[#0D1117]/80 px-3 py-2 text-xs text-[#3fb950]">
            <Activity className="size-4" strokeWidth={1.75} aria-hidden />
            <span className="font-mono">SYSTEM STATUS: OPERATIONAL</span>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8B949E]">
              Status
            </p>
            <p className="mt-3 font-mono text-3xl text-[#3fb950]">100%</p>
            <p className="mt-2 text-xs text-[#8B949E]">Motores agendados via CI / Cloud Build.</p>
          </div>
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8B949E]">
              PHRNOKA / IPROL
            </p>
            <p className="mt-3 font-mono text-3xl text-[#58A6FF]">87.4%</p>
            <p className="mt-2 text-xs text-[#8B949E]">
              Indicador operacional ilustrativo até ligação ao DataPulse.
            </p>
          </div>
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8B949E]">
              Risco agregado
            </p>
            <p className="mt-3 font-mono text-3xl text-[#f97316]">—</p>
            <p className="mt-2 text-xs text-[#8B949E]">
              Depende dos alertas em <code className="text-[#58A6FF]">alertas_bodes</code>.
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-5">
            <div className="flex items-center gap-2">
              <LayoutGrid className="size-5 text-[#58A6FF]" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold tracking-tight">Atalhos</h2>
            </div>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              <li>
                <Link
                  className="text-[#58A6FF] underline-offset-4 hover:underline"
                  to="/ranking"
                >
                  Ranking nacional (entidades)
                </Link>
              </li>
              <li>
                <Link
                  className="text-[#58A6FF] underline-offset-4 hover:underline"
                  to="/mapa"
                >
                  Mapa da fraude (UF + PMTiles)
                </Link>
              </li>
              <li>
                <Link
                  className="text-[#58A6FF] underline-offset-4 hover:underline"
                  to="/alertas"
                >
                  Alertas recentes (Firestore)
                </Link>
              </li>
              <li>
                <Link
                  className="text-[#58A6FF] underline-offset-4 hover:underline"
                  to="/dossie/teste"
                >
                  Dossiê exemplo (substitua o ID)
                </Link>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-5">
            <div className="flex items-center gap-2">
              <Bell className="size-5 text-[#f85149]" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold tracking-tight">Alertas recentes</h2>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[#8B949E]">
              Consumir a coleção <span className="font-mono text-[#C9D1D9]">alertas_bodes</span>{" "}
              depois da sincronização BigQuery → Firestore (
              <span className="font-mono text-[#a371f7]">engines/05_sync_bodes.py</span>
              ).
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-[#8B949E]">
              <Shield className="size-4 text-[#8B949E]" strokeWidth={1.5} aria-hidden />
              <span>I.R.O.N.M.A.N. · LGPD Shield disponível em pipeline.</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
