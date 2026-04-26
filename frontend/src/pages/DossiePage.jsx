import {
  AlertTriangle,
  BarChart3,
  Globe,
  Radar,
  Share2,
  Sparkles,
} from "lucide-react";
import html2pdf from "html2pdf.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useParams } from "react-router-dom";

import PremiumGate from "../components/PremiumGate.jsx";
import BrandLogo from "../components/BrandLogo.jsx";
import ExposureGauge from "../components/ExposureGauge.jsx";
import PanelSkeleton from "../components/dossie/PanelSkeleton.jsx";
import DossiePDFContent from "../components/dossie/DossiePDFContent.jsx";
import AgendaDoDia from "../components/dossie/AgendaDoDia.jsx";
import BussolaPolitica from "../components/dossie/BussolaPolitica.jsx";
import CeapMonitorSection from "../components/dossie/CeapMonitorSection.jsx";
import EmendasParlamentaresSection from "../components/dossie/EmendasParlamentaresSection.jsx";
import HealthAuditSection from "../components/dossie/HealthAuditSection.jsx";
import SocioeconomicBaseSection from "../components/dossie/SocioeconomicBaseSection.jsx";
import CommercialOpportunitySection from "../components/dossie/CommercialOpportunitySection.jsx";
import Section4Placeholder from "../components/dossie/Section4Placeholder.jsx";
import BrazilHeatmap from "../components/BrazilHeatmap.jsx";
import NetworkGraph from "../components/dossie/NetworkGraph.jsx";
import { useUserCredits } from "../hooks/useUserCredits.js";
import {
  deductCredits,
  fetchPoliticoById,
  getFirebaseApp,
} from "../lib/firebase.js";
import { useTransparencyReport } from "../services/transparencyReports.js";
import {
  absolutizeMediaUrl,
  enrichPoliticoRecord,
  normalizeAlertRow,
  normalizeInvestigationRow,
  pickGraphPayload,
  pickInvestigations,
  pickNome,
  pickPhotoUrl,
  pickPartidoSigla,
  pickRiskScore,
} from "../utils/dataParsers.js";

/** Alinhar com `oracleLaboratorioCost()` em `firestore.rules` (200). */
const ORACLE_LABORATORIO_CREDITS = 200;

/** Watchlist local (Cofre / Sentinela) — simulação até sync Firestore completo. */
const WATCHLIST_STORAGE_KEY = "transparenciabr_watchlist_ids";

function readWatchlistIdsFromStorage() {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function dossiePdfFilename(nomePolitico) {
  const slug = String(nomePolitico || "Parlamentar")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `Dossie_Forense_${slug || "Parlamentar"}.pdf`;
}

function oracleStorageKey(politicoId) {
  return `transparenciabr_oracle_${politicoId}`;
}

export default function DossiePage() {
  const { id } = useParams();
  const politicoId = id ?? "";

  const credits = useUserCredits();
  const pdfRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [record, setRecord] = useState(null);
  const [oracleUnlocked, setOracleUnlocked] = useState(false);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const reportQuery = useTransparencyReport(politicoId);

  const displayRecord = useMemo(() => enrichPoliticoRecord(record), [record]);

  useEffect(() => {
    const pid = politicoId.trim();
    if (!pid) return;
    setMonitoringActive(readWatchlistIdsFromStorage().includes(pid));
  }, [politicoId]);

  const handleToggleMonitor = useCallback(() => {
    const pid = politicoId.trim();
    if (!pid) return;
    const prev = readWatchlistIdsFromStorage();
    const next = monitoringActive
      ? prev.filter((x) => x !== pid)
      : [...new Set([...prev, pid])];
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(next));
    setMonitoringActive(!monitoringActive);
  }, [politicoId, monitoringActive]);

  useEffect(() => {
    if (!politicoId.trim()) return;
    try {
      if (sessionStorage.getItem(oracleStorageKey(politicoId.trim())) === "1") {
        setOracleUnlocked(true);
      }
    } catch {
      /* storage indisponível */
    }
  }, [politicoId]);

  const handleOraclePay = useCallback(async () => {
    await deductCredits(ORACLE_LABORATORIO_CREDITS);
    try {
      sessionStorage.setItem(oracleStorageKey(politicoId.trim()), "1");
    } catch {
      /* ignore */
    }
    setOracleUnlocked(true);
  }, [politicoId]);

  const handleDownloadPDF = useCallback(async () => {
    const el = pdfRef.current;
    if (!el) return;
    const filename = dossiePdfFilename(pickNome(displayRecord));
    await html2pdf()
      .set({
        margin: 10,
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(el)
      .save();
  }, [displayRecord]);

  useEffect(() => {
    if (!politicoId.trim()) {
      setLoading(false);
      setError("missing_id");
      setRecord(null);
      return;
    }

    if (!getFirebaseApp()) {
      setLoading(false);
      setError("missing_config");
      setRecord(null);
      return;
    }

    setLoading(reportQuery.isLoading || reportQuery.isFetching);
    setError(null);

    if (reportQuery.isError) {
      setError(reportQuery.error instanceof Error ? reportQuery.error.message : "fetch_failed");
      setRecord(null);
      setLoading(false);
      return;
    }

    if (reportQuery.isSuccess) {
      if (!reportQuery.data) {
        setError("not_found");
        setRecord(null);
      } else {
        setRecord(reportQuery.data);
      }
      setLoading(false);
    }
  }, [
    politicoId,
    reportQuery.data,
    reportQuery.error,
    reportQuery.isError,
    reportQuery.isFetching,
    reportQuery.isLoading,
    reportQuery.isSuccess,
  ]);

  const nomeExibicao = useMemo(() => pickNome(displayRecord), [displayRecord]);
  const partidoSigla = useMemo(
    () => pickPartidoSigla(displayRecord),
    [displayRecord],
  );
  const riskValue = useMemo(() => pickRiskScore(displayRecord), [displayRecord]);
  const photoAbs = useMemo(
    () => absolutizeMediaUrl(pickPhotoUrl(displayRecord)),
    [displayRecord],
  );

  const municipalityRiskMap = useMemo(() => {
    if (!displayRecord || typeof displayRecord !== "object") return undefined;
    const raw =
      displayRecord.mapa_risco_municipal ??
      displayRecord.risco_por_municipio ??
      displayRecord.risco_municipios;
    return raw && typeof raw === "object" ? raw : undefined;
  }, [displayRecord]);

  const graphPayload = useMemo(() => pickGraphPayload(displayRecord), [displayRecord]);

  const investigations = useMemo(() => {
    const rows = pickInvestigations(displayRecord);
    return rows
      .map((r, i) => normalizeInvestigationRow(r, i))
      .filter(Boolean);
  }, [displayRecord]);

  const alerts = useMemo(() => {
    const rows = Array.isArray(displayRecord?.alertas_anexados)
      ? displayRecord.alertas_anexados
      : [];
    const normalized = rows.map(normalizeAlertRow).filter(Boolean);
    return normalized;
  }, [displayRecord]);

  const pageTitle = nomeExibicao
    ? riskValue != null
      ? `Dossiê: ${nomeExibicao} · Índice de Risco ${Math.round(Number(riskValue))} | TransparênciaBR`
      : `Dossiê: ${nomeExibicao} | TransparênciaBR`
    : "Dossiê parlamentar | TransparênciaBR";

  const metaDesc =
    nomeExibicao && riskValue != null
      ? `TransparênciaBR — ${nomeExibicao}. Índice de Risco ${Math.round(Number(riskValue))} (dados agregados).`
      : `Painel de transparência e fiscalização — ${nomeExibicao || "parlamentar"}.`;

  const oracleLocked = !oracleUnlocked;
  const creditsLoading = credits === null;

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

      <div className="relative isolate min-h-full max-w-[100vw] overflow-x-hidden bg-[#0A0E17] pb-12 text-[#F0F4FC]">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 overflow-hidden"
        >
          <div className="absolute -left-[18%] -top-[12%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(253,224,71,0.38)_0%,transparent_68%)] blur-3xl opacity-10" />
          <div className="absolute -right-[12%] top-[28%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(74,222,128,0.38)_0%,transparent_68%)] blur-3xl opacity-10" />
          <div className="absolute bottom-[-14%] left-[22%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(125,211,252,0.42)_0%,transparent_68%)] blur-3xl opacity-10" />
        </div>

        <div className="relative z-10">
          {/* Linha 1 — cabeçalho Bentobox fixo */}
          <header className="sticky top-0 z-50 border-b border-[#30363D] bg-[#0A0E17]/93 backdrop-blur-lg">
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
              <BrandLogo />
              {photoAbs ? (
                <img
                  src={photoAbs}
                  alt=""
                  className="size-11 shrink-0 rounded-xl border border-[#30363D] object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
                  Dossiê político completo
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-lg font-semibold tracking-tight md:text-2xl">
                    {nomeExibicao || "—"}
                  </h1>
                  {partidoSigla ? (
                    <span className="rounded-lg border border-[#30363D] bg-[#161B22]/90 px-2 py-0.5 text-xs font-semibold text-[#C9D1D9]">
                      {partidoSigla}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-data text-[10px] text-[#484F58]">
                  {politicoId ? `politicos/${politicoId}` : "—"}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center rounded-full border border-[#4ADE80]/45 bg-[#4ADE80]/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4ADE80]">
                Operational
              </span>
              <button
                type="button"
                onClick={() => handleToggleMonitor()}
                className={[
                  "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold tracking-tight transition",
                  monitoringActive
                    ? "border-[#4ADE80]/45 bg-[#4ADE80]/12 text-[#4ADE80]"
                    : "border-[#7DD3FC]/45 bg-[#7DD3FC]/10 text-[#7DD3FC] hover:bg-[#7DD3FC]/16",
                ].join(" ")}
              >
                <span aria-hidden="true">🔔</span>
                {monitoringActive ? "Ativo" : "Monitorizar"}
              </button>
              <div className="ml-auto text-right font-data text-xs text-[#8B949E]">
                <span className="block text-[10px] uppercase tracking-wider">
                  Créditos
                </span>
                <span className="inline-flex max-w-[min(100vw,14rem)] flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  <span className="text-[#7DD3FC]">
                    {credits === null ? "…" : credits}
                  </span>
                  <span className="text-[#484F58]">·</span>
                  <span className="break-all text-[#C9D1D9]">{politicoId}</span>
                </span>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] space-y-4 px-4 pt-6 sm:px-6">
            {/* Linha 2 — índice forense + bússola */}
            <div className="grid gap-4 md:grid-cols-2">
              <section className="glass-card flex min-h-[26rem] flex-col overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Radar className="size-4 text-[#7DD3FC]" strokeWidth={1.75} />
                    <div>
                      <h2 className="text-sm font-semibold tracking-tight">
                        Motor Forense TransparênciaBR
                      </h2>
                      <p className="text-[11px] text-[#8B949E]">
                        Nível de exposição (índice agregado no documento)
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex min-h-[14rem] flex-1 items-center justify-center px-2 py-4">
                  {riskValue != null ? (
                    <ExposureGauge value={riskValue} />
                  ) : (
                    <p className="text-center text-xs text-[#484F58]">
                      Índice de exposição indisponível neste registo.
                    </p>
                  )}
                </div>
              </section>

              <section className="glass-card relative flex min-h-[26rem] flex-col overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="size-4 text-[#FDBA74]" strokeWidth={1.75} />
                    <h2 className="text-sm font-semibold tracking-tight">
                      Espectro político (Bússola)
                    </h2>
                  </div>
                  <Sparkles className="size-4 text-[#FDE047]" />
                </div>
                <div className="flex min-h-[14rem] flex-1 items-stretch justify-center overflow-hidden px-2 py-4">
                  <BussolaPolitica politico={displayRecord} />
                </div>
              </section>
            </div>

            {/* Linha 3 — CEAP · agenda · IBGE */}
            <div className="grid gap-4 lg:grid-cols-3">
              <CeapMonitorSection investigations={investigations} />
              <AgendaDoDia politico={displayRecord} />
              <SocioeconomicBaseSection
                politico={displayRecord}
                variant="bento"
              />
            </div>

            {/* Emendas LOA (links externos em EmendasParlamentaresSection) */}
            <section className="glass-card overflow-hidden p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Globe className="size-4 text-[#4ADE80]" strokeWidth={1.75} />
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
                    Emendas parlamentares
                  </h2>
                  <p className="text-[11px] text-[#8B949E]">
                    RP6 / RP7 / RP99 e exercícios LOA (portal SIOP).
                  </p>
                </div>
              </div>
              <EmendasParlamentaresSection politico={displayRecord} />
            </section>

            {/* Mapa + alertas */}
            <div className="grid gap-4 lg:grid-cols-12">
              <section className="glass-card col-span-12 flex min-h-[22rem] flex-col overflow-hidden p-0 lg:col-span-7">
                <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 text-[#4ADE80]" strokeWidth={1.75} />
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

              <section className="glass-card col-span-12 flex min-h-[22rem] flex-col overflow-hidden p-0 lg:col-span-5">
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
                              <span className="rounded bg-[#21262D] px-2 py-0.5 font-data text-[10px] uppercase tracking-wide text-[#f85149]">
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

            {/* Linha 4 — OSS / saúde */}
            <HealthAuditSection politico={displayRecord} />

            {/* Linha 5 — paywall 200 créditos */}
            <div className="min-w-0 pb-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Sparkles className="size-4 text-[#7DD3FC]" strokeWidth={1.75} />
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
                    Motor Forense TransparênciaBR — camada premium
                  </h2>
                  <p className="text-[11px] text-[#8B949E]">
                    Teia 3D preditiva, PDF forense e oportunidades comerciais — débito de{" "}
                    <span className="font-data text-[#FDE047]">
                      {ORACLE_LABORATORIO_CREDITS}
                    </span>{" "}
                    créditos.
                  </p>
                </div>
              </div>
              <PremiumGate
                locked={oracleLocked}
                creditsRequired={ORACLE_LABORATORIO_CREDITS}
                currentCredits={credits ?? 0}
                creditsLoading={creditsLoading}
                onPayCredits={handleOraclePay}
              >
                <div className="oracle-laboratory space-y-4">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleDownloadPDF()}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[#7DD3FC]/45 bg-[#7DD3FC]/10 px-5 py-3 text-sm font-semibold tracking-tight text-[#7DD3FC] shadow-[0_0_24px_rgba(125,211,252,0.12)] transition hover:bg-[#7DD3FC]/18 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC]"
                    >
                      <span aria-hidden="true">📄</span>
                      Baixar Dossiê Forense (PDF)
                    </button>
                  </div>

                  <div className="glass-card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Share2 className="size-4 text-[#7DD3FC]" strokeWidth={1.75} />
                        <h3 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
                          Teia preditiva — Análise Forense
                        </h3>
                      </div>
                      <Radar className="size-4 text-[#484F58]" />
                    </div>
                    <div className="flex min-h-[280px] min-w-0 flex-col overflow-x-auto p-2 sm:min-h-[300px]">
                      <NetworkGraph
                        politicianId={politicoId}
                        embedded
                        graphPayload={graphPayload}
                        centralLabel={nomeExibicao || ""}
                      />
                    </div>
                  </div>

                  <CommercialOpportunitySection politico={displayRecord} />

                  <Section4Placeholder />
                </div>
              </PremiumGate>
            </div>
          </div>

          <DossiePDFContent ref={pdfRef} politico={displayRecord} alertas={alerts} />
        </div>
      </div>
    </>
  );
}
