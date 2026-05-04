/**
 * Ranking público de parlamentares com maior volume de notas em alto risco (GCS).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { alvosUrl } from "../lib/datalakeApi.js";

export function useAlvos({ limit = 50, minScore = 0, sort = "notas_alto_risco" } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    p.set("min_score", String(minScore));
    p.set("sort", String(sort || "notas_alto_risco"));
    return p.toString();
  }, [limit, minScore, sort]);

  const fetchAlvos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(alvosUrl(qs), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    fetchAlvos();
  }, [fetchAlvos]);

  return { data, loading, error, refetch: fetchAlvos };
}

export default useAlvos;
