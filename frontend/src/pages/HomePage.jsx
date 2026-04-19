import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import GlobalSearch from "../components/GlobalSearch.jsx";
import UniverseGraph from "../components/UniverseGraph.jsx";
import { fetchPoliticosCollection, getFirebaseApp } from "../lib/firebase.js";

export default function HomePage() {
  const [politicos, setPoliticos] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!getFirebaseApp()) {
        if (!cancelled) {
          setPoliticos([]);
          setLoadError("missing_config");
        }
        return;
      }
      try {
        const rows = await fetchPoliticosCollection();
        if (!cancelled) {
          setPoliticos(rows);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setPoliticos([]);
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = politicos === null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#080B14]">
      {!loading && politicos.length === 0 && !loadError ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#080B14]/95 px-6 text-center">
          <p className="max-w-md text-sm text-[#8B949E]">
            Nenhum registro na coleção de políticos. Verifique o povoamento no
            backend.
          </p>
        </div>
      ) : null}

      {loadError === "missing_config" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#080B14]/95 px-6 text-center">
          <p className="max-w-md text-sm text-[#8B949E]">
            Firebase não configurado neste ambiente (variáveis{" "}
            <code className="text-[#58A6FF]">VITE_FIREBASE_*</code>).
          </p>
        </div>
      ) : null}

      {loadError && loadError !== "missing_config" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#080B14]/95 px-6 text-center">
          <p className="max-w-md text-sm text-[#f85149]">
            Falha ao carregar políticos: {loadError}
          </p>
        </div>
      ) : null}

      <Canvas
        frameloop="always"
        camera={{ position: [0, 0, 14], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        className="absolute inset-0 block h-full w-full touch-none"
      >
        <UniverseGraph politicos={loading ? [] : politicos} />
      </Canvas>

      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#080B14]/60 backdrop-blur-sm">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#30363D] border-t-[#58A6FF]" />
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-10 p-8 sm:p-12">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-[#F0F4FC] drop-shadow-[0_2px_24px_rgba(0,0,0,0.85)] sm:text-5xl md:text-6xl">
            Transparência BR
          </h1>
          <div className="pointer-events-auto w-full max-w-md lg:max-w-lg">
            <GlobalSearch />
          </div>
        </div>

        <div className="pointer-events-auto">
          <Link
            to="/dossie/teste"
            className="inline-flex items-center justify-center rounded-xl bg-[#21262D] px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.12em] text-[#F0F4FC] shadow-[0_16px_40px_rgba(0,0,0,0.55)] ring-1 ring-[#30363D] transition hover:bg-[#30363D] hover:ring-[#58A6FF]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58A6FF]"
          >
            Entrar no Sistema
          </Link>
        </div>
      </div>
    </div>
  );
}
