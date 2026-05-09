// bentos/index.jsx — Conteúdo interno de cada um dos 17 bentos.
// Cada componente recebe `data` (real do hook) e renderiza SOMENTE o miolo
// do card (BentoCard wrappa do lado de fora).
//
// MOCK ZERO: quando `data` é null/inválido, renderiza <EmBreve variant="inline" />.
// Filosofia: "Toda nota é suspeita até prova contrária. Não fazemos
// denúncia — apresentamos fatos."

import React from 'react';
import EmBreve from '../../dossie/EmBreve';

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
  if (!data) return <EmBreveBento subtitulo="Coletando snapshots para score nacional." />;
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
    <div className="flex flex-col items-center justify-between h-full">
      <div className="relative w-32 h-16">
        <svg viewBox="0 0 100 50" className="w-full h-full">
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
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className="text-2xl font-semibold text-white tabular-nums">
            {score}<span className="text-sm text-white/40"> / 100</span>
          </span>
        </div>
      </div>
      {hasSerie ? (
        <svg viewBox="0 0 100 30" className="w-full h-8 mt-1" preserveAspectRatio="none">
          <polyline points={pts} fill="none" stroke="#fbbf24" strokeWidth="1.5" />
        </svg>
      ) : (
        <div className="h-8 mt-1 flex items-center justify-center text-[9px] text-white/30">série 30d em breve</div>
      )}
      <p className="text-[11px] text-white/40 mt-1">Indicador Aurora · média 513 parlamentares</p>
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
export function SinalizacoesSOC({ data }) {
  if (!data) return <EmBreveBento subtitulo="Feed live de sinalizações em construção." />;
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
// B04 MapaUFBrasil — mock visual de mapa (placeholder gradiente)
// =============================================================================
export function MapaUFBrasil({ data }) {
  if (!Array.isArray(data) || data.length === 0)
    return <EmBreveBento subtitulo="Calculando distribuição por UF." />;
  return (
    <div className="relative w-full h-full min-h-[100px] flex items-center justify-center">
      <svg viewBox="0 0 100 90" className="w-full h-full max-h-[110px]">
        <defs>
          <radialGradient id="brMap" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#9b8cff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.1" />
          </radialGradient>
        </defs>
        <path
          d="M 30 15 Q 45 10 60 15 L 70 25 Q 75 35 72 50 L 65 65 Q 55 75 40 72 L 28 65 Q 22 50 25 35 Z"
          fill="url(#brMap)"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="0.5"
        />
        {data.slice(0, 8).map((d, i) => {
          const cx = 35 + (i % 4) * 10;
          const cy = 25 + Math.floor(i / 4) * 25;
          return (
            <circle
              key={d.uf}
              cx={cx}
              cy={cy}
              r={1 + (d.intensidade / 100) * 2}
              fill="#fbbf24"
              opacity={0.4 + (d.intensidade / 100) * 0.6}
            />
          );
        })}
      </svg>
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
// B06 MataUFBrasil — mapa "negativo" (alvos críticos por UF)
// =============================================================================
export function MataUFBrasil({ data }) {
  if (!Array.isArray(data) || data.length === 0)
    return <EmBreveBento subtitulo="Calculando alvos críticos por UF." />;
  return (
    <div className="relative w-full h-full min-h-[80px] flex items-center justify-center">
      <svg viewBox="0 0 100 60" className="w-full h-full">
        <defs>
          <radialGradient id="brMapDark" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f87171" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#1f2937" stopOpacity="0.1" />
          </radialGradient>
        </defs>
        <path
          d="M 30 10 Q 45 5 60 10 L 70 20 Q 75 30 72 45 L 65 55 Q 55 60 40 57 L 28 50 Q 22 35 25 25 Z"
          fill="url(#brMapDark)"
          stroke="rgba(248,113,113,0.3)"
          strokeWidth="0.5"
        />
      </svg>
    </div>
  );
}

// =============================================================================
// B07 EmendasCriticas — número grande + lista CNPJ risco
// =============================================================================
export function EmendasCriticas({ data }) {
  if (!data) return <EmBreveBento subtitulo="Pipeline de emendas em construção." />;
  return (
    <div className="flex h-full justify-between gap-3">
      <div className="flex flex-col justify-between flex-1 min-w-0">
        <div>
          <p className="text-3xl font-semibold text-white tabular-nums leading-tight">
            {fmtBRLcompact(data.queimadoHoje)}
          </p>
          <p className="text-xs text-white/50 mt-0.5">queimados hoje</p>
        </div>
        <div className="mt-2">
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-red-400 to-amber-400" style={{ width: `${data.pctConsumido}%` }} />
          </div>
          <p className="text-[10px] text-white/40 mt-1">{data.pctConsumido}% da quota mensal consumida</p>
        </div>
      </div>
      <ul className="space-y-1 text-[11px] flex-shrink-0">
        {data.topCnpj.map(c => (
          <li key={c.cnpj} className="flex items-center gap-2">
            <span className="text-white/60">{c.cnpj}</span>
            <span className="px-1.5 py-0.5 bg-red-500/15 text-red-300 border border-red-400/20 rounded text-[9px]">{c.risco}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// B08 ContratosPNCP — histograma
// =============================================================================
export function ContratosPNCP({ data }) {
  if (!data) return <EmBreveBento subtitulo="Histograma PNCP em construção." />;
  const max = Math.max(...data.histograma.map(h => h.count));
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-end gap-1 h-16 flex-1">
        {data.histograma.map(h => (
          <div key={h.bucket} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-gradient-to-t from-cyan-500/40 to-cyan-300/80 rounded-t"
              style={{ height: `${(h.count / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] text-white/30">count</span>
      </div>
      <p className="text-[10px] text-white/40 text-center">risk_score</p>
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
// B13 AtividadeLegislativa — 4 KPIs em grid
// =============================================================================
export function AtividadeLegislativa({ data }) {
  if (!data) return <EmBreveBento subtitulo="Calculando atividade legislativa." />;
  const fmt = (v) => (v == null ? '—' : (typeof v === 'number' ? v.toLocaleString('pt-BR') : v));
  const items = [
    { label: 'Presença', value: data.presenca != null ? `${data.presenca}%` : '—', color: 'emerald' },
    { label: 'Votos',    value: fmt(data.votos),                                    color: 'cyan' },
    { label: 'Projetos', value: fmt(data.projetos),                                 color: 'violet' },
    { label: 'Faltas',   value: fmt(data.faltas),                                   color: 'red' },
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
        {data.campanha.map(w => (
          <span
            key={w.palavra}
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
      <svg viewBox="0 0 100 100" className="w-full h-full max-h-[110px]">
        {data.edges.map((e, i) => {
          const f = positions[e.from], t = positions[e.to];
          return <line key={i} x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="#a78bfa" strokeWidth="0.4" opacity="0.5" />;
        })}
        {data.nodes.map(n => {
          const p = positions[n.id];
          return (
            <circle
              key={n.id}
              cx={p.x}
              cy={p.y}
              r={n.tipo === 'parlamentar' ? 3.2 : 2.4}
              fill={n.tipo === 'parlamentar' ? '#22d3ee' : '#fbbf24'}
              opacity="0.85"
            />
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
