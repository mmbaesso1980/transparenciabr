import { useMemo, useState } from "react";
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
  Radar,
} from "lucide-react";

import BrandLogo from "../components/BrandLogo.jsx";
import { useAlvos } from "../hooks/useAlvos.js";
import { usePartidoMarketData } from "../hooks/usePartidoMarketData.js";
import { usePublicCeapRanking } from "../hooks/usePublicCeapRanking.js";
import useUniverseRoster from "../hooks/useUniverseRoster.js";
import {
  aggregatePartiesFromRoster,
  partyAlvosHighlights,
  partyKeysFromRoster,
  partidoLabelCompact,
  resolvePartyKeyFromUrl,
  topMembersByCota,
  ufGridPayload,
} from "../utils/partidoAggregates.js";

/**
 * PartidoPage — Hotpage de partido (dados reais).
 * Fontes: getUniverseRoster · ranking CEAP público (GCS) · getAlvos (datalake).
 */

const PARTY_COLORS = {
  PT: "#dc2626",
  PL: "#16a34a",
  MDB: "#1e40af",
  PSD: "#0ea5e9",
  UNIAO: "#1e3a8a",
  UNIAOBRASIL: "#1e3a8a",
  PP: "#1e40af",
  REPUBLICANOS: "#1e40af",
  REP: "#1e40af",
  PSDB: "#0ea5e9",
  PDT: "#dc2626",
  NOVO: "#f97316",
  PSB: "#facc15",
  PCDOB: "#dc2626",
  SOLIDARIEDADE: "#f97316",
  PODE: "#f97316",
  CIDADANIA: "#dc2626",
  REDE: "#059669",
  PV: "#22c55e",
};

function partyAccentColor(siglaKey) {
  const compact = partidoLabelCompact(siglaKey);
  if (PARTY_COLORS[compact]) return PARTY_COLORS[compact];
  const first = compact.slice(0, 8);
  if (PARTY_COLORS[first]) return PARTY_COLORS[first];
  return "#22d3ee";
}

import { fmtBRLcompact as fmtBRL } from "../utils/formatBRL.js";

function normPartidoQuery(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// =============================================================================
// CATÁLOGO (sem :sigla)
// =============================================================================
function CatalogoPartidos() {
  const {
    loading,
    rosterError,
    rankingError,
    alvosError,
    partyStats,
    rosterLen,
  } = usePartidoMarketData();

  const [filtroSigla, setFiltroSigla] = useState("");
  const [ordenacao, setOrdenacao] = useState("sigla");

  const partyStatsFiltrados = useMemo(() => {
    const needle = normPartidoQuery(filtroSigla);
    let list = needle
      ? partyStats.filter((p) => normPartidoQuery(p.siglaKey).includes(needle))
      : [...partyStats];
    list.sort((a, b) => {
      if (ordenacao === "cota") return (Number(b.cotaTotal) || 0) - (Number(a.cotaTotal) || 0);
      if (ordenacao === "sinais") return (Number(b.sinalizacoes) || 0) - (Number(a.sinalizacoes) || 0);
      if (ordenacao === "bancada") return (Number(b.parlamentares) || 0) - (Number(a.parlamentares) || 0);
      return String(a.siglaKey).localeCompare(String(b.siglaKey), "pt-BR");
    });
    return list;
  }, [partyStats, filtroSigla, ordenacao]);

  return (
    <div className="min-h-dvh bg-[#080B14] text-[#F0F4FC]">
      <Helmet>
        <title>Partidos · TransparênciaBR</title>
        <meta
          name="description"
          content="Bancadas reais (Câmara e Senado), cotas CEAP públicas e sinais do datalake classificado — TransparênciaBR."
        />
      </Helmet>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
        <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <BrandLogo to="/" variant="full" size="md" />
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
              Dados conectados
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              Partidos na lupa
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#8B949E]">
              Cadastro oficial de parlamentares, cruzado com o ranking CEAP exportado (BigQuery → GCS) e
              com o ranking público de exposição no datalake (<span className="font-mono text-[#8B949E]">getAlvos</span>
              ). Clique na sigla para a hotpage da bancada.
            </p>
            {rosterError ? (
              <p className="mt-2 text-xs text-rose-300">Roster: {rosterError}</p>
            ) : null}
            {rankingError ? (
              <p className="mt-2 text-xs text-amber-200/90">Ranking CEAP: {rankingError} (cotas podem aparecer como —)</p>
            ) : null}
            {alvosError ? (
              <p className="mt-2 text-xs text-amber-200/90">Alvos datalake: {alvosError} (Aurora / sinalizações podem ficar vazias)</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Link
              to="/painel"
              className="rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-4 py-2.5 text-center text-sm font-medium text-cyan-200 transition-all hover:bg-cyan-500/25"
            >
              Painel mestre
            </Link>
            <Link
              to="/universo"
              className="rounded-xl border border-[#30363D] px-4 py-2.5 text-center text-sm text-[#F0F4FC] transition-colors hover:border-violet-400/40"
            >
              Universo 3D
            </Link>
          </div>
        </header>

        {loading && rosterLen === 0 ? (
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117] px-6 py-16 text-center text-sm text-[#8B949E]">
            Carregando cadastro de parlamentares e APIs públicas…
          </div>
        ) : partyStats.length === 0 ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-6 py-10 text-center text-sm text-rose-200">
            Nenhum partido agregado — verifique se o roster oficial está publicado (
            <span className="font-mono">getUniverseRoster</span>).
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8B949E]">
                  Filtrar por sigla
                </span>
                <input
                  type="search"
                  value={filtroSigla}
                  onChange={(e) => setFiltroSigla(e.target.value)}
                  placeholder="Ex.: PT, PSDB, UNIÃO…"
                  autoComplete="off"
                  className="rounded-xl border border-[#30363D] bg-[#0D1117] px-4 py-2.5 text-sm text-[#F0F4FC] outline-none placeholder:text-[#484F58] focus:border-cyan-400/45"
                />
              </label>
              <label className="flex w-full flex-col gap-1.5 sm:w-52">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8B949E]">
                  Ordenar
                </span>
                <select
                  value={ordenacao}
                  onChange={(e) => setOrdenacao(e.target.value)}
                  className="rounded-xl border border-[#30363D] bg-[#0D1117] px-4 py-2.5 text-sm text-[#F0F4FC] outline-none focus:border-cyan-400/45"
                >
                  <option value="sigla">Sigla (A–Z)</option>
                  <option value="bancada">Tamanho da bancada</option>
                  <option value="cota">Cota Σ (maior primeiro)</option>
                  <option value="sinais">Notas alto risco Σ</option>
                </select>
              </label>
            </div>

            {partyStatsFiltrados.length === 0 ? (
              <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/80 px-6 py-12 text-center text-sm text-[#8B949E]">
                Nenhuma sigla corresponde a «{filtroSigla}».{" "}
                <button
                  type="button"
                  onClick={() => setFiltroSigla("")}
                  className="font-semibold text-cyan-400 hover:underline"
                >
                  Limpar filtro
                </button>
              </div>
            ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {partyStatsFiltrados.map((p) => {
              const cor = partyAccentColor(p.siglaKey);
              const href = `/partido/${encodeURIComponent(p.siglaKey)}`;
              return (
                <motion.div
                  key={p.siglaKey}
                  variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                >
                  <Link
                    to={href}
                    className="group block rounded-2xl border border-[#30363D] bg-[#0D1117] p-5 transition-all hover:-translate-y-0.5 hover:border-white/20"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="text-xl font-bold tracking-tight tabular-nums break-words"
                          style={{ color: cor }}
                        >
                          {p.siglaKey}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-tight text-[#8B949E]">
                          {p.parlamentares} parlamentar(es) no roster
                          {p.cotaCoverage > 0 ? (
                            <span className="text-[#484F58]">
                              {" "}
                              · {p.cotaCoverage} com cota no ranking CEAP
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <ChevronRight
                        size={18}
                        className="mt-1 shrink-0 text-[#484F58] transition-colors group-hover:text-cyan-400"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="mb-0.5 text-[10px] uppercase tracking-wider text-[#8B949E]">Cota Σ</p>
                        <p className="font-semibold tabular-nums text-[#F0F4FC]">{fmtBRL(p.cotaTotal)}</p>
                      </div>
                      <div>
                        <p className="mb-0.5 text-[10px] uppercase tracking-wider text-[#8B949E]">Aurora Ø</p>
                        <p className="font-semibold tabular-nums text-cyan-300">
                          {p.scoreMedio != null ? p.scoreMedio : "—"}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="mb-0.5 text-[10px] uppercase tracking-wider text-[#8B949E]">
                          Notas alto risco (Σ na bancada)
                        </p>
                        <p className="font-semibold tabular-nums text-amber-300">{p.sinalizacoes}</p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
            )}
          </>
        )}

        <p className="mt-10 text-center text-xs text-[#484F58]">
          Indicadores são computacionais e auditáveis — não substituem decisão judicial.{" "}
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
  const { roster, loading: rLoad, error: rosterError } = useUniverseRoster();
  const { ranking, loading: rkLoad, error: rankingError } = usePublicCeapRanking();

  const rosterPartyKeys = useMemo(() => partyKeysFromRoster(roster), [roster]);
  const resolvedKey = useMemo(
    () => resolvePartyKeyFromUrl(sigla, rosterPartyKeys),
    [sigla, rosterPartyKeys],
  );

  const { data: alvosPayload, loading: aLoad, error: alvosError } = useAlvos({
    limit: 200,
    minScore: 0,
    sort: "notas_alto_risco",
    partido: resolvedKey || "",
    enabled: Boolean(resolvedKey),
  });

  const agg = useMemo(
    () => aggregatePartiesFromRoster(roster, ranking, alvosPayload?.alvos),
    [roster, ranking, alvosPayload],
  );

  const stat = useMemo(
    () => agg.partyStats.find((s) => s.siglaKey === resolvedKey) || null,
    [agg, resolvedKey],
  );

  const { rankingMap, alvosMap } = agg;

  const pageLoading = rLoad || rkLoad || (resolvedKey ? aLoad : false);
  const rosterLen = roster.length;

  const cor = stat ? partyAccentColor(stat.siglaKey) : "#22d3ee";

  const top = useMemo(() => {
    if (!stat || !rankingMap || !alvosMap) return [];
    return topMembersByCota(stat.members, rankingMap, alvosMap, 10);
  }, [stat, rankingMap, alvosMap]);

  const ufCells = useMemo(() => {
    if (!stat) return [];
    return ufGridPayload(stat.members, cor);
  }, [stat, cor]);

  const datalakeRows = useMemo(() => {
    if (!stat || !alvosMap) return [];
    return partyAlvosHighlights(stat.members, alvosMap, 24);
  }, [stat, alvosMap]);

  if (!rLoad && rosterLen === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#080B14] px-6 text-center text-sm text-[#8B949E]">
        Cadastro de parlamentares indisponível. Tente mais tarde ou abra o{" "}
        <Link to="/status" className="text-cyan-400 hover:underline">
          status
        </Link>
        .
      </div>
    );
  }

  if (!rLoad && rosterLen > 0 && !resolvedKey) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#080B14] px-6 text-center">
        <div>
          <p className="text-lg font-semibold text-white">Partido não encontrado no roster</p>
          <p className="mt-2 max-w-md text-sm text-[#8B949E]">
            Não há bancada com a sigla «{sigla}» no cadastro oficial. Experimente o nome exatamente como na
            Câmara/Senado ou volte ao catálogo.
          </p>
          <Link to="/partido" className="mt-6 inline-block text-sm text-cyan-400 hover:underline">
            ← Todos os partidos
          </Link>
        </div>
      </div>
    );
  }

  if (pageLoading && !stat) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#080B14] text-sm text-[#8B949E]">
        Carregando hotpage…
      </div>
    );
  }

  if (!pageLoading && resolvedKey && !stat) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#080B14] px-6 text-center">
        <div>
          <p className="text-lg font-semibold text-white">Não foi possível montar a bancada</p>
          <p className="mt-2 text-sm text-[#8B949E]">Sigla resolvida mas sem agregados — contacte suporte se persistir.</p>
          <Link to="/partido" className="mt-6 inline-block text-sm text-cyan-400 hover:underline">
            ← Todos os partidos
          </Link>
        </div>
      </div>
    );
  }

  if (!stat) {
    return null;
  }

  return (
    <div className="min-h-dvh bg-[#080B14] text-[#F0F4FC]">
      <Helmet>
        <title>{stat.siglaKey} — Hotpage de bancada · TransparênciaBR</title>
        <meta
          name="description"
          content={`Bancada ${stat.siglaKey}: ${stat.parlamentares} parlamentares, cotas CEAP e datalake.`}
        />
      </Helmet>

      <div className="absolute left-0 right-0 top-0 z-10 h-1.5" style={{ background: cor }} />

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-8">
        <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to="/partido"
              className="inline-flex items-center gap-1.5 text-xs text-[#8B949E] transition-colors hover:text-cyan-400"
            >
              <ArrowLeft size={14} /> Todos os partidos
            </Link>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <p
                className="text-5xl font-bold leading-none tracking-tighter tabular-nums md:text-7xl"
                style={{ color: cor, textShadow: `0 0 40px ${cor}40` }}
              >
                {stat.siglaKey}
              </p>
              <div className="pb-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
                  Bancada no Congresso
                </p>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-[#F0F4FC] md:text-2xl">
                  Dados oficiais + datalake CEAP
                </h1>
              </div>
            </div>
            {rosterError ? <p className="mt-2 text-xs text-rose-300">{rosterError}</p> : null}
            {rankingError ? (
              <p className="mt-1 text-[11px] text-amber-200/80">Ranking CEAP: {rankingError}</p>
            ) : null}
            {alvosError ? (
              <p className="mt-1 text-[11px] text-amber-200/80">getAlvos: {alvosError}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Link
              to="/painel"
              className="rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-4 py-2.5 text-center text-sm font-medium text-cyan-200 hover:bg-cyan-500/25"
            >
              Painel mestre
            </Link>
            <Link
              to="/universo"
              className="rounded-xl border border-[#30363D] px-4 py-2.5 text-center text-sm text-[#F0F4FC] hover:border-violet-400/40"
            >
              Universo
            </Link>
          </div>
        </header>

        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {[
            { icon: Users, label: "Parlamentares", value: stat.parlamentares, accent: "cyan" },
            { icon: TrendingUp, label: "Cota Σ (ranking)", value: fmtBRL(stat.cotaTotal), accent: "violet" },
            {
              icon: Leaf,
              label: "Aurora Ø (datalake)",
              value: stat.scoreMedio != null ? stat.scoreMedio : aLoad ? "…" : "—",
              accent: "green",
            },
            {
              icon: AlertTriangle,
              label: "Notas alto risco Σ",
              value: aLoad ? "…" : stat.sinalizacoes,
              accent: "amber",
            },
          ].map((k, i) => {
            const accentMap = {
              cyan: "border-cyan-400/20 bg-cyan-500/[0.04] text-cyan-300",
              violet: "border-violet-400/20 bg-violet-500/[0.04] text-violet-300",
              green: "border-emerald-400/20 bg-emerald-500/[0.04] text-emerald-300",
              amber: "border-amber-400/20 bg-amber-500/[0.04] text-amber-300",
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
                <p className="mt-2 text-3xl font-semibold leading-tight tabular-nums text-white">{k.value}</p>
              </motion.div>
            );
          })}
        </motion.div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117] p-5 lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-cyan-400" />
              <h2 className="text-sm font-semibold tracking-wide text-[#F0F4FC]">Maiores cotas (ranking CEAP)</h2>
              <span className="ml-auto text-[10px] text-[#8B949E]">top 10 · IDs oficiais</span>
            </div>
            <ul className="divide-y divide-white/5">
              {top.map((p, i) => (
                <li key={p.id} className="py-2.5">
                  <Link
                    to={`/politico/${encodeURIComponent(p.id)}`}
                    className="group flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="w-6 tabular-nums text-xs text-[#484F58]">{i + 1}</span>
                    <div
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ background: `linear-gradient(135deg, ${cor}, #1f2937)` }}
                    >
                      {(p.nome || "?")[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#F0F4FC] transition-colors group-hover:text-cyan-300">
                        {p.nome}
                      </p>
                      <p className="text-[10px] text-[#8B949E]">{p.uf}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm tabular-nums text-[#F0F4FC]">{fmtBRL(p.cota)}</p>
                      <div className="mt-0.5 flex items-center justify-end gap-2">
                        {p.aurora != null ? (
                          <span className="tabular-nums text-[9px] text-cyan-300">Aurora {p.aurora}</span>
                        ) : null}
                        {p.notasAlto > 0 ? (
                          <span className="tabular-nums text-[9px] text-amber-300">⚡ {p.notasAlto}</span>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-[#484F58] group-hover:text-cyan-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117] p-5">
            <div className="mb-4 flex items-center gap-2">
              <MapPin size={16} className="text-violet-400" />
              <h2 className="text-sm font-semibold tracking-wide text-[#F0F4FC]">Distribuição UF</h2>
            </div>
            <div className="grid grid-cols-9 gap-1">
              {ufCells.map(({ uf, n, intensidade }) => (
                <div
                  key={uf}
                  title={`${uf}: ${n} parlamentar(es)`}
                  className="flex aspect-square items-center justify-center rounded text-[8px] font-medium tabular-nums"
                  style={{
                    background:
                      n > 0
                        ? `${cor}${Math.round(intensidade * 55 + 18)
                            .toString(16)
                            .padStart(2, "0")}`
                        : "rgba(255,255,255,0.04)",
                    color: intensidade > 0.35 ? "#fff" : "#8B949E",
                  }}
                >
                  {uf}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-[#8B949E]">
              Intensidade proporcional ao número de parlamentares da sigla em cada UF (roster oficial).
            </p>
          </div>

          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117] p-5 lg:col-span-3">
            <div className="mb-4 flex items-center gap-2">
              <Radar size={16} className="text-amber-400" />
              <h2 className="text-sm font-semibold tracking-wide text-[#F0F4FC]">
                Exposição no datalake (CEAP classificado)
              </h2>
              <span className="ml-auto max-w-[14rem] text-right text-[10px] text-[#8B949E]">
                getAlvos?partido=… · até 200 por sigla
              </span>
            </div>
            {datalakeRows.length === 0 ? (
              <p className="text-sm text-[#8B949E]">
                {aLoad
                  ? "Carregando recorte do datalake para esta sigla…"
                  : "Nenhum parlamentar desta bancada no recorte classificado — ou cobertura ainda não inclui estes mandatos."}
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {datalakeRows.map((row) => (
                  <li key={row.id}>
                    <Link
                      to={`/politico/${encodeURIComponent(row.id)}`}
                      className="flex flex-col rounded-xl border border-[#30363D]/80 bg-[#0B0F14]/80 px-3 py-2 text-left transition-colors hover:border-cyan-500/35"
                    >
                      <span className="truncate text-sm font-medium text-[#F0F4FC]">{row.nome}</span>
                      <span className="text-[10px] text-[#8B949E]">
                        Aurora {row.aurora} · {row.notasAlto} notas alto risco
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-[#484F58]">
          Cota = soma do ranking público CEAP onde o ID coincide com o roster. Aurora/notas usam{" "}
          <span className="font-mono text-[#6e7681]">getAlvos</span> com filtro por sigla (
          {resolvedKey ? partidoLabelCompact(resolvedKey) : "—"}). Toda nota é suspeita até prova em contrário.{" "}
          <Link to="/metodologia" className="text-cyan-400 hover:underline">
            Metodologia
          </Link>
        </p>
      </div>
    </div>
  );
}

// =============================================================================
export default function PartidoPage() {
  const { sigla } = useParams();
  if (!sigla) return <CatalogoPartidos />;
  return <HotpagePartido sigla={sigla} />;
}
