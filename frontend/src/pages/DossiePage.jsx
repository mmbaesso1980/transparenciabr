import {
  AlertTriangle,
  BarChart3,
  Globe,
  Radar,
  Share2,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useParams } from "react-router-dom";

import AsmodeusGauge from "../components/AsmodeusGauge.jsx";
import GaugeSkeleton from "../components/GaugeSkeleton.jsx";
import BrazilHeatmap from "../components/BrazilHeatmap.jsx";
import NetworkGraph from "../components/NetworkGraph.jsx";
import PremiumGate from "../components/PremiumGate.jsx";
import { useUserCredits } from "../hooks/useUserCredits.js";
import {
  fetchAlertasForPolitico,
  fetchPoliticoById,
  getFirebaseApp,
} from "../lib/firebase.ts";

const PREMIUM_ANALYSIS_CREDITS = Number(
  import.meta.env.VITE_PREMIUM_ANALYSIS_CREDITS ?? 200,
);

function pickNome(data) {
  if (!data || typeof data !== "object") return "";
  const v =
    data.nome ?? data.nome_completo ?? data.apelido_publico ?? data.apelido;
  return typeof v === "string" ? v.trim() : "";
}

function pickGraphPayload(data) {
  if (!data || typeof data !== "object") return null;
  const g =
    data.grafo_rede ??
    data.rede_entidades ??
    data.graph_network ??
    data.network_graph ??
    data.grafo;
  return g && typeof g === "object" ? g : null;
}

function pickRiskScore(data) {
  if (!data || typeof data !== "object") return null;
  const keys = [
    "indice_risco",
    "score_exposicao",
    "risk_score",
    "score",
    "indice_benford",
    "risco_estatistico",
    "indice_correlacao_idh",
    "score_correlacao_socioeconomica",
    "indice_correlacao_gastos_idh",
    "asmodeus",
  ];
  for (const k of keys) {
    const n = Number(data[k]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickPhotoUrl(data) {
  if (!data || typeof data !== "object") return "";
  const u =
    data.foto_url ??
    data.url_foto ??
    data.foto ??
    data.imagem_url ??
    data.imagem;
  return typeof u === "string" ? u.trim() : "";
}

function absolutizeMediaUrl(u) {
  if (!u || typeof u !== "string") return undefined;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (typeof window === "undefined") return u;
  if (u.startsWith("/")) return `${window.location.origin}${u}`;
  return `${window.location.origin}/${u}`;
}

function pickInvestigations(data) {
  if (!data || typeof data !== "object") return [];
  const raw =
    data.investigacoes_top ?? data.top_investigacoes ?? data.investigacoes;
  return Array.isArray(raw) ? raw : [];
}

function normalizeInvestigationRow(row, idx) {
  if (!row || typeof row !== "object") return null;
  const ref =
    row.ref ?? row.codigo ?? row.id ?? String(idx + 1).padStart(4, "0");
  const titulo =
    row.titulo ?? row.nome ?? row.descricao ?? row.objeto ?? "—";
  const foco = row.foco ?? row.tipo ?? row.tema ?? "";
  const valor = Number(row.valor ?? row.gasto_total ?? row.valor_aprovado);
  const teto = Number(row.teto ?? row.limite ?? row.teto_orcamento);
  let progressPct = null;
  if (Number.isFinite(valor) && Number.isFinite(teto) && teto > 0) {
    progressPct = Math.min(100, Math.max(0, (valor / teto) * 100));
  } else {
    const p = Number(row.percentual ?? row.exposicao ?? row.score);
    if (Number.isFinite(p)) progressPct = Math.min(100, Math.max(0, p));
  }
  return {
    ref: String(ref),
    titulo: String(titulo),
    foco: String(foco),
    progressPct,
    valorLabel:
      Number.isFinite(valor) && valor > 0
        ? valor.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            maximumFractionDigits: 0,
          })
        : null,
  };
}

function normalizeAlertRow(row) {
  if (!row || typeof row !== "object") return null;
  const tipo = row.tipo ?? row.tipo_risco ?? row.categoria ?? "Classificação";
  const trecho =
    row.mensagem ??
    row.texto ??
    row.justificativa ??
    row.resumo ??
    row.trecho ??
    "—";
  const severidade = row.severidade ?? row.nivel ?? row.gravidade ?? "";
  return {
    tipo: String(tipo),
    trecho: String(trecho),
    severidade: String(severidade),
  };
}

function PanelSkeleton() {
  return (
    <div className="min-h-full animate-pulse bg-[#080B14] pb-10">
      <div className="border-b border-[#30363D] px-6 py-5">
        <div className="h-3 w-40 rounded bg-[#21262D]" />
        <div className="mt-4 h-8 w-72 max-w-full rounded bg-[#21262D]" />
      </div>
      <div className="grid grid-cols-12 gap-4 p-6">
        {[1, 2, 3, 4, 5].map((k) => (
          <div
            key={k}
            className={`glass dashboard-panel col-span-12 rounded-xl bg-[#0D1117]/80 ${
              k <= 3
                ? "h-96 lg:col-span-4"
                : k === 4
                  ? "h-80 lg:col-span-7"
                  : "h-80 lg:col-span-5"
            }`}
          >
            <div className="h-full rounded-lg bg-[#21262D]/40" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Section4Placeholder() {
  return (
    <div className="grid gap-4 text-left text-sm leading-relaxed text-[#C9D1D9] md:grid-cols-2">
      <div className="rounded-lg border border-[#30363D] bg-[#0D1117]/90 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
          Correlação documental
        </p>
        <p className="mt-2">
          Cruzamento entre emendas, transferências e fornecedores recorrentes,
          com linha do tempo sintética e referências auditáveis.
        </p>
      </div>
      <div className="rounded-lg border border-[#30363D] bg-[#0D1117]/90 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
          Resumo executivo
        </p>
        <p className="mt-2">
          Síntese neutra dos principais indicadores exibidos neste painel,
          adequada para reproducibilidade e arquivo institucional.
        </p>
      </div>
    </div>
  );
}

export default function DossiePage() {
  const { id } = useParams();
  const politicoId = id ?? "";

  const credits = useUserCredits();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [record, setRecord] = useState(null);
  const [alertsRemote, setAlertsRemote] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setRecord(null);
      setAlertsRemote([]);

      if (!politicoId.trim()) {
        setLoading(false);
        setError("missing_id");
        return;
      }

      if (!getFirebaseApp()) {
        setLoading(false);
        setError("missing_config");
        return;
      }

      try {
        const docSnap = await fetchPoliticoById(politicoId.trim());
        if (cancelled) return;
        if (!docSnap) {
          setError("not_found");
          setRecord(null);
        } else {
          setRecord(docSnap);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "fetch_failed");
          setRecord(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [politicoId]);

  useEffect(() => {
    let cancelled = false;
    if (!politicoId.trim() || !getFirebaseApp()) return undefined;

    (async () => {
      try {
        const rows = await fetchAlertasForPolitico(politicoId.trim());
        if (!cancelled) setAlertsRemote(rows);
      } catch {
        if (!cancelled) setAlertsRemote([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [politicoId]);

  const nomeExibicao = useMemo(() => pickNome(record), [record]);
  const riskValue = useMemo(() => pickRiskScore(record), [record]);
  const photoAbs = useMemo(
    () => absolutizeMediaUrl(pickPhotoUrl(record)),
    [record],
  );

  const municipalityRiskMap = useMemo(() => {
    if (!record || typeof record !== "object") return undefined;
    const raw =
      record.mapa_risco_municipal ??
      record.risco_por_municipio ??
      record.risco_municipios;
    return raw && typeof raw === "object" ? raw : undefined;
  }, [record]);

  const graphPayload = useMemo(() => pickGraphPayload(record), [record]);

  const investigations = useMemo(() => {
    const rows = pickInvestigations(record);
    return rows
      .map((r, i) => normalizeInvestigationRow(r, i))
      .filter(Boolean);
  }, [record]);

  const alerts = useMemo(() => {
    const normalized = alertsRemote.map(normalizeAlertRow).filter(Boolean);
    return normalized;
  }, [alertsRemote]);

  const pageTitle = nomeExibicao
    ? riskValue != null
      ? `Dossiê: ${nomeExibicao} · Índice de Risco ${Math.round(Number(riskValue))} | TransparênciaBR`
      : `Dossiê: ${nomeExibicao} | TransparênciaBR`
    : "Dossiê parlamentar | TransparênciaBR";

  const metaDesc =
    nomeExibicao && riskValue != null
      ? `TransparênciaBR — ${nomeExibicao}. Índice de Risco ${Math.round(Number(riskValue))} (dados agregados).`
      : `Painel de transparência e fiscalização — ${nomeExibicao || "parlamentar"}.`;

  const premiumLocked =
    credits === null || credits < PREMIUM_ANALYSIS_CREDITS;

  if (loading) {
    return <PanelSkeleton />;
  }

  if (error === "missing_config") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-[#8B949E]">
          Conector de dados indisponível. Configure as variáveis de ambiente do
          projeto Firebase para este ambiente de build.
        </p>
      </div>
    );
  }

  if (error === "missing_id") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-sm text-[#f85149]">
        Identificador ausente na rota.
      </div>
    );
  }

  if (error === "not_found") {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-[#F0F4FC]">
          Registro não encontrado
        </p>
        <p className="max-w-md text-xs text-[#8B949E]">
          Não existe documento na coleção correspondente ao identificador
          informado.
        </p>
      </div>
    );
  }

  if (error && error !== "not_found") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-center text-sm text-[#f85149]">
        Falha ao recuperar dados: {error}
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={metaDesc} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={metaDesc} />
        {photoAbs ? <meta property="og:image" content={photoAbs} /> : null}
        <meta property="og:type" content="article" />
      </Helmet>

      <div className="min-h-full bg-[#080B14] pb-10 text-[#F0F4FC]">
        <div className="border-b border-[#30363D] px-6 py-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
                Painel situacional
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
                {nomeExibicao || "—"}
              </h1>
            </div>
            <div className="text-right font-mono text-xs text-[#8B949E]">
              <span className="block text-[10px] uppercase tracking-wider">
                Créditos
              </span>
              <span className="text-[#58A6FF]">
                {credits === null ? "…" : credits}
              </span>
              <span className="mx-2 text-[#484F58]">·</span>
              <span className="text-[#C9D1D9]">{politicoId}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4 p-6">
          <section className="glass dashboard-panel col-span-12 flex min-h-[24rem] flex-col overflow-hidden p-0 lg:col-span-4">
            <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
              <div className="flex items-center gap-2">
                <Share2 className="size-4 text-[#58A6FF]" strokeWidth={1.75} />
                <h2 className="text-sm font-semibold tracking-tight">
                  Rede de entidades
                </h2>
              </div>
              <Radar className="size-4 text-[#484F58]" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1">
              <NetworkGraph
                politicianId={politicoId}
                embedded
                graphPayload={graphPayload}
              />
            </div>
          </section>

          <section className="glass dashboard-panel relative col-span-12 flex min-h-[24rem] flex-col overflow-hidden p-0 lg:col-span-4">
            <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-[#f85149]" strokeWidth={1.75} />
                <h2 className="text-sm font-semibold tracking-tight">
                  Índice de exposição
                </h2>
              </div>
              <Sparkles className="size-4 text-[#f97316]" />
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center px-2">
              {riskValue != null ? (
                <AsmodeusGauge value={riskValue} />
              ) : (
                <GaugeSkeleton />
              )}
            </div>
          </section>

          <section className="glass dashboard-panel col-span-12 flex min-h-[24rem] flex-col overflow-hidden p-0 lg:col-span-4">
            <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-[#a371f7]" strokeWidth={1.75} />
                <h2 className="text-sm font-semibold tracking-tight">
                  Linhas prioritárias de gasto
                </h2>
              </div>
            </div>
            <ul className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-4 py-3">
              {investigations.length === 0 ? (
                <li className="py-8 text-center text-xs text-[#8B949E]">
                  Nenhuma linha estruturada neste documento.
                </li>
              ) : (
                investigations.map((row, idx) => (
                  <li
                    key={`${row.ref}-${idx}`}
                    className="border-b border-[#21262D] py-3 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-[#58A6FF]">
                          {row.ref}
                        </p>
                        <p className="mt-1 text-sm font-medium leading-snug text-[#F0F4FC]">
                          {row.titulo}
                        </p>
                        {row.foco ? (
                          <p className="mt-1 text-xs text-[#8B949E]">{row.foco}</p>
                        ) : null}
                      </div>
                      {row.valorLabel ? (
                        <span className="shrink-0 font-mono text-[11px] text-[#C9D1D9]">
                          {row.valorLabel}
                        </span>
                      ) : null}
                    </div>
                    {row.progressPct != null ? (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#21262D]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#14532d] via-[#22c55e] to-[#fde047]"
                          style={{
                            width: `${Math.min(100, Math.max(0, row.progressPct))}%`,
                          }}
                        />
                      </div>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="glass dashboard-panel col-span-12 flex min-h-[22rem] flex-col overflow-hidden p-0 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-[#3fb950]" strokeWidth={1.75} />
                <h2 className="text-sm font-semibold tracking-tight">
                  Distribuição geográfica
                </h2>
              </div>
            </div>
            <div className="flex min-h-[18rem] flex-1 flex-col px-2 pb-2 pt-2">
              <BrazilHeatmap
                embedded
                riskScore={riskValue ?? undefined}
                municipalityRiskMap={municipalityRiskMap}
              />
            </div>
          </section>

          <section className="glass dashboard-panel col-span-12 flex min-h-[22rem] flex-col overflow-hidden p-0 lg:col-span-5">
            <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className="size-4 text-[#f85149]"
                  strokeWidth={1.75}
                />
                <h2 className="text-sm font-semibold tracking-tight">
                  Alertas recentes
                </h2>
              </div>
            </div>
            <ul className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-4 py-3">
              {alerts.length === 0 ? (
                <li className="py-8 text-center text-xs text-[#8B949E]">
                  Nenhum alerta cadastrado para este parlamentar na coleção de
                  monitorização.
                </li>
              ) : (
                alerts.map((a, idx) => (
                  <li
                    key={`${a.tipo}-${idx}`}
                    className="border-b border-[#21262D] py-3 last:border-b-0"
                  >
                    <div className="flex gap-3">
                      <span
                        className="select-none text-lg leading-snug text-[#f85149]"
                        aria-hidden="true"
                      >
                        ●
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-[#21262D] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#f85149]">
                            {a.tipo}
                          </span>
                          {a.severidade ? (
                            <span className="text-[10px] uppercase tracking-wider text-[#8B949E]">
                              {a.severidade}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[#C9D1D9]">
                          {a.trecho}
                        </p>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <div className="px-6 pb-8">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-[#58A6FF]" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
              Secção 4 — Relatório analítico
            </h2>
          </div>
          <PremiumGate
            locked={premiumLocked}
            creditsRequired={PREMIUM_ANALYSIS_CREDITS}
            currentCredits={credits ?? 0}
            title="Relatório analítico assistido"
          >
            <Section4Placeholder />
          </PremiumGate>
        </div>
      </div>
    </>
  );
}
