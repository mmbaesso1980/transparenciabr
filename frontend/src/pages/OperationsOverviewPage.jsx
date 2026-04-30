import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Database,
  Gauge,
  LayoutGrid,
  Radar,
  Shield,
  Workflow,
} from "lucide-react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { INVESTIGATION_CATEGORIES } from "../constants/investigationCategories.js";
import {
  fetchAlertasBodesRecent,
  fetchPoliticosCollection,
  getFirebaseApp,
} from "../lib/firebase.js";
import { ONE_DAY_MS } from "../lib/queryClient.js";
import { pickNome, pickRiskScore } from "../utils/dataParsers.js";

const ENGINE_STEPS = [
  {
    id: "00-02",
    title: "Ingestao + ETL",
    text: "PNCP, emendas e contratos em NDJSON, com purificacao LGPD e carga batch no BigQuery.",
    status: "operacional",
  },
  {
    id: "05-06",
    title: "OCR + Oraculo",
    text: "Document AI OCR e Gemini 2.5 Pro (Vertex, agent_1777236402725) em JSON estrito para auditoria semantica.",
    status: "implantado",
  },
  {
    id: "15",
    title: "BQML preditivo",
    text: "K-Means para empresas de fachada e ARIMA_PLUS para surtos temporais de gasto.",
    status: "treino noturno",
  },
  {
    id: "17",
    title: "Ponte Firestore",
    text: "Desnormalizacao extrema em transparency_reports para leitura direta pelo front-end.",
    status: "cache 24h",
  },
];

function fmtInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtRisk(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("pt-BR");
}

function severityWeight(row) {
  const raw = String(row?.severidade ?? row?.criticidade ?? row?.nivel_risco ?? "").toUpperCase();
  if (raw.includes("CRIT") || raw.includes("NIVEL_5")) return 100;
  if (raw.includes("ALTO") || raw.includes("NIVEL_4")) return 78;
  if (raw.includes("MED") || raw.includes("NIVEL_3")) return 52;
  if (raw.includes("BAIX") || raw.includes("NIVEL_2")) return 25;
  return 40;
}

function buildDashboardStats(politicos, alertas) {
  const rows = Array.isArray(politicos) ? politicos : [];
  const alerts = Array.isArray(alertas) ? alertas : [];
  const riskValues = rows
    .map((row) => Number(pickRiskScore(row)))
    .filter((value) => Number.isFinite(value));
  const avgPoliticalRisk =
    riskValues.length > 0
      ? riskValues.reduce((acc, value) => acc + value, 0) / riskValues.length
      : null;
  const avgAlertRisk =
    alerts.length > 0
      ? alerts.reduce((acc, row) => acc + severityWeight(row), 0) / alerts.length
      : null;
  const topEntities = [...rows]
    .map((row) => ({
      id: String(row?.id ?? "").trim(),
      nome: pickNome(row) || String(row?.id ?? "Entidade"),
      risk: Number(pickRiskScore(row)),
    }))
    .filter((row) => row.id)
    .sort((a, b) => (Number.isFinite(b.risk) ? b.risk : -1) - (Number.isFinite(a.risk) ? a.risk : -1))
    .slice(0, 5);

  return {
    totalPoliticos: rows.length,
    totalAlertas: alerts.length,
    avgRisk: avgAlertRisk ?? avgPoliticalRisk,
    topEntities,
    latestAlerts: alerts.slice(0, 4),
  };
}

/**
 * Centro de operacoes (SOC) — resumo do pipeline e dos dados ja sincronizados.
 */
export default function OperationsOverviewPage() {
  const firebaseReady = Boolean(getFirebaseApp());

  const politicosQuery = useQuery({
    queryKey: ["dashboard", "politicos"],
    queryFn: fetchPoliticosCollection,
    enabled: firebaseReady,
    staleTime: ONE_DAY_MS,
    gcTime: 2 * ONE_DAY_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const alertasQuery = useQuery({
    queryKey: ["dashboard", "alertas_bodes", 80],
    queryFn: () => fetchAlertasBodesRecent(80),
    enabled: firebaseReady,
    staleTime: ONE_DAY_MS,
    gcTime: 2 * ONE_DAY_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const loading = firebaseReady && (politicosQuery.isLoading || alertasQuery.isLoading);
  const stats = useMemo(
    () => buildDashboardStats(politicosQuery.data, alertasQuery.data),
    [politicosQuery.data, alertasQuery.data],
  );
  const dataError = politicosQuery.error || alertasQuery.error;

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
              Cockpit situacional do A.S.M.O.D.E.U.S.: ingestao, OCR, analise
              semantica, BQML e sincronizacao Firestore em uma unica linha de
              comando visual.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[#30363D] bg-[#0D1117]/80 px-3 py-2 text-xs text-[#3fb950]">
            <Activity className="size-4" strokeWidth={1.75} aria-hidden />
            <span className="font-mono">
              {firebaseReady ? "SYSTEM STATUS: OPERATIONAL" : "SYSTEM STATUS: FRONT-END ONLY"}
            </span>
          </div>
        </header>

        <section
          id="auditoria"
          className="scroll-mt-24 rounded-2xl border border-[#30363D]/80 bg-[#0D1117]/50 p-5 shadow-[0_18px_48px_rgba(0,0,0,0.35)]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
            Frentes de auditoria
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-[#F0F4FC]">
            Atalhos do Universo
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#8B949E]">
            Âncoras a partir do grafo 3D. Cada cartão abre o ranking na frente correspondente.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INVESTIGATION_CATEGORIES.map((cat) => (
              <li key={cat.seed} id={cat.dashboardHash} className="scroll-mt-28">
                <Link
                  to={cat.to}
                  className="flex h-full flex-col rounded-xl border border-[#21262D] bg-[#080B14]/80 p-4 transition hover:border-[#58A6FF]/40 hover:bg-[#0D1117]/90"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#58A6FF]">
                    {cat.label}
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold text-[#F0F4FC]">{cat.headline}</p>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[#8B949E]">{cat.body}</p>
                  <span className="mt-3 text-[11px] font-semibold text-[#7DD3FC]">{cat.cta} →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8B949E]">
                Entidades monitoradas
              </p>
              <Database className="size-4 text-[#58A6FF]" strokeWidth={1.75} />
            </div>
            <p className="mt-3 font-mono text-3xl text-[#58A6FF]">
              {loading ? "..." : fmtInt(stats.totalPoliticos)}
            </p>
            <p className="mt-2 text-xs text-[#8B949E]">
              Leitura cacheada da colecao <code>politicos</code> para ranking e busca.
            </p>
          </div>
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8B949E]">
                Alertas consolidados
              </p>
              <AlertTriangle className="size-4 text-[#f85149]" strokeWidth={1.75} />
            </div>
            <p className="mt-3 font-mono text-3xl text-[#f85149]">
              {loading ? "..." : fmtInt(stats.totalAlertas)}
            </p>
            <p className="mt-2 text-xs text-[#8B949E]">
              Amostra recente de <code>alertas_bodes</code> com limite de leitura.
            </p>
          </div>
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8B949E]">
                Risco agregado
              </p>
              <Gauge className="size-4 text-[#f97316]" strokeWidth={1.75} />
            </div>
            <p className="mt-3 font-mono text-3xl text-[#f97316]">
              {loading ? "..." : fmtRisk(stats.avgRisk)}
            </p>
            <p className="mt-2 text-xs text-[#8B949E]">
              Media heuristica de severidade/indices disponiveis no Firestore.
            </p>
          </div>
        </section>

        {dataError ? (
          <div className="rounded-2xl border border-[#f85149]/35 bg-[#f85149]/10 px-4 py-3 text-sm text-[#fecaca]">
            Falha parcial ao consultar Firestore:{" "}
            {dataError instanceof Error ? dataError.message : String(dataError)}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-4">
          {ENGINE_STEPS.map((step) => (
            <article
              key={step.id}
              className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] text-[#58A6FF]">ENGINE {step.id}</p>
                  <h2 className="mt-1 text-sm font-semibold text-[#F0F4FC]">{step.title}</h2>
                </div>
                <CheckCircle2 className="size-4 text-[#3fb950]" strokeWidth={1.75} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#8B949E]">{step.text}</p>
              <p className="mt-4 rounded-lg border border-[#30363D] bg-[#080B14]/80 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#C9D1D9]">
                {step.status}
              </p>
            </article>
          ))}
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
                  Dossie exemplo (substitua o ID)
                </Link>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-5">
            <div className="flex items-center gap-2">
              <Bell className="size-5 text-[#f85149]" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold tracking-tight">Alertas recentes</h2>
            </div>
            {stats.latestAlerts.length === 0 ? (
              <p className="mt-4 text-sm leading-relaxed text-[#8B949E]">
                Nenhum alerta recente carregado. Execute a sincronizacao BigQuery - Firestore
                ou consulte o ranking enquanto a base e populada.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[#21262D]">
                {stats.latestAlerts.map((alert, index) => (
                  <li key={alert?.id ?? index} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-[#21262D] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#f85149]">
                        {String(alert?.tipo_risco ?? alert?.tipo ?? "alerta")}
                      </span>
                      <span className="font-mono text-[10px] text-[#8B949E]">
                        {String(alert?.severidade ?? alert?.criticidade ?? "")}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#C9D1D9]">
                      {String(alert?.mensagem ?? alert?.trecho ?? "Alerta sem descricao.")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-5 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Radar className="size-5 text-[#a371f7]" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold tracking-tight">Entidades prioritarias</h2>
            </div>
            {stats.topEntities.length === 0 ? (
              <p className="mt-4 text-sm text-[#8B949E]">
                Aguardando indices de risco nos documentos. A pagina continua funcional para
                navegação e operacao do pipeline.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[#21262D]">
                {stats.topEntities.map((entity) => (
                  <li key={entity.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#F0F4FC]">{entity.nome}</p>
                      <p className="font-mono text-[11px] text-[#8B949E]">{entity.id}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-[#f97316]">{fmtRisk(entity.risk)}</span>
                      <Link
                        className="rounded-lg border border-[#30363D] bg-[#21262D] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#58A6FF] hover:border-[#58A6FF]/50"
                        to={`/dossie/${encodeURIComponent(entity.id)}`}
                      >
                        Dossie
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-5">
            <div className="flex items-center gap-2">
              <Workflow className="size-5 text-[#3fb950]" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold tracking-tight">Proxima carga</h2>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[#8B949E]">
              Para popular completamente os Bento Boxes: execute Engine 00/02, rode OCR/Oraculo
              quando houver PDFs, treine Engine 15 e finalize com Engine 17.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-[#8B949E]">
              <Shield className="size-4 text-[#8B949E]" strokeWidth={1.5} aria-hidden />
              <span>LGPD, cache 24h e Security Rules ativos.</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
