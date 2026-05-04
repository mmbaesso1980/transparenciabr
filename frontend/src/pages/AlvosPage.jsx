import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useState } from "react";

import BrandLogo from "../components/BrandLogo.jsx";
import PoliticianOrb from "../components/PoliticianOrb.jsx";
import useAlvos from "../hooks/useAlvos.js";

const BG = "#0B0F1A";
const CARD = "#111827";

function fmtBrl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

const DISCLAIMER =
  "Estes dados são fatos extraídos das notas fiscais públicas da CEAP via API oficial da Câmara, classificadas pelo motor AURORA. Não constituem denúncia ou acusação. Toda nota é suspeita até prova contrária — apresentamos ranking de risco computacional, nada mais. Eventuais explicações dos parlamentares são bem-vindas: contato@transparenciabr.com.br";

function orbScoreForRow(p) {
  const idx = Number(p.indice_risco_aurora);
  if (Number.isFinite(idx)) return Math.min(100, Math.round(idx));
  return Math.min(100, Math.round(p.score_max || p.score_medio || 45));
}

export default function AlvosPage() {
  const [tab, setTab] = useState("todos");
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState("notas_alto_risco");
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    setLimit(50);
  }, [minScore, sort]);

  const { data, loading, error } = useAlvos({
    limit,
    minScore,
    sort,
  });

  const filtered = useMemo(() => {
    const rows = data?.alvos ?? [];
    if (tab === "todos") return rows;
    if (tab === "deputado") {
      return rows.filter((r) => String(r.cargo || "").toLowerCase() === "deputado");
    }
    return rows.filter((r) => String(r.cargo || "").toLowerCase() === "senador");
  }, [data?.alvos, tab]);

  const featured = useMemo(() => filtered.slice(0, 5), [filtered]);
  const rest = useMemo(() => filtered.slice(5), [filtered]);

  const empty =
    !loading && !error && Array.isArray(data?.alvos) && data.alvos.length === 0;

  const showLoadMore =
    !loading && data && Array.isArray(data.alvos) && data.alvos.length >= limit && limit < 200;

  return (
    <div className="flex min-h-dvh flex-col pb-40 text-slate-100" style={{ backgroundColor: BG }}>
      <Helmet>
        <title>Alvos em destaque — TransparênciaBR</title>
        <meta
          name="description"
          content="Top parlamentares com maior exposição a risco segundo motor AURORA (Data Lake GCS)."
        />
      </Helmet>

      <header
        className="sticky top-0 z-30 border-b border-white/[0.08] px-4 py-3 backdrop-blur-xl sm:px-6"
        style={{ background: `${BG}f0` }}
      >
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo to="/" variant="full" size="md" />
            <div className="hidden h-6 w-px bg-white/15 sm:block" aria-hidden />
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#22d3ee]">
                TBR · Alvos em destaque
              </p>
              <p className="mt-0.5 max-w-lg text-xs leading-snug text-slate-500">
                Rastreamento de risco cívico — ranking pela amostra CEAP classificada no datalake
              </p>
            </div>
          </div>
          <Link
            to="/painel"
            className="text-sm font-semibold text-[#22d3ee] transition hover:text-[#67e8f9]"
          >
            Painel mestre
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
        <nav className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-4" aria-label="Filtro por casa">
          {[
            { id: "todos", label: "Todos" },
            { id: "deputado", label: "Câmara" },
            { id: "senador", label: "Senado" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              aria-current={tab === t.id ? "true" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/50 ${
                tab === t.id
                  ? "bg-[#22d3ee]/15 text-slate-100 ring-1 ring-[#22d3ee]/45"
                  : "text-slate-500 hover:bg-white/[0.06]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="min-score-alvos" className="text-sm font-medium text-slate-300">
              Score médio mínimo: <span className="font-mono text-[#22d3ee]">{minScore}</span>
            </label>
            <input
              id="min-score-alvos"
              type="range"
              min={0}
              max={100}
              step={1}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={minScore}
              aria-labelledby="min-score-alvos"
              className="mt-2 w-full accent-[#22d3ee]"
            />
          </div>
          <div className="shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ordenar por</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { id: "notas_alto_risco", label: "Notas alto risco" },
                { id: "score_medio", label: "Score médio" },
                { id: "indice_risco_aurora", label: "Índice AURORA" },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSort(o.id)}
                  aria-pressed={sort === o.id}
                  className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/50 ${
                    sort === o.id
                      ? "bg-[#111827] text-[#22d3ee] ring-1 ring-[#22d3ee]/40"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <p className="mt-8 rounded-xl border border-red-500/35 bg-red-950/30 px-4 py-3 text-sm text-red-100">
            Não foi possível carregar os dados. {error}
          </p>
        ) : null}

        {loading ? (
          <ul className="mt-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <li
                key={i}
                className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
              />
            ))}
          </ul>
        ) : null}

        {empty ? (
          <p className="mt-10 text-center text-sm text-slate-500">
            Ainda não há alvos suficientes na amostra. O motor está processando.
          </p>
        ) : null}

        {!loading && data && !empty ? (
          <>
            {featured.length > 0 ? (
              <section className="mt-10" aria-labelledby="destaque-heading">
                <h2 id="destaque-heading" className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                  Em destaque
                </h2>
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {featured.map((p, idx) => (
                    <li
                      key={p.id}
                      className="flex flex-col rounded-2xl border border-[#22d3ee]/25 p-4 shadow-[0_0_24px_rgba(34,211,238,0.08)]"
                      style={{ background: `${CARD}f0` }}
                    >
                      <div className="flex items-start gap-3">
                        <PoliticianOrb
                          identity={p.id}
                          score={orbScoreForRow(p)}
                          size={56}
                          withRing
                          ariaLabel={`${p.nome}, orbe indica risco computacional`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[10px] text-slate-500">#{idx + 1}</p>
                          <h3 className="truncate text-base font-semibold text-slate-100">
                            {p.nome}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {p.partido}-{p.uf}
                          </p>
                        </div>
                      </div>
                      <dl className="mt-4 space-y-1 font-mono text-[11px] text-slate-400">
                        <div className="flex justify-between gap-2">
                          <dt>Alto risco</dt>
                          <dd className="text-[#f87171]">{p.qtd_notas_alto_risco} notas</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>Valor alto risco</dt>
                          <dd>{fmtBrl(p.valor_alto_risco_brl)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>Índice AURORA</dt>
                          <dd className="text-[#22d3ee]">
                            {p.indice_risco_aurora != null
                              ? Number(p.indice_risco_aurora).toFixed(1)
                              : "—"}
                          </dd>
                        </div>
                      </dl>
                      <Link
                        to={`/dossie/${encodeURIComponent(p.id)}`}
                        className="mt-4 inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 py-2 text-xs font-semibold text-[#22d3ee] hover:border-[#22d3ee]/40"
                      >
                        Abrir dossiê →
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="mt-10" aria-labelledby="lista-heading">
              <h2 id="lista-heading" className="sr-only">
                Lista de alvos
              </h2>
              <ol className="space-y-4">
                {rest.map((p, idx) => (
                  <li
                    key={p.id}
                    className="rounded-2xl border border-white/[0.08] p-4 sm:p-5"
                    style={{ background: `${CARD}cc` }}
                  >
                    <div className="flex gap-4">
                      <div className="shrink-0 pt-1">
                        <PoliticianOrb
                          identity={p.id}
                          score={orbScoreForRow(p)}
                          size={48}
                          withRing
                          ariaLabel={`Orbe parlamentar ${p.nome}`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs tabular-nums text-[#22d3ee]">
                          #{featured.length + idx + 1}
                        </p>
                        <h3 className="text-lg font-semibold tracking-tight text-slate-100">
                          {p.nome}
                          <span className="font-normal text-slate-500">
                            {" "}
                            — {p.partido}-{p.uf}
                          </span>
                        </h3>
                        <p className="mt-1 text-sm text-slate-300">
                          <span className="font-semibold text-[#f87171]">{p.qtd_notas_alto_risco}</span>{" "}
                          notas alto risco · {fmtBrl(p.valor_alto_risco_brl)}
                        </p>
                        <p className="mt-1 font-mono text-xs text-slate-500">
                          Score médio{" "}
                          {Number(p.score_medio).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} · máx{" "}
                          {p.score_max}
                          {p.indice_risco_aurora != null ? (
                            <>
                              {" "}
                              · índice AURORA{" "}
                              {Number(p.indice_risco_aurora).toLocaleString("pt-BR", {
                                maximumFractionDigits: 1,
                              })}
                            </>
                          ) : null}
                          {p.ultima_nota_alto_risco_at ? (
                            <>
                              {" "}
                              · última alto risco {String(p.ultima_nota_alto_risco_at).slice(0, 16)}Z
                            </>
                          ) : null}
                        </p>
                        <Link
                          to={`/dossie/${encodeURIComponent(p.id)}`}
                          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#22d3ee] hover:text-[#67e8f9]"
                          aria-label={`Abrir dossiê de ${p.nome}`}
                        >
                          Abrir dossiê
                          <span aria-hidden>→</span>
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {filtered.length === 0 && data.alvos?.length > 0 ? (
              <p className="mt-8 text-center text-sm text-slate-500">
                Nenhum resultado neste filtro. Ajuste a casa ou o score mínimo.
              </p>
            ) : null}

            {showLoadMore ? (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={() => setLimit((l) => Math.min(200, l + 50))}
                  className="rounded-xl border border-[#22d3ee]/30 bg-[#111827] px-8 py-3 text-sm font-semibold text-slate-100 transition hover:border-[#22d3ee]/55"
                  aria-label="Carregar mais 50 alvos"
                >
                  Carregar mais (50)
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </main>

      <footer
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.08] px-4 py-3 text-center text-[11px] leading-relaxed text-slate-500 backdrop-blur-xl sm:px-8"
        style={{ background: `${BG}f2` }}
      >
        <p className="mx-auto max-w-4xl">{DISCLAIMER}</p>
      </footer>
    </div>
  );
}
