import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useEffect, useRef, useState } from "react";

import ForensicBarChartH from "../components/forensic/ForensicBarChartH.jsx";
import ForensicLineChart from "../components/forensic/ForensicLineChart.jsx";
import KPICardXL from "../components/forensic/KPICardXL.jsx";
import BrandLogo from "../components/BrandLogo.jsx";
import PoliticianOrb from "../components/PoliticianOrb.jsx";
import useDashboardKPIs from "../hooks/useDashboardKPIs.js";

const BG = "#0B0F1A";
const CARD = "#111827";

/**
 * Anima número de 0 até target na primeira montagem (800ms ease-out).
 */
function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  className = "",
}) {
  const target = Number(value);
  const safe = Number.isFinite(target) ? target : 0;
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      setDisplay(safe);
      return;
    }
    started.current = true;
    const t0 = performance.now();
    const dur = 800;

    function easeOut(t) {
      return 1 - (1 - t) ** 3;
    }

    let frame;
    function tick(now) {
      const elapsed = now - t0;
      const u = Math.min(1, elapsed / dur);
      const v = easeOut(u) * safe;
      setDisplay(v);
      if (u < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safe]);

  const formatted =
    decimals > 0
      ? display.toLocaleString("pt-BR", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(display).toLocaleString("pt-BR");

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

function fmtBrl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  if (x >= 1e6) return `R$ ${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `R$ ${(x / 1e3).toFixed(1)}k`;
  return x.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatRelativePt(d) {
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 120) return "há instantes";
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h`;
}

function utcStatusLine(iso) {
  if (!iso) return "Última atualização: —";
  try {
    const d = new Date(iso);
    const utc = d.toISOString().replace("T", " ").slice(0, 19);
    return `Última atualização: ${utc} UTC (${formatRelativePt(d)})`;
  } catch {
    return "Última atualização: —";
  }
}

function GlassPanel({ title, subtitle, children, className = "" }) {
  return (
    <section
      className={`rounded-2xl border border-white/[0.08] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6 ${className}`}
      style={{ background: `${CARD}e6` }}
    >
      {title ? (
        <header className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100 sm:text-xl">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

function RiskRow({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <li className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-[8rem] items-center justify-between gap-2 sm:block">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        <span className="font-mono text-sm tabular-nums text-slate-500">{count}</span>
      </div>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-800/80">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            minWidth: count > 0 ? "4px" : "0",
          }}
        />
      </div>
    </li>
  );
}

export default function PainelMestrePage() {
  const { data, loading, error, empty, nextRetryMs } = useDashboardKPIs({
    pollMs: 60_000,
  });

  const forense = data?.indicadores_forense || {};
  const ierp = Number(forense.ierp_pct);
  const tad = Number(forense.tad_pct);
  const rast = Number(forense.rastreabilidade_pct);
  const hhi = Number(forense.hhi_fornecedores);
  const bits = Number(forense.diversidade_categorias_shannon_bits);
  const lat = forense.latencia_media_horas_ingestao_classif;
  const prof = Number(forense.profundidade_cobertura_notas_por_parlamentar);
  const serie = forense.valor_financeiro_classificado_serie_anual_brl || [];
  const notasAno = Array.isArray(forense.notas_por_ano) ? forense.notas_por_ano : [];

  const valorTotal = Number(data?.valor_total_classificado_brl);
  const valorAlto = Number(data?.valor_alto_risco_brl);
  const pctAltoVsTotal =
    Number.isFinite(valorTotal) && valorTotal > 0
      ? Math.round((valorAlto / valorTotal) * 10000) / 100
      : 0;

  const updatedLabel = data?.ultima_classificacao_utc
    ? formatRelativePt(new Date(data.ultima_classificacao_utc))
    : null;

  const risk = data?.notas_por_faixa_risco || { baixo: 0, medio: 0, alto: 0 };
  const riskSum = risk.baixo + risk.medio + risk.alto || 1;

  const topPreview = Array.isArray(data?.top_alvos_preview) ? data.top_alvos_preview : [];

  const statusGcs = error ? "ERRO" : loading && !data ? "SINCRONIZANDO" : empty ? "VAZIO" : "OK";

  return (
    <div className="min-h-dvh pb-28 text-slate-100" style={{ backgroundColor: BG }}>
      <Helmet>
        <title>Painel mestre — TransparênciaBR</title>
        <meta
          name="description"
          content="Painel mestre de exposição a risco cívico — indicadores forenses CEAP (motor AURORA, Data Lake GCS)."
        />
      </Helmet>

      <header
        className="sticky top-0 z-30 border-b border-white/[0.08] px-4 py-3 backdrop-blur-xl sm:px-6"
        style={{ background: `${BG}e8` }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <BrandLogo to="/" variant="full" size="md" />
            <div className="hidden h-6 w-px bg-white/15 sm:block" aria-hidden />
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#22d3ee]">
                TBR · Painel mestre de exposição a risco cívico
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Status datalake GCS:{" "}
                <span
                  className={
                    statusGcs === "OK"
                      ? "font-semibold text-emerald-400"
                      : statusGcs === "ERRO"
                        ? "font-semibold text-red-400"
                        : "font-semibold text-amber-300"
                  }
                >
                  {statusGcs}
                </span>
                {updatedLabel ? (
                  <>
                    {" "}
                    · Atualizado <span className="text-slate-300">{updatedLabel}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                {utcStatusLine(data?.ultima_classificacao_utc || data?.generated_at)}
              </p>
            </div>
          </div>
          <Link
            to="/alvos"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[#22d3ee]/35 bg-[#111827]/90 px-4 py-2 text-sm font-semibold text-[#22d3ee] transition hover:border-[#22d3ee]/60 hover:text-[#67e8f9]"
          >
            Ver todos os alvos
            <span aria-hidden>→</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {error ? (
          <div
            className="mb-8 rounded-2xl border border-amber-500/35 bg-amber-950/25 px-5 py-6"
            role="alert"
          >
            <p className="text-sm font-medium text-amber-100">
              Painel temporariamente indisponível. Nova tentativa
              {nextRetryMs ? ` em ${Math.round(nextRetryMs / 1000)}s` : ""}.
            </p>
            <p className="mt-2 font-mono text-xs text-amber-200/85">{error}</p>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
                />
              ))}
            </div>
          </div>
        ) : null}

        {empty ? (
          <p className="rounded-2xl border border-white/10 px-5 py-8 text-center text-sm text-slate-500">
            Motor de classificação ainda não publicou resultados no prefixo{" "}
            <span className="font-mono text-slate-400">ceap_classified/</span>. Volte em alguns minutos.
          </p>
        ) : null}

        {data && !empty ? (
          <>
            <section aria-labelledby="hero-kpis-heading" className="mb-10">
              <h2 id="hero-kpis-heading" className="sr-only">
                Hero de dados — indicadores principais
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <KPICardXL
                  label="Índice de exposição a risco público (IERP)"
                  accent="red"
                  footnote="Fonte: CEAP classificado (GCS) — (valor alto + médio) ÷ valor total classificado × 100."
                  ariaLabel={`IERP ${Number.isFinite(ierp) ? ierp : 0} por cento`}
                >
                  <AnimatedNumber value={ierp} decimals={1} suffix="%" />
                </KPICardXL>

                <KPICardXL
                  label="Taxa de abertura de dados (TAD)"
                  accent="green"
                  footnote="Proxy: parlamentares com notas no GCS ÷ roster. N_declarada API → BigQuery (003)."
                  ariaLabel={`Taxa de abertura ${Number.isFinite(tad) ? tad : 0} por cento`}
                >
                  <AnimatedNumber value={tad} decimals={1} suffix="%" />
                </KPICardXL>

                <KPICardXL
                  label="Rastreabilidade documental"
                  accent="cyan"
                  footnote="Fonte: CEAP classificado — notas com URL de documento preenchida ÷ total."
                  ariaLabel={`Rastreabilidade ${Number.isFinite(rast) ? rast : 0} por cento`}
                >
                  <AnimatedNumber value={rast} decimals={1} suffix="%" />
                </KPICardXL>

                <KPICardXL
                  label="Valor em faixa de alto risco"
                  accent="red"
                  footnote={`Fonte: CEAP classificado — ${pctAltoVsTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do valor total classificado.`}
                  ariaLabel={`Valor alto risco ${fmtBrl(valorAlto)}`}
                >
                  <span className="text-3xl sm:text-4xl">{fmtBrl(valorAlto)}</span>
                </KPICardXL>

                <KPICardXL
                  label="Concentração de fornecedores (HHI)"
                  accent="yellow"
                  footnote="Fonte: agregação global por CNPJ (0–10000). ≥2500: mercado concentrado."
                  ariaLabel={`HHI ${hhi}`}
                >
                  <span>{Number.isFinite(hhi) ? Math.round(hhi).toLocaleString("pt-BR") : "—"}</span>
                </KPICardXL>

                <KPICardXL
                  label="Diversidade de categorias (Shannon)"
                  accent="cyan"
                  footnote="Fonte: distribuição de valor por categoria — entropia em bits."
                  ariaLabel={`Entropia ${bits} bits`}
                >
                  <span>
                    {Number.isFinite(bits)
                      ? bits.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                      : "—"}{" "}
                    <span className="text-2xl font-semibold text-slate-500">bits</span>
                  </span>
                </KPICardXL>
              </div>
            </section>

            <div className="space-y-8">
              <GlassPanel
                title="Volume financeiro classificado (R$)"
                subtitle="Série anual — valores somados no datalake por ano de pasta."
              >
                <ForensicLineChart
                  points={serie}
                  valueFormatter={(v) => fmtBrl(v)}
                />
              </GlassPanel>

              <GlassPanel
                title="Parlamentares em destaque (alto risco)"
                subtitle="Top da amostra classificada — link para hotpage completa."
              >
                {topPreview.length === 0 ? (
                  <p className="text-sm text-slate-500">Sem pré-visualização.</p>
                ) : (
                  <ul className="space-y-3">
                    {topPreview.map((p, idx) => (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0b0f1a]/60 px-3 py-3 sm:px-4"
                      >
                        <span className="font-mono text-xs text-slate-500">#{idx + 1}</span>
                        <PoliticianOrb
                          identity={p.id}
                          score={Math.min(100, Math.round(Number(p.score_medio) || 45))}
                          size={44}
                          withRing
                          ariaLabel={`Orbe de risco, ${p.nome}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-100">
                            {p.nome}{" "}
                            <span className="font-normal text-slate-500">
                              ({p.partido}-{p.uf})
                            </span>
                          </p>
                          <p className="font-mono text-xs text-slate-400">
                            {p.qtd_notas_alto_risco} notas alto risco · score médio{" "}
                            {Number(p.score_medio).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                          </p>
                        </div>
                        <Link
                          to={`/dossie/${encodeURIComponent(p.id)}`}
                          className="shrink-0 text-xs font-semibold text-[#22d3ee] hover:text-[#67e8f9]"
                        >
                          Dossiê →
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </GlassPanel>

              <GlassPanel
                title="Profundidade de cobertura"
                subtitle="Notas classificadas por parlamentar (média global no datalake)."
              >
                <div className="mb-4 flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-3xl font-bold text-[#22d3ee]">
                    {Number.isFinite(prof) ? prof.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}
                  </span>
                  <span className="text-sm text-slate-500">notas / parlamentar (média)</span>
                </div>
                <ForensicBarChartH
                  rows={notasAno.map((r) => ({ label: r.ano, value: r.qtd }))}
                  labelKey="label"
                  valueKey="value"
                  valueFormatter={(n) =>
                    Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 })
                  }
                />
              </GlassPanel>

              <GlassPanel
                title="Tempo de resposta do pipeline"
                subtitle="Média entre data de publicação (campo no JSONL) e classified_at, quando ambos válidos."
              >
                <p className="font-mono text-3xl font-bold text-[#facc15]">
                  {lat != null
                    ? `${Number(lat).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`
                    : "—"}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {lat == null
                    ? "Sem amostras com publicação + classificação temporal na base atual."
                    : "Latência média ingestão → classificação AURORA."}
                </p>
              </GlassPanel>

              <GlassPanel title="Distribuição por faixa de risco (notas)" subtitle="Contagem por score da linha.">
                <p className="mb-3 text-xs text-slate-500">
                  Baixo &lt;60 · Médio 60–84 · Alto ≥85
                </p>
                <ul className="space-y-3">
                  <RiskRow label="Baixo" count={risk.baixo} total={riskSum} color="#22c55e" />
                  <RiskRow label="Médio" count={risk.medio} total={riskSum} color="#f59e0b" />
                  <RiskRow label="Alto" count={risk.alto} total={riskSum} color="#ef4444" />
                </ul>
              </GlassPanel>

              <GlassPanel
                title="Principais categorias (por soma de score)"
                subtitle="Ranking operacional no recorte classificado."
              >
                <ol className="space-y-2">
                  {(data.top_categorias_risco || []).slice(0, 10).map((row, idx) => (
                    <li
                      key={`${row.categoria}-${idx}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#0b0f1a]/50 px-4 py-3"
                    >
                      <span className="text-sm text-slate-300">
                        <span className="mr-2 font-mono text-[#22d3ee]">{idx + 1}.</span>
                        {row.categoria}
                      </span>
                      <span className="font-mono text-sm tabular-nums text-slate-500">
                        score Σ{" "}
                        {Number(row.score_total).toLocaleString("pt-BR", {
                          maximumFractionDigits: 0,
                        })}{" "}
                        · {row.qtd} notas
                        {row.valor_total_brl != null ? <> · {fmtBrl(row.valor_total_brl)}</> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </GlassPanel>
            </div>

            <div className="mt-12 flex justify-end">
              <Link
                to="/alvos"
                className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-[#0B0F1A] shadow-[0_0_32px_rgba(212,175,55,0.35)] transition hover:brightness-110"
                style={{ backgroundColor: "#d4af37" }}
              >
                Ver todos os alvos
                <span aria-hidden>→</span>
              </Link>
            </div>

            <div className="mt-8 grid gap-4 border-t border-white/[0.06] pt-8 sm:grid-cols-3">
              <div className="rounded-xl border border-white/[0.06] bg-[#111827]/80 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Cobertura roster
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-100">
                  <AnimatedNumber value={data.total_parlamentares_cobertos} />
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {Number(data.cobertura_pct ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do
                  roster
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#111827]/80 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Notas classificadas
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-100">
                  <AnimatedNumber value={data.total_notas_classificadas} />
                </p>
                <p className="mt-1 text-xs text-slate-500">Total no datalake</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#111827]/80 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Valor classificado
                </p>
                <p className="mt-1 font-mono text-xl font-bold text-slate-100">{fmtBrl(valorTotal)}</p>
                <p className="mt-1 text-xs text-slate-500">Soma CEAP (abs)</p>
              </div>
            </div>

            {typeof data.parse_errors === "number" && data.parse_errors > 0 ? (
              <p className="mt-8 text-center font-mono text-[11px] text-slate-600">
                Linhas JSONL ignoradas no parse: {data.parse_errors}
              </p>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
