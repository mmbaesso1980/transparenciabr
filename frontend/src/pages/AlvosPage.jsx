import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useState } from "react";

import BrandLogo from "../components/BrandLogo.jsx";
import PoliticianOrb from "../components/PoliticianOrb.jsx";
import useAlvos from "../hooks/useAlvos.js";

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

export default function AlvosPage() {
  const [tab, setTab] = useState("todos"); // todos | deputado | senador
  const [minScore, setMinScore] = useState(0);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    setLimit(50);
  }, [minScore]);

  const { data, loading, error } = useAlvos({
    limit,
    minScore,
  });

  const filtered = useMemo(() => {
    const rows = data?.alvos ?? [];
    if (tab === "todos") return rows;
    if (tab === "deputado") {
      return rows.filter((r) => String(r.cargo || "").toLowerCase() === "deputado");
    }
    return rows.filter((r) => String(r.cargo || "").toLowerCase() === "senador");
  }, [data?.alvos, tab]);

  const empty =
    !loading &&
    !error &&
    Array.isArray(data?.alvos) &&
    data.alvos.length === 0;

  const showLoadMore =
    !loading && data && Array.isArray(data.alvos) && data.alvos.length >= limit && limit < 200;

  return (
    <div className="flex min-h-dvh flex-col bg-[#02040a] pb-36 text-[#E6EDF3]">
      <Helmet>
        <title>Alvos da semana — TransparênciaBR</title>
        <meta
          name="description"
          content="Parlamentares com maior volume de notas classificadas em alto risco (Data Lake, motor AURORA)."
        />
      </Helmet>

      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#02040a]/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo to="/" variant="full" size="md" />
            <div className="hidden h-6 w-px bg-white/15 sm:block" aria-hidden />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
                Alvos da semana
              </p>
              <p className="max-w-md text-xs leading-snug text-[#8B949E]">
                Parlamentares com maior número de notas em alto risco na amostra classificada
              </p>
            </div>
          </div>
          <Link
            to="/painel"
            className="text-sm font-semibold text-[#7DD3FC] transition hover:text-[#F0F4FC]"
          >
            Painel mestre
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap gap-2 border-b border-[#30363D]/60 pb-4">
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
              aria-label={`Filtrar ${t.label}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                tab === t.id
                  ? "bg-[#58A6FF]/20 text-[#F0F4FC] ring-1 ring-[#58A6FF]/50"
                  : "text-[#8B949E] hover:bg-white/[0.06]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <label
            htmlFor="min-score-alvos"
            className="flex flex-col gap-2 text-sm text-[#C9D1D9]"
          >
            <span className="font-medium">Score médio mínimo: {minScore}</span>
            <input
              id="min-score-alvos"
              type="range"
              min={0}
              max={100}
              step={1}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-[#58A6FF]"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-8 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            Não foi possível carregar os dados. {error}
          </p>
        ) : null}

        {loading ? (
          <ul className="mt-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <li
                key={i}
                className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
              />
            ))}
          </ul>
        ) : null}

        {empty ? (
          <p className="mt-10 text-center text-sm text-[#8B949E]">
            Ainda não há alvos suficientes na amostra. O motor está processando.
          </p>
        ) : null}

        {!loading && data && !empty ? (
          <>
            <ol className="mt-8 space-y-5">
              {filtered.map((p, idx) => (
                <li
                  key={p.id}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-md sm:p-5"
                >
                  <div className="flex gap-4">
                    <div className="shrink-0 pt-1">
                      <PoliticianOrb
                        identity={p.id}
                        score={Math.min(100, Math.round(p.score_max || p.score_medio || 45))}
                        size={48}
                        withRing
                        ariaLabel={`Orbe parlamentar ${p.nome}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-data text-xs tabular-nums text-[#7DD3FC]">
                        #{idx + 1}
                      </p>
                      <h2 className="text-lg font-semibold tracking-tight text-[#F0F4FC]">
                        {p.nome}
                        <span className="font-normal text-[#8B949E]">
                          {" "}
                          — {p.partido}-{p.uf}
                        </span>
                      </h2>
                      <p className="mt-1 text-sm text-[#C9D1D9]">
                        <span className="font-medium text-[#ef4444]">
                          {p.qtd_notas_alto_risco}
                        </span>{" "}
                        notas em alto risco · {fmtBrl(p.valor_alto_risco_brl)} em alto risco
                      </p>
                      <p className="mt-1 text-xs text-[#8B949E]">
                        Score médio {Number(p.score_medio).toLocaleString("pt-BR", {
                          maximumFractionDigits: 1,
                        })}{" "}
                        · máximo {p.score_max}
                        {p.ultima_nota_alto_risco_at ? (
                          <>
                            {" "}
                            · última classificação{" "}
                            {String(p.ultima_nota_alto_risco_at).slice(0, 16)}
                          </>
                        ) : null}
                      </p>
                      <Link
                        to={`/dossie/${encodeURIComponent(p.id)}`}
                        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#58A6FF] hover:text-[#79b8ff]"
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

            {filtered.length === 0 && data.alvos?.length > 0 ? (
              <p className="mt-8 text-center text-sm text-[#8B949E]">
                Nenhum resultado neste filtro. Ajuste a casa ou o score mínimo.
              </p>
            ) : null}

            {showLoadMore ? (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setLimit((l) => Math.min(200, l + 50))}
                  className="rounded-xl border border-[#30363D] bg-[#0d1117]/80 px-6 py-3 text-sm font-semibold text-[#F0F4FC] transition hover:border-[#58A6FF]/50"
                  aria-label="Carregar mais parlamentares na lista"
                >
                  Carregar mais
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#30363D]/80 bg-[#02040a]/95 px-4 py-3 text-center text-[11px] leading-relaxed text-[#8B949E] backdrop-blur-xl sm:px-8">
        <p className="mx-auto max-w-3xl">{DISCLAIMER}</p>
      </footer>
    </div>
  );
}
