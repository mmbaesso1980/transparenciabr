/**
 * Agregados CEAP partilhados (Benford, rubricas, CNPJ, minificação).
 */

export function toIso8601Date(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const d = dateStr.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return `${d}T12:00:00.000Z`;
}

export function parseValor(row) {
  const keys = [
    "valorLiquido",
    "valor_liquido",
    "vlrLiquido",
    "valorDocumento",
    "valor_documento",
    "valor",
  ];
  for (const k of keys) {
    if (row[k] != null && row[k] !== "") {
      const n = Number(row[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function urlDocumentoOficial(row) {
  const u = row.urlDocumento || row.url_documento;
  if (typeof u === "string" && u.trim().startsWith("http")) return u.trim();
  const num =
    row.numeroDocumento ??
    row.numDocumento ??
    row.numero_documento ??
    row.codigoDocumento ??
    "";
  const s = String(num ?? "").trim();
  if (/^[0-9]+$/.test(s)) {
    return `https://www.camara.leg.br/cota-parlamentar/documentos/publ/${s}.pdf`;
  }
  return typeof u === "string" ? u.trim() : "";
}

export function parseDataDoc(row) {
  const raw =
    row.dataDocumento ??
    row.data_documento ??
    row.dataEmissao ??
    row.data_emissao ??
    "";
  return String(raw ?? "").slice(0, 10);
}

export function minificarNotaParaFirestore(row) {
  const v = parseValor(row);
  const dataDoc = parseDataDoc(row);
  const url = urlDocumentoOficial(row);
  const nome = String(row.nomeFornecedor ?? row.nome_fornecedor ?? "").trim();
  const cnpj = String(row.cnpjCpfFornecedor ?? row.cnpjCpf ?? "").trim();
  return {
    txtFornecedor: nome,
    vlrLiquido: v != null && Number.isFinite(v) ? v : null,
    dataDocumento: dataDoc,
    dataDocumentoIso: toIso8601Date(dataDoc),
    urlDocumento:
      url || (typeof row.urlDocumento === "string" ? row.urlDocumento.trim() : ""),
    cnpjCpf: cnpj,
  };
}

export function ordenarTopCatalogo(minificadas) {
  return [...minificadas].sort((a, b) => {
    const db = String(b.dataDocumento || "");
    const da = String(a.dataDocumento || "");
    if (db !== da) return db.localeCompare(da);
    const vb = Number(b.vlrLiquido);
    const va = Number(a.vlrLiquido);
    const nb = Number.isFinite(vb) ? vb : -Infinity;
    const na = Number.isFinite(va) ? va : -Infinity;
    return nb - na;
  });
}

/** Rubrica = tipoDespesa da API (chave natural). */
export function buildResumoRubricas(rowsApi) {
  const map = new Map();
  for (const row of rowsApi) {
    const label = String(row.tipoDespesa ?? row.tipo_despesa ?? "").trim() || "Sem rubrica";
    const v = parseValor(row);
    if (!Number.isFinite(v)) continue;
    const cur = map.get(label) ?? { rubrica: label, total_valor: 0, n_notas: 0 };
    cur.total_valor += v;
    cur.n_notas += 1;
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => b.total_valor - a.total_valor);
}

export function buildMetricasCnpj(rowsApi) {
  const cnpjs = new Set();
  let ativos = 0;
  for (const row of rowsApi) {
    const raw = row.cnpjCpfFornecedor ?? row.cnpjCpf ?? "";
    const s = String(raw ?? "").replace(/\D/g, "");
    if (s.length >= 11) {
      cnpjs.add(s);
      const v = parseValor(row);
      if (Number.isFinite(v) && v > 0) ativos += 1;
    }
  }
  return {
    total_distinct_cnpj: cnpjs.size,
    fornecedores_ativos: ativos,
  };
}

export function computeTagsSemanticasRisco({ benford, rowsApi }) {
  const tags = new Set();
  if (benford?.anomaly_detected === true) tags.add("benford_anomalia");
  for (const row of rowsApi) {
    const tipo = String(row.tipoDespesa ?? "").toUpperCase();
    if (/CONSULTORIA|DIVULGA|LOCAC|PASSAGEM/i.test(tipo)) {
      tags.add("rubrica_auditoria_prioritaria");
      break;
    }
  }
  const vals = rowsApi.map((r) => parseValor(r)).filter((x) => Number.isFinite(x));
  if (vals.some((x) => x > 50000)) tags.add("valor_extremo_ceap");
  return [...tags];
}
