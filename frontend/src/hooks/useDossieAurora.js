/**
 * useDossieAurora — Fetches Aurora 360 dossie data from getDossieAurora CF.
 * Preview mode is free; full mode requires 800 credits (handled by caller).
 */
import { useCallback, useEffect, useState } from "react";
import { dossieAuroraUrl } from "../lib/datalakeApi.js";

export function useDossieAurora(politicoId, mode = "preview") {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDossie = useCallback(async () => {
    const id = String(politicoId || "").trim();
    if (!id) { setData(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(dossieAuroraUrl(id, mode), {
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) { setData(null); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [politicoId, mode]);

  useEffect(() => { fetchDossie(); }, [fetchDossie]);

  return { data, loading, error, refetch: fetchDossie };
}

export default useDossieAurora;
