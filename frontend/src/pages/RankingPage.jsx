import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  Filter,
  Radar,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { fetchPoliticosCollection, getFirebaseApp } from "../lib/firebase.js";
import { ONE_DAY_MS } from "../lib/queryClient.js";
import { pickNome, pickRiskScore, pickUf } from "../utils/dataParsers.js";

const MODULES = [
  {
    label: "Benford",
    desc: "Desvio estatistico em despesas e notas.",
    icon: BarChart3,
    color: "text-[#58A6FF]",
  },
  {
    label: "K-Means",
    desc: "Clusters de fornecedores e empresas de fachada.",
    icon: Radar,
    color: "text-[#a371f7]",
  },
  {
    label: "ARIMA+",
    desc: "Surtos temporais de gastos acima da banda.",
    icon: Activity,
    color: "text-[#f97316]",
  },
  {
    label: "I.R.O.N.M.A.N.",
    desc: "LGPD, neutralidade e auditabilidade.",
    icon: ShieldAlert,
    color: "text-[#4ADE80]",
  },
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function riskBand(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return { label: "Sem score", tone: "text-[#8B949E]" };
  if (n >= 80) return { label: "Critico", tone: "text-[#f85149]" };
  if (n >= 55) return { label: "Alto", tone: "text-[#f97316]" };
  if (n >= 25) return { label: "Medio", tone: "text-[#FDE047]" };
  return { label: "Baixo", tone: "text-[#4ADE80]" };
}

function usePoliticosRanking() {
  return useQuery({
    queryKey: ["politicos", "ranking"],
    queryFn: async () => {
      if (!getFirebaseApp()) return [];
      return fetchPoliticosCollection();
    },
    staleTime: ONE_DAY_MS,
    gcTime: 2 * ONE_DAY_MS,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
}

export default function RankingPage() {
  const [queryText, setQueryText] = useState("");
  const [ufFilter, setUfFilter] = useState("TODAS");
  const rankingQuery = usePoliticosRanking();
  const rows = Array.isArray(rankingQuery.data) ? rankingQuery.data : [];
  const loading = rankingQuery.isLoading || rankingQuery.isFetching;
  const error = rankingQuery.error
    ? rankingQuery.error instanceof Error
      ? rankingQuery.error.message
      : String(rankingQuery.error)
    : null;
  const firebaseMissing = !getFirebaseApp();

  const ufs = useMemo(() => {
    const set = new Set(rows.map((row) => pickUf(row)).filter(Boolean));
    return ["TODAS", ...Array.from(set).sort()];
  }, [rows]);

  const rankedRows = useMemo(() => {
    const term = normalizeText(queryText);
    return rows
      .filter((row) => {
        if (ufFilter !== "TODAS" && pickUf(row) !== ufFilter) return false;
        if (!term) return true;
        return (
          normalizeText(pickNome(row)).includes(term) ||
          normalizeText(row.id).includes(term) ||
          normalizeText(row.partido ?? row.partido_sigla).includes(term)
        );
      })
      .map((row) => ({
        ...row,
        _risk: pickRiskScore(row),
        _nome: pickNome(row) || row.id,
        _uf: pickUf(row),
      }))
      .sort((a, b) => {
        const ar = Number.isFinite(Number(a._risk)) ? Number(a._risk) : -1;
        const br = Number.isFinite(Number(b._risk)) ? Number(b._risk) : -1;
        return br - ar || String(a._nome).localeCompare(String(b._nome));
      });
  }, [queryText, rows, ufFilter]);

  const stats = useMemo(() => {
    const scored = rows.map((row) => Number(pickRiskScore(row))).filter(Number.isFinite);
    const avg = scored.length ? scored.reduce((acc, n) => acc + n, 0) / scored.length : null;
    const critical = scored.filter((n) => n >= 80).length;
    return { total: rows.length, scored: scored.length, avg, critical };
  }, [rows]);

  return (
    <div className="min-h-full bg-[#080B14] px-4 py-6 text-[#F0F4FC] sm:px-6">
      <Helmet>
        <title>Ranking de entidades | TransparênciaBR</title>
        <meta
          name="description"
          content="Ranking forense de entidades politicas com indices de risco, filtros e acesso ao dossie TransparenciaBR."
        />
      </Helmet>

      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="relative overflow-hidden rounded-3xl border border-[#30363D] bg-[#0D1117]/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div
            aria-hidden
            className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#58A6FF]/10 blur-3xl"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
            Entidades / Fiscalizapa
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Ranking forense nacional
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#9AA4BD]">
                Camada publica de priorizacao: Benford, ARIMA_PLUS, K-Means,
                Gemini e Firestore desnormalizado convergem para indicar quem
                merece investigacao aprofundada. Cada linha abre uma hotpage de
                dossie com uma unica leitura cacheada.
              </p>
            </div>
            <Link
              to="/dashboard"
              className="rounded-xl border border-[#58A6FF]/35 bg-[#58A6FF]/10 px-4 py-2 text-sm font-semibold text-[#9CCBFF] transition hover:bg-[#58A6FF]/16"
            >
              Centro de operacoes
            </Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          {[
            ["Entidades", stats.total.toLocaleString("pt-BR"), "politicos"],
            ["Com score", stats.scored.toLocaleString("pt-BR"), "indices"],
            [
              "Risco medio",
              stats.avg == null ? "—" : Math.round(stats.avg).toLocaleString("pt-BR"),
              "media ponderada",
            ],
            ["Criticos", stats.critical.toLocaleString("pt-BR"), ">= 80"],
          ].map(([label, value, hint]) => (
            <article
              key={label}
              className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#8B949E]">
                {label}
              </p>
              <p className="mt-3 font-mono text-3xl text-[#F0F4FC]">{value}</p>
              <p className="mt-1 font-mono text-[11px] text-[#484F58]">{hint}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-3 lg:grid-cols-4">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <article
                key={mod.label}
                className="rounded-2xl border border-[#30363D] bg-[#0D1117]/60 p-4"
              >
                <Icon className={`size-5 ${mod.color}`} strokeWidth={1.75} />
                <h2 className="mt-3 text-sm font-semibold">{mod.label}</h2>
                <p className="mt-2 text-xs leading-relaxed text-[#8B949E]">{mod.desc}</p>
              </article>
            );
          })}
        </section>

        <section className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[16rem] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8B949E]"
                strokeWidth={1.75}
              />
              <input
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                placeholder="Buscar por nome, ID, partido..."
                className="w-full rounded-xl border border-[#30363D] bg-[#080B14] py-2.5 pl-10 pr-3 text-sm text-[#F0F4FC] outline-none ring-[#58A6FF] placeholder:text-[#484F58] focus:border-[#58A6FF]/50 focus:ring-2"
              />
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-[#30363D] bg-[#080B14] px-3 py-2.5 text-sm text-[#8B949E]">
              <Filter className="size-4" strokeWidth={1.75} />
              <select
                value={ufFilter}
                onChange={(event) => setUfFilter(event.target.value)}
                className="bg-transparent font-mono text-xs text-[#C9D1D9] outline-none"
              >
                {ufs.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {firebaseMissing ? (
          <p className="rounded-2xl border border-[#30363D] bg-[#0D1117]/60 px-6 py-10 text-center text-sm text-[#8B949E]">
            Firebase nao configurado.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-[#f85149]/30 bg-[#f85149]/10 px-6 py-6 text-sm text-[#fca5a5]">
            {error}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-[#30363D] bg-[#0D1117]/70">
          <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] gap-3 border-b border-[#30363D] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8B949E] max-md:hidden">
            <span>Entidade</span>
            <span>UF</span>
            <span>Risco</span>
            <span>Acao</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#30363D] border-t-[#58A6FF]" />
            </div>
          ) : rankedRows.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <BriefcaseBusiness className="mx-auto size-10 text-[#484F58]" strokeWidth={1.5} />
              <p className="mt-3 text-sm text-[#8B949E]">
                Nenhuma entidade encontrada no filtro atual. Quando a Engine 17
                preencher dossies completos, eles continuarao entrando aqui com
                leitura cacheada.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#21262D]">
              {rankedRows.map((p, idx) => {
                const band = riskBand(p._risk);
                return (
                  <li
                    key={p.id}
                    className="grid gap-3 px-5 py-4 transition hover:bg-[#161B22]/70 md:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-[#484F58]">
                          #{String(idx + 1).padStart(3, "0")}
                        </span>
                        <p className="truncate font-semibold text-[#F0F4FC]">{p._nome}</p>
                        {p.partido_sigla || p.partido ? (
                          <span className="rounded bg-[#21262D] px-2 py-0.5 text-[10px] font-semibold text-[#C9D1D9]">
                            {p.partido_sigla || p.partido}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-[#8B949E]">{p.id}</p>
                    </div>
                    <span className="font-mono text-xs text-[#C9D1D9]">{p._uf || "—"}</span>
                    <div>
                      <p className={`font-mono text-xl ${band.tone}`}>
                        {p._risk == null ? "—" : Math.round(Number(p._risk))}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-[#8B949E]">
                        {band.label}
                      </p>
                    </div>
                    <Link
                      className="inline-flex w-fit items-center justify-center rounded-lg border border-[#30363D] bg-[#21262D] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#58A6FF] hover:border-[#58A6FF]/50"
                      to={`/dossie/${encodeURIComponent(String(p.id))}`}
                    >
                      Dossie
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
