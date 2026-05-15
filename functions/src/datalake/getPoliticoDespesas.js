/**
 * getPoliticoDespesas — Serve despesas detalhadas de um parlamentar.
 * 
 * Modos:
 *   ?id=204554&mode=preview  → Top 10 despesas (grátis, sem URL)
 *   ?id=204554&mode=full     → Todas as despesas com URL clicável (requer 100 cr)
 * 
 * Fonte: BigQuery ceap_despesas (legislatura atual 2023+)
 * Alertas: valores redondos, acima de R$10k, fornecedor concentrado, Benford digit 1
 */
const { BigQuery } = require("@google-cloud/bigquery");

const PROJECT = "transparenciabr";
const DATASET = "transparenciabr";
const TABLE = "ceap_despesas";

// Benford expected distribution for first digit
const BENFORD = { 1: 0.301, 2: 0.176, 3: 0.125, 4: 0.097, 5: 0.079, 6: 0.067, 7: 0.058, 8: 0.051, 9: 0.046 };

function detectAlerts(row, stats) {
  const alerts = [];
  const val = Number(row.valor_documento || 0);
  
  // 1. Valor redondo (múltiplo de 100 acima de R$500)
  if (val >= 500 && val % 100 === 0) {
    alerts.push({ tipo: "valor_redondo", msg: "Valor redondo suspeito", severidade: "media" });
  }
  
  // 2. Valor alto (acima de R$10k)
  if (val >= 10000) {
    alerts.push({ tipo: "valor_alto", msg: `Despesa acima de R$ 10.000`, severidade: "alta" });
  }
  
  // 3. Fornecedor concentrado (>5% do total do parlamentar)
  const fornecedor = String(row.nome_fornecedor || "").trim();
  if (fornecedor && stats.fornecedorPct[fornecedor] > 15) {
    alerts.push({ 
      tipo: "fornecedor_concentrado", 
      msg: `Fornecedor recebe ${stats.fornecedorPct[fornecedor].toFixed(1)}% do total`,
      severidade: "alta" 
    });
  }
  
  // 4. Benford anomaly on first digit
  if (val > 0) {
    const d1 = parseInt(String(Math.abs(val))[0]);
    if (d1 >= 1 && d1 <= 9 && stats.benfordDeviation[d1] > 0.05) {
      alerts.push({ 
        tipo: "benford", 
        msg: `Dígito ${d1} sobre-representado (desvio Benford)`,
        severidade: "baixa" 
      });
    }
  }
  
  return alerts;
}

async function queryDespesas(id, nome) {
  const bq = new BigQuery({ projectId: PROJECT });
  
  // Try to match by name from ranking, or by id
  let whereClause;
  if (nome) {
    whereClause = `LOWER(nome_parlamentar) = LOWER(@nome)`;
  } else {
    // Try to find the name from the ranking
    whereClause = `CAST(id_deputado AS STRING) = @id OR nome_parlamentar LIKE CONCAT('%', @id, '%')`;
  }
  
  const query = `
    SELECT
      data_emissao,
      nome_parlamentar,
      tipo_despesa,
      nome_fornecedor,
      cnpj_fornecedor,
      valor_documento,
      numero_documento,
      parlamentar_id
    FROM \`${PROJECT}.${DATASET}.${TABLE}\`
    WHERE ${nome ? 'LOWER(nome_parlamentar) = LOWER(@nome)' : 'parlamentar_id = @id'}
      AND data_emissao >= '2023-02-01'
    ORDER BY data_emissao DESC
  `;
  
  const params = nome ? { nome } : { id: String(id) };
  const [rows] = await bq.query({ query, params, location: "US" });
  return rows;
}

function computeStats(rows) {
  const totalGeral = rows.reduce((s, r) => s + Number(r.valor_documento || 0), 0);
  
  // Fornecedor concentration
  const fornecedorTotals = {};
  for (const r of rows) {
    const f = String(r.nome_fornecedor || "").trim();
    if (f) fornecedorTotals[f] = (fornecedorTotals[f] || 0) + Number(r.valor_documento || 0);
  }
  const fornecedorPct = {};
  for (const [f, v] of Object.entries(fornecedorTotals)) {
    fornecedorPct[f] = totalGeral > 0 ? (v / totalGeral) * 100 : 0;
  }
  
  // Benford first digit distribution
  const digitCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  let totalDigits = 0;
  for (const r of rows) {
    const val = Math.abs(Number(r.valor_documento || 0));
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
    tipoTotals[t] = (tipoTotals[t] || 0) + Number(r.valor_documento || 0);
  }
  
  // Top fornecedores
  const topFornecedores = Object.entries(fornecedorTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100, pct: Math.round((valor / totalGeral) * 1000) / 10 }));
  
  return {
    total_despesas: rows.length,
    total_brl: Math.round(totalGeral * 100) / 100,
    fornecedorPct,
    benfordDeviation,
    topFornecedores,
    tipoBreakdown: Object.entries(tipoTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, valor]) => ({ tipo, valor: Math.round(valor * 100) / 100 })),
    periodo: rows.length > 0 ? {
      inicio: rows[rows.length - 1].data_emissao?.value || "",
      fim: rows[0].data_emissao?.value || "",
    } : null,
  };
}

function formatRow(r, stats, includeUrl = false) {
  const alerts = detectAlerts(r, stats);
  const row = {
    data: r.data_emissao?.value || String(r.data_emissao || ""),
    tipo_despesa: String(r.tipo_despesa || ""),
    fornecedor: String(r.nome_fornecedor || ""),
    cnpj: String(r.cnpj_fornecedor || ""),
    valor: Number(r.valor_documento || 0),
    num_documento: String(r.numero_documento || ""),
    alertas: alerts,
    tem_alerta: alerts.length > 0,
    severidade_max: alerts.length > 0 
      ? (alerts.some(a => a.severidade === "alta") ? "alta" : alerts.some(a => a.severidade === "media") ? "media" : "baixa")
      : null,
  };
  
  if (includeUrl) {
    const numDoc = String(r.numero_documento || "").trim();
    // Build URL from Câmara's public CEAP portal
    row.url_nota = numDoc
      ? `https://www.camara.leg.br/cota-parlamentar/nota-fiscal-eletronica?ideDocumentoFiscal=${numDoc}`
      : "";
  }
  
  return row;
}

module.exports = { queryDespesas, computeStats, formatRow };
