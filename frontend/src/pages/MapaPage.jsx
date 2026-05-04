import { Crosshair, Globe, Layers } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import BrazilHeatmap from "../components/BrazilHeatmap.jsx";
import BrazilUFTileMap from "../components/BrazilUFTileMap.jsx";
import {
  aggregateAlertCountsByUf,
  fetchAlertasBodesRecent,
  fetchPoliticoUfMap,
  getFirebaseApp,
} from "../lib/firebase.js";

export default function MapaPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ufCounts, setUfCounts] = useState({});
  const [selectedUf, setSelectedUf] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      if (!getFirebaseApp()) {
        if (!cancelled) {
          setError("missing_config");
          setUfCounts({});
          setLoading(false);
        }
        return;
      }
      try {
        const [ufMap, alertas] = await Promise.all([
          fetchPoliticoUfMap(),
          fetchAlertasBodesRecent(1200),
        ]);
        if (cancelled) return;
        const agg = aggregateAlertCountsByUf(alertas, ufMap);
        setUfCounts(agg);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setUfCounts({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalAlertas = useMemo(
    () => Object.values(ufCounts).reduce((a, b) => a + b, 0),
    [ufCounts],
  );

  const topUfs = useMemo(() => {
    return Object.entries(ufCounts)
      .map(([uf, n]) => ({ uf, n: Number(n) || 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);
  }, [ufCounts]);

  return (
    <div className="min-h-full bg-[#080B14] px-4 py-6 text-[#F0F4FC] sm:px-6">
      <Helmet>
        <title>Mapa forense por UF | TransparênciaBR</title>
        <meta
          name="description"
          content="Mapa interativo de calor por UF e malha municipal opcional — base alertas_bodes."
        />
      </Helmet>

      <header className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 border-b border-[#30363D] pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
            Geointeligência forense
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Globe className="size-5 text-[#3fb950]" strokeWidth={1.75} />
            <h1 className="text-2xl font-semibold tracking-tight">Mapa operacional</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-[#8B949E]">
            Agregação por UF a partir de <span className="font-mono text-[#C9D1D9]">alertas_bodes</span>{" "}
            cruzada com UF em <span className="font-mono text-[#C9D1D9]">politicos</span>. Painel lateral
            destaca estados com maior densidade de alertas.
          </p>
        </div>
        <div className="text-right font-mono text-xs text-[#8B949E]">
          <span className="block text-[10px] uppercase tracking-wider">Alertas agregados</span>
          <span className="text-lg text-[#58A6FF]">{loading ? "…" : totalAlertas}</span>
        </div>
      </header>

      {error === "missing_config" ? (
        <p className="mx-auto mt-10 max-w-lg text-center text-sm text-[#8B949E]">
          Firebase não configurado — defina as variáveis{" "}
          <code className="font-mono text-[#58A6FF]">VITE_FIREBASE_*</code>.
        </p>
      ) : null}

      {error && error !== "missing_config" ? (
        <p className="mx-auto mt-10 max-w-lg text-center text-sm text-[#f85149]">{error}</p>
      ) : null}

      <div className="mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-12">
        <section className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-5 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Calor por UF</h2>
            {selectedUf ? (
              <button
                type="button"
                onClick={() => setSelectedUf(null)}
                className="text-[11px] font-semibold text-[#58A6FF] hover:underline"
              >
                Limpar seleção ({selectedUf})
              </button>
            ) : null}
          </div>
          {loading ? (
            <div className="mt-6 flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#30363D] border-t-[#58A6FF]" />
            </div>
          ) : (
            <div className="mt-5">
              <BrazilUFTileMap
                ufCounts={ufCounts}
                selectedUf={selectedUf}
                onSelectUf={setSelectedUf}
              />
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4 lg:col-span-4">
          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/85 p-4">
            <div className="flex items-center gap-2 border-b border-[#21262D] pb-3">
              <Crosshair className="size-4 text-[#f97316]" strokeWidth={1.75} />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B949E]">
                Painel forense
              </h3>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#6e7681]">
              Clique num estado no mapa para filtrar a lista. Use{" "}
              <Link to="/alertas" className="text-[#58A6FF] hover:underline">
                Alertas SOC
              </Link>{" "}
              para o feed bruto.
            </p>
            <ul className="mt-4 space-y-2">
              {topUfs.length === 0 ? (
                <li className="text-sm text-[#8B949E]">Sem dados agregados.</li>
              ) : (
                topUfs.map((row) => (
                  <li key={row.uf}>
                    <button
                      type="button"
                      onClick={() => setSelectedUf(row.uf === selectedUf ? null : row.uf)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedUf === row.uf
                          ? "border-[#58A6FF]/50 bg-[#58A6FF]/10"
                          : "border-[#30363D]/80 hover:border-[#58A6FF]/30"
                      }`}
                    >
                      <span className="font-mono font-semibold text-[#C9D1D9]">{row.uf}</span>
                      <span className="font-mono text-xs text-[#58A6FF]">{row.n}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-4">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-[#a371f7]" strokeWidth={1.75} />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8B949E]">
                Malha municipal
              </h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#8B949E]">
              Com <span className="font-mono text-[#58A6FF]">VITE_BR_PM_TILES_URL</span> o MapLibre ativa
              polígonos IBGE; sem variável, modo demonstração.
            </p>
            <div className="mt-3">
              <BrazilHeatmap riskScore={55} municipalityRiskMap={undefined} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
