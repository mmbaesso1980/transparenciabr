import { Activity, CheckCircle2, Server, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import BrandLogo from "../components/BrandLogo.jsx";
import useLandingKPIs from "../hooks/useLandingKPIs.js";

const SPRINT_STATUS_URL = "/api/sprint/status";

const STAT_IDS = ["ceap", "patrimonio", "gabinete", "viagens", "emendas", "contratos"];

const STAT_LABELS = {
  ceap: "CEAP classificado",
  patrimonio: "Patrimônio (outliers)",
  gabinete: "Gabinete / vínculos",
  viagens: "Viagens / passagens",
  emendas: "Emendas",
  contratos: "Contratos / PNCP",
};

export default function StatusPage() {
  const { headlines, lastUpdated, isFresh, error: kpiError } = useLandingKPIs();
  const [loading, setLoading] = useState(true);
  const [sprintError, setSprintError] = useState(null);
  const [sprintPayload, setSprintPayload] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSprintError(null);
    fetch(SPRINT_STATUS_URL, { headers: { Accept: "application/json" } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!cancelled) setSprintPayload(j);
      })
      .catch((e) => {
        if (!cancelled) setSprintError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatedLabel = lastUpdated
    ? (() => {
        try {
          return new Date(lastUpdated).toLocaleString("pt-BR");
        } catch {
          return String(lastUpdated);
        }
      })()
    : "—";

  return (
    <div className="min-h-dvh bg-[#080B14] px-4 py-10 text-[#F0F4FC] sm:px-8">
      <Helmet>
        <title>Status operacional — TransparênciaBR</title>
        <meta
          name="description"
          content="Indicadores estáticos do datalake e saúde da API de sprint — sem WebGL."
        />
      </Helmet>

      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex flex-wrap items-start justify-between gap-4 border-b border-[#30363D] pb-6">
          <div>
            <BrandLogo to="/" variant="full" size="md" />
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
              Status operacional
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">TransparênciaBR — visão estática</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#8B949E]">
              Mesma linha de métricas da landing, sem animação 3D. Dados via{" "}
              <span className="font-mono text-[#58A6FF]">getDashboardKPIs</span> (cache 1h no cliente).
            </p>
            <p className="mt-2 font-mono text-[11px] text-[#484F58]">
              Última atualização KPIs: {updatedLabel}
              {isFresh ? " · cache válido" : ""}
              {kpiError ? ` · aviso: ${kpiError}` : ""}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Link
              to="/universo"
              className="rounded-lg border border-[#30363D] px-3 py-2 text-center text-sm text-[#58A6FF] hover:border-[#58A6FF]/50"
            >
              Universo 3D →
            </Link>
            <Link
              to="/alertas"
              className="rounded-lg border border-[#30363D] px-3 py-2 text-center text-sm text-[#8B949E] hover:border-[#58A6FF]/40"
            >
              SOC Alertas →
            </Link>
          </div>
        </header>

        <section className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STAT_IDS.map((id) => (
            <div
              key={id}
              className="rounded-2xl border border-[#30363D] bg-[#0D1117]/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8B949E]">
                {STAT_LABELS[id]}
              </p>
              <p className="mt-2 font-mono text-lg font-semibold text-[#58A6FF]">{headlines[id]}</p>
            </div>
          ))}
        </section>

        <section className="glass-card rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl border border-[#30363D] bg-[#161B22]">
              <Server className="size-6 text-[#58A6FF]" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#C9D1D9]">
                API sprint
              </h2>
              <p className="font-mono text-xs text-[#8B949E]">{SPRINT_STATUS_URL}</p>
            </div>
          </div>

          {loading ? (
            <div className="mt-8 flex items-center gap-3 text-sm text-[#8B949E]">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#30363D] border-t-[#58A6FF]" />
              A consultar…
            </div>
          ) : sprintError ? (
            <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
              <div className="flex items-start gap-2">
                <Wifi className="mt-0.5 size-5 shrink-0 text-amber-400" strokeWidth={1.75} />
                <div>
                  <p className="font-semibold text-amber-200">Sprint API indisponível</p>
                  <p className="mt-1 font-mono text-xs text-amber-100/90">{sprintError}</p>
                  <p className="mt-3 text-xs leading-relaxed text-[#8B949E]">
                    Os KPIs acima continuam a funcionar pelo datalake. Verifique rewrites do Hosting.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="size-5" strokeWidth={1.75} />
                <span className="text-sm font-medium">Resposta recebida</span>
              </div>
              <pre className="max-h-[40vh] overflow-auto rounded-lg border border-[#21262D] bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-[#C9D1D9]">
                {JSON.stringify(sprintPayload, null, 2)}
              </pre>
            </div>
          )}
        </section>

        <section className="mt-8 flex items-start gap-3 rounded-xl border border-[#30363D]/80 bg-[#0D1117]/50 p-4 text-sm text-[#8B949E]">
          <Activity className="size-5 shrink-0 text-[#58A6FF]" strokeWidth={1.75} />
          <p>
            Missão SOC: feed em tempo real em{" "}
            <Link to="/alertas" className="font-semibold text-[#58A6FF] hover:underline">
              /alertas
            </Link>{" "}
            (área autenticada).
          </p>
        </section>
      </div>
    </div>
  );
}
