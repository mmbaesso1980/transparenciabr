const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery({ projectId: "transparenciabr" });

/**
 * Retorna KPIs de nepotismo cruzado
 * Pares de parlamentares que compartilham os mesmos fornecedores
 */
async function getNepotismoCruzadoKPIs() {
  try {
    const [paresCruzados] = await bq.query({
      query: `
        WITH fornecedor_parlamentar AS (
          SELECT DISTINCT
            nome_fornecedor,
            nome_parlamentar
          FROM \`transparenciabr.transparenciabr.ceap_despesas\`
          WHERE nome_fornecedor IS NOT NULL AND TRIM(nome_fornecedor) != ''
        )
        SELECT
          a.nome_parlamentar as parlamentar_a,
          b.nome_parlamentar as parlamentar_b,
          COUNT(DISTINCT a.nome_fornecedor) as fornecedores_em_comum
        FROM fornecedor_parlamentar a
        JOIN fornecedor_parlamentar b
          ON a.nome_fornecedor = b.nome_fornecedor
          AND a.nome_parlamentar < b.nome_parlamentar
        GROUP BY a.nome_parlamentar, b.nome_parlamentar
        HAVING COUNT(DISTINCT a.nome_fornecedor) >= 15
        ORDER BY fornecedores_em_comum DESC
        LIMIT 20
      `,
    });

    const [resumo] = await bq.query({
      query: `
        SELECT
          COUNT(DISTINCT nome_fornecedor) as total_fornecedores,
          COUNT(DISTINCT nome_parlamentar) as total_parlamentares
        FROM \`transparenciabr.transparenciabr.ceap_despesas\`
        WHERE nome_fornecedor IS NOT NULL AND TRIM(nome_fornecedor) != ''
      `,
    });

    return {
      source: "bigquery:transparenciabr.transparenciabr.ceap_despesas",
      updatedAt: new Date().toISOString(),
      status: "ativo",
      mensagem: "Análise de nepotismo cruzado: pares de parlamentares que compartilham os mesmos fornecedores via CEAP.",
      resumo: resumo[0] || {},
      paresCruzados,
      engenharia_pendente: [
        "Ingestão de folha de gabinete para cruzamento de parentesco",
        "Cruzamento TSE (candidatos x familiares)",
      ],
    };
  } catch (error) {
    console.error("Erro em getNepotismoCruzadoKPIs:", error);
    throw new Error(`Falha ao buscar KPIs de nepotismo cruzado: ${error.message}`);
  }
}

module.exports = { getNepotismoCruzadoKPIs };
