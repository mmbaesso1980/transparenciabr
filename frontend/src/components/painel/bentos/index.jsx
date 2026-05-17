// bentos/index.jsx — Conteúdo interno de cada um dos 17 bentos.
// Cada componente recebe `data` (real do hook `usePainelData`) e renderiza SOMENTE o miolo
// do card (BentoCard wrappa do lado de fora).
//
// Estados vazios: mensagens operacionais (sem copy de "em breve").

import React from 'react';

/** Estado neutro quando ainda não há dados agregados (roster / ranking / KPIs a sincronizar). */
function PainelAwaitingData({ titulo = 'Sincronização', subtitulo = 'A aguardar dados do datalake ou do ranking público.' }) {
  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-1">
      <div className="text-center">
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-200/85 truncate">{titulo}</p>
        <p className="mt-1 text-[10px] leading-snug text-white/45 line-clamp-3">{subtitulo}</p>
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
export function PontuacaoBrasil({ data }) {
  if (!data) return <PainelAwaitingData subtitulo="KPIs do datalake a sincronizar." />;
  const { score = 0, serie30d = [] } = data;
  const hasSerie = Array.isArray(serie30d) && serie30d.length > 1;
  const max = hasSerie ? Math.max(...serie30d, 100) : 100;
  const min = hasSerie ? Math.min(...serie30d, 0) : 0;
  const range = max - min || 1;
  const pts = hasSerie
    ? serie30d
        .map((v, i) => `${(i / (serie30d.length - 1)) * 100},${100 - ((v - min) / range) * 100}`)
        .join(' ')
    : '';

  const angle = (score / 100) * 180; // semi-circle

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-between gap-1 overflow-hidden">
      <div className="flex w-full shrink-0 flex-col items-center">
        <div className="h-14 w-28 shrink-0">
          <svg viewBox="0 0 100 50" className="h-full w-full">
            <path d="M 5 50 A 45 45 0 0 1 95 50" stroke="#1f2937" strokeWidth="6" fill="none" strokeLinecap="round" />
            <path
              d="M 5 50 A 45 45 0 0 1 95 50"
              stroke="url(#scoreGrad)"
              strokeWidth="6"
              fill="none"
              strokeDasharray={`${(angle / 180) * 141.37} 141.37`}
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <p className="mt-0.5 text-center text-xl font-semibold tabular-nums text-white">
          {score}
          <span className="text-sm text-white/40"> / 100</span>
        </p>
      </div>
      {hasSerie ? (
        <svg viewBox="0 0 100 30" className="mt-1 h-7 w-full shrink-0" preserveAspectRatio="none">
          <polyline points={pts} fill="none" stroke="#fbbf24" strokeWidth="1.5" />
        </svg>
      ) : (
        <div className="mt-1 flex h-7 shrink-0 items-center justify-center text-[9px] text-white/35">
          série 30d · indisponível nesta carga
        </div>
      )}
      <p className="mt-auto shrink-0 text-center text-[10px] leading-tight text-white/40 line-clamp-2">
        Indicador Aurora · média 513 parlamentares
      </p>
    </div>
  );
}

// =============================================================================
// B02 MaioresCotas — tabela top 5
// =============================================================================
export function MaioresCotas({ data }) {
  if (!Array.isArray(data) || data.length === 0)
    return <PainelAwaitingData subtitulo="Ranking CEAP (GCS público) a sincronizar." />;
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
export function SinalizacoesSOC({ data }) {
  if (!data) return <PainelAwaitingData subtitulo="KPIs de auditoria a sincronizar." />;
  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <span className="text-2xl font-semibold text-white tabular-nums">{data.total}</span>
        <span className="text-xs text-white/50">ao vivo</span>
      </div>
      <ul className="space-y-1 text-[10.5px] text-white/55 leading-tight">
        {data.feed.slice(0, 3).map(item => (
          <li key={item.id} className="line-clamp-2">{item.texto}</li>
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
    return <PainelAwaitingData subtitulo="Roster nacional a sincronizar." />;
  const top = [...data].sort((a, b) => b.total - a.total).slice(0, 8);
  const max = Math.max(1, ...top.map((d) => d.total));
  return (
    <div className="flex flex-col h-full justify-between gap-1">
      <div className="grid grid-cols-4 gap-1">
        {top.map((d) => {
          const pct = (d.total / max) * 100;
          const hue = 180 - (pct / 100) * 130;
          const bg = `hsla(${hue}, 70%, 36%, ${0.32 + (pct / 100) * 0.38})`;
          return (
            <div
              key={d.uf}
              className="flex aspect-square flex-col items-center justify-center rounded border border-white/10 p-0.5"
              style={{ background: bg }}
              title={`${d.uf}: ${d.total} parlamentares`}
            >
              <span className="text-[10px] font-bold tabular-nums leading-none text-white">{d.uf}</span>
              <span className="mt-0.5 text-[9px] tabular-nums text-white/80">{d.total}</span>
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
  if (!data) return <PainelAwaitingData subtitulo="KPIs CEAP classificado a sincronizar." />;
  return (
    <div className="flex flex-col justify-between h-full">
      <div>
        <p className="text-3xl font-semibold text-white tabular-nums leading-tight">
          {fmtBRLcompact(data.queimadoHoje)}
        </p>
        <p className="text-xs text-white/50 mt-0.5">cota nacional agregada (CEAP · datalake)</p>
      </div>
      <div className="mt-3">
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-violet-400"
            style={{ width: `${data.pctConsumido}%` }}
          />
        </div>
        <p className="text-[10px] text-white/40 mt-1">{data.pctConsumido}% cobertura deputados no datalake</p>
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
    return <PainelAwaitingData subtitulo="Mapa UF a sincronizar." />;
  let top = [...data]
    .filter((r) => Number(r.risco || 0) > 0)
    .sort((a, b) => b.risco - a.risco)
    .slice(0, 8);
  if (top.length === 0) {
    top = [...data].sort((a, b) => b.total - a.total).slice(0, 8);
  }
  if (top.length === 0)
    return <PainelAwaitingData subtitulo="Sem dados UF nesta carga." />;
  const maxR = Math.max(1, ...top.map((r) => Number(r.risco || r.total || 0)));
  const modo = top[0]?.modo || "risco";
  const isRisco = modo === "risco" && Number(top[0]?.risco || 0) > 0;
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
              title={`${r.uf}: ${r.risco ?? r.total} ${isRisco ? "sinalizações de alto risco" : "parlamentares"}`}
            >
              <span className="text-xs font-bold text-white tabular-nums leading-none">{r.uf}</span>
              <span className="text-[9px] text-white/70 tabular-nums mt-0.5">{r.risco ?? r.total}</span>
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
  if (!data) return <PainelAwaitingData subtitulo="KPIs de emendas / fornecedores a sincronizar." />;
  const isRisco = data.modo === "risco";
  const tagBg = isRisco
    ? "bg-red-500/15 text-red-300 border border-red-400/20"
    : "bg-cyan-500/15 text-cyan-300 border border-cyan-400/20";
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <p className="shrink-0 text-[10px] text-white/50 truncate">
        {isRisco ? "Indicadores de alto risco (lake)" : "Indicadores classificados (lake)"}
      </p>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto text-[11px] pr-0.5">
        {data.topCnpj.map((c, i) => (
          <li key={`${c.cnpj}-${i}`} className="flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate text-white/75">{c.cnpj}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${tagBg}`}>{c.risco}</span>
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
    return <PainelAwaitingData subtitulo="PNCP ou faixas CEAP a sincronizar." />;
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
// B09 CoberturaDatalake — parlamentares cobertos no classificador CEAP (substitui “radar jurídico” no painel)
// =============================================================================
export function CoberturaDatalake({ data }) {
  if (!data) return <PainelAwaitingData subtitulo="KPIs de cobertura a sincronizar." />;
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1 overflow-hidden px-1">
      <p className="text-3xl font-bold tabular-nums text-white">{data.parlamentaresCobertos.toLocaleString("pt-BR")}</p>
      <p className="max-w-full truncate text-center text-[10px] text-white/45">Parlamentares no classificador CEAP</p>
    </div>
  );
}

/** @deprecated Use CoberturaDatalake — mantido para imports legados. */
export function RadarJuridico(props) {
  return <CoberturaDatalake {...props} />;
}

// =============================================================================
// B10 MeuUniverso — planetas dos alvos pessoais (avatares circulares)
// =============================================================================
export function MeuUniverso({ data }) {
  if (!Array.isArray(data) || data.length === 0)
    return <PainelAwaitingData subtitulo="Ranking de alvos a sincronizar." />;
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
    return <PainelAwaitingData subtitulo="Ranking CEAP a sincronizar." />;
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
  if (!data) return <PainelAwaitingData subtitulo="Roster + links UF×partido a sincronizar." />;
  const colors = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#f87171'];
  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,0.9fr)_minmax(0,2.2fr)_minmax(0,0.9fr)] gap-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col justify-around text-[10px] text-white/60">
        {data.esquerda.map((s) => (
          <span key={s} className="truncate">
            {s}
          </span>
        ))}
      </div>
      <div className="min-h-0 min-w-0">
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
          {data.links.map((l, i) => {
            const fromIdx = data.esquerda.indexOf(l.from);
            const toIdx = data.direita.indexOf(l.to);
            const denomL = Math.max(1, data.esquerda.length - 1);
            const denomR = Math.max(1, data.direita.length - 1);
            const y1 = 12 + fromIdx * (76 / denomL);
            const y2 = 12 + toIdx * (76 / denomR);
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
      <div className="flex min-h-0 min-w-0 flex-col justify-around text-right text-[10px] text-white/60">
        {data.direita.map((p) => (
          <span key={p} className="truncate">
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// B13 AtividadeLegislativa — 4 KPIs em grid (métricas operacionais reais)
// =============================================================================
export function AtividadeLegislativa({ data }) {
  if (!data) return <PainelAwaitingData subtitulo="Roster legislativo a sincronizar." />;
  const fmt = (v) => (v == null ? "—" : typeof v === "number" ? v.toLocaleString("pt-BR") : v);
  const items = [
    { label: "Parlamentares", value: fmt(data.total), color: "cyan" },
    { label: "Cobertura", value: data.cobertura != null ? `${data.cobertura}%` : "—", color: "emerald" },
    { label: "Notas no lake", value: fmt(data.notasLake), color: "violet" },
  ];
  const colorMap = {
    emerald: "bg-emerald-500/10 border-emerald-400/30 text-emerald-200",
    cyan: "bg-cyan-500/10 border-cyan-400/30 text-cyan-200",
    violet: "bg-violet-500/10 border-violet-400/30 text-violet-200",
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="grid min-h-0 grid-cols-1 gap-2 md:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.label}
            className={`min-w-0 rounded-lg border px-2 py-2 text-center ${colorMap[it.color]}`}
          >
            <p className="truncate text-sm font-semibold tabular-nums leading-tight">{it.value}</p>
            <p className="mt-1 truncate text-[10px] text-white/55">{it.label}</p>
          </div>
        ))}
      </div>
      <p className="shrink-0 truncate text-center text-[10px] text-white/40">
        Alto risco: <span className="tabular-nums text-white/70">{fmt(data.altoRisco)}</span> notas
      </p>
    </div>
  );
}

// =============================================================================
// B14 PromessaEntrega — wordcloud + valor entregue
// =============================================================================
export function PromessaEntrega({ data }) {
  if (!data) return <PainelAwaitingData subtitulo="Categorias CEAP a sincronizar." />;
  const rosterMatch = String(data.entrega?.metrica || "").match(/(\d[\d.]*)\s*mandatos/i);
  const nMandatos = rosterMatch ? rosterMatch[1] : null;
  const titulo = nMandatos
    ? `Distribuição de ${nMandatos} mandatos`
    : "Distribuição proporcional (dados públicos)";
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2 overflow-hidden">
      <p className="shrink-0 truncate text-center text-[11px] font-medium text-white/80">{titulo}</p>
      <div className="flex h-2.5 w-full shrink-0 overflow-hidden rounded-full bg-white/10">
        {data.campanha.slice(0, 8).map((w, idx) => {
          const flex = Math.max(1, Number(w.tamanho) || 1);
          const hue = 190 + (idx % 5) * 24;
          return (
            <div
              key={`${w.palavra}-${idx}`}
              className="h-full min-w-[2px] transition-[flex] duration-300"
              style={{
                flex: `${flex} 1 0%`,
                background: `hsla(${hue}, 65%, 48%, 0.88)`,
              }}
              title={w.palavra}
            />
          );
        })}
      </div>
      <p className="truncate text-center text-[10px] text-white/45">
        {data.entrega?.metrica ? String(data.entrega.metrica).slice(0, 120) : "Aguardando série consolidada"}
      </p>
    </div>
  );
}

// =============================================================================
// B15 PulsoFederal — termômetro horizontal
// =============================================================================
export function PulsoFederal({ data }) {
  if (!data) return <PainelAwaitingData subtitulo="KPIs executado vs orçado a sincronizar." />;
  return (
    <div className="flex flex-col justify-center h-full gap-2">
      <p className="text-[10px] text-white/50">Real-time termômetro · R$ executed vs budgeted</p>
      <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-amber-400"
          style={{ width: `${Math.min(100, Math.max(0, data.pct))}%` }}
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
    return <PainelAwaitingData subtitulo="Grafo fornecedores / alvos a sincronizar." />;
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
    return <PainelAwaitingData subtitulo="PNCP ou categorias CEAP a sincronizar." />;
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
