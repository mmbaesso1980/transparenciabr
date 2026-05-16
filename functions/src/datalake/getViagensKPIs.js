const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery({ projectId: "transparenciabr" });

/**
 * Retorna KPIs de viagens parlamentares
 * Tabela viagens ainda não ingerida - usa ceap_despesas (passagens aéreas) como proxy
 */
async function getViagensKPIs() {
  try {
    const [rows] = await bq.query({
      query: `
        SELECT
          nome_parlamentar,
          COUNT(*) as qtd_passagens,
          SUM(valor_documento) as total_gasto,
          COUNT(DISTINCT nome_fornecedor) as cias_aereas
        FROM \`transparenciabr.transparenciabr.ceap_despesas\`
        WHERE UPPER(tipo_despesa) LIKE '%PASSAG%' OR UPPER(tipo_despesa) LIKE '%AÉREA%' OR UPPER(tipo_despesa) LIKE '%AEREA%'
        GROUP BY nome_parlamentar
        ORDER BY total_gasto DESC
        LIMIT 20
      `,
    });

    const [resumo] = await bq.query({
      query: `
        SELECT
          COUNT(*) as total_notas_passagens,
          SUM(valor_documento) as total_gasto_passagens,
          COUNT(DISTINCT nome_parlamentar) as parlamentares_com_passagens,
          COUNT(DISTINCT nome_fornecedor) as fornecedores_passagens
        FROM \`transparenciabr.transparenciabr.ceap_despesas\`
        WHERE UPPER(tipo_despesa) LIKE '%PASSAG%' OR UPPER(tipo_despesa) LIKE '%AÉREA%' OR UPPER(tipo_despesa) LIKE '%AEREA%'
      `,
    });

    return {
      source: "bigquery:transparenciabr.transparenciabr.ceap_despesas (filtro passagens)",
      updatedAt: new Date().toISOString(),
      status: "parcial",
      mensagem: "Dados completos de viagens/agenda ainda não ingeridos. Exibindo gastos com passagens aéreas via CEAP.",
      resumo: resumo[0] || {},
      topParlamentares: rows,
      engenharia_pendente: [
        "Ingestão de dados de viagens oficiais (Câmara/Senado)",
        "Tabela destino: viagens",
        "Fonte: Portal da Transparência / Dados Abertos Câmara",
      ],
    };
  } catch (error) {
    console.error("Erro em getViagensKPIs:", error);
    throw new Error(`Falha ao buscar KPIs de viagens: ${error.message}`);
  }
}

module.exports = { getViagensKPIs };
