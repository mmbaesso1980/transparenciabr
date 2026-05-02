import { useMemo } from "react";

import {
  LEGACY_PRISMA_FETCH_KEY,
  LEGACY_PRISMA_HEALTH_KEY,
} from "../../constants/legacyFieldNames.js";

/**
 * Ordem dos 12 módulos CEAP / investigação (UI).
 * Dados: `transparency_reports` → `investigacao_prisma_ceap` (motor Node) + merge narrativa ID 220645.
 */
const PRISMAS_ORDER = [
  { key: "BENFORD", label: "BENFORD", subtitle: "Estatística · Lei de Benford" },
  { key: "ORACULO", label: "ORÁCULO", subtitle: "Semântica · Gemini" },
  { key: "SANGUE_PODER", label: "SANGUE E PODER", subtitle: "Nepotismo · QSA" },
  { key: "FETCH_API", label: "FETCH-API", subtitle: "Logística · agenda" },
  { key: "CRAWLER", label: "CRAWLER", subtitle: "Saúde · CNAE / ANVISA" },
  { key: "ESPECTRO", label: "E.S.P.E.C.T.R.O.", subtitle: "Coerência legislativa" },
  { key: "ARIMA", label: "ARIMA", subtitle: "Anomalias temporais" },
  { key: "KMEANS", label: "K-MEANS", subtitle: "Clusters de risco" },
  { key: "DOC_AI", label: "DOC-AI", subtitle: "OCR forense" },
  { key: "SANKEY", label: "SANKEY", subtitle: "Fluxo · subcontratações" },
  { key: "IRONMAN", label: "I.R.O.N.M.A.N.", subtitle: "Fundamentação legal" },
  { key: "VISUAL", label: "VISUAL", subtitle: "Rede 3D · InstancedMesh" },
];

function isPrismaWaiting(payload) {
  if (!payload) return true;
  const s = String(payload.status ?? payload.nota ?? "");
  return (
    s.includes("aguardando") ||
    s.includes("AGUARDANDO") ||
    s === "aguardando" ||
    s === "pendente"
  );
}

/**
 * ID 220645: funde narrativa manual (Padrão Ouro) com métricas do motor Node quando existirem.
 */
function mergePrismaForPolitico(record, politicoId) {
  const id = String(politicoId || record?.id || "").trim();
  const api = record?.investigacao_prisma_ceap;
  if (id !== "220645") return api;

  const manual = buildInvestigacaoPrismaFallback220645();
  if (!api) return manual;

  const manualP = manual.prismas || {};
  const apiP = api.prismas || {};
  const keys = new Set([...Object.keys(manualP), ...Object.keys(apiP)]);
  const mergedPrismas = {};

  for (const k of keys) {
    const base = manualP[k];
    const fromApi = apiP[k];
    if (!fromApi) {
      mergedPrismas[k] = base;
      continue;
    }
    if (!base) {
      mergedPrismas[k] = fromApi;
      continue;
    }
    const apiWaiting = isPrismaWaiting(fromApi);
    const baseHasText = typeof base?.relatorio === "string" && base.relatorio.length > 0;
    if (apiWaiting && baseHasText) {
      mergedPrismas[k] = {
        ...base,
        ...fromApi,
        relatorio: base.relatorio,
        status_linha: base.status_linha ?? fromApi.status_linha,
        nota: base.nota,
      };
    } else {
      mergedPrismas[k] = { ...base, ...fromApi };
    }
  }

  if (!mergedPrismas.FETCH_API && mergedPrismas[LEGACY_PRISMA_FETCH_KEY]) {
    mergedPrismas.FETCH_API = mergedPrismas[LEGACY_PRISMA_FETCH_KEY];
  }
  if (!mergedPrismas.CRAWLER && mergedPrismas[LEGACY_PRISMA_HEALTH_KEY]) {
    mergedPrismas.CRAWLER = mergedPrismas[LEGACY_PRISMA_HEALTH_KEY];
  }

  return {
    ...manual,
    ...api,
    prismas: mergedPrismas,
    resumo_executivo: api.resumo_executivo || manual.resumo_executivo,
    titulo_relatorio: manual.titulo_relatorio,
    subtitulo_relatorio: manual.subtitulo_relatorio,
    avisos: Array.from(
      new Set([...(Array.isArray(api.avisos) ? api.avisos : []), ...(manual.avisos || [])]),
    ),
  };
}

function AgenteCard({ label, subtitle, children, alertPulse }) {
  return (
    <div
      className={[
        "flex min-h-[11rem] flex-col rounded-xl border bg-[#050608] p-5 shadow-inner sm:min-h-[12rem]",
        alertPulse
          ? "animate-[prisma-pulse_1.4s_ease-in-out_infinite] border-[#f85149]"
          : "border-[#2d0808]",
      ].join(" ")}
    >
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f85149] md:text-sm">
        {label}
      </p>
      <p className="mt-1 text-xs uppercase tracking-wider text-[#6e7681] md:text-sm">{subtitle}</p>
      <div className="mt-4 flex-1 text-lg leading-relaxed text-[#C9D1D9]">{children}</div>
    </div>
  );
}

/**
 * @param {{ record?: Record<string, unknown> | null; politicoId?: string }} props
 */
export default function PrismaCeapSection({ record, politicoId = "" }) {
  const bundle = useMemo(
    () => mergePrismaForPolitico(record, politicoId),
    [record, politicoId],
  );
  const prismas = bundle?.prismas;
  const benfordAgent = bundle?.benford_agente;

  const cards = useMemo(() => {
    return PRISMAS_ORDER.map(({ key, label, subtitle }) => {
      const payload = prismas?.[key];
      const statusLinha =
        typeof payload?.status_linha === "string"
          ? payload.status_linha
          : typeof payload?.status === "string" && payload.status !== "narrativa_manual"
            ? payload.status
            : "";

      if (key === "BENFORD") {
        const r = benfordAgent ?? prismas?.BENFORD?.resultado;
        const anomaly =
          r?.anomaly_detected === true ||
          r?.alerta_forense === true ||
          Boolean(prismas?.BENFORD?.resultado?.anomaly_detected) ||
          /ALERTA/i.test(String(payload?.status_linha || ""));
        const mad = r?.mad ?? prismas?.BENFORD?.resultado?.mad;
        const ok = r?.amostra_suficiente ?? prismas?.BENFORD?.resultado?.amostra_suficiente;
        const chi = r?.chi2_pearson_aprox ?? prismas?.BENFORD?.resultado?.chi2_pearson_aprox;
        const texto =
          typeof payload?.relatorio === "string"
            ? payload.relatorio
            : "";
        return (
          <AgenteCard key={key} label={label} subtitle={subtitle} alertPulse={anomaly}>
            <div className="flex flex-col gap-3">
              {statusLinha ? (
                <p className="text-sm font-bold uppercase tracking-wide text-[#FDE047] md:text-base">
                  {statusLinha}
                </p>
              ) : null}
              {anomaly ? (
                <p className="text-xl font-bold uppercase tracking-wide text-[#f85149] md:text-2xl">
                  ALERTA FORENSE
                </p>
              ) : (
                <p className="text-lg text-[#8B949E] md:text-xl">
                  Sem anomalia Benford destacada nesta amostra (MAD).
                </p>
              )}
              {texto ? (
                <p className="border-l-2 border-[#30363D] pl-3 text-base leading-relaxed text-[#C9D1D9] md:text-lg">
                  {texto}
                </p>
              ) : null}
              <div className="rounded-lg border border-[#30363D] bg-[#0d1117]/90 px-4 py-3">
                <p className="font-data text-[10px] font-semibold uppercase tracking-widest text-[#8B949E]">
                  MAD (1.º dígito)
                </p>
                <p className="font-data mt-1 text-4xl font-bold tabular-nums text-[#7DD3FC] md:text-5xl">
                  {mad != null ? String(mad) : "—"}
                </p>
              </div>
              <p className="font-data text-sm text-[#8B949E] md:text-base">
                χ² ≈ {chi != null ? String(chi) : "—"} · Amostra:{" "}
                {ok === false ? "insuficiente" : ok === true ? "ok" : "—"}
              </p>
            </div>
          </AgenteCard>
        );
      }

      const relatorio =
        typeof payload?.relatorio === "string" ? payload.relatorio : "";
      const notaUi =
        relatorio ||
        (typeof payload?.nota === "string"
          ? payload.nota.replace(/^[A-ZÀ-Ú\s]+:\s*/i, "").trim() || payload.nota
          : "—");
      const alertPulse =
        /ALERTA|INDÍCIO|RISCO|SURTO/i.test(String(statusLinha + notaUi));

      return (
        <AgenteCard key={key} label={label} subtitle={subtitle} alertPulse={alertPulse}>
          <div className="flex flex-col gap-2">
            {statusLinha ? (
              <p className="text-sm font-bold uppercase tracking-wide text-[#FDE047]">
                {statusLinha}
              </p>
            ) : null}
            <p className="text-base leading-relaxed text-[#C9D1D9] md:text-lg">{notaUi}</p>
          </div>
        </AgenteCard>
      );
    });
  }, [bundle, benfordAgent, prismas]);

  return (
    <div className="space-y-5">
      <style>{`
        @keyframes prisma-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(248, 81, 73, 0.35); }
          50% { box-shadow: 0 0 14px 2px rgba(248, 81, 73, 0.55); }
        }
      `}</style>
      <div className="border-b border-[#2d0808] pb-4">
        <h2 className="text-2xl font-bold tracking-tight text-[#f85149] md:text-3xl">
          {bundle?.titulo_relatorio ?? "AURORA · 12 módulos CEAP"}
        </h2>
        {bundle?.subtitulo_relatorio ? (
          <p className="mt-2 text-base font-medium leading-relaxed text-[#8B949E] md:text-lg">
            {bundle.subtitulo_relatorio}
          </p>
        ) : null}
        <p className="mt-2 text-lg leading-relaxed text-[#8B949E]">
          Motor CEAP —{" "}
          <span className="font-mono text-[#C9D1D9]">
            {bundle?.gerado_em ? String(bundle.gerado_em).slice(0, 19) : "—"}
          </span>{" "}
          ·{" "}
          <span className="font-mono text-[#8B949E]">{bundle?.fonte ?? "—"}</span>
        </p>
      </div>

      {bundle?.resumo_executivo ? (
        <section className="rounded-xl border border-[#30363D] bg-[#0d1117]/90 p-6">
          <h3 className="text-xl font-bold tracking-tight text-[#F0F4FC] md:text-2xl">
            Resumo executivo (overview)
          </h3>
          <p className="mt-4 text-lg leading-relaxed text-[#C9D1D9] md:text-xl">
            {bundle.resumo_executivo}
          </p>
          {Array.isArray(bundle.avisos) && bundle.avisos.length > 0 ? (
            <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-[#8B949E]">
              {bundle.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {!bundle ? (
        <p className="rounded-xl border border-[#2d0808] bg-[#050608] p-6 text-lg leading-relaxed text-[#8B949E]">
          Execute <span className="font-mono text-[#f85149]">node engines/ceap_motor.js</span> para
          popular os prismas ou aguarde ingestão Firestore.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards}
        </div>
      )}
    </div>
  );
}
