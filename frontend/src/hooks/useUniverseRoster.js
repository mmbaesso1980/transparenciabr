/**
 * Hook do /universo — l\u00ea o cadastro de parlamentares (id, nome, partido, UF, foto)
 * de gs://datalake-tbr-clean/universe/roster.json via Cloud Function getUniverseRoster.
 *
 * Diretiva Suprema preservada: ZERO Firestore. Fonte exclusiva = Data Lake GCS.
 */

import { useEffect, useMemo, useState } from "react";

import { getPartyColors } from "../utils/partyColors.js";

const ROSTER_URL =
  "https://southamerica-east1-transparenciabr.cloudfunctions.net/getUniverseRoster";

/** Normaliza string para busca acento/case-insensitive. */
function normSearch(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Constr\u00f3i o grafo (partidos -> pol\u00edticos) no mesmo formato esperado por OrbMeshScene. */
function buildGraphFromRoster(roster) {
  if (!Array.isArray(roster) || roster.length === 0) {
    return { nodes: [], links: [] };
  }

  const partyMap = new Map();
  const nodes = [];
  const links = [];

  for (const p of roster) {
    const sigla = String(p.partido || "OUTROS").trim().toUpperCase() || "OUTROS";
    if (!partyMap.has(sigla)) {
      partyMap.set(sigla, `party_${sigla}`);
    }
  }

  for (const [sigla, partyId] of partyMap) {
    const colors = getPartyColors(sigla);
    nodes.push({
      id: partyId,
      label: sigla,
      tipo: "partido",
      tier: "grande",
      partyColor: colors.primary,
      partyColorSecondary: colors.secondary || null,
      mass: 14,
    });
  }

  for (const p of roster) {
    const sigla = String(p.partido || "OUTROS").trim().toUpperCase() || "OUTROS";
    const partyId = partyMap.get(sigla);
    const polNodeId = `pol_${p.id}`;
    nodes.push({
      id: polNodeId,
      label: String(p.nome || "").slice(0, 80),
      tipo: "politico",
      tier: "medio",
      politicoId: String(p.id),
      dossiePath: `/dossie/${encodeURIComponent(String(p.id))}`,
      riskScore: 35, // placeholder \u2014 risk vem em fase futura via outro endpoint
      partido: sigla,
      uf: String(p.uf || ""),
      urlFoto: p.urlFoto || "",
      cargo: p.cargo || "deputado",
      mass: 5,
    });
    if (partyId) {
      links.push({ source: partyId, target: polNodeId, kind: "filia\u00e7\u00e3o" });
    }
  }

  return { nodes, links };
}

/** Busca por substring acento-insensitive em nome/partido/UF. */
function matchPoliticoFromRoster(roster, rawQuery) {
  const needle = normSearch(rawQuery);
  if (needle.length < 2) return null;
  const qTrim = String(rawQuery || "").trim();

  // Match por id exato primeiro.
  for (const p of roster) {
    if (String(p.id) === qTrim) {
      return { id: String(p.id), nome: String(p.nome || "").slice(0, 120) };
    }
  }

  // Match por nome contendo a needle.
  for (const p of roster) {
    const hay = normSearch(p.nome);
    if (hay.includes(needle)) {
      return { id: String(p.id), nome: String(p.nome || "").slice(0, 120) };
    }
  }

  return null;
}

/**
 * @returns {{
 *   roster: Array<{id:string, nome:string, partido:string, uf:string, urlFoto?:string, cargo:string}>,
 *   graphData: {nodes: object[], links: object[]},
 *   loading: boolean,
 *   error: string | null,
 *   findPoliticoByQuery: (rawQuery: string) => {id:string, nome:string} | null,
 *   total: number,
 *   generatedAt: string | null,
 * }}
 */
export function useUniverseRoster() {
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const resp = await fetch(ROSTER_URL, { headers: { Accept: "application/json" } });
        if (!resp.ok) {
          throw new Error(`roster_unavailable_${resp.status}`);
        }
        const data = await resp.json();
        if (cancelled) return;
        const list = Array.isArray(data?.roster) ? data.roster : [];
        setRoster(list);
        setGeneratedAt(data?.generated_at || null);
      } catch (e) {
        if (!cancelled) {
          setRoster([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const graphData = useMemo(() => buildGraphFromRoster(roster), [roster]);

  const findPoliticoByQuery = useMemo(() => {
    return (rawQuery) => matchPoliticoFromRoster(roster, rawQuery);
  }, [roster]);

  return {
    roster,
    graphData,
    loading,
    error,
    findPoliticoByQuery,
    total: roster.length,
    generatedAt,
  };
}

export default useUniverseRoster;
