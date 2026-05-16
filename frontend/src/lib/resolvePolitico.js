/**
 * resolvePoliticoUniversal — Cadeia universal de 4 fallbacks para garantir
 * que QUALQUER ID/slug clicável no painel ou compartilhado em link gere
 * uma hotpage utilizável, em vez de "não encontrado".
 *
 * Usado por:
 *  - /politico/:id (público, vitrine + funil comercial)
 *
 * Cadeia:
 *  1) Coleção politicos (Firestore) por ID ou slug
 *  2) Hint via CEAP ranking público (id ou nome)
 *  3) Roster oficial Câmara/Senado (com fuzzy-match por nome se hint disponível)
 *  4) Ex-parlamentar histórico (CEAP só) — registro com aviso
 *
 * Diretiva: "Não fazemos denúncia — apresentamos fatos."
 * O caminho 4 sempre devolve um registro com `snapshot_origem='ceap_historico'`
 * e `aviso_historico` para o componente ressaltar a natureza do dado.
 */

import { fetchPoliticoByIdOrSlug } from "./firebase.js";
import {
  fetchUniverseRosterList,
  findPoliticoInUniverseRoster,
  rosterEntryToDossieRecord,
  ceapEntryToHistoricoRecord,
} from "./universeRosterApi.js";
import { fetchPublicCeapRankingRows } from "./publicCeapRanking.js";

/**
 * Resolve um ID/slug de político em um registro padronizado.
 * Retorna null somente se nenhum dos 5 caminhos achou nada.
 *
 * @param {string} rawParam ID Câmara, ID CEAP (ideCadastro) ou slug do nome
 * @returns {Promise<object|null>}
 */
export async function resolvePoliticoUniversal(rawParam) {
  const cleanId = String(rawParam || "").trim();
  if (!cleanId) return null;

  // 1) Firestore politicos (caminho histórico — slug ou ID)
  try {
    const politico = await fetchPoliticoByIdOrSlug(cleanId);
    if (politico) return politico;
  } catch {
    // segue para próxima estratégia
  }

  // 2) CEAP ranking público — pega hint de nome para ajudar o roster fuzzy
  let ceapHint = null;
  try {
    const rows = await fetchPublicCeapRankingRows();
    if (Array.isArray(rows)) {
      ceapHint =
        rows.find((r) => String(r?.id ?? "") === cleanId) ||
        rows.find(
          (r) =>
            String(r?.nome || r?.deputado || "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "") === cleanId.toLowerCase(),
        ) ||
        null;
    }
  } catch {
    ceapHint = null;
  }

  // 3) Roster oficial Câmara/Senado (594) — match exato por ID, ou fuzzy via hint
  let roster = [];
  try {
    roster = await fetchUniverseRosterList();
  } catch {
    roster = [];
  }
  const hintNome = ceapHint?.nome || ceapHint?.deputado || "";
  const row = findPoliticoInUniverseRoster(roster, cleanId, hintNome);
  if (row) return rosterEntryToDossieRecord(row);

  // 4) Fallback final: ex-parlamentar histórico (CEAP só)
  if (ceapHint) {
    const hist = ceapEntryToHistoricoRecord({
      ...ceapHint,
      deputado: ceapHint.nome || ceapHint.deputado,
      total_brl: ceapHint.cota ?? ceapHint.total_brl,
      pct_aproveitamento: ceapHint.pct ?? ceapHint.pct_aproveitamento,
    });
    if (hist) return hist;
  }

  return null;
}
