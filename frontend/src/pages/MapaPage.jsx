import { Globe } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";

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

  return (
    <div className="min-h-full bg-[#080B14] px-4 py-6 text-[#F0F4FC] sm:px-6">
      <Helmet>
        <title>Mapa da fraude por UF | TransparênciaBR</title>
        <meta
          name="description"
          content="Distribuição geográfica de alertas forenses (alertas_bodes) por estado, com malha municipal PMTiles opcional."
        />
      </Helmet>

      <header className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 border-b border-[#30363D] pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
            Geointeligência
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Globe className="size-5 text-[#3fb950]" strokeWidth={1.75} />
            <h1 className="text-2xl font-semibold tracking-tight">Mapa da fraude</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-[#8B949E]">
            Agregação por UF a partir de <span className="font-mono text-[#C9D1D9]">alertas_bodes</span>{" "}
            cruzada com a UF declarada em cada documento de{" "}
            <span className="font-mono text-[#C9D1D9]">politicos</span>.
          </p>
        </div>
        <div className="text-right font-mono text-xs text-[#8B949E]">
          <span className="block text-[10px] uppercase tracking-wider">Alertas carregados</span>
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
        <p className="mx-auto mt-10 max-w-lg text-center text-sm text-[#f85149]">
          {error}
        </p>
      ) : null}

      <section className="mx-auto mt-8 flex max-w-6xl flex-col gap-6">
        <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-5">
          <h2 className="text-sm font-semibold tracking-tight">Calor por UF</h2>
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
        </div>

        <div className="rounded-2xl border border-[#30363D] bg-[#0D1117]/70 p-5">
          <h2 className="text-sm font-semibold tracking-tight">
            Malha municipal (PMTiles)
          </h2>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[#8B949E]">
            Quando <span className="font-mono text-[#58A6FF]">VITE_BR_PM_TILES_URL</span> estiver
            definido, o MapLibre pinta os polígonos IBGE; sem variável, mostramos o estado de espera.
            O mapa municipal pode ser ligado a <span className="font-mono">mapa_risco_municipal</span>{" "}
            por político no dossiê.
          </p>
          <div className="mt-4">
            <BrazilHeatmap riskScore={55} municipalityRiskMap={undefined} />
          </div>
        </div>
      </section>
    </div>
  );
}
