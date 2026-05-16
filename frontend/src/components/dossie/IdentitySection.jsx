import { useCallback, useState } from "react";
import { ArrowDown, Loader2, Radar } from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";

import ExposureGauge from "../ExposureGauge.jsx";
import { ORACLE_LABORATORIO_CREDITS } from "../../constants/dossieConstants.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { getFirebaseApp } from "../../lib/firebase.js";
import RefreshDossieButton from "./RefreshDossieButton.jsx";

/**
 * Hotpage — identidade (foto, nome, partido/UF) e vitrine de risco CEAP.
 */
export default function IdentitySection({
  nomeExibicao = "—",
  partidoSigla = "",
  uf = "",
  photoAbs,
  politicoId = "",
  snapshotOrigem,
  riskValue,
  ceapKpi,
  credits,
  onScrollPremium,
  onInvestigationComplete,
}) {
  const partidoUf = [partidoSigla, uf].filter(Boolean).join(" · ");
  const { user, isAuthenticated } = useAuth();

  const [auditOpen, setAuditOpen] = useState(false);
  const [auditContext, setAuditContext] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [auditOk, setAuditOk] = useState(false);

  const closeAudit = useCallback(() => {
    if (auditLoading) return;
    setAuditOpen(false);
    setAuditError(null);
    setAuditOk(false);
  }, [auditLoading]);

  const runAuditoriaOnDemand = useCallback(async () => {
    setAuditError(null);
    setAuditOk(false);
    const ctx = auditContext.trim();
    if (ctx.length < 8) {
      setAuditError("Descreva o contexto com pelo menos 8 caracteres (ex.: notícias do dia).");
      return;
    }
    if (!politicoId.trim()) {
      setAuditError("ID do parlamentar indisponível.");
      return;
    }
    if (!isAuthenticated || !user) {
      setAuditError("Inicie sessão para disparar a auditoria on-demand.");
      return;
    }
    const app = getFirebaseApp();
    if (!app) {
      setAuditError("Firebase não está configurado neste ambiente.");
      return;
    }
    setAuditLoading(true);
    try {
      const functions = getFunctions(app, "southamerica-east1");
      const callable = httpsCallable(functions, "gerarDossieOnDemand");
      await callable({
        parlamentarId: politicoId.trim(),
        contextoInvestigativo: ctx,
      });
      setAuditOk(true);
      setAuditContext("");
      await onInvestigationComplete?.();
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      const msg = e instanceof Error ? e.message : String(e);
      setAuditError(code ? `${code}: ${msg}` : msg);
    } finally {
      setAuditLoading(false);
    }
  }, [auditContext, isAuthenticated, onInvestigationComplete, politicoId, user]);

  return (
    <section className="border-b border-[#30363D]/80 bg-gradient-to-b from-[#111827]/90 to-transparent px-4 py-8 sm:px-6">
      <div className="mx-auto grid max-w-[1600px] gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-4">
          <div className="flex items-start gap-4">
            {photoAbs ? (
              <img
                src={photoAbs}
                alt={nomeExibicao || "Parlamentar"}
                className="size-24 shrink-0 rounded-2xl border border-[#30363D] object-cover shadow-lg"
              />
            ) : (
              <div className="flex size-24 shrink-0 items-center justify-center rounded-2xl border border-[#30363D] bg-[#161B22] font-mono text-2xl text-[#58A6FF]">
                {(nomeExibicao || "?").slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
                Hotpage parlamentar
              </p>
              <h2 className="truncate text-2xl font-bold text-[#F0F4FC] sm:text-3xl">
                {nomeExibicao || "—"}
              </h2>
              {partidoUf ? (
                <p className="mt-1 text-sm text-[#8B949E]">{partidoUf}</p>
              ) : null}
              <p className="mt-2 font-mono text-[11px] text-[#484F58]">ID {politicoId}</p>
              {snapshotOrigem === "universe_roster" ? (
                <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-100/95">
                  Hotpage dinâmica — cadastro oficial Câmara/Senado. Blocos forenses completos quando o
                  dossiê existir em Firestore ou após gerar coleta sob demanda.
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onScrollPremium}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d4af37]/50 bg-[#d4af37]/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#fde68a] transition hover:bg-[#d4af37]/20"
            >
              Dossiê premium — {ORACLE_LABORATORIO_CREDITS} créditos
              <ArrowDown className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                setAuditOpen(true);
                setAuditError(null);
                setAuditOk(false);
              }}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-red-500/45 bg-red-950/50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-100 shadow-[0_0_20px_-6px_rgba(248,113,113,0.55)] transition hover:border-red-400/70 hover:bg-red-900/55"
            >
              <Radar className="size-3.5 text-red-300" strokeWidth={2.25} aria-hidden />
              Auditoria On-Demand
            </button>
            <RefreshDossieButton politicoId={politicoId} />
          </div>
        </div>

        <div className="glass-card flex min-h-[14rem] flex-col justify-center rounded-2xl border border-[#30363D] p-4 lg:col-span-4">
          <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-[#8B949E]">
            Índice de exposição
          </p>
          <div className="mt-2 flex justify-center">
            {riskValue != null ? (
              <ExposureGauge value={riskValue} />
            ) : (
              <p className="py-8 text-center text-sm text-[#8B949E]">Índice indisponível neste registo.</p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
          {[
            {
              k: "AURORA (datalake)",
              v:
                ceapKpi?.indice_risco_aurora != null
                  ? String(ceapKpi.indice_risco_aurora)
                  : "—",
              sub: "Índice CEAP classificado (GCS)",
            },
            {
              k: "Notas alto risco",
              v: ceapKpi?.qtd_notas_alto_risco != null ? String(ceapKpi.qtd_notas_alto_risco) : "—",
              sub: "Score ≥ 85",
            },
            {
              k: "Créditos disponíveis",
              v: credits === null ? "…" : String(credits),
              sub: "Laboratório: 200 créditos",
            },
          ].map((box) => (
            <div
              key={box.k}
              className="rounded-xl border border-[#30363D]/80 bg-[#0D1117]/80 px-4 py-3 shadow-inner"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8B949E]">{box.k}</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#58A6FF]">{box.v}</p>
              <p className="mt-1 text-[11px] text-[#6e7681]">{box.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {auditOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-modal-title"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-red-500/35 bg-[#0d1117] p-5 shadow-[0_0_40px_-10px_rgba(248,113,113,0.45)]">
            <button
              type="button"
              onClick={closeAudit}
              className="absolute right-3 top-3 rounded-lg px-2 py-1 text-xs text-[#8B949E] hover:bg-white/5 hover:text-[#F0F4FC]"
            >
              Fechar
            </button>
            <p
              id="audit-modal-title"
              className="pr-10 text-sm font-bold uppercase tracking-[0.2em] text-red-200/95"
            >
              Auditoria On-Demand
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#8B949E]">
              Vertex Gemini 1.5 Pro (projeto <span className="font-mono text-[#7DD3FC]">projeto-codex-br</span>) cruzará
              os dados já materializados do relatório com o contexto que você descrever. Os achados entram em{" "}
              <span className="font-mono text-[#C9D1D9]">alertas_anexados</span> e no feed{" "}
              <span className="font-mono text-[#C9D1D9]">alertas_bodes</span>.
            </p>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-[#8B949E]">
              Contexto (notícias do dia, linha de investigação)
            </label>
            <textarea
              value={auditContext}
              onChange={(e) => setAuditContext(e.target.value)}
              rows={5}
              disabled={auditLoading}
              placeholder='Ex.: "Cruzar com grupo Vorcaro — menções em veículos regionais hoje."'
              className="mt-2 w-full resize-y rounded-xl border border-[#30363D] bg-[#161B22] px-3 py-2 text-sm text-[#F0F4FC] outline-none ring-red-500/25 placeholder:text-[#484F58] focus:border-red-500/50 focus:ring-2 disabled:opacity-60"
            />
            {auditError ? (
              <p className="mt-2 text-xs text-red-300/95" role="alert">
                {auditError}
              </p>
            ) : null}
            {auditOk ? (
              <p className="mt-2 text-xs text-emerald-300/95">Findings gravados. Atualizámos o painel de alertas.</p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeAudit}
                disabled={auditLoading}
                className="rounded-xl border border-[#30363D] px-4 py-2 text-xs font-semibold text-[#C9D1D9] hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={runAuditoriaOnDemand}
                disabled={auditLoading}
                className={`inline-flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-600/85 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-lg transition hover:bg-red-500 disabled:opacity-60 ${auditLoading ? "animate-pulse" : ""}`}
              >
                {auditLoading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                {auditLoading ? "A processar…" : "Disparar análise"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
