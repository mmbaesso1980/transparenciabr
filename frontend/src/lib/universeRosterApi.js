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
 * @param {string} [hintNome] — nome opcional para fallback fuzzy
 *   (ex.: vem do ranking.json quando ID-CEAP ≠ ID-Câmara)
 */
export function findPoliticoInUniverseRoster(roster, rawParam, hintNome) {
  const q = String(rawParam || "").trim();
  if (!Array.isArray(roster)) return null;

  // 1) Match exato por ID (caminho rápido)
  if (q) {
    for (const p of roster) {
      if (String(p?.id ?? "") === q) return p;
    }
  }

  // 2) Match por slug normalizado do parâmetro
  const slugNorm = normalizePoliticoSlugParam(q);
  if (slugNorm) {
    for (const p of roster) {
      const ns = normalizePoliticoSlugParam(String(p?.nome || ""));
      if (ns && ns === slugNorm) return p;
    }
  }

  // 3) Fallback fuzzy por hint de nome (usado quando ID histórico do CEAP
  //    não bate com o ID atual da Câmara mas o nome existe no roster)
  const hint = String(hintNome || "").trim();
  if (hint) {
    const hintSlug = normalizePoliticoSlugParam(hint);
    if (hintSlug) {
      for (const p of roster) {
        const ns = normalizePoliticoSlugParam(String(p?.nome || ""));
        if (ns && ns === hintSlug) return p;
      }
      // Fuzzy: comparar primeiros tokens (handles "Pompeo" vs "Pompeo de Mattos")
      const hintTokens = hintSlug.split("-").filter(Boolean);
      if (hintTokens.length >= 2) {
        const hintFirst2 = hintTokens.slice(0, 2).join("-");
        for (const p of roster) {
          const ns = normalizePoliticoSlugParam(String(p?.nome || ""));
          if (ns && ns.startsWith(hintFirst2)) return p;
        }
      }
    }
  }

  return null;
}

/**
 * Cria registro de hotpage "ex-parlamentar" quando o ID histórico do CEAP
 * não bate com o roster atual nem com a API Câmara. Permite a hotpage abrir
 * com dados básicos (nome, partido, UF) em vez de cair em "não encontrado".
 */
export function ceapEntryToHistoricoRecord(meta) {
  if (!meta || typeof meta !== "object") return null;
  const nome = String(meta.deputado || meta.nome || "").trim();
  if (!nome) return null;
  const partido = String(meta.partido || "").trim();
  const uf = String(meta.uf || "").trim();
  const id = String(meta.id || "").trim();
  return {
    id: id || normalizePoliticoSlugParam(nome) || "sem-id",
    nome,
    nome_completo: nome,
    partido,
    sigla_partido: partido,
    uf,
    cargo: "ex-deputado",
    snapshot_origem: "ceap_historico",
    tipo_dossie: "parlamentar",
    historico_ceap: {
      id_ceap: id,
      total_brl: meta.total_brl,
      qtd_notas: meta.qtd_notas,
      meses_ativos: meta.meses_ativos,
      pct_aproveitamento: meta.pct_aproveitamento,
      is_suplente: meta.is_suplente,
    },
    aviso_historico:
      "Parlamentar registrado no CEAP histórico mas não consta no roster atual da Câmara/Senado.",
  };
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
