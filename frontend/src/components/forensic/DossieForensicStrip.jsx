import { Link } from "react-router-dom";

import ForensicBarChartH from "./ForensicBarChartH.jsx";
import ForensicLineChart from "./ForensicLineChart.jsx";
import KPICardXL from "./KPICardXL.jsx";

function fmtBrlCompact(n) {
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

function shortCatLabel(name, max = 18) {
  const s = String(name || "").trim() || "—";
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * Faixa resumo executivo CEAP (datalake) no dossiê — alinhado ao contrato 003 FORENSE / UX.
 */
export default function DossieForensicStrip({ kpi, politicoId, loading }) {
  if (loading) {
    return (
      <section
        className="mb-8 h-32 animate-pulse rounded-2xl border border-white/[0.08] bg-[#111827]/40"
        aria-busy="true"
        aria-label="A carregar indicadores CEAP"
      />
    );
  }

  if (!kpi && !politicoId) return null;

  if (!kpi) {
    return (
      <section
        className="mb-8 rounded-2xl border border-white/[0.08] bg-[#111827]/60 p-5 text-center text-sm text-slate-500"
        aria-label="Indicadores CEAP agregados"
      >
        <p>
          Indicadores forenses CEAP (GCS) ainda não disponíveis para este ID — o pipeline pode não ter
          publicado <span className="font-mono text-slate-400">ceap_classified/</span> para este parlamentar.
        </p>
      </section>
    );
  }

  const idx = Number(kpi.indice_risco_aurora);
  const idxAccent =
    idx >= 85 ? "red" : idx >= 60 ? "orange" : idx >= 40 ? "yellow" : "green";

  const serie = Array.isArray(kpi.serie_valor_anual_brl) ? kpi.serie_valor_anual_brl : [];
  const topCats = Array.isArray(kpi.top_categorias_valor) ? kpi.top_categorias_valor : [];
  const barRows = topCats.map((row) => ({
    label: shortCatLabel(row.categoria, 16),
    labelTitle: row.categoria,
    value: row.valor_brl,
  }));

  return (
    <section
      className="mb-8 rounded-2xl border border-[#22d3ee]/20 bg-[#111827]/85 p-5 sm:p-6"
      aria-label="Resumo executivo e KPIs individuais CEAP"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#22d3ee]">
            Motor AURORA · CEAP classificado
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Resumo forense (datalake)</h2>
        </div>
        <Link
          to="/metodologia"
          className="text-xs font-semibold text-[#d4af37] underline-offset-2 hover:underline"
        >
          Metodologia
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KPICardXL
          label="Índice de risco AURORA"
          accent={idxAccent}
          footnote="Fonte: agregação CEAP classificado (GCS) · score ponderado + frequência alto risco − penalidade HHI."
          ariaLabel={`Índice de risco AURORA ${Number.isFinite(idx) ? idx : 0}`}
        >
          <span>{Number.isFinite(idx) ? idx.toFixed(1) : "—"}</span>
        </KPICardXL>

        <KPICardXL
          label="Score médio ponderado"
          accent="cyan"
          footnote="Fonte: Σ(score×valor)/Σ(valor) nas notas classificadas."
          ariaLabel={`Score médio ponderado ${kpi.score_medio_ponderado}`}
        >
          <span>
            {Number(kpi.score_medio_ponderado).toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
            })}
          </span>
        </KPICardXL>

        <KPICardXL
          label="Posicionamento GAL"
          accent="gold"
          footnote={
            kpi.posicionamento_ideologico_gal_motivo ||
            "Requer votações nominais (BigQuery). Campo reservado."
          }
          ariaLabel="Posicionamento ideológico GAL não disponível neste recorte"
        >
          <span className="text-3xl sm:text-4xl">—</span>
        </KPICardXL>

        <KPICardXL
          label="Notas alto risco (≥85)"
          accent="red"
          footnote="Fonte: CEAP classificado · contagem de linhas."
          ariaLabel={`${kpi.qtd_notas_alto_risco} notas em alto risco`}
        >
          <span>{Number(kpi.qtd_notas_alto_risco || 0)}</span>
        </KPICardXL>

        <KPICardXL
          label="Valor alto risco"
          accent="red"
          footnote="Fonte: soma dos valores das notas com score ≥ 85."
          ariaLabel={`Valor em alto risco ${fmtBrlCompact(kpi.valor_alto_risco_brl)}`}
        >
          <span className="text-3xl sm:text-4xl">{fmtBrlCompact(kpi.valor_alto_risco_brl)}</span>
        </KPICardXL>

        <KPICardXL
          label="HHI fornecedores"
          accent="yellow"
          footnote="Herfindahl-Hirschman (0–10000). ≥2500: concentração elevada."
          ariaLabel={`HHI ${kpi.hhi_fornecedores}`}
        >
          <span>{Number(kpi.hhi_fornecedores || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
        </KPICardXL>

        <KPICardXL
          label="Diversidade CEAP (Shannon)"
          accent="cyan"
          footnote="Entropia em bits sobre distribuição de valor por categoria."
          ariaLabel={`Diversidade ${kpi.diversidade_categorias_shannon_bits} bits`}
        >
          <span>
            {Number(kpi.diversidade_categorias_shannon_bits || 0).toLocaleString("pt-BR", {
              maximumFractionDigits: 2,
            })}{" "}
            <span className="text-2xl text-slate-400">bits</span>
          </span>
        </KPICardXL>

        <KPICardXL
          label="Média notas/ano"
          accent="cyan"
          footnote="Notas classificadas ÷ anos distintos no datalake."
          ariaLabel={`Média de notas por ano ${kpi.media_notas_por_ano}`}
        >
          <span>
            {Number(kpi.media_notas_por_ano || 0).toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
            })}
          </span>
        </KPICardXL>

        <KPICardXL
          label="Rastreabilidade doc."
          accent="green"
          footnote="Proporção de linhas com URL de documento preenchida (campo presente no JSONL)."
          ariaLabel={`Rastreabilidade ${kpi.rastreabilidade_pct} por cento`}
        >
          <span>
            {Number(kpi.rastreabilidade_pct || 0).toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
            })}
            %
          </span>
        </KPICardXL>
      </div>

      {(serie.length > 0 || barRows.length > 0) && (
        <div
          className="mt-8 grid gap-6 lg:grid-cols-2"
          aria-label="Mini gráficos CEAP: evolução anual e valor por categoria"
        >
          <div className="rounded-xl border border-white/[0.08] bg-[#0b0f1a]/50 p-4 sm:p-5">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#22d3ee]">
              Evolução CEAP (valor classificado)
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Fonte: soma por ano no prefixo <span className="font-mono text-slate-400">ceap_classified/</span>.
            </p>
            <div className="mt-3">
              <ForensicLineChart
                points={serie}
                valueFormatter={(v) => fmtBrlCompact(v)}
                height={120}
                compact
                showValueLabels={serie.length <= 6}
                ariaLabel="Mini gráfico de linha do valor CEAP classificado por ano"
                emptyMessage="Sem série anual para este parlamentar."
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0b0f1a]/50 p-4 sm:p-5">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#22d3ee]">
              Gasto por categoria (top 8)
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Fonte: valor agregado por rubrica no datalake classificado.
            </p>
            <div className="mt-3">
              <ForensicBarChartH
                rows={barRows}
                labelKey="label"
                titleKey="labelTitle"
                valueKey="value"
                valueFormatter={(v) => fmtBrlCompact(v)}
                compact
                maxRows={8}
                emptyMessage="Sem categorias agregadas."
              />
            </div>
          </div>
        </div>
      )}

      {kpi.latencia_media_horas_ingestao_classif != null ? (
        <p className="mt-4 font-mono text-[11px] text-slate-500">
          Latência média ingestão → classificação:{" "}
          <span className="text-slate-300">
            {Number(kpi.latencia_media_horas_ingestao_classif).toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
            })}{" "}
            h
          </span>{" "}
          (amostras com data publicação + classified_at válidos)
        </p>
      ) : null}
    </section>
  );
}
