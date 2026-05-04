/**
 * KPIs CEAP classificado (GCS agregado) para o dossiê — ZERO Firestore.
 */

import { useCallback, useEffect, useState } from "react";

import { dossieCeapKpisUrl } from "../lib/datalakeApi.js";

export function useDossieCeapKPIs(politicoId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchKpis = useCallback(async () => {
    const id = String(politicoId || "").trim();
    if (!id) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(dossieCeapKpisUrl(id), {
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) {
        setData(null);
        setError(null);
        return;
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [politicoId]);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  return { data, loading, error, refetch: fetchKpis };
}

export default useDossieCeapKPIs;
