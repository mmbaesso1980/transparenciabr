/**
 * @file CamadaDrawer.jsx
 * @description Drawer inline (Onda 6 — Camadas Vivas) para drill-down dos KPIs
 * e das 6 camadas canônicas na PoliticoPage. Não usa portal, não exige auth,
 * não cobra créditos — é a "vitrine viva" do que já está no Data Lake.
 *
 * Filosofia: mostrar todo dado real disponível na CF pública e ser
 * brutalmente honesto sobre o que ainda não foi coletado.
 */

import { Fragment, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";
import EnriquecimentoCNPJ from "./EnriquecimentoCNPJ.jsx";
import { fmtBRL, fmtNum } from "../utils/formatBRL.js";

const fmtPct = (v) =>
  Number.isFinite(Number(v)) ? `${Math.round(Number(v))}%` : "—";

export default function CamadaDrawer({ open, onClose, payload, ctaTo, ctaLabel }) {
  // ESC fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && payload && (
        <Fragment>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-white/10 bg-[#080B14] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={payload.title}
          >
            {/* Header */}
            <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-white/10 bg-[#080B14]/95 p-5 backdrop-blur">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
                  {payload.kicker ?? "Camada · Aurora"}
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">
                  {payload.title}
                </h2>
                {payload.subtitle && (
                  <p className="mt-1 text-xs text-[#8B949E]">{payload.subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </header>

            {/* Body */}
            <div className="flex-1 space-y-5 p-5">
              {/* KPI principal */}
              {payload.bigValue && (
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-300/70">
                    {payload.bigLabel ?? "Valor"}
                  </p>
                  <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-white">
                    {payload.bigValue}
                  </p>
                  {payload.bigHint && (
                    <p className="mt-1 text-xs text-[#8B949E]">{payload.bigHint}</p>
                  )}
                </div>
              )}

              {/* Série anual (CEAP) */}
              {Array.isArray(payload.serieAnual) && payload.serieAnual.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/60">
                    Série anual
                  </h3>
                  <div className="space-y-1.5">
                    {payload.serieAnual.map((r) => {
                      const max = Math.max(
                        ...payload.serieAnual.map((x) => x.valor_brl || 0),
                        1,
                      );
                      const pct = ((r.valor_brl || 0) / max) * 100;
                      return (
                        <div
                          key={r.ano}
                          className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                        >
                          <span className="w-12 shrink-0 font-mono text-xs text-white/50">
                            {r.ano}
                          </span>
                          <div className="flex-1">
                            <div
                              className="h-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-28 shrink-0 text-right font-mono text-xs tabular-nums text-white/80">
                            {fmtBRL(r.valor_brl)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Top categorias / fornecedores / linhas detalhadas */}
              {Array.isArray(payload.topCategorias) && payload.topCategorias.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/60">
                    {payload.topCategoriasLabel ?? "Top categorias"}
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <table className="w-full text-xs">
                      <thead className="bg-white/[0.03]">
                        <tr className="text-left text-[10px] uppercase tracking-widest text-white/40">
                          <th className="px-3 py-2 font-semibold">
                            {payload.topCategoriasColuna ?? "Item"}
                          </th>
                          {payload.topCategorias.some((c) => c.qtd > 0) && (
                            <th className="px-3 py-2 text-right font-semibold">
                              Qtd
                            </th>
                          )}
                          {payload.topCategorias.some(
                            (c) => Number(c.valor_brl) > 0,
                          ) && (
                            <th className="px-3 py-2 text-right font-semibold">
                              Valor
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {payload.topCategorias.slice(0, 12).map((c, i) => (
                          <tr
                            key={`${c.categoria}-${i}`}
                            className="border-t border-white/5 align-top"
                          >
                            <td className="px-3 py-2 text-white/80">
                              <div>{c.categoria}</div>
                              {c.cnpj && (
                                <EnriquecimentoCNPJ cnpj={c.cnpj} />
                              )}
                            </td>
                            {payload.topCategorias.some((x) => x.qtd > 0) && (
                              <td className="px-3 py-2 text-right font-mono tabular-nums text-white/60">
                                {c.qtd > 0 ? fmtNum(c.qtd) : "—"}
                              </td>
                            )}
                            {payload.topCategorias.some(
                              (x) => Number(x.valor_brl) > 0,
                            ) && (
                              <td className="px-3 py-2 text-right font-mono tabular-nums text-white">
                                {Number(c.valor_brl) > 0
                                  ? fmtBRL(c.valor_brl)
                                  : "—"}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Métricas auxiliares (KV list) */}
              {Array.isArray(payload.metricas) && payload.metricas.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/60">
                    Métricas auxiliares
                  </h3>
                  <dl className="grid grid-cols-2 gap-2">
                    {payload.metricas.map((m, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                      >
                        <dt className="text-[9px] uppercase tracking-widest text-white/40">
                          {m.label}
                        </dt>
                        <dd className="mt-0.5 font-mono text-sm tabular-nums text-white">
                          {m.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {/* Bloco honesto: "ainda não coletado" */}
              {payload.honestNote && (
                <section className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
                  <div className="flex items-start gap-3">
                    <Info
                      className="mt-0.5 size-4 shrink-0 text-amber-300"
                      strokeWidth={1.75}
                    />
                    <div className="text-xs leading-relaxed text-[#D1D5DB]">
                      {payload.honestNote}
                    </div>
                  </div>
                </section>
              )}

              {/* Metodologia */}
              {payload.metodologia && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/60">
                    Metodologia
                  </h3>
                  <p className="text-xs leading-relaxed text-[#8B949E]">
                    {payload.metodologia}
                  </p>
                </section>
              )}

              {/* Fontes */}
              {Array.isArray(payload.fontes) && payload.fontes.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/60">
                    Fontes primárias
                  </h3>
                  <ul className="space-y-1 text-xs text-[#8B949E]">
                    {payload.fontes.map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="size-1 rounded-full bg-cyan-400/60" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {/* Footer com CTA secundário */}
            {ctaTo && (
              <footer className="sticky bottom-0 border-t border-white/10 bg-[#080B14]/95 p-4 backdrop-blur">
                <Link
                  to={ctaTo}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-sm font-bold uppercase tracking-wider text-[#02040a] transition hover:brightness-110"
                >
                  {ctaLabel ?? "Abrir dossiê completo"}
                  <ArrowRight className="size-4" strokeWidth={2.25} />
                </Link>
              </footer>
            )}
          </motion.aside>
        </Fragment>
      )}
    </AnimatePresence>
  );
}
