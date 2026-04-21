import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import { fetchPoliticosCollection, getFirebaseApp } from "../lib/firebase.js";
import { pickNome, pickRiskScore, pickUf } from "../utils/dataParsers.js";

export default function RankingPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!getFirebaseApp()) {
        if (!cancelled) {
          setRows([]);
          setError("missing_config");
        }
        return;
      }
      try {
        const list = await fetchPoliticosCollection();
        if (!cancelled) {
          setRows(list);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = rows === null;

  return (
    <div className="min-h-full bg-[#080B14] px-4 py-6 text-[#F0F4FC] sm:px-6">
      <Helmet>
        <title>Ranking de entidades | TransparênciaBR</title>
        <meta
          name="description"
          content="Lista de políticos na coleção Firestore politicos — índice de risco e atalho para dossiê."
        />
      </Helmet>

      <header className="mx-auto max-w-6xl border-b border-[#30363D] pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
          Entidades
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ranking</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#8B949E]">
          Leitura da coleção <span className="font-mono text-[#C9D1D9]">politicos</span>. Use o dossiê
          para análise completa.
        </p>
      </header>

      {error === "missing_config" ? (
        <p className="mx-auto mt-10 max-w-lg text-center text-sm text-[#8B949E]">
          Firebase não configurado.
        </p>
      ) : null}

      {error && error !== "missing_config" ? (
        <p className="mx-auto mt-10 max-w-lg text-center text-sm text-[#f85149]">{error}</p>
      ) : null}

      <div className="mx-auto mt-8 max-w-6xl">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#30363D] border-t-[#58A6FF]" />
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-[#30363D] bg-[#0D1117]/60 px-6 py-12 text-center text-sm text-[#8B949E]">
            Sem registos em <span className="font-mono">politicos</span>.
          </p>
        ) : (
          <ul className="divide-y divide-[#21262D] rounded-2xl border border-[#30363D] bg-[#0D1117]/70">
            {rows.map((p) => {
              const nome = pickNome(p) || p.id;
              const uf = pickUf(p);
              const risk = pickRiskScore(p);
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#F0F4FC]">{nome}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#8B949E]">
                      {p.id}
                      {uf ? ` · ${uf}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs">
                    {risk != null ? (
                      <span className="text-[#f97316]">{Math.round(Number(risk))}</span>
                    ) : (
                      <span className="text-[#484F58]">—</span>
                    )}
                    <Link
                      className="rounded-lg border border-[#30363D] bg-[#21262D] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#58A6FF] hover:border-[#58A6FF]/50"
                      to={`/dossie/${encodeURIComponent(String(p.id))}`}
                    >
                      Dossiê
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
