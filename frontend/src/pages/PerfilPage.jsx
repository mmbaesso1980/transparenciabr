import { Bell, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import { getFirebaseAuth, getFirestoreDb } from "../lib/firebase.js";
import { doc, getDoc } from "firebase/firestore";

const STORAGE_KEY = "transparenciabr_watchlist_ids";

function readLocalWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function PerfilPage() {
  const [ids, setIds] = useState(() => readLocalWatchlist());
  const [remoteIds, setRemoteIds] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const db = getFirestoreDb();
      const auth = getFirebaseAuth();
      const uid = auth?.currentUser?.uid;
      if (!db || !uid) return;
      try {
        const snap = await getDoc(doc(db, "usuarios", uid));
        const wl = snap.data()?.watchlist;
        if (cancelled) return;
        if (Array.isArray(wl)) {
          setRemoteIds(wl.map(String));
        }
      } catch {
        /* rules / offline */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setIds(readLocalWatchlist());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const effectiveIds = useMemo(() => {
    if (remoteIds && remoteIds.length > 0) return remoteIds;
    return ids;
  }, [remoteIds, ids]);

  return (
    <>
      <Helmet>
        <title>Cofre — Watchlist | TransparênciaBR</title>
      </Helmet>

      <div className="min-h-full bg-[#080B14] px-6 py-10 text-[#F0F4FC]">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-[#30363D] bg-[#161B22]">
              <Shield className="size-5 text-[#58A6FF]" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#8B949E]">
                Motor Forense TransparênciaBR
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">O Cofre</h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#8B949E]">
                Lista de parlamentares sob monitorização. Sincroniza com o campo{" "}
                <span className="font-mono text-[11px] text-[#58A6FF]">watchlist</span> no Firestore
                quando disponível; caso contrário, usa a lista local deste navegador.
              </p>
            </div>
          </div>

          <div className="glass rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
            <div className="flex items-center gap-2 border-b border-[#21262D] pb-4">
              <Bell className="size-4 text-[#f97316]" strokeWidth={1.75} />
              <h2 className="text-sm font-semibold tracking-tight">Watchlist</h2>
              <span className="ml-auto font-mono text-[11px] text-[#8B949E]">
                {effectiveIds.length} ativo(s)
              </span>
            </div>

            {effectiveIds.length === 0 ? (
              <p className="py-12 text-center text-sm text-[#8B949E]">
                Nenhum parlamentar na lista. Use{" "}
                <span className="font-medium text-[#C9D1D9]">Monitorizar</span> num dossiê para
                acrescentar (simulação local).
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {effectiveIds.map((polId) => (
                  <li key={polId}>
                    <Link
                      to={`/dossie/${encodeURIComponent(polId)}`}
                      className="flex items-center justify-between rounded-xl border border-[#30363D]/80 bg-[#161B22]/90 px-4 py-3 text-sm transition hover:border-[#58A6FF]/45 hover:bg-[#161B22]"
                    >
                      <span className="font-mono text-[13px] text-[#58A6FF]">{polId}</span>
                      <span className="text-[11px] text-[#8B949E]">Abrir dossiê →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
