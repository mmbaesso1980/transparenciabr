/**
 * Normalização de tipos de emenda (RP6 / RP7 / RP99) para filtros no dossiê.
 * Compatível com dados reais incompletos e mocks de QA.
 */

/** @typedef {'TODAS' | 'PIX' | 'INDIVIDUAL' | 'BANCADA'} FiltroEmenda */

export const FILTROS_EMENDA = {
  TODAS: "TODAS",
  PIX: "PIX",
  INDIVIDUAL: "INDIVIDUAL",
  BANCADA: "BANCADA",
};

/**
 * @param {string | undefined} raw
 * @returns {'PIX' | 'INDIVIDUAL' | 'BANCADA'}
 */
export function normalizeTipoEmendaLabel(raw) {
  const u = String(raw || "")
    .trim()
    .toUpperCase();
  if (u === "PIX" || u === "RP99" || u === "99") return "PIX";
  if (
    u === "INDIVIDUAL" ||
    u === "INDIVIDUAIS" ||
    u === "RP6" ||
    u === "6" ||
    u === "EMENDA_INDIVIDUAL"
  )
    return "INDIVIDUAL";
  if (u === "BANCADA" || u === "RP7" || u === "7" || u === "EMENDA_BANCADA")
    return "BANCADA";
  return "INDIVIDUAL";
}

/**
 * @param {Record<string, unknown>} row
 * @returns {'PIX' | 'INDIVIDUAL' | 'BANCADA'}
 */
export function inferTipoEmenda(row) {
  if (!row || typeof row !== "object") return "INDIVIDUAL";
  const direct = row.tipo_emenda ?? row.tipoEmenda ?? row.modalidade_emenda;
  if (typeof direct === "string" && direct.trim()) {
    return normalizeTipoEmendaLabel(direct);
  }
  const rp = String(
    row.codigo_rp ??
      row.codigoRp ??
      row.rp ??
      row.tipo_rp ??
      row.modalidade ??
      "",
  )
    .toUpperCase()
    .trim();
  if (rp.includes("99") || rp === "RP99") return "PIX";
  if (rp.includes("7") || rp === "RP7") return "BANCADA";
  if (rp.includes("6") || rp === "RP6") return "INDIVIDUAL";
  const desc = String(row.descricao ?? row.objeto ?? row.nome ?? "").toLowerCase();
  if (desc.includes("pix") || desc.includes("rp99")) return "PIX";
  if (desc.includes("bancada") || desc.includes("rp7")) return "BANCADA";
  if (desc.includes("individual") || desc.includes("rp6")) return "INDIVIDUAL";
  return "INDIVIDUAL";
}

/**
 * @param {Record<string, unknown>} row
 * @param {number} idx
 */
export function normalizeEmendaRow(row, idx) {
  const tipo_emenda = inferTipoEmenda(row);
  const valor =
    Number(
      row.valor ??
        row.valor_aprovado ??
        row.valorEmpenhado ??
        row.valor_emenda ??
        row.valorRepassado,
    ) || 0;
  const descricao = String(
    row.descricao ?? row.objeto ?? row.nome ?? `Emenda ${idx + 1}`,
  );
  const ano = row.ano ?? row.exercicio ?? null;
  return {
    ...row,
    tipo_emenda,
    valor_normalizado: valor,
    descricao_normalizada: descricao,
    ano,
  };
}

/**
 * @param {unknown[]} rows
 */
export function normalizeEmendasList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r, i) =>
    normalizeEmendaRow(r && typeof r === "object" ? r : {}, i),
  );
}

/**
 * @param {'PIX' | 'INDIVIDUAL' | 'BANCADA'} tipo
 */
export function labelRpForTipo(tipo) {
  if (tipo === "PIX") return "RP99";
  if (tipo === "INDIVIDUAL") return "RP6";
  if (tipo === "BANCADA") return "RP7";
  return "";
}

/**
 * @param {FiltroEmenda} filtro
 * @param {{ tipo_emenda: string }} row
 */
export function rowMatchesFiltro(filtro, row) {
  if (filtro === FILTROS_EMENDA.TODAS) return true;
  return row.tipo_emenda === filtro;
}
