import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useEffect, useRef, useState } from "react";

import BrandLogo from "../components/BrandLogo.jsx";
import useDashboardKPIs from "../hooks/useDashboardKPIs.js";

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
    <span className={`font-data tabular-nums ${className}`}>
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

function KpiCard({ label, sub, children }) {
  return (
    <div className="rounded-2xl border border-white/[0.1] bg-white/[0.05] p-5 shadow-inner backdrop-blur-[16px]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8B949E]">
        {label}
      </p>
      <div className="mt-3">{children}</div>
      {sub ? <p className="mt-2 text-xs text-[#6e7681]">{sub}</p> : null}
    </div>
  );
}

function RiskRow({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <li className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-[8rem] items-center justify-between gap-2 sm:block">
        <span className="text-sm font-medium text-[#C9D1D9]">{label}</span>
        <span className="font-data text-sm tabular-nums text-[#8B949E]">{count}</span>
      </div>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-[#21262D]">
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

  const updatedLabel = data?.ultima_classificacao_utc
    ? formatRelativePt(new Date(data.ultima_classificacao_utc))
    : null;

  const risk = data?.notas_por_faixa_risco || { baixo: 0, medio: 0, alto: 0 };
  const riskSum = risk.baixo + risk.medio + risk.alto || 1;

  return (
    <div className="min-h-dvh bg-[#02040a] text-[#E6EDF3]">
      <Helmet>
        <title>Painel mestre — TransparênciaBR</title>
        <meta
          name="description"
          content="Indicadores agregados das notas CEAP classificadas no Data Lake (motor AURORA)."
        />
      </Helmet>

      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#02040a]/85 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo to="/" variant="full" size="md" />
            <div className="hidden h-6 w-px bg-white/15 sm:block" aria-hidden />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
                Painel mestre
              </p>
              <p className="text-xs text-[#7DD3FC]/90">
                Data Lake ·{" "}
                {updatedLabel ? `Atualizado ${updatedLabel}` : "Sincronizando…"}
              </p>
            </div>
          </div>
          <Link
            to="/alvos"
            className="inline-flex items-center gap-2 rounded-full border border-[#58A6FF]/40 bg-[#0d1117]/80 px-4 py-2 text-sm font-semibold text-[#7DD3FC] transition hover:border-[#7DD3FC]/70 hover:text-[#F0F4FC]"
          >
            Ver alvos
            <span aria-hidden>→</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {error ? (
          <div
            className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-5 py-6 text-center"
            role="alert"
          >
            <p className="text-sm font-medium text-amber-100">
              Painel temporariamente indisponível. Tentando novamente
              {nextRetryMs ? ` em ${Math.round(nextRetryMs / 1000)}s` : ""}.
            </p>
            <p className="mt-2 text-xs text-amber-200/80">{error}</p>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
                />
              ))}
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-8 animate-pulse rounded-lg bg-white/[0.04]"
                />
              ))}
            </div>
          </div>
        ) : null}

        {empty ? (
          <p className="rounded-2xl border border-[#30363D] bg-[#0d1117]/60 px-5 py-8 text-center text-sm text-[#8B949E]">
            Motor de classificação ainda não publicou resultados. Volte em alguns minutos.
          </p>
        ) : null}

        {data && !empty ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard
                label="Parlamentares cobertos"
                sub={`${Number(data.cobertura_pct ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do roster`}
              >
                <AnimatedNumber
                  value={data.total_parlamentares_cobertos}
                  className="text-3xl font-bold text-[#F0F4FC] sm:text-4xl"
                />
                <span className="mt-1 block text-xs text-[#8B949E]">de 594 no roster</span>
              </KpiCard>
              <KpiCard label="Notas classificadas" sub="Total no Data Lake">
                <AnimatedNumber
                  value={data.total_notas_classificadas}
                  className="text-3xl font-bold text-[#F0F4FC] sm:text-4xl"
                />
              </KpiCard>
              <KpiCard label="Valor classificado" sub="Soma das notas (CEAP)">
                <p className="font-data text-2xl font-bold tabular-nums text-[#F0F4FC] sm:text-3xl">
                  {fmtBrl(data.valor_total_classificado_brl)}
                </p>
              </KpiCard>
            </div>

            <section className="mt-10">
              <h2 className="text-lg font-semibold text-[#F0F4FC]">
                Distribuição por faixa de risco
              </h2>
              <p className="mt-1 text-xs text-[#8B949E]">
                Baixo &lt;60 · Médio 60–84 · Alto ≥85 (score da linha)
              </p>
              <ul className="mt-4 space-y-3">
                <RiskRow
                  label="Baixo"
                  count={risk.baixo}
                  total={riskSum}
                  color="#22c55e"
                />
                <RiskRow
                  label="Médio"
                  count={risk.medio}
                  total={riskSum}
                  color="#f59e0b"
                />
                <RiskRow
                  label="Alto"
                  count={risk.alto}
                  total={riskSum}
                  color="#ef4444"
                />
              </ul>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-semibold text-[#F0F4FC]">
                Principais categorias (por soma de score)
              </h2>
              <ol className="mt-4 space-y-2">
                {(data.top_categorias_risco || []).slice(0, 10).map((row, idx) => (
                  <li
                    key={`${row.categoria}-${idx}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 backdrop-blur-md"
                  >
                    <span className="text-sm text-[#C9D1D9]">
                      <span className="mr-2 font-data text-[#7DD3FC]">{idx + 1}.</span>
                      {row.categoria}
                    </span>
                    <span className="font-data text-sm tabular-nums text-[#8B949E]">
                      score Σ{" "}
                      {Number(row.score_total).toLocaleString("pt-BR", {
                        maximumFractionDigits: 0,
                      })}{" "}
                      · {row.qtd} notas
                      {row.valor_total_brl != null ? (
                        <> · {fmtBrl(row.valor_total_brl)}</>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="mt-12 flex justify-center">
              <Link
                to="/alvos"
                className="inline-flex items-center gap-2 rounded-xl bg-[#58A6FF] px-6 py-3 text-sm font-bold uppercase tracking-wide text-[#02040a] shadow-[0_0_28px_rgba(88,166,255,0.35)] transition hover:bg-[#79b8ff]"
              >
                Ver alvos da semana
                <span aria-hidden>→</span>
              </Link>
            </div>

            {typeof data.parse_errors === "number" && data.parse_errors > 0 ? (
              <p className="mt-6 text-center text-[11px] text-[#6e7681]">
                Linhas JSONL ignoradas no parse: {data.parse_errors}
              </p>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
