import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  Leaf,
  ChevronRight,
  ArrowLeft,
  BarChart3,
  MapPin,
  Building2,
} from "lucide-react";

import BrandLogo from "../components/BrandLogo.jsx";

/**
 * PartidoPage — Hotpage de partido.
 * - Sem :sigla → catálogo de partidos com KPIs agregados.
 * - Com :sigla → hotpage completa (header, KPIs, top 10, UF, Sankey).
 *
 * Mock data interno. TODO: ligar useUniverseRoster filtrado por partido + view forense_partido_kpis.
 */

const PARTY_COLORS = {
  PT: "#dc2626",
  PL: "#16a34a",
  MDB: "#1e40af",
  PSD: "#0ea5e9",
  UNIAO: "#1e3a8a",
  PP: "#1e40af",
  REPUBLICANOS: "#1e40af",
  PSDB: "#0ea5e9",
  PDT: "#dc2626",
  NOVO: "#f97316",
  PSB: "#facc15",
  PCdoB: "#dc2626",
  SOLIDARIEDADE: "#f97316",
  PODE: "#f97316",
  CIDADANIA: "#dc2626",
};

const PARTIDOS_OVERVIEW = [
  { sigla: "PL", nome: "Liberal",          parlamentares: 99, cotaTotal: 87_500_000, scoreMedio: 58, sinalizacoes: 142 },
  { sigla: "PT", nome: "dos Trabalhadores", parlamentares: 68, cotaTotal: 61_300_000, scoreMedio: 72, sinalizacoes: 41 },
  { sigla: "MDB",  nome: "Democrático Brasileiro", parlamentares: 42, cotaTotal: 38_900_000, scoreMedio: 64, sinalizacoes: 78 },
  { sigla: "PSD",  nome: "Social Democrático",     parlamentares: 41, cotaTotal: 37_200_000, scoreMedio: 66, sinalizacoes: 55 },
  { sigla: "UNIAO", nome: "União Brasil",          parlamentares: 59, cotaTotal: 54_100_000, scoreMedio: 61, sinalizacoes: 92 },
  { sigla: "PP", nome: "Progressistas",            parlamentares: 47, cotaTotal: 42_700_000, scoreMedio: 60, sinalizacoes: 81 },
  { sigla: "REPUBLICANOS", nome: "Republicanos",   parlamentares: 41, cotaTotal: 36_400_000, scoreMedio: 63, sinalizacoes: 67 },
  { sigla: "PSDB", nome: "Social Democracia",      parlamentares: 13, cotaTotal: 11_800_000, scoreMedio: 71, sinalizacoes: 12 },
  { sigla: "PDT", nome: "Democrático Trabalhista", parlamentares: 17, cotaTotal: 15_600_000, scoreMedio: 69, sinalizacoes: 18 },
  { sigla: "NOVO", nome: "Novo",                   parlamentares: 4,  cotaTotal: 2_900_000, scoreMedio: 84, sinalizacoes: 2  },
  { sigla: "PSB", nome: "Socialista Brasileiro",   parlamentares: 14, cotaTotal: 12_700_000, scoreMedio: 70, sinalizacoes: 14 },
  { sigla: "PCdoB", nome: "Comunista do Brasil",    parlamentares: 6,  cotaTotal: 5_200_000, scoreMedio: 75, sinalizacoes: 4 },
];

// Mock dos top 10 da bancada (gerado deterministicamente por sigla)
function topBancada(sigla) {
  const seed = sigla.charCodeAt(0);
  const nomes = [
    "Antônio Vieira", "Carla Souza", "Bruno Lima", "Daniela Rocha", "Eduardo Silva",
    "Fernanda Costa", "Gustavo Pereira", "Helena Castro", "Igor Santos", "Júlia Almeida",
  ];
  return nomes.map((n, i) => ({
    id: `${sigla.toLowerCase()}_${i + 1}`,
    nome: n,
    uf: ["SP", "RJ", "MG", "BA", "RS", "PR", "PE", "CE", "GO", "SC"][i],
    cota: Math.round((((seed + i * 17) % 100) / 100) * 1_500_000 + 200_000),
    score: Math.round(((seed + i * 7) % 60) + 30),
    sinalizacoes: ((seed + i * 3) % 12),
  }));
}

const SETORES = ["Petróleo", "Construção", "Saúde", "Banca", "Agro"];

function fmtBRL(v) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)} mi`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)} k`;
  return `R$ ${v}`;
}

// =============================================================================
// CATÁLOGO (sem :sigla)
// =============================================================================
function CatalogoPartidos() {
  return (
    <div className="min-h-dvh bg-[#080B14] text-[#F0F4FC]">
      <Helmet>
        <title>Partidos · TransparênciaBR</title>
        <meta
          name="description"
          content="Visão forense agregada de todos os partidos brasileiros: cota CEAP, score Aurora, sinalizações."
        />
      </Helmet>

      <div className="mx-auto max-w-6xl px-4 sm:px-8 py-10">
        <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <BrandLogo to="/" variant="full" size="md" />
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
              Forense agregada
            </p>
            <h1 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight">
              Partidos na lupa
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#8B949E]">
              Compare bancadas, cotas CEAP, scores Aurora e padrões forenses. Clique numa sigla
              para ver a hotpage completa do partido.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              to="/painel"
              className="rounded-xl bg-cyan-500/15 border border-cyan-400/40 px-4 py-2.5 text-center text-sm font-medium text-cyan-200 hover:bg-cyan-500/25 transition-all"
            >
              Voltar ao painel
            </Link>
            <Link
              to="/universo"
              className="rounded-xl border border-[#30363D] px-4 py-2.5 text-center text-sm text-[#F0F4FC] hover:border-violet-400/40 transition-colors"
            >
              Ver no universo
            </Link>
          </div>
        </header>

        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {PARTIDOS_OVERVIEW.map((p) => {
            const cor = PARTY_COLORS[p.sigla] || "#22d3ee";
            return (
              <motion.div
                key={p.sigla}
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
              >
                <Link
                  to={`/partido/${p.sigla}`}
                  className="group block rounded-2xl border border-[#30363D] bg-[#0D1117] p-5 hover:border-white/20 hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <p
                        className="text-3xl font-bold tracking-tight tabular-nums"
                        style={{ color: cor }}
                      >
                        {p.sigla}
                      </p>
                      <p className="text-[12px] text-[#8B949E] leading-tight mt-0.5">{p.nome}</p>
                    </div>
                    <ChevronRight size={18} className="text-[#484F58] group-hover:text-cyan-400 transition-colors mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#8B949E] mb-0.5">Bancada</p>
                      <p className="text-[#F0F4FC] tabular-nums font-semibold">{p.parlamentares}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#8B949E] mb-0.5">Cota</p>
                      <p className="text-[#F0F4FC] tabular-nums font-semibold">{fmtBRL(p.cotaTotal)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#8B949E] mb-0.5">Aurora</p>
                      <p className="text-cyan-300 tabular-nums font-semibold">{p.scoreMedio}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#8B949E] mb-0.5">Sinaliz.</p>
                      <p className="text-amber-300 tabular-nums font-semibold">{p.sinalizacoes}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        <p className="mt-10 text-center text-xs text-[#484F58]">
          Scores são indicadores computacionais — não substituem decisão judicial.{" "}
          <Link to="/metodologia" className="text-cyan-400 hover:underline">
            Metodologia
          </Link>
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// HOTPAGE INDIVIDUAL (com :sigla)
// =============================================================================
function HotpagePartido({ sigla }) {
  const sig = sigla.toUpperCase();
  const partido = PARTIDOS_OVERVIEW.find((p) => p.sigla === sig);
  const cor = PARTY_COLORS[sig] || "#22d3ee";
  const top = useMemo(() => topBancada(sig), [sig]);

  if (!partido) {
    return (
      <div className="min-h-dvh bg-[#080B14] flex items-center justify-center text-center px-6">
        <div>
          <p className="text-lg font-semibold text-white">Partido "{sigla}" não encontrado</p>
          <Link to="/partido" className="inline-block mt-4 text-cyan-400 hover:underline text-sm">
            ← Ver todos os partidos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#080B14] text-[#F0F4FC]">
      <Helmet>
        <title>{sig} — {partido.nome} · TransparênciaBR</title>
        <meta name="description" content={`Hotpage forense do ${sig} — ${partido.nome}`} />
      </Helmet>

      {/* Banda de cor do partido */}
      <div className="absolute top-0 left-0 right-0 h-1.5 z-10" style={{ background: cor }} />

      <div className="mx-auto max-w-6xl px-4 sm:px-8 py-10">
        {/* Header */}
        <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to="/partido"
              className="inline-flex items-center gap-1.5 text-xs text-[#8B949E] hover:text-cyan-400 transition-colors"
            >
              <ArrowLeft size={14} /> Todos os partidos
            </Link>
            <div className="mt-3 flex items-end gap-4">
              <p
                className="text-7xl md:text-8xl font-bold tracking-tighter leading-none tabular-nums"
                style={{ color: cor, textShadow: `0 0 40px ${cor}40` }}
              >
                {sig}
              </p>
              <div className="pb-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
                  Partido
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#F0F4FC]">
                  {partido.nome}
                </h1>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              to="/painel"
              className="rounded-xl bg-cyan-500/15 border border-cyan-400/40 px-4 py-2.5 text-center text-sm font-medium text-cyan-200 hover:bg-cyan-500/25"
            >
              Painel forense
            </Link>
            <Link
              to="/universo"
              className="rounded-xl border border-[#30363D] px-4 py-2.5 text-center text-sm text-[#F0F4FC] hover:border-violet-400/40"
            >
              Universo
            </Link>
          </div>
        </header>

        {/* KPIs */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10"
        >
          {[
            { icon: Users,         label: "Bancada",       value: partido.parlamentares,        accent: "cyan" },
            { icon: TrendingUp,    label: "Cota total",    value: fmtBRL(partido.cotaTotal),    accent: "violet" },
            { icon: Leaf,          label: "Score Aurora",  value: partido.scoreMedio,           accent: "green" },
            { icon: AlertTriangle, label: "Sinalizações",  value: partido.sinalizacoes,         accent: "amber" },
          ].map((k, i) => {
            const accentMap = {
              cyan:   "border-cyan-400/20 bg-cyan-500/[0.04] text-cyan-300",
              violet: "border-violet-400/20 bg-violet-500/[0.04] text-violet-300",
              green:  "border-emerald-400/20 bg-emerald-500/[0.04] text-emerald-300",
              amber:  "border-amber-400/20 bg-amber-500/[0.04] text-amber-300",
            };
            return (
              <motion.div
                key={i}
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                className={`rounded-2xl border p-4 ${accentMap[k.accent]}`}
              >
                <div className="flex items-center gap-2 opacity-80">
                  <k.icon size={14} strokeWidth={1.8} />
                  <span className="text-[10px] uppercase tracking-wider">{k.label}</span>
                </div>
                <p className="text-3xl font-semibold tabular-nums mt-2 leading-tight text-white">{k.value}</p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Grid principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top 10 bancada */}
          <div className="lg:col-span-2 rounded-2xl border border-[#30363D] bg-[#0D1117] p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={16} className="text-cyan-400" />
              <h2 className="text-sm font-semibold tracking-wide text-[#F0F4FC]">Top 10 da bancada</h2>
              <span className="ml-auto text-[10px] text-[#8B949E]">por cota CEAP</span>
            </div>
            <ul className="divide-y divide-white/5">
              {top.map((p, i) => (
                <li key={p.id} className="py-2.5">
                  <Link
                    to={`/dossie/${p.id}`}
                    className="flex items-center gap-3 group hover:bg-white/[0.03] rounded-lg -mx-2 px-2 py-1 transition-colors"
                  >
                    <span className="text-xs text-[#484F58] tabular-nums w-6">{i + 1}</span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${cor}, #1f2937)` }}
                    >
                      {p.nome[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#F0F4FC] group-hover:text-cyan-300 transition-colors truncate">
                        {p.nome}
                      </p>
                      <p className="text-[10px] text-[#8B949E]">{p.uf}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm tabular-nums text-[#F0F4FC]">{fmtBRL(p.cota)}</p>
                      <div className="flex items-center gap-2 justify-end mt-0.5">
                        <span className="text-[9px] text-cyan-300 tabular-nums">Aurora {p.score}</span>
                        {p.sinalizacoes > 0 && (
                          <span className="text-[9px] text-amber-300 tabular-nums">⚡ {p.sinalizacoes}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-[#484F58] group-hover:text-cyan-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Distribuição UF (mini-heatmap) */}
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117] p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={16} className="text-violet-400" />
              <h2 className="text-sm font-semibold tracking-wide text-[#F0F4FC]">Distribuição UF</h2>
            </div>
            <div className="grid grid-cols-9 gap-1">
              {["SP","RJ","MG","BA","RS","PR","PE","CE","GO","SC","MA","PA","ES","PI","AL","RN","MT","MS","DF","SE","AM","RO","TO","AC","AP","RR","PB"].map((uf, i) => {
                const intensidade = ((sig.charCodeAt(0) + i * 13) % 100) / 100;
                return (
                  <div
                    key={uf}
                    title={`${uf}: ${Math.round(intensidade * partido.parlamentares / 27)} parlamentar(es)`}
                    className="aspect-square rounded text-[8px] flex items-center justify-center font-medium tabular-nums"
                    style={{
                      background: `${cor}${Math.round(intensidade * 60 + 10).toString(16).padStart(2,'0')}`,
                      color: intensidade > 0.5 ? "#fff" : "#8B949E",
                    }}
                  >
                    {uf}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-[#8B949E] mt-3 leading-relaxed">
              Intensidade ∝ nº de parlamentares por UF. Hover para ver detalhes.
            </p>
          </div>

          {/* Influência setorial */}
          <div className="lg:col-span-3 rounded-2xl border border-[#30363D] bg-[#0D1117] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={16} className="text-amber-400" />
              <h2 className="text-sm font-semibold tracking-wide text-[#F0F4FC]">Influência setorial</h2>
              <span className="ml-auto text-[10px] text-[#8B949E]">doações + contratos</span>
            </div>
            <div className="space-y-2.5">
              {SETORES.map((s, i) => {
                const pct = ((sig.charCodeAt(0) + i * 19) % 80) + 20;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <span className="w-24 text-xs text-[#8B949E] flex-shrink-0">{s}</span>
                    <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: i * 0.1, duration: 0.6, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${cor}, ${cor}80)` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums text-[#F0F4FC]">{pct}%</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-[#8B949E] mt-4">
              Indicador computacional baseado em volumes de doações declaradas e contratos públicos.
            </p>
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-[#484F58]">
          Toda nota é suspeita até prova contrária. Não fazemos denúncia — apresentamos fatos.{" "}
          <Link to="/metodologia" className="text-cyan-400 hover:underline">
            Metodologia
          </Link>
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// EXPORT — roteador interno
// =============================================================================
export default function PartidoPage() {
  const { sigla } = useParams();
  if (!sigla) return <CatalogoPartidos />;
  return <HotpagePartido sigla={sigla} />;
}
