/**
 * getPoliticoDespesas — Serve TODAS as despesas CEAP de um parlamentar na ativa.
 * 
 * Modos:
 *   ?id=204536&mode=preview  → Top 10 despesas (grátis, sem URL)
 *   ?id=204536&mode=full     → Todas as despesas com URL clicável (requer 100 cr)
 *   ?nome=KIM KATAGUIRI&mode=full
 * 
 * Fonte: BigQuery transparenciabr.tbr_ceap.ceap_despesas_ext (5.1M registros, TEM url_documento)
 * URL padrão: https://www.camara.leg.br/cota-parlamentar/documentos/publ/{nu_deputado_id}/{num_ano}/{ide_documento}.pdf
 * 
 * IMPORTANTE: ceap_despesas_ext usa nu_deputado_id (ID interno da Câmara, ex: 3354)
 *             A API da Câmara usa id_deputado (ex: 204536)
 *             O frontend passa o id da API → precisamos fazer lookup por nome
 */
const { BigQuery } = require("@google-cloud/bigquery");

const PROJECT = "transparenciabr";
const DATASET = "tbr_ceap";
const TABLE = "ceap_despesas_ext";

// Benford expected distribution for first digit
const BENFORD = { 1: 0.301, 2: 0.176, 3: 0.125, 4: 0.097, 5: 0.079, 6: 0.067, 7: 0.058, 8: 0.051, 9: 0.046 };

/**
 * Constrói URL do documento CEAP.
 * Padrão: https://www.camara.leg.br/cota-parlamentar/documentos/publ/{nu_deputado_id}/{num_ano}/{ide_documento}.pdf
 */
function buildDocUrl(row) {
  // 1. URL direta do BQ (já preenchida para registros recentes)
  const urlDireta = row.url_documento || "";
  if (urlDireta && String(urlDireta).startsWith("http")) {
    return String(urlDireta).trim();
  }

  // 2. Construir via padrão: /publ/{nu_deputado_id}/{num_ano}/{ide_documento}.pdf
  const depId = String(row.nu_deputado_id || "").trim();
  const ano = String(row.num_ano || "").trim();
  const ideDoc = String(row.ide_documento || "").trim();
  if (depId && ano && ideDoc) {
    return `https://www.camara.leg.br/cota-parlamentar/documentos/publ/${depId}/${ano}/${ideDoc}.pdf`;
  }

  // 3. Fallback: nota-fiscal-eletronica
  if (ideDoc) {
    return `https://www.camara.leg.br/cota-parlamentar/nota-fiscal-eletronica?ideDocumentoFiscal=${ideDoc}`;
  }

  return "";
}

function detectAlerts(row, stats) {
  const alerts = [];
  const val = Number(row.vlr_documento || 0);

  // 1. Valor redondo (múltiplo de 100 acima de R$500)
  if (val >= 500 && val % 100 === 0) {
    alerts.push({ tipo: "valor_redondo", msg: "Valor redondo suspeito", severidade: "media" });
  }
  // 2. Valor alto (acima de R$10k)
  if (val >= 10000) {
    alerts.push({ tipo: "valor_alto", msg: `Despesa acima de R$ 10.000`, severidade: "alta" });
  }
  // 3. Fornecedor concentrado (>15% do total do parlamentar)
  const fornecedor = String(row.txt_fornecedor || "").trim();
  if (fornecedor && stats.fornecedorPct[fornecedor] > 15) {
    alerts.push({
      tipo: "fornecedor_concentrado",
      msg: `Fornecedor recebe ${stats.fornecedorPct[fornecedor].toFixed(1)}% do total`,
      severidade: "alta",
    });
  }
  // 4. Benford anomaly on first digit
  if (val > 0) {
    const d1 = parseInt(String(Math.abs(val))[0]);
    if (d1 >= 1 && d1 <= 9 && stats.benfordDeviation[d1] > 0.05) {
      alerts.push({
        tipo: "benford",
        msg: `Dígito ${d1} sobre-representado (desvio Benford)`,
        severidade: "baixa",
      });
    }
  }
  return alerts;
}

/**
 * Query TODAS as despesas CEAP de um parlamentar.
 * Usa ceap_despesas_ext que tem url_documento e ide_documento.
 * 
 * O frontend passa id da API (204536) mas esta tabela usa nu_deputado_id (3354).
 * Solução: primeiro buscar por nome no dataset transparenciabr.ceap_despesas (que tem parlamentar_id),
 * ou buscar direto por nome na ceap_despesas_ext.
 */
async function queryDespesas(id, nome) {
  const bq = new BigQuery({ projectId: PROJECT });

  // Se temos o id da API, primeiro precisamos descobrir o nome do parlamentar
  // porque ceap_despesas_ext usa nu_deputado_id (diferente do id da API)
  let nomeParl = nome;
  if (!nomeParl && id) {
    // Buscar nome na tabela transparenciabr.ceap_despesas que tem parlamentar_id
    const lookupQuery = `
      SELECT DISTINCT nome_parlamentar
      FROM \`transparenciabr.transparenciabr.ceap_despesas\`
      WHERE CAST(parlamentar_id AS STRING) = @id
      LIMIT 1
    `;
    const [lookupRows] = await bq.query({ query: lookupQuery, params: { id: String(id) }, location: "US" });
    if (lookupRows && lookupRows.length > 0) {
      nomeParl = lookupRows[0].nome_parlamentar;
    }
  }

  if (!nomeParl) {
    return [];
  }

  const query = `
    SELECT
      dat_emissao,
      tx_nome_parlamentar,
      nu_deputado_id,
      txt_descricao AS tipo_despesa,
      txt_fornecedor,
      txt_cnpjcpf,
      vlr_documento,
      vlr_liquido,
      vlr_glosa,
      txt_numero,
      ide_documento,
      num_ano,
      url_documento
    FROM \`${PROJECT}.${DATASET}.${TABLE}\`
    WHERE LOWER(tx_nome_parlamentar) = LOWER(@nome)
    ORDER BY dat_emissao DESC
  `;
  const [rows] = await bq.query({ query, params: { nome: nomeParl }, location: "US" });
  return rows;
}

function computeStats(rows) {
  const totalGeral = rows.reduce((s, r) => s + Number(r.vlr_documento || 0), 0);

  // Fornecedor concentration
  const fornecedorTotals = {};
  for (const r of rows) {
    const f = String(r.txt_fornecedor || "").trim();
    if (f) fornecedorTotals[f] = (fornecedorTotals[f] || 0) + Number(r.vlr_documento || 0);
  }
  const fornecedorPct = {};
  for (const [f, v] of Object.entries(fornecedorTotals)) {
    fornecedorPct[f] = totalGeral > 0 ? (v / totalGeral) * 100 : 0;
  }

  // Benford first digit distribution
  const digitCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  let totalDigits = 0;
  for (const r of rows) {
    const val = Math.abs(Number(r.vlr_documento || 0));
    if (val > 0) {
      const d1 = parseInt(String(val)[0]);
      if (d1 >= 1 && d1 <= 9) {
        digitCounts[d1]++;
        totalDigits++;
      }
    }
  }
  const benfordDeviation = {};
  for (let d = 1; d <= 9; d++) {
    const observed = totalDigits > 0 ? digitCounts[d] / totalDigits : 0;
    benfordDeviation[d] = observed - (BENFORD[d] || 0);
  }

  // Type breakdown
  const tipoTotals = {};
  for (const r of rows) {
    const t = String(r.tipo_despesa || "Outros").trim();
    tipoTotals[t] = (tipoTotals[t] || 0) + Number(r.vlr_documento || 0);
  }

  // Top fornecedores
  const topFornecedores = Object.entries(fornecedorTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100, pct: Math.round((valor / totalGeral) * 1000) / 10 }));

  // Periodo
  const datas = rows
    .map(r => {
      const d = r.dat_emissao;
      if (!d) return null;
      if (d.value) return d.value;
      return String(d).slice(0, 10);
    })
    .filter(Boolean)
    .sort();

  return {
    total_despesas: rows.length,
    total_brl: Math.round(totalGeral * 100) / 100,
    fornecedorPct,
    benfordDeviation,
    topFornecedores,
    tipoBreakdown: Object.entries(tipoTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, valor]) => ({ tipo, valor: Math.round(valor * 100) / 100 })),
    periodo: datas.length > 0
      ? { inicio: datas[0], fim: datas[datas.length - 1] }
      : null,
  };
}

function formatRow(r, stats, includeUrl = false) {
  const alerts = detectAlerts(r, stats);
  const valor = Number(r.vlr_documento || 0);
  const valorLiquido = Number(r.vlr_liquido || valor);
  const valorGlosa = Number(r.vlr_glosa || 0);

  // Extract date
  let dataStr = "";
  if (r.dat_emissao) {
    if (r.dat_emissao.value) dataStr = r.dat_emissao.value;
    else dataStr = String(r.dat_emissao).slice(0, 10);
  }

  const row = {
    data: dataStr,
    data_emissao: dataStr,
    tipo_despesa: String(r.tipo_despesa || ""),
    fornecedor: String(r.txt_fornecedor || ""),
    cnpj: String(r.txt_cnpjcpf || ""),
    valor,
    valor_liquido: valorLiquido,
    valor_glosa: valorGlosa,
    num_documento: String(r.txt_numero || ""),
    alertas: alerts,
    tem_alerta: alerts.length > 0,
    severidade_max: alerts.length > 0
      ? alerts.some((a) => a.severidade === "alta")
        ? "alta"
        : alerts.some((a) => a.severidade === "media")
          ? "media"
          : "baixa"
      : null,
  };

  if (includeUrl) {
    row.url_documento = buildDocUrl(r);
  }
  return row;
}

module.exports = { queryDespesas, computeStats, formatRow, buildDocUrl };
