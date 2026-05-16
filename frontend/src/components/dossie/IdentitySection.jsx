import { ArrowDown } from "lucide-react";

import ExposureGauge from "../ExposureGauge.jsx";
import { ORACLE_LABORATORIO_CREDITS } from "../../constants/dossieConstants.js";
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
}) {
  const partidoUf = [partidoSigla, uf].filter(Boolean).join(" · ");

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
    </section>
  );
}
