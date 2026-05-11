// bentos/index.jsx — Conteúdo interno de cada um dos 17 bentos.
// Cada componente recebe `data` (real do hook) e renderiza SOMENTE o miolo
// do card (BentoCard wrappa do lado de fora).
//
// MOCK ZERO: quando `data` é null/inválido, renderiza <EmBreve variant="inline" />.
// Filosofia: "Toda nota é suspeita até prova contrária. Não fazemos
// denúncia — apresentamos fatos."

import React from 'react';
/** Helper: renderiza estado "em breve" inline com mensagem honesta. */
function EmBreveBento({ titulo = 'Em breve', subtitulo = 'Aurora ainda não processou esta camada. Em breve.' }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center px-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">{titulo}</p>
        <p className="mt-1 text-[10px] leading-tight text-white/45">{subtitulo}</p>
      </div>
    </div>
  );
}

function SkeletonBento() {
  return (
    <div className="h-full animate-pulse">
      <div className="h-5 w-20 rounded bg-white/10" />
      <div className="mt-2 h-8 w-24 rounded bg-white/10" />
      <div className="mt-3 h-2 w-full rounded bg-white/10" />
      <div className="mt-3 space-y-1.5">
        <div className="h-2 w-full rounded bg-white/10" />
        <div className="h-2 w-11/12 rounded bg-white/10" />
        <div className="h-2 w-10/12 rounded bg-white/10" />
      </div>
    </div>
  );
}

const fmtBRL = (v) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtBRLcompact = (v) => {
  if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toFixed(1)} bi`;
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)} mi`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)} k`;
  return fmtBRL(v);
};

// =============================================================================
// B01 PontuacaoBrasil — gauge + sparkline
// =============================================================================
export function PontuacaoBrasil({ data, loading = false }) {
  if (loading || !data || data.score == null) return <SkeletonBento />;
  const score = Number(data.score || 0);
  const faixas = data.faixas || {};
  const alto = Number(faixas.alto || 0);
  const medio = Number(faixas.medio || 0);
  const baixo = Number(faixas.baixo || 0);
  const coberturaPct = Number(data.coberturaPct || 0);
  const totalParlamentares = Number(data.totalParlamentares || 0);
  const scoreTone =
    score <= 30
      ? 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10'
      : score <= 60
        ? 'text-amber-300 border-amber-400/40 bg-amber-500/10'
        : 'text-red-300 border-red-400/40 bg-red-500/10';
  const scoreBar =
    score <= 30 ? 'from-emerald-400 to-emerald-300' : score <= 60 ? 'from-amber-400 to-amber-300' : 'from-red-500 to-red-400';
  return (
    <div className="flex h-full flex-col justify-between gap-1.5">
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-[0.18em] text-white/50">score nacional</span>
          <span className="text-2xl font-semibold text-white tabular-nums leading-none">
            {score}
            <span className="text-xs text-white/45"> / 100</span>
          </span>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${scoreTone}`}>{score <= 30 ? 'baixo' : score <= 60 ? 'médio' : 'alto'}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${scoreBar}`} style={{ width: `${score}%` }} />
      </div>
      <ul className="space-y-1 text-[10px] text-white/70 tabular-nums leading-tight">
        <li className="flex items-center justify-between"><span>● Alto risco</span><span>{alto.toLocaleString('pt-BR')} notas</span></li>
        <li className="flex items-center justify-between"><span>● Médio risco</span><span>{medio.toLocaleString('pt-BR')} notas</span></li>
        <li className="flex items-center justify-between"><span>● Baixo risco</span><span>{baixo.toLocaleString('pt-BR')} notas</span></li>
      </ul>
      <p className="text-[10px] text-white/45 tabular-nums">
        Cobertura {coberturaPct.toFixed(1)}% · {totalParlamentares.toLocaleString('pt-BR')} parlamentares
      </p>
    </div>
  );
}

// =============================================================================
// B02 MaioresCotas — tabela top 5
// =============================================================================
export function MaioresCotas({ data }) {
  if (!Array.isArray(data) || data.length === 0)
    return <EmBreveBento subtitulo="Carregando ranking de cotas." />;
  return (
    <ul className="space-y-1.5 text-[12px]">
      {data.slice(0, 5).map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
            <span className="text-white/80 truncate">{p.nome.split(' ')[0]}</span>
            <span className="px-1.5 py-0.5 text-[9px] bg-white/5 border border-white/10 rounded text-white/60 flex-shrink-0">{p.partido}</span>
            {p.is_suplente ? (
              <span className="px-1.5 py-0.5 text-[8px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0">
                SUP
              </span>
            ) : null}
          </span>
          <span className="flex flex-col items-end flex-shrink-0">
            <span className="text-white tabular-nums text-[11px]">{fmtBRL(p.cota)}</span>
            {Number.isFinite(Number(p.pct)) ? (
              <span className="text-[9px] text-white/40 tabular-nums">{Number(p.pct).toFixed(0)}% cota</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// =============================================================================
// B03 SinalizacoesSOC — feed live
// =============================================================================
export function SinalizacoesSOC({ data, loading = false }) {
  if (loading || !Array.isArray(data) || data.length === 0) return <SkeletonBento />;
  const scoreClass = (score) =>
    score <= 30
      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
      : score <= 60
        ? 'border-amber-400/30 bg-amber-500/10 text-amber-300'
        : 'border-red-400/30 bg-red-500/10 text-red-300';
  return (
    <div className="flex h-full flex-col gap-1.5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Parlamentares em alerta</p>
      <ul className="space-y-1">
        {data.slice(0, 5).map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] text-white/90">{item.nome}</p>
              <p className="text-[9px] text-white/50 tabular-nums">{item.partido}/{item.uf}</p>
            </div>
            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ${scoreClass(item.scoreMedio)}`}>
                {Math.round(Number(item.scoreMedio || 0))}/100
              </span>
              {item.valorTotal > 0 ? (
                <span className="text-[8px] text-white/40 tabular-nums">{fmtBRLcompact(item.valorTotal)}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// B04 MapaUFBrasil — grade de top 8 UFs por intensidade (parlamentares)
// =============================================================================
export function MapaUFBrasil({ data }) {
  if (!Array.isArray(data) || data.length === 0)
    return <EmBreveBento subtitulo="Calculando distribuição por UF." />;
  const top = [...data].sort((a, b) => b.total - a.total).slice(0, 8);
  const max = Math.max(1, ...top.map((d) => d.total));
  return (
    <div className="flex flex-col h-full justify-between gap-1">
      <div className="grid grid-cols-4 gap-1">
        {top.map((d) => {
          const pct = (d.total / max) * 100;
          // Cor cyan->amber pela intensidade relativa
          const hue = 180 - (pct / 100) * 130; // 180 cyan -> 50 amber
          return (
            <div
              key={d.uf}
              className="relative aspect-square rounded border border-white/10 overflow-hidden flex flex-col items-center justify-center"
              title={`${d.uf}: ${d.total} parlamentares`}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: `hsla(${hue}, 70%, 50%, ${0.15 + (pct / 100) * 0.4})`,
                }}
              />
              <span className="relative text-[10px] font-bold text-white tabular-nums">
                {d.uf}
              </span>
              <span className="relative text-[9px] text-white/70 tabular-nums">
                {d.total}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-white/40 text-center">
        top 8 UFs · parlamentares por estado
      </p>
    </div>
  );
}

// =============================================================================
// B05 PulsoCEAP — número grande + barra de quota
// =============================================================================
export function PulsoCEAP({ data }) {
  if (!data) return <EmBreveBento subtitulo="Pulso CEAP diário em breve." />;
  return (
    <div className="flex flex-col justify-between h-full">
      <div>
        <p className="text-3xl font-semibold text-white tabular-nums leading-tight">
          {fmtBRLcompact(data.queimadoHoje)}
        </p>
        <p className="text-xs text-white/50 mt-0.5">queimados hoje</p>
      </div>
      <div className="mt-3">
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-violet-400"
            style={{ width: `${data.pctConsumido}%` }}
          />
        </div>
        <p className="text-[10px] text-white/40 mt-1">{data.pctConsumido}% da quota mensal consumida</p>
      </div>
    </div>
  );
}

// =============================================================================
// B06 MataUFBrasil — top UFs por volume de alvos (modo "risco" = vermelho;
// modo "cobertura" = cyan, indicando concentração de notas no lake)
// =============================================================================
export function MataUFBrasil({ data }) {
  if (!Array.isArray(data) || data.length === 0)
    return <EmBreveBento subtitulo="Calculando alvos críticos por UF." />;
  const top = [...data]
    .filter((r) => Number(r.risco || 0) > 0)
    .sort((a, b) => b.risco - a.risco)
    .slice(0, 8);
  if (top.length === 0)
    return <EmBreveBento subtitulo="Sem sinalizações de alto risco no momento." />;
  const maxR = Math.max(1, ...top.map((r) => r.risco));
  const modo = top[0]?.modo || "risco";
  const isRisco = modo === "risco";
  return (
    <div className="flex flex-col h-full gap-1">
      <div className="grid grid-cols-4 gap-1.5 flex-1 content-center">
        {top.map((r) => {
          const intensity = Math.min(1, r.risco / maxR);
          let bg, border;
          if (isRisco) {
            // vermelho->amber para risco real
            bg = `rgba(${248 - Math.round(60 * intensity)}, ${113 - Math.round(40 * intensity)}, ${113 - Math.round(60 * intensity)}, ${0.18 + 0.42 * intensity})`;
            border = `rgba(248, 113, 113, ${0.3 + 0.5 * intensity})`;
          } else {
            // cyan para concentração/cobertura (modo honesto: "o que temos")
            bg = `rgba(34, 211, 238, ${0.12 + 0.4 * intensity})`;
            border = `rgba(34, 211, 238, ${0.25 + 0.45 * intensity})`;
          }
          return (
            <div
              key={r.uf}
              className="rounded-lg px-1 py-1.5 flex flex-col items-center justify-center"
              style={{ background: bg, border: `1px solid ${border}` }}
              title={`${r.uf}: ${r.risco} ${isRisco ? "sinalizações de alto risco" : "parlamentares cobertos"}`}
            >
              <span className="text-xs font-bold text-white tabular-nums leading-none">{r.uf}</span>
              <span className="text-[9px] text-white/70 tabular-nums mt-0.5">{r.risco}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-white/40 text-center leading-tight">
        {isRisco
          ? "sinalizações de alto risco · datalake"
          : "cobertura no lake · classificação em refinamento"}
      </p>
    </div>
  );
}

// =============================================================================
// B07 EmendasCriticas — número grande + lista; varia entre risco real e volume
// =============================================================================
export function EmendasCriticas({ data }) {
  if (!data) return <EmBreveBento subtitulo="Pipeline de emendas em construção." />;
  const isRisco = data.modo === "risco";
  const tagBg = isRisco
    ? "bg-red-500/15 text-red-300 border border-red-400/20"
    : "bg-cyan-500/15 text-cyan-300 border border-cyan-400/20";
  const barGradient = isRisco
    ? "bg-gradient-to-r from-red-400 to-amber-400"
    : "bg-gradient-to-r from-cyan-400 to-violet-400";
  return (
    <div className="flex h-full justify-between gap-3">
      <div className="flex flex-col justify-between flex-1 min-w-0">
        <div>
          <p className="text-3xl font-semibold text-white tabular-nums leading-tight">
            {fmtBRLcompact(data.queimadoHoje)}
          </p>
          <p className="text-xs text-white/50 mt-0.5">
            {isRisco ? "alto risco classificado" : "valor classificado no lake"}
          </p>
        </div>
        <div className="mt-2">
          {isRisco ? (
            <>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full ${barGradient}`} style={{ width: `${data.pctConsumido}%` }} />
              </div>
              <p className="text-[10px] text-white/40 mt-1">{data.pctConsumido}% da quota mensal consumida</p>
            </>
          ) : (
            <p className="text-[10px] text-white/40">categorização em refinamento</p>
          )}
        </div>
      </div>
      <ul className="space-y-1 text-[11px] flex-shrink-0">
        {data.topCnpj.map((c, i) => (
          <li key={`${c.cnpj}-${i}`} className="flex items-center gap-2">
            <span className="text-white/60 truncate max-w-[120px]">{c.cnpj}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] ${tagBg}`}>{c.risco}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// B08 ContratosPNCP — histograma + total nacional 30d
// =============================================================================
export function ContratosPNCP({ data }) {
  if (!data || !Array.isArray(data.histograma) || data.histograma.length === 0)
    return <EmBreveBento subtitulo="Aguardando dados PNCP nacional." />;
  const max = Math.max(1, ...data.histograma.map((h) => h.count));
  const faixaCeap = data.source === "ceap_faixa";
  return (
    <div className="flex flex-col h-full justify-between">
      {!faixaCeap && data.total != null ? (
        <div className="mb-1">
          <p className="text-2xl font-semibold text-white tabular-nums leading-tight">
            {Number(data.total).toLocaleString("pt-BR")}
          </p>
          <p className="text-[10px] text-white/50">contratos federais · 30d</p>
          {data.valor30d ? (
            <p className="text-[11px] text-cyan-300 tabular-nums mt-0.5">
              {fmtBRLcompact(data.valor30d)}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-end gap-1 h-12">
        {data.histograma.map((h) => (
          <div key={h.bucket} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full bg-gradient-to-t from-cyan-500/40 to-cyan-300/80 rounded-t min-h-[2px]"
              style={{ height: `${(h.count / max) * 100}%` }}
              title={`${h.bucket}: ${h.count}`}
            />
            <span className="text-[8px] text-white/40 truncate w-full text-center">
              {h.bucket}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-white/40 text-center mt-1">
        {faixaCeap ? "faixa de risco · datalake CEAP" : "valor por faixa · PNCP nacional"}
      </p>
    </div>
  );
}

// =============================================================================
// B09 RadarJuridico — funil estilizado
// =============================================================================
export function RadarJuridico({ data }) {
  if (!data) return <EmBreveBento subtitulo="Radar Jurídico em construção." />;
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <div className="relative">
        <div className="px-3 py-2 bg-emerald-400/10 border border-emerald-400/30 rounded text-emerald-300 text-xs font-medium tabular-nums">
          {data.leadsAtivos} leads ativos
        </div>
        <svg viewBox="0 0 60 30" className="w-16 h-8 mx-auto mt-1" fill="none">
          <path d="M 5 5 L 55 5 L 40 25 L 20 25 Z" stroke="#34d399" strokeWidth="1" opacity="0.6" />
          <path d="M 15 12 L 45 12 L 35 22 L 25 22 Z" stroke="#34d399" strokeWidth="1" opacity="0.4" />
        </svg>
      </div>
    </div>
  );
}

// =============================================================================
// B10 MeuUniverso — planetas dos alvos pessoais (avatares circulares)
// =============================================================================
export function MeuUniverso({ data }) {
  if (!Array.isArray(data) || data.length === 0)
    return <EmBreveBento subtitulo="Adicione alvos pessoais para popular seu universo." />;
  return (
    <div className="grid grid-cols-3 gap-3 h-full content-center">
      {data.slice(0, 6).map(p => (
        <div key={p.id} className="flex flex-col items-center gap-1">
          <div
            className="w-10 h-10 rounded-full flex-shrink-0 shadow-lg"
            style={{
              background: `radial-gradient(circle at 30% 30%, ${p.cor}, ${p.cor}40)`,
              boxShadow: `0 0 12px -2px ${p.cor}80`,
            }}
          />
          <span className="text-[10px] text-white/70 text-center leading-tight line-clamp-1">{p.nome.split(' ')[0]}</span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// B11 MaisFrugais — top 5
// =============================================================================
export function MaisFrugais({ data }) {
  if (!Array.isArray(data) || data.length === 0)
    return <EmBreveBento subtitulo="Calculando ranking de frugalidade." />;
  return (
    <ul className="space-y-1.5 text-[12px]">
      {data.slice(0, 5).map((p) => (
        <li key={p.id} className="flex items-center justify-between py-0.5 gap-2">
          <span className="truncate text-sm text-white/90 min-w-0">
            {p.nome.split(' ').slice(0, 2).join(' ')}
            {p.is_suplente ? (
              <span className="ml-1.5 px-1.5 py-0.5 text-[9px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 align-middle">
                SUP
              </span>
            ) : null}
          </span>
          <span className="flex flex-col items-end ml-2 flex-shrink-0">
            <span className="text-cyan-400 font-bold tabular-nums text-sm">
              {Number.isFinite(Number(p.pct)) ? `${Number(p.pct).toFixed(0)}%` : '—'}
            </span>
            <span className="text-[10px] text-white/40 tabular-nums">
              {Number.isFinite(Number(p.meses_ativos)) ? `${p.meses_ativos}m` : '—'} ·{' '}
              {fmtBRLcompact(p.cota)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// =============================================================================
// B12 InfluenciaSetorial — mini-Sankey (linhas curvas)
// =============================================================================
export function InfluenciaSetorial({ data }) {
  if (!data) return <EmBreveBento subtitulo="Sankey setor × partido em construção." />;
  const colors = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#f87171'];
  return (
    <div className="relative w-full h-full min-h-[100px]">
      <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-around text-[10px] text-white/60">
        {data.esquerda.map(s => <span key={s}>{s}</span>)}
      </div>
      <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-around text-[10px] text-white/60">
        {data.direita.map(p => <span key={p}>{p}</span>)}
      </div>
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        {data.links.map((l, i) => {
          const fromIdx = data.esquerda.indexOf(l.from);
          const toIdx = data.direita.indexOf(l.to);
          const y1 = 12 + fromIdx * (76 / (data.esquerda.length - 1));
          const y2 = 12 + toIdx * (76 / (data.direita.length - 1));
          return (
            <path
              key={i}
              d={`M 18 ${y1} C 50 ${y1}, 50 ${y2}, 82 ${y2}`}
              stroke={colors[i % colors.length]}
              strokeWidth={Math.max(0.6, l.valor / 18)}
              fill="none"
              opacity="0.55"
            />
          );
        })}
      </svg>
    </div>
  );
}

// =============================================================================
// B13 AtividadeLegislativa — 4 KPIs em grid (métricas operacionais reais)
// =============================================================================
export function AtividadeLegislativa({ data }) {
  if (!data) return <EmBreveBento subtitulo="Calculando atividade legislativa." />;
  const fmt = (v) => (v == null ? '—' : (typeof v === 'number' ? v.toLocaleString('pt-BR') : v));
  const items = [
    { label: 'Parlamentares', value: fmt(data.total),                                          color: 'cyan' },
    { label: 'Cobertura',     value: data.cobertura != null ? `${data.cobertura}%` : '—',     color: 'emerald' },
    { label: 'Notas no lake', value: fmt(data.notasLake),                                      color: 'violet' },
    { label: 'Alto risco',    value: fmt(data.altoRisco),                                      color: 'red' },
  ];
  const colorMap = {
    emerald: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300',
    cyan:    'bg-cyan-500/10 border-cyan-400/30 text-cyan-300',
    violet:  'bg-violet-500/10 border-violet-400/30 text-violet-300',
    red:     'bg-red-500/10 border-red-400/30 text-red-300',
  };
  return (
    <div className="grid grid-cols-4 gap-1.5 h-full content-center">
      {items.map(it => (
        <div key={it.label} className={`rounded-lg border px-2 py-2 text-center ${colorMap[it.color]}`}>
          <p className="text-[14px] font-semibold tabular-nums leading-tight">{it.value}</p>
          <p className="text-[9px] opacity-70 mt-0.5">{it.label}</p>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// B14 PromessaEntrega — wordcloud + valor entregue
// =============================================================================
export function PromessaEntrega({ data }) {
  if (!data) return <EmBreveBento subtitulo="Promessa × Entrega em construção." />;
  return (
    <div className="flex h-full gap-3">
      <div className="flex-1 flex flex-wrap gap-1.5 items-center content-center">
        {data.campanha.map((w, idx) => (
          <span
            key={`${w.palavra}-${idx}`}
            className="text-white/80 leading-none"
            style={{ fontSize: `${Math.min(28, w.tamanho * 0.6)}px`, fontWeight: w.tamanho > 35 ? 600 : 400 }}
          >
            {w.palavra}
          </span>
        ))}
      </div>
      <div className="flex flex-col justify-center text-right flex-shrink-0">
        <p className="text-[9px] text-white/40 uppercase">atualizou</p>
        <p className="text-base font-semibold text-white tabular-nums leading-tight">
          {data.entrega.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </p>
        <p className="text-[10px] text-white/50">{data.entrega.metrica}</p>
      </div>
    </div>
  );
}

// =============================================================================
// B15 PulsoFederal — termômetro horizontal
// =============================================================================
export function PulsoFederal({ data }) {
  if (!data) return <EmBreveBento subtitulo="Pulso federal em construção." />;
  return (
    <div className="flex flex-col justify-center h-full gap-2">
      <p className="text-[10px] text-white/50">Real-time termômetro · R$ executed vs budgeted</p>
      <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-400 via-violet-400 to-amber-400"
          style={{ width: `${data.pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-white/50 tabular-nums">
        <span>{fmtBRLcompact(data.executado)} exec</span>
        <span>{fmtBRLcompact(data.orcado)} orçado</span>
      </div>
    </div>
  );
}

// =============================================================================
// B16 RedeEmpresarial — mini grafo
// =============================================================================
export function RedeEmpresarial({ data }) {
  if (!data || !Array.isArray(data?.nodes) || data.nodes.length === 0)
    return <EmBreveBento subtitulo="Mapa de rede empresarial em construção." />;
  // posições circulares
  const N = data.nodes.length;
  const positions = data.nodes.reduce((acc, n, i) => {
    const angle = (i / N) * 2 * Math.PI;
    acc[n.id] = { x: 50 + Math.cos(angle) * 32, y: 50 + Math.sin(angle) * 28 };
    return acc;
  }, {});
  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {data.edges.map((e, i) => {
          const f = positions[e.from], t = positions[e.to];
          if (!f || !t) return null;
          return <line key={i} x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="#a78bfa" strokeWidth="0.5" opacity="0.55" />;
        })}
        {data.nodes.map(n => {
          const p = positions[n.id];
          if (!p) return null;
          const r = n.tipo === 'parlamentar' ? 4.5 : 3.2;
          const fill = n.tipo === 'parlamentar' ? '#22d3ee' : '#fbbf24';
          // afasta o label do nó (raio externo)
          const dx = (p.x - 50) * 0.16;
          const dy = (p.y - 50) * 0.16;
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={r} fill={fill} opacity="0.9" />
              {n.label ? (
                <text
                  x={p.x + dx}
                  y={p.y + dy + r + 3}
                  fontSize="3.5"
                  fill="rgba(255,255,255,0.75)"
                  textAnchor="middle"
                >
                  {n.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// =============================================================================
// B17 AberturaOrgao — barras horizontais com %
// =============================================================================
export function AberturaOrgao({ data }) {
  if (!Array.isArray(data) || data.length === 0)
    return <EmBreveBento subtitulo="Score de abertura por órgão em construção." />;
  return (
    <ul className="space-y-2 h-full flex flex-col justify-center">
      {data.map((o, i) => (
        <li key={o.orgao} className="flex items-center gap-2">
          <span className="text-[10px] text-white/50 w-3 tabular-nums">{i + 1}</span>
          <div className="flex-1">
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-violet-400"
                style={{ width: `${o.pct}%` }}
              />
            </div>
          </div>
          <span className="text-[10px] text-white/70 tabular-nums w-8 text-right">{o.pct}%</span>
        </li>
      ))}
    </ul>
  );
}
