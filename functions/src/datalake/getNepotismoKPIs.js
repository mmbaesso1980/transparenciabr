const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery({ projectId: "transparenciabr" });

/**
 * Retorna KPIs de nepotismo / fornecedores compartilhados
 * Usa nome_fornecedor (cnpj_fornecedor está vazio na tabela ceap_despesas)
 */
async function getNepotismoKPIs() {
  try {
    const [fornecedoresCompartilhados] = await bq.query({
      query: `
        SELECT
          nome_fornecedor,
          COUNT(DISTINCT nome_parlamentar) as qtd_parlamentares,
          SUM(valor_documento) as total_recebido,
          COUNT(*) as qtd_notas
        FROM \`transparenciabr.transparenciabr.ceap_despesas\`
        WHERE nome_fornecedor IS NOT NULL AND TRIM(nome_fornecedor) != ''
        GROUP BY nome_fornecedor
        HAVING COUNT(DISTINCT nome_parlamentar) >= 20
        ORDER BY qtd_parlamentares DESC
        LIMIT 20
      `,
    });

    const [resumo] = await bq.query({
      query: `
        SELECT
          COUNT(DISTINCT nome_fornecedor) as total_fornecedores,
          COUNT(DISTINCT nome_parlamentar) as total_parlamentares,
          COUNT(*) as total_transacoes,
          SUM(valor_documento) as total_valor
        FROM \`transparenciabr.transparenciabr.ceap_despesas\`
        WHERE nome_fornecedor IS NOT NULL AND TRIM(nome_fornecedor) != ''
      `,
    });

    // Top parlamentares por concentração em poucos fornecedores
    const [concentracao] = await bq.query({
      query: `
        WITH stats AS (
          SELECT
            nome_parlamentar,
            COUNT(DISTINCT nome_fornecedor) as fornecedores_distintos,
            COUNT(*) as total_notas,
            SUM(valor_documento) as total_gasto
          FROM \`transparenciabr.transparenciabr.ceap_despesas\`
          WHERE nome_fornecedor IS NOT NULL AND TRIM(nome_fornecedor) != ''
          GROUP BY nome_parlamentar
          HAVING COUNT(*) >= 50
        )
        SELECT *
        FROM stats
        WHERE fornecedores_distintos <= 3
        ORDER BY total_gasto DESC
        LIMIT 20
      `,
    });

    return {
      source: "bigquery:transparenciabr.transparenciabr.ceap_despesas",
      updatedAt: new Date().toISOString(),
      status: "ativo",
      mensagem: "Análise de fornecedores compartilhados entre parlamentares e concentração de gastos. Dados de folha de gabinete (nepotismo direto) ainda pendentes.",
      resumo: resumo[0] || {},
      fornecedoresCompartilhados,
      concentracaoFornecedores: concentracao,
      engenharia_pendente: [
        "Ingestão de dados de folha de gabinete (Câmara/Senado)",
        "Cruzamento com dados de parentesco (TSE/Receita Federal)",
      ],
    };
  } catch (error) {
    console.error("Erro em getNepotismoKPIs:", error);
    throw new Error(`Falha ao buscar KPIs de nepotismo: ${error.message}`);
  }
}

module.exports = { getNepotismoKPIs };
