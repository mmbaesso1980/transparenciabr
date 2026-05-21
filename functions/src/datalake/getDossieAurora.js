/**
 * getDossieAurora — Dossiê Aurora 360 completo de um parlamentar.
 *
 * NÃO depende de tb_dossie_aurora_360. Faz cross-query em tempo real:
 *   ceap_despesas + emendas + vw_benford_ceap_audit + vw_ceap_zscore_roll + vw_parlamentar_base_eleitoral
 *   + FILTROS FORENSES AUTOMATIZADOS (F04, F15, Emendas×CEAP)
 *
 * Modos:
 *   ?nome=NOME&mode=preview  → Resumo gratuito (score, alertas count, total CEAP)
 *   ?nome=NOME&mode=full     → Dossiê completo (800 créditos - Dossiê Matador)
 *   ?id=PARLAMENTAR_ID       → Busca por ID (resolve nome via ceap_despesas)
 */
const { BigQuery } = require("@google-cloud/bigquery");
const PROJECT = "transparenciabr";
const DATASET = "transparenciabr";

function bq() {
  return new BigQuery({ projectId: PROJECT, location: "US" });
}

// Resolve parlamentar_id → nome via ceap_despesas
async function resolveNome(id) {
  const [rows] = await bq().query({
    query: `SELECT DISTINCT nome_parlamentar, parlamentar_id FROM \`${PROJECT}.${DATASET}.ceap_despesas\` WHERE parlamentar_id = @id LIMIT 1`,
    params: { id: String(id) },
    location: "US",
  });
  return rows.length > 0 ? rows[0] : null;
}

// CEAP stats consolidados
async function queryCeapStats(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT 
        COUNT(*) as total_notas,
        SUM(valor_documento) as total_brl,
        COUNT(DISTINCT nome_fornecedor) as fornecedores_distintos,
        SUM(CASE WHEN valor_documento >= 500 AND MOD(CAST(ROUND(valor_documento) AS INT64), 100) = 0 THEN 1 ELSE 0 END) as notas_redondas,
        SUM(CASE WHEN valor_documento >= 10000 THEN 1 ELSE 0 END) as notas_altas,
        MIN(data_emissao) as primeira_nota,
        MAX(data_emissao) as ultima_nota,
        ANY_VALUE(parlamentar_id) as parlamentar_id
      FROM \`${PROJECT}.${DATASET}.ceap_despesas\`
      WHERE LOWER(nome_parlamentar) = LOWER(@nome)
    `,
    params: { nome },
    location: "US",
  });
  return rows.length > 0 && rows[0].total_notas > 0 ? rows[0] : null;
}

// Top 15 fornecedores
async function queryTopFornecedores(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT nome_fornecedor, SUM(valor_documento) as total, COUNT(*) as notas
      FROM \`${PROJECT}.${DATASET}.ceap_despesas\`
      WHERE LOWER(nome_parlamentar) = LOWER(@nome)
      GROUP BY nome_fornecedor
      ORDER BY total DESC
      LIMIT 15
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// Despesas por tipo
async function queryTipoDespesas(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT tipo_despesa, SUM(valor_documento) as total, COUNT(*) as notas
      FROM \`${PROJECT}.${DATASET}.ceap_despesas\`
      WHERE LOWER(nome_parlamentar) = LOWER(@nome)
      GROUP BY tipo_despesa
      ORDER BY total DESC
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// Gastos mensais (temporal)
async function queryGastosMensais(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT 
        FORMAT_DATE('%Y-%m', data_emissao) as mes,
        SUM(valor_documento) as total,
        COUNT(*) as notas
      FROM \`${PROJECT}.${DATASET}.ceap_despesas\`
      WHERE LOWER(nome_parlamentar) = LOWER(@nome) AND data_emissao IS NOT NULL
      GROUP BY mes
      ORDER BY mes
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// Emendas parlamentares
async function queryEmendas(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT autor, descricao, CAST(valorEmpenhado AS FLOAT64) as valorEmpenhado,
             CAST(valorPago AS FLOAT64) as valorPago, funcao, subfuncao, municipio, estado, ano
      FROM \`${PROJECT}.${DATASET}.emendas\`
      WHERE LOWER(autor) LIKE CONCAT('%', LOWER(@nome), '%')
      ORDER BY CAST(valorEmpenhado AS FLOAT64) DESC
      LIMIT 500
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// Benford audit
async function queryBenford(parlamentarId) {
  if (!parlamentarId) return [];
  const [rows] = await bq().query({
    query: `
      SELECT digito, pct_observado_pct, pct_teorico_pct, gap_relativo_pct, flag_desvio_gt_30pct
      FROM \`${PROJECT}.${DATASET}.vw_benford_ceap_audit\`
      WHERE parlamentar_id = @id
      ORDER BY digito
    `,
    params: { id: parlamentarId },
    location: "US",
  });
  return rows;
}

// Z-score outliers (dias com gasto anormalmente alto)
async function queryZscoreOutliers(parlamentarId) {
  if (!parlamentarId) return [];
  const [rows] = await bq().query({
    query: `
      SELECT data_emissao, gasto_dia, zscore
      FROM \`${PROJECT}.${DATASET}.vw_ceap_zscore_roll\`
      WHERE parlamentar_id = @id AND flag_outlier_z3 = TRUE
      ORDER BY zscore DESC
      LIMIT 20
    `,
    params: { id: parlamentarId },
    location: "US",
  });
  return rows;
}

// Base eleitoral (emendas por município)
async function queryBaseEleitoral(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT nome_municipio, uf, total_emendas_valor, n_documentos,
             populacao, idh_municipal
      FROM \`${PROJECT}.${DATASET}.vw_parlamentar_base_eleitoral\`
      WHERE UPPER(parlamentar_nome) = UPPER(@nome)
      ORDER BY total_emendas_valor DESC
      LIMIT 20
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// Notas com valores exatos redondos (suspeitas detector)
async function querySacanagens(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT nome_fornecedor, valor_documento, tipo_despesa, data_emissao, numero_documento,
        CASE
          WHEN valor_documento >= 500 AND MOD(CAST(ROUND(valor_documento) AS INT64), 1000) = 0 THEN 'VALOR_REDONDO_MIL'
          WHEN valor_documento >= 500 AND MOD(CAST(ROUND(valor_documento) AS INT64), 100) = 0 THEN 'VALOR_REDONDO'
          WHEN valor_documento >= 10000 THEN 'VALOR_ALTO'
          ELSE 'OUTRO'
        END as tipo_alerta
      FROM \`${PROJECT}.${DATASET}.ceap_despesas\`
      WHERE LOWER(nome_parlamentar) = LOWER(@nome)
        AND (
          (valor_documento >= 500 AND MOD(CAST(ROUND(valor_documento) AS INT64), 100) = 0)
          OR valor_documento >= 10000
        )
      ORDER BY valor_documento DESC
      LIMIT 50
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// Concentração de fornecedores (mesmo fornecedor com muitas notas)
async function queryFornecedorConcentrado(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT nome_fornecedor, COUNT(*) as notas, SUM(valor_documento) as total,
             MIN(data_emissao) as primeira, MAX(data_emissao) as ultima,
             COUNT(DISTINCT FORMAT_DATE('%Y-%m', data_emissao)) as meses_distintos
      FROM \`${PROJECT}.${DATASET}.ceap_despesas\`
      WHERE LOWER(nome_parlamentar) = LOWER(@nome)
      GROUP BY nome_fornecedor
      HAVING COUNT(*) >= 5
      ORDER BY total DESC
      LIMIT 20
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTROS FORENSES AUTOMATIZADOS — Novas queries contra views materializadas
// ═══════════════════════════════════════════════════════════════════════════

// F15 — Dupla cobrança aviação (táxi aéreo × voo comercial mesmo dia)
async function queryF15DuplaCobranca(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT 
        data_fretamento, valor_fretamento, fornecedor_fretamento, cnpj_fretamento,
        trecho_fretamento, url_fretamento,
        data_passagem, valor_passagem, fornecedor_passagem, trecho_passagem,
        dias_diferenca, valor_total_suspeito, severidade
      FROM \`${PROJECT}.${DATASET}.vw_f15_aviacao_dupla_cobranca\`
      WHERE UPPER(nome_parlamentar) LIKE CONCAT('%', UPPER(@nome), '%')
      ORDER BY data_fretamento DESC
      LIMIT 30
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// F15 — Fretamento em rota com voo comercial disponível
async function queryF15FretamentoRota(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT 
        data_nota, valor, fornecedor, cnpj, trecho, url_documento, severidade
      FROM \`${PROJECT}.${DATASET}.vw_f15_fretamento_rota_comercial\`
      WHERE UPPER(nome_parlamentar) LIKE CONCAT('%', UPPER(@nome), '%')
      ORDER BY valor DESC
      LIMIT 20
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// F04 — Trecho inconsistente (sem trecho declarado ou sem Brasília)
async function queryF04TrechoInconsistente(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT 
        data_nota, valor, fornecedor, cnpj, trecho, tipo_despesa, 
        tipo_alerta, severidade, url_documento
      FROM \`${PROJECT}.${DATASET}.vw_f04_trecho_inconsistente\`
      WHERE UPPER(nome_parlamentar) LIKE CONCAT('%', UPPER(@nome), '%')
      ORDER BY valor DESC
      LIMIT 30
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// Emendas × CEAP — Mesmo parlamentar tem fornecedor CEAP recorrente
async function queryEmendasCeapCruzamento(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT 
        municipio_emenda, estado, emenda_total_empenhado, emenda_total_pago,
        n_emendas, ceap_cnpj_fornecedor, ceap_fornecedor, total_ceap,
        ceap_notas, primeira_nota, ultima_nota, valor_circuito_total, severidade
      FROM \`${PROJECT}.${DATASET}.vw_emendas_x_ceap_fornecedor\`
      WHERE UPPER(parlamentar) LIKE CONCAT('%', UPPER(@nome), '%')
      ORDER BY valor_circuito_total DESC
      LIMIT 20
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// Emendas concentração municipal (>40% para um município)
async function queryEmendasConcentracao(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT 
        municipio, estado, total_municipio, total_geral, 
        pct_concentracao, n_emendas, severidade
      FROM \`${PROJECT}.${DATASET}.vw_emendas_concentracao_municipal\`
      WHERE UPPER(parlamentar) LIKE CONCAT('%', UPPER(@nome), '%')
      ORDER BY pct_concentracao DESC
      LIMIT 10
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

// Emendas função × CEAP consultoria (emenda saúde + fornecedor consultoria)
async function queryEmendasFuncaoCeap(nome) {
  const [rows] = await bq().query({
    query: `
      SELECT 
        emenda_funcao, emenda_municipio, emenda_estado, emenda_ano,
        emenda_valor, ceap_fornecedor, ceap_cnpj, ceap_tipo,
        total_ceap, ceap_notas, severidade
      FROM \`${PROJECT}.${DATASET}.vw_emendas_funcao_x_fornecedor_ceap\`
      WHERE UPPER(parlamentar) LIKE CONCAT('%', UPPER(@nome), '%')
      ORDER BY total_ceap DESC
      LIMIT 20
    `,
    params: { nome },
    location: "US",
  });
  return rows;
}

module.exports = {
  resolveNome,
  queryCeapStats,
  queryTopFornecedores,
  queryTipoDespesas,
  queryGastosMensais,
  queryEmendas,
  queryBenford,
  queryZscoreOutliers,
  queryBaseEleitoral,
  querySacanagens,
  queryFornecedorConcentrado,
  // Filtros forenses
  queryF15DuplaCobranca,
  queryF15FretamentoRota,
  queryF04TrechoInconsistente,
  queryEmendasCeapCruzamento,
  queryEmendasConcentracao,
  queryEmendasFuncaoCeap,
};
