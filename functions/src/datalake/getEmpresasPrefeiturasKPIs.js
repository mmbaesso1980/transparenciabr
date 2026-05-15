const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery({ projectId: "transparenciabr" });

/**
 * Retorna KPIs de empresas/fornecedores
 * Usa nome_fornecedor (cnpj_fornecedor está vazio)
 */
async function getEmpresasPrefeiturasKPIs() {
  try {
    const [topFornecedores] = await bq.query({
      query: `
        SELECT
          nome_fornecedor,
          COUNT(DISTINCT nome_parlamentar) as qtd_parlamentares,
          SUM(valor_documento) as total_recebido,
          COUNT(*) as qtd_notas
        FROM \`transparenciabr.transparenciabr.ceap_despesas\`
        WHERE nome_fornecedor IS NOT NULL AND TRIM(nome_fornecedor) != ''
        GROUP BY nome_fornecedor
        ORDER BY total_recebido DESC
        LIMIT 20
      `,
    });

    const [porTipoDespesa] = await bq.query({
      query: `
        SELECT
          tipo_despesa,
          COUNT(DISTINCT nome_fornecedor) as fornecedores,
          SUM(valor_documento) as total_valor,
          COUNT(*) as qtd_notas
        FROM \`transparenciabr.transparenciabr.ceap_despesas\`
        WHERE tipo_despesa IS NOT NULL AND tipo_despesa != ''
        GROUP BY tipo_despesa
        ORDER BY total_valor DESC
        LIMIT 15
      `,
    });

    const [resumo] = await bq.query({
      query: `
        SELECT
          COUNT(DISTINCT nome_fornecedor) as total_empresas,
          SUM(valor_documento) as total_movimentado,
          COUNT(*) as total_transacoes,
          COUNT(DISTINCT nome_parlamentar) as total_parlamentares
        FROM \`transparenciabr.transparenciabr.ceap_despesas\`
        WHERE nome_fornecedor IS NOT NULL AND TRIM(nome_fornecedor) != ''
      `,
    });

    return {
      source: "bigquery:transparenciabr.transparenciabr.ceap_despesas",
      updatedAt: new Date().toISOString(),
      status: "ativo",
      mensagem: "Rede de fornecedores baseada em gastos CEAP. Dados de licitações municipais e rede empresarial completa (QSA) ainda pendentes.",
      resumo: resumo[0] || {},
      topFornecedores,
      porTipoDespesa,
      engenharia_pendente: [
        "Ingestão de dados de licitações municipais (PNCP)",
        "Rede empresarial (Receita Federal - QSA)",
      ],
    };
  } catch (error) {
    console.error("Erro em getEmpresasPrefeiturasKPIs:", error);
    throw new Error(`Falha ao buscar KPIs de empresas/prefeituras: ${error.message}`);
  }
}

module.exports = { getEmpresasPrefeiturasKPIs };
