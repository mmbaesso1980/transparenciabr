/**
 * Cadastro público de parlamentares (Câmara + Senado) via Cloud Function — mesmo JSON do /universo.
 */

import { normalizePoliticoSlugParam } from "./firebase.js";

export const UNIVERSE_ROSTER_URL =
  "https://southamerica-east1-transparenciabr.cloudfunctions.net/getUniverseRoster";

const ROSTER_TTL_MS = 5 * 60 * 1000;

let rosterCache = null;
let rosterFetchedAt = 0;

/**
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchUniverseRosterList() {
  const now = Date.now();
  if (Array.isArray(rosterCache) && now - rosterFetchedAt < ROSTER_TTL_MS) {
    return rosterCache;
  }
  const resp = await fetch(UNIVERSE_ROSTER_URL, {
    headers: { Accept: "application/json" },
    cache: "default",
  });
  if (!resp.ok) {
    throw new Error(`universe_roster_http_${resp.status}`);
  }
  const data = await resp.json();
  const list = Array.isArray(data?.roster) ? data.roster : [];
  rosterCache = list;
  rosterFetchedAt = now;
  return list;
}

/**
 * @param {Array<Record<string, unknown>>} roster
 * @param {string} rawParam — ID numérico ou slug (nome normalizado)
 */
export function findPoliticoInUniverseRoster(roster, rawParam) {
  const q = String(rawParam || "").trim();
  if (!q || !Array.isArray(roster)) return null;

  for (const p of roster) {
    if (String(p?.id ?? "") === q) return p;
  }

  const slugNorm = normalizePoliticoSlugParam(q);
  if (slugNorm) {
    for (const p of roster) {
      const ns = normalizePoliticoSlugParam(String(p?.nome || ""));
      if (ns && ns === slugNorm) return p;
    }
  }

  return null;
}

/**
 * Formato compatível com `enrichPoliticoRecord` / DossiePage (hotpage sem Firestore).
 */
export function rosterEntryToDossieRecord(entry) {
  const id = String(entry?.id ?? "").trim();
  return {
    id,
    nome: String(entry?.nome || "").trim(),
    nome_completo: String(entry?.nome || "").trim(),
    partido: String(entry?.partido || "").trim(),
    sigla_partido: String(entry?.partido || "").trim(),
    uf: String(entry?.uf || "").trim(),
    urlFoto: typeof entry?.urlFoto === "string" ? entry.urlFoto : "",
    cargo: String(entry?.cargo || "deputado"),
    snapshot_origem: "universe_roster",
    tipo_dossie: "parlamentar",
  };
}
