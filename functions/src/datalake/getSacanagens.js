/**
 * getSacanagens — Motor de detecção de irregularidades parlamentares.
 * 
 * Cruza: CEAP + Emendas + Benford + Fornecedores concentrados.
 * Identifica: valores redondos, fornecedores dominantes, emendas milionárias,
 * desvios Benford, padrões temporais suspeitos.
 */
const { BigQuery } = require("@google-cloud/bigquery");
const PROJECT = "transparenciabr";
const DATASET = "transparenciabr";

/**
 * Busca os TOP parlamentares com mais sinais de irregularidade.
 * Retorna ranking consolidado com score de sacanagem.
 */
async function queryTopSacanagens(limit = 50) {
  const bq = new BigQuery({ projectId: PROJECT, location: "US" });
  const query = `
    WITH ceap_agg AS (
      SELECT
        parlamentar_id,
        ANY_VALUE(nome_parlamentar) as nome,
        SUM(valor_documento) as total_ceap,
        COUNT(*) as total_notas,
        COUNT(DISTINCT nome_fornecedor) as fornecedores,
        SUM(CASE WHEN valor_documento >= 500 AND MOD(CAST(ROUND(valor_documento) AS INT64), 100) = 0 THEN 1 ELSE 0 END) as notas_redondas,
        SUM(CASE WHEN valor_documento >= 10000 THEN 1 ELSE 0 END) as notas_altas,
        -- Concentração: % do maior fornecedor
        SAFE_DIVIDE(
          MAX(fornecedor_total),
          SUM(valor_documento)
        ) as concentracao_max_fornecedor
      FROM (
        SELECT 
          parlamentar_id, nome_parlamentar, valor_documento, nome_fornecedor,
          SUM(valor_documento) OVER (PARTITION BY parlamentar_id, nome_fornecedor) as fornecedor_total
        FROM \`${PROJECT}.${DATASET}.ceap_despesas\`
        WHERE valor_documento > 0
      )
      GROUP BY parlamentar_id
    ),
    benford_agg AS (
      SELECT
        parlamentar_id,
        COUNT(*) as digitos_analisados,
        SUM(CASE WHEN flag_desvio_gt_30pct THEN 1 ELSE 0 END) as benford_alertas
      FROM \`${PROJECT}.${DATASET}.vw_benford_ceap_audit\`
      GROUP BY parlamentar_id
    ),
    emendas_agg AS (
      SELECT
        autor,
        COUNT(*) as total_emendas,
        SUM(SAFE_CAST(valorEmpenhado AS FLOAT64)) as total_empenhado,
        SUM(CASE WHEN SAFE_CAST(valorEmpenhado AS FLOAT64) >= 1000000 THEN 1 ELSE 0 END) as emendas_milionarias,
        SUM(CASE WHEN SAFE_CAST(valorEmpenhado AS FLOAT64) >= 100000 AND MOD(CAST(ROUND(SAFE_CAST(valorEmpenhado AS FLOAT64)) AS INT64), 100000) = 0 THEN 1 ELSE 0 END) as emendas_redondas
      FROM \`${PROJECT}.${DATASET}.emendas\`
      WHERE autor NOT LIKE '%BANCADA%' AND autor NOT LIKE '%RELATOR%' AND autor NOT LIKE '%COMISSAO%'
      GROUP BY autor
    ),
    joined AS (
      SELECT
        c.parlamentar_id,
        c.nome,
        c.total_ceap,
        c.total_notas,
        c.fornecedores,
        c.notas_redondas,
        c.notas_altas,
        c.concentracao_max_fornecedor,
        COALESCE(b.benford_alertas, 0) as benford_alertas,
        COALESCE(e.total_emendas, 0) as total_emendas,
        COALESCE(e.total_empenhado, 0) as total_empenhado,
        COALESCE(e.emendas_milionarias, 0) as emendas_milionarias,
        COALESCE(e.emendas_redondas, 0) as emendas_redondas,
        -- SCORE DE SACANAGEM (0-100)
        LEAST(100, 
          COALESCE(b.benford_alertas, 0) * 12 +
          LEAST(30, c.notas_redondas * 0.15) +
          c.notas_altas * 2 +
          COALESCE(e.emendas_milionarias, 0) * 5 +
          COALESCE(e.emendas_redondas, 0) * 3 +
          (CASE WHEN c.concentracao_max_fornecedor > 0.3 THEN 15 ELSE 0 END) +
          (CASE WHEN c.total_ceap > 1500000 THEN 10 ELSE 0 END)
        ) as score_sacanagem
      FROM ceap_agg c
      LEFT JOIN benford_agg b ON c.parlamentar_id = b.parlamentar_id
      LEFT JOIN emendas_agg e ON LOWER(e.autor) LIKE CONCAT('%', LOWER(REGEXP_REPLACE(c.nome, r'\\s+', ' ')), '%')
    )
    SELECT * FROM joined
    WHERE score_sacanagem >= 20
    ORDER BY score_sacanagem DESC
    LIMIT @limit
  `;
  const [rows] = await bq.query({ query, params: { limit }, location: "US" });
  return rows;
}

/**
 * Busca sacanagens específicas de um parlamentar.
 */
async function querySacanagensDetalhe(parlamentarId, nome) {
  const bq = new BigQuery({ projectId: PROJECT, location: "US" });

  // 1. Notas redondas suspeitas (valores exatos em centenas)
  const notasRedondas = await bq.query({
    query: `
      SELECT data_emissao, valor_documento, nome_fornecedor, tipo_despesa, numero_documento
      FROM \`${PROJECT}.${DATASET}.ceap_despesas\`
      WHERE parlamentar_id = @id
        AND valor_documento >= 500
        AND MOD(CAST(ROUND(valor_documento) AS INT64), 100) = 0
      ORDER BY valor_documento DESC
      LIMIT 30
    `,
    params: { id: parlamentarId },
    location: "US",
  }).then(r => r[0]);

  // 2. Fornecedores com concentração suspeita (>20% do total)
  const fornecedoresSuspeitos = await bq.query({
    query: `
      WITH totais AS (
        SELECT SUM(valor_documento) as total FROM \`${PROJECT}.${DATASET}.ceap_despesas\` WHERE parlamentar_id = @id
      )
      SELECT 
        nome_fornecedor, 
        SUM(valor_documento) as total_fornecedor,
        COUNT(*) as notas,
        ROUND(SUM(valor_documento) / (SELECT total FROM totais) * 100, 1) as pct_total
      FROM \`${PROJECT}.${DATASET}.ceap_despesas\`
      WHERE parlamentar_id = @id
      GROUP BY nome_fornecedor
      HAVING pct_total > 10
      ORDER BY total_fornecedor DESC
      LIMIT 10
    `,
    params: { id: parlamentarId },
    location: "US",
  }).then(r => r[0]);

  // 3. Emendas do parlamentar (por nome)
  const emendas = nome ? await bq.query({
    query: `
      SELECT descricao, SAFE_CAST(valorEmpenhado AS FLOAT64) as valor_empenhado,
             SAFE_CAST(valorPago AS FLOAT64) as valor_pago, funcao, subfuncao, 
             municipio, estado, ano
      FROM \`${PROJECT}.${DATASET}.emendas\`
      WHERE LOWER(autor) LIKE CONCAT('%', LOWER(@nome), '%')
      ORDER BY SAFE_CAST(valorEmpenhado AS FLOAT64) DESC
      LIMIT 50
    `,
    params: { nome },
    location: "US",
  }).then(r => r[0]) : [];

  // 4. Benford
  const benford = await bq.query({
    query: `
      SELECT digito, pct_observado_pct, pct_teorico_pct, gap_relativo_pct, flag_desvio_gt_30pct
      FROM \`${PROJECT}.${DATASET}.vw_benford_ceap_audit\`
      WHERE parlamentar_id = @id
      ORDER BY digito
    `,
    params: { id: parlamentarId },
    location: "US",
  }).then(r => r[0]);

  // 5. Padrão temporal (gastos por mês - picos suspeitos)
  const temporal = await bq.query({
    query: `
      SELECT 
        FORMAT_DATE('%Y-%m', data_emissao) as mes,
        SUM(valor_documento) as total_mes,
        COUNT(*) as notas_mes
      FROM \`${PROJECT}.${DATASET}.ceap_despesas\`
      WHERE parlamentar_id = @id
      GROUP BY mes
      ORDER BY mes
    `,
    params: { id: parlamentarId },
    location: "US",
  }).then(r => r[0]);

  // Detectar picos temporais (meses com gasto > 2x a média)
  const mediaMensal = temporal.length > 0 
    ? temporal.reduce((s, t) => s + Number(t.total_mes), 0) / temporal.length 
    : 0;
  const picosSuspeitos = temporal.filter(t => Number(t.total_mes) > mediaMensal * 2);

  return {
    notas_redondas: notasRedondas.map(n => ({
      data: n.data_emissao?.value || "",
      valor: Number(n.valor_documento),
      fornecedor: n.nome_fornecedor,
      tipo: n.tipo_despesa,
      doc: n.numero_documento,
    })),
    fornecedores_suspeitos: fornecedoresSuspeitos.map(f => ({
      nome: f.nome_fornecedor,
      total: Math.round(Number(f.total_fornecedor) * 100) / 100,
      notas: f.notas,
      pct: Number(f.pct_total),
    })),
    emendas: emendas.map(e => ({
      descricao: e.descricao,
      valor_empenhado: Number(e.valor_empenhado || 0),
      valor_pago: Number(e.valor_pago || 0),
      funcao: e.funcao,
      subfuncao: e.subfuncao,
      municipio: e.municipio,
      estado: e.estado,
      ano: e.ano,
      suspeita: Number(e.valor_empenhado || 0) >= 1000000 || 
        (Number(e.valor_empenhado || 0) >= 100000 && Number(e.valor_empenhado || 0) % 100000 === 0),
    })),
    benford: {
      distribuicao: benford.map(b => ({
        digito: b.digito,
        observado: b.pct_observado_pct,
        teorico: b.pct_teorico_pct,
        gap: b.gap_relativo_pct,
        alerta: b.flag_desvio_gt_30pct,
      })),
      alertas: benford.filter(b => b.flag_desvio_gt_30pct).length,
    },
    temporal: {
      serie: temporal.map(t => ({ mes: t.mes, total: Number(t.total_mes), notas: t.notas_mes })),
      media_mensal: Math.round(mediaMensal),
      picos: picosSuspeitos.map(p => ({ mes: p.mes, total: Number(p.total_mes), ratio: Math.round(Number(p.total_mes) / mediaMensal * 10) / 10 })),
    },
  };
}

module.exports = { queryTopSacanagens, querySacanagensDetalhe };
