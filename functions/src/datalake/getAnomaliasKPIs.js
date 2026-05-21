const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery({ projectId: "transparenciabr" });

/**
 * Retorna KPIs de anomalias (Lei de Benford aplicada ao CEAP)
 * Análise real de primeiro dígito dos valores de notas fiscais
 */
async function getAnomaliasKPIs() {
  try {
    // Lei de Benford: distribuição esperada do primeiro dígito
    const benfordEsperado = {
      1: 30.1, 2: 17.6, 3: 12.5, 4: 9.7, 5: 7.9,
      6: 6.7, 7: 5.8, 8: 5.1, 9: 4.6,
    };

    // Distribuição real do primeiro dígito
    const [benfordReal] = await bq.query({
      query: `
        SELECT
          CAST(SUBSTR(CAST(CAST(valor_documento AS INT64) AS STRING), 1, 1) AS INT64) as primeiro_digito,
          COUNT(*) as qtd,
          ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) as pct_real
        FROM \`transparenciabr.transparenciabr.ceap_despesas\`
        WHERE valor_documento > 0
        GROUP BY primeiro_digito
        HAVING primeiro_digito BETWEEN 1 AND 9
        ORDER BY primeiro_digito
      `,
    });

    // Parlamentares com maior desvio de Benford
    const [parlamentaresSuspeitos] = await bq.query({
      query: `
        WITH digitos AS (
          SELECT
            nome_parlamentar,
            CAST(SUBSTR(CAST(CAST(valor_documento AS INT64) AS STRING), 1, 1) AS INT64) as d1,
            valor_documento
          FROM \`transparenciabr.transparenciabr.ceap_despesas\`
          WHERE valor_documento > 0
        ),
        dist AS (
          SELECT
            nome_parlamentar,
            d1,
            COUNT(*) as qtd,
            SUM(COUNT(*)) OVER(PARTITION BY nome_parlamentar) as total
          FROM digitos
          WHERE d1 BETWEEN 1 AND 9
          GROUP BY nome_parlamentar, d1
        )
        SELECT
          nome_parlamentar,
          MAX(total) as total_notas,
          -- Desvio máximo do dígito 1 (esperado 30.1%)
          ROUND(ABS(MAX(CASE WHEN d1 = 1 THEN 100.0 * qtd / total ELSE 0 END) - 30.1), 2) as desvio_d1
        FROM dist
        GROUP BY nome_parlamentar
        HAVING MAX(total) >= 50
        ORDER BY desvio_d1 DESC
        LIMIT 20
      `,
    });

    // Valores redondos suspeitos (terminam em 00)
    const [valoresRedondos] = await bq.query({
      query: `
        SELECT
          nome_parlamentar,
          COUNT(*) as qtd_redondos,
          SUM(valor_documento) as total_redondos,
          ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM \`transparenciabr.transparenciabr.ceap_despesas\` c2 WHERE c2.nome_parlamentar = c.nome_parlamentar AND c2.valor_documento > 0), 2) as pct_redondos
        FROM \`transparenciabr.transparenciabr.ceap_despesas\` c
        WHERE valor_documento > 0 AND MOD(CAST(valor_documento AS INT64), 100) = 0
        GROUP BY nome_parlamentar
        HAVING COUNT(*) >= 20
        ORDER BY pct_redondos DESC
        LIMIT 20
      `,
    });

    // Resumo geral
    const [resumo] = await bq.query({
      query: `
        SELECT
          COUNT(*) as total_notas,
          SUM(valor_documento) as total_valor,
          COUNT(CASE WHEN MOD(CAST(valor_documento AS INT64), 100) = 0 AND valor_documento > 0 THEN 1 END) as notas_valor_redondo,
          ROUND(100.0 * COUNT(CASE WHEN MOD(CAST(valor_documento AS INT64), 100) = 0 AND valor_documento > 0 THEN 1 END) / COUNT(*), 2) as pct_valor_redondo
        FROM \`transparenciabr.transparenciabr.ceap_despesas\`
        WHERE valor_documento > 0
      `,
    });

    // Calcular desvio de Benford
    const benfordComparacao = benfordReal.map(r => ({
      digito: r.primeiro_digito,
      pct_real: r.pct_real,
      pct_esperado: benfordEsperado[r.primeiro_digito] || 0,
      desvio: Math.round((r.pct_real - (benfordEsperado[r.primeiro_digito] || 0)) * 100) / 100,
    }));

    return {
      source: "bigquery:transparenciabr.transparenciabr.ceap_despesas",
      updatedAt: new Date().toISOString(),
      status: "ativo",
      mensagem: "Análise de anomalias aplicando Lei de Benford e detecção de valores redondos nos gastos CEAP.",
      resumo: resumo[0] || {},
      benford: benfordComparacao,
      parlamentaresSuspeitos,
      valoresRedondos,
    };
  } catch (error) {
    console.error("Erro em getAnomaliasKPIs:", error);
    throw new Error(`Falha ao buscar KPIs de anomalias: ${error.message}`);
  }
}

module.exports = { getAnomaliasKPIs };
