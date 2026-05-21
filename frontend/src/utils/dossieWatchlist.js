import { WATCHLIST_STORAGE_KEY } from "../constants/dossieConstants.js";

export function readWatchlistIdsFromStorage() {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function dossiePdfFilename(nomePolitico) {
  const slug = String(nomePolitico || "Parlamentar")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `Dossie_Forense_${slug || "Parlamentar"}.pdf`;
}

export function oracleStorageKey(politicoId) {
  return `transparenciabr_oracle_${politicoId}`;
}
