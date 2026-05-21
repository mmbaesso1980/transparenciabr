const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery({ projectId: "transparenciabr" });

async function getEmendasKPIs() {
  try {
    const queries = {
      resumo: `
        SELECT
          COUNT(*) as total_emendas,
          COUNT(DISTINCT autor) as total_autores,
          SUM(valorEmpenhado) as total_empenhado,
          SUM(valorLiquidado) as total_liquidado,
          SUM(valorPago) as total_pago,
          MIN(ano) as ano_min,
          MAX(ano) as ano_max
        FROM \`transparenciabr.transparenciabr.emendas\`
      `,
      topAutores: `
        SELECT
          autor,
          COUNT(*) as qtd_emendas,
          SUM(valorEmpenhado) as total_empenhado,
          SUM(valorPago) as total_pago
        FROM \`transparenciabr.transparenciabr.emendas\`
        GROUP BY autor
        ORDER BY total_empenhado DESC
        LIMIT 20
      `,
      porFuncao: `
        SELECT
          funcao,
          COUNT(*) as qtd,
          SUM(valorEmpenhado) as total_empenhado,
          SUM(valorPago) as total_pago
        FROM \`transparenciabr.transparenciabr.emendas\`
        WHERE funcao IS NOT NULL AND funcao != ''
        GROUP BY funcao
        ORDER BY total_empenhado DESC
        LIMIT 15
      `,
      porAno: `
        SELECT
          ano,
          COUNT(*) as qtd,
          SUM(valorEmpenhado) as total_empenhado,
          SUM(valorPago) as total_pago
        FROM \`transparenciabr.transparenciabr.emendas\`
        GROUP BY ano
        ORDER BY ano
      `,
      porEstado: `
        SELECT
          estado,
          COUNT(*) as qtd,
          SUM(valorEmpenhado) as total_empenhado
        FROM \`transparenciabr.transparenciabr.emendas\`
        WHERE estado IS NOT NULL AND estado != ''
        GROUP BY estado
        ORDER BY total_empenhado DESC
        LIMIT 27
      `,
    };

    const results = {};
    for (const [key, query] of Object.entries(queries)) {
      const [rows] = await bq.query({ query });
      results[key] = rows;
    }

    return {
      source: "bigquery:transparenciabr.transparenciabr.emendas",
      updatedAt: new Date().toISOString(),
      resumo: results.resumo[0] || {},
      topAutores: results.topAutores,
      porFuncao: results.porFuncao,
      porAno: results.porAno,
      porEstado: results.porEstado,
    };
  } catch (error) {
    console.error("Erro em getEmendasKPIs:", error);
    throw new Error(`Falha ao buscar KPIs de emendas: ${error.message}`);
  }
}

module.exports = { getEmendasKPIs };
