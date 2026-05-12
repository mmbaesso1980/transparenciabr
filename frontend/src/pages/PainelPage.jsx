import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import BentoBox from "../components/painel/BentoBox";
import { AURORA_AGENT_NAMES } from "../constants/auroraAgents.js";
import { fetchPoliticosCollection, getFirebaseApp } from "../lib/firebase.js";
import { pickNome, pickPartidoSigla, pickUf } from "../utils/dataParsers";

const TAB_ITEMS = [
  { key: "todos", label: "Todos" },
  { key: "deputados", label: "Deputados Federais" },
  { key: "senadores", label: "Senadores" },
];

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function pickFirstFinite(raw, keys) {
  for (const key of keys) {
    const n = Number(raw?.[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function computeAuroraScore(raw) {
  const asmodeus = pickFirstFinite(raw, [
    "score_asmodeus",
    "scoreAsmodeus",
    "asmodeus_score",
  ]);
  if (asmodeus != null) return clampScore(asmodeus);

  // Fórmula da view `vw_score_parlamentar` (pesos oficiais)
  const benford = pickFirstFinite(raw, ["score_benford", "benford_score"]) ?? 0;
  const contratos =
    pickFirstFinite(raw, ["score_contratos", "contracts_score"]) ?? 0;
  const nepotismo =
    pickFirstFinite(raw, ["score_nepotismo", "nepotismo_score"]) ?? 0;
  const sancoes = pickFirstFinite(raw, ["score_sancoes", "sancoes_score"]) ?? 0;
  const weighted =
    benford * 0.25 + contratos * 0.3 + nepotismo * 0.2 + sancoes * 0.25;
  if (weighted > 0) return clampScore(weighted);

  const fallback = pickFirstFinite(raw, [
    "score_risco",
    "score_medio",
    "risk_score",
    "score",
    "indice_risco",
    "kpi_score_risco",
  ]);
  return clampScore(fallback ?? 0);
}

function inferCargo(raw) {
  const direct = String(raw?.cargo || raw?.tipo_cargo || "").toLowerCase();
  if (direct.includes("sen")) return "senador";
  if (direct.includes("dep")) return "deputado";

  const casa = String(raw?.casa || raw?.casa_legislativa || "").toLowerCase();
  if (casa.includes("senado")) return "senador";
  if (casa.includes("câmara") || casa.includes("camara")) return "deputado";

  const tipo = String(raw?.tipo || raw?.mandato || "").toLowerCase();
  if (tipo.includes("sen")) return "senador";

  if (raw?.is_senador === true || raw?.senador === true) return "senador";
  return "deputado";
}

function normalizePolitico(raw, idx) {
  if (!raw?.id) return null;
  const nome = pickNome(raw) || "Sem nome";
  const score = computeAuroraScore(raw);

  return {
    id: String(raw.id),
    nome,
    partido: pickPartidoSigla(raw) || "—",
    uf: pickUf(raw) || "—",
    cargo: inferCargo(raw),
    foto: raw?.foto ?? raw?.fotoUrl ?? raw?.urlFoto ?? raw?.avatar ?? null,
    score,
    agente: AURORA_AGENT_NAMES[idx % AURORA_AGENT_NAMES.length],
  };
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-white/10 bg-[#0b1324] p-4">
      <div className="h-4 w-28 rounded bg-white/10" />
      <div className="mt-3 h-7 w-24 rounded bg-white/10" />
      <div className="mt-2 h-3 w-full rounded bg-white/10" />
      <div className="mt-4 h-9 w-full rounded bg-white/10" />
    </div>
  );
}

function Section({ title, subtitle, items, onOpenDossie }) {
  if (!items.length) {
    return (
      <section className="rounded-2xl border border-white/10 bg-[#0a1020] p-5">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-white/55">{subtitle}</p> : null}
        <p className="mt-4 text-sm text-white/45">Nenhum parlamentar encontrado neste recorte.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-white/55">{subtitle}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((politico) => (
          <BentoBox
            key={politico.id}
            politico={politico}
            onClick={() => onOpenDossie(politico.id)}
          />
        ))}
      </div>
    </section>
  );
}

export default function PainelPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("todos");
  const [ufFilter, setUfFilter] = useState("todas");
  const [partidoFilter, setPartidoFilter] = useState("todos");

  const hasFirebaseConfig = !!getFirebaseApp();

  const { data: rawPoliticos = [], isLoading, isError, error } = useQuery({
    queryKey: ["painel-politicos-firestore-v1"],
    queryFn: fetchPoliticosCollection,
    enabled: hasFirebaseConfig,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const politicos = useMemo(
    () =>
      (Array.isArray(rawPoliticos) ? rawPoliticos : [])
        .map(normalizePolitico)
        .filter(Boolean),
    [rawPoliticos],
  );

  const ufOptions = useMemo(
    () =>
      [...new Set(politicos.map((p) => p.uf).filter((uf) => uf && uf !== "—"))].sort(),
    [politicos],
  );

  const partidoOptions = useMemo(
    () =>
      [...new Set(politicos.map((p) => p.partido).filter((partido) => partido && partido !== "—"))].sort(),
    [politicos],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return politicos
      .filter((p) => {
        if (tab === "deputados" && p.cargo !== "deputado") return false;
        if (tab === "senadores" && p.cargo !== "senador") return false;
        if (ufFilter !== "todas" && p.uf !== ufFilter) return false;
        if (partidoFilter !== "todos" && p.partido !== partidoFilter) return false;
        if (!term) return true;
        return (
          p.nome.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term) ||
          `${p.partido}/${p.uf}`.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.score - a.score);
  }, [partidoFilter, politicos, search, tab, ufFilter]);

  const deputados = filtered.filter((p) => p.cargo === "deputado");
  const senadores = filtered.filter((p) => p.cargo === "senador");

  function openDossie(id) {
    navigate(`/dossie/${encodeURIComponent(id)}`);
  }

  return (
    <div className="min-h-screen bg-[#050915] text-white">
      <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-6 lg:px-8">
        <header className="rounded-2xl border border-white/10 bg-[#0a1020] p-4 md:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300/80">
                Aurora
              </p>
              <h1 className="text-2xl font-semibold text-white md:text-3xl">
                Painel de Parlamentares
              </h1>
              <p className="text-sm text-white/55">
                Firestore (`politicos`) com busca global, filtros e ordenação por Score Aurora.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.8fr_1fr_1fr]">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, ID, partido/UF..."
                className="w-full rounded-xl border border-white/15 bg-[#040913] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 outline-none ring-cyan-300/40 focus:border-cyan-300/45 focus:ring-2"
              />
              <select
                value={ufFilter}
                onChange={(e) => setUfFilter(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#040913] px-3.5 py-2.5 text-sm text-white outline-none ring-cyan-300/40 focus:border-cyan-300/45 focus:ring-2"
              >
                <option value="todas">Todas as UFs</option>
                {ufOptions.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
              <select
                value={partidoFilter}
                onChange={(e) => setPartidoFilter(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#040913] px-3.5 py-2.5 text-sm text-white outline-none ring-cyan-300/40 focus:border-cyan-300/45 focus:ring-2"
              >
                <option value="todos">Todos os partidos</option>
                {partidoOptions.map((partido) => (
                  <option key={partido} value={partido}>
                    {partido}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              {TAB_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    tab === item.key
                      ? "border-cyan-300/45 bg-cyan-400/15 text-cyan-200"
                      : "border-white/15 bg-white/5 text-white/70 hover:border-white/30"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="mt-5 space-y-6">
          {!hasFirebaseConfig ? (
            <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 p-5 text-sm text-amber-100">
              Firebase não configurado neste ambiente (`VITE_FIREBASE_*`). O painel só usa dados reais quando a configuração está presente.
            </div>
          ) : null}

          {isError ? (
            <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-5 text-sm text-red-100">
              Erro ao carregar `politicos` no Firestore: {String(error?.message || error || "desconhecido")}
            </div>
          ) : null}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <SkeletonCard key={`sk-${idx}`} />
              ))}
            </div>
          ) : (
            <>
              {(tab === "todos" || tab === "deputados") && (
                <Section
                  title="Deputados Federais"
                  subtitle={`${deputados.length.toLocaleString("pt-BR")} resultados · ordenado por Score Aurora (desc)`}
                  items={deputados}
                  onOpenDossie={openDossie}
                />
              )}

              {(tab === "todos" || tab === "senadores") && (
                <Section
                  title="Senadores"
                  subtitle={`${senadores.length.toLocaleString("pt-BR")} resultados · ordenado por Score Aurora (desc)`}
                  items={senadores}
                  onOpenDossie={openDossie}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}