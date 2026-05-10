import { useMemo } from "react";

import { useAlvos } from "./useAlvos.js";
import { usePublicCeapRanking } from "./usePublicCeapRanking.js";
import useUniverseRoster from "./useUniverseRoster.js";
import { aggregatePartiesFromRoster } from "../utils/partidoAggregates.js";

/**
 * Dados de mercado para /partido — roster oficial + ranking CEAP GCS + getAlvos (datalake).
 */
export function usePartidoMarketData() {
  const { roster, loading: rosterLoading, error: rosterError } = useUniverseRoster();
  const { ranking, loading: rankingLoading, error: rankingError } = usePublicCeapRanking();
  const { data: alvosPayload, loading: alvosLoading, error: alvosError } = useAlvos({
    limit: 200,
    minScore: 0,
    sort: "notas_alto_risco",
  });

  const partyStats = useMemo(
    () => aggregatePartiesFromRoster(roster, ranking, alvosPayload?.alvos),
    [roster, ranking, alvosPayload],
  );

  const rosterPartyKeys = useMemo(
    () => partyStats.partyStats.map((s) => s.siglaKey),
    [partyStats],
  );

  return {
    loading: rosterLoading || rankingLoading || alvosLoading,
    rosterError,
    rankingError,
    alvosError,
    partyStats: partyStats.partyStats,
    rankingMap: partyStats.rankingMap,
    alvosMap: partyStats.alvosMap,
    rosterPartyKeys,
    rosterLen: roster.length,
    rankingLen: ranking?.length ?? 0,
    alvosLen: alvosPayload?.alvos?.length ?? 0,
  };
}
