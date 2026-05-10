import { useEffect, useState } from "react";

import { fetchPublicCeapRankingRows } from "../lib/publicCeapRanking.js";

export function usePublicCeapRanking() {
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchPublicCeapRankingRows();
        if (!cancel) {
          setRanking(rows);
          setError(null);
        }
      } catch (e) {
        if (!cancel) {
          setRanking(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return { ranking, loading, error };
}
