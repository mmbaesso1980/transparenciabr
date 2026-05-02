/**
 * KPIs agregados do Data Lake (ceap_classified) via Cloud Function — ZERO Firestore.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const DASHBOARD_KPIS_URL =
  "https://southamerica-east1-transparenciabr.cloudfunctions.net/getDashboardKPIs";

const BACKOFF_MS = [5000, 15000, 60000];

export function useDashboardKPIs({ pollMs = 60_000 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextRetryMs, setNextRetryMs] = useState(null);
  const backoffIdx = useRef(0);

  const fetchKpis = useCallback(async (opts = { silent: false }) => {
    if (!opts.silent) setLoading(true);
    try {
      const res = await fetch(DASHBOARD_KPIS_URL, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
      backoffIdx.current = 0;
      setNextRetryMs(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      const ms = BACKOFF_MS[Math.min(backoffIdx.current, BACKOFF_MS.length - 1)];
      setNextRetryMs(ms);
      backoffIdx.current += 1;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKpis({ silent: false });
  }, [fetchKpis]);

  useEffect(() => {
    if (!pollMs) return undefined;
    const id = window.setInterval(() => fetchKpis({ silent: true }), pollMs);
    return () => window.clearInterval(id);
  }, [fetchKpis, pollMs]);

  useEffect(() => {
    if (!error || nextRetryMs == null) return undefined;
    const t = window.setTimeout(() => fetchKpis({ silent: true }), nextRetryMs);
    return () => window.clearTimeout(t);
  }, [error, nextRetryMs, fetchKpis]);

  const empty =
    Boolean(data) &&
    Number(data.total_notas_classificadas || 0) === 0 &&
    !error;

  return {
    data,
    loading,
    error,
    empty,
    refetch: () => fetchKpis({ silent: false }),
    nextRetryMs,
  };
}

export default useDashboardKPIs;
