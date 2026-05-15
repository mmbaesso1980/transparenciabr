const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery({ projectId: "transparenciabr" });

/**
 * Retorna Score de Risco composto por parlamentar
 * Combina ceap_despesas + emendas para gerar score de risco
 */
async function getRiscoKPIs() {
  try {
    // Score composto: gasto CEAP + volume emendas + concentração fornecedores
    const [ranking] = await bq.query({
      query: `
        WITH ceap_stats AS (
          SELECT
            nome_parlamentar,
            SUM(valor_documento) as total_ceap,
            COUNT(*) as qtd_notas,
            COUNT(DISTINCT cnpj_fornecedor) as fornecedores_distintos,
            -- Concentração: % do gasto no top fornecedor
            ROUND(100.0 * MAX(fornecedor_total) / NULLIF(SUM(valor_documento), 0), 2) as concentracao_top_fornecedor
          FROM (
            SELECT
              nome_parlamentar,
              cnpj_fornecedor,
              valor_documento,
              SUM(valor_documento) OVER(PARTITION BY nome_parlamentar, cnpj_fornecedor) as fornecedor_total
            FROM \`transparenciabr.transparenciabr.ceap_despesas\`
            WHERE valor_documento > 0
          )
          GROUP BY nome_parlamentar
        ),
        emenda_stats AS (
          SELECT
            autor as nome_parlamentar,
            SUM(valorEmpenhado) as total_emendas,
            COUNT(*) as qtd_emendas
          FROM \`transparenciabr.transparenciabr.emendas\`
          GROUP BY autor
        )
        SELECT
          c.nome_parlamentar,
          c.total_ceap,
          c.qtd_notas,
          c.fornecedores_distintos,
          c.concentracao_top_fornecedor,
          COALESCE(e.total_emendas, 0) as total_emendas,
          COALESCE(e.qtd_emendas, 0) as qtd_emendas,
          -- Score de risco: normalizado 0-100
          ROUND(
            LEAST(100,
              (CASE WHEN c.total_ceap > 1000000 THEN 20 WHEN c.total_ceap > 500000 THEN 10 ELSE 5 END) +
              (CASE WHEN c.concentracao_top_fornecedor > 50 THEN 30 WHEN c.concentracao_top_fornecedor > 30 THEN 20 WHEN c.concentracao_top_fornecedor > 15 THEN 10 ELSE 0 END) +
              (CASE WHEN c.fornecedores_distintos < 5 THEN 20 WHEN c.fornecedores_distintos < 10 THEN 10 ELSE 0 END) +
              (CASE WHEN COALESCE(e.total_emendas, 0) > 100000000 THEN 20 WHEN COALESCE(e.total_emendas, 0) > 10000000 THEN 10 ELSE 5 END) +
              (CASE WHEN c.qtd_notas > 2000 THEN 10 WHEN c.qtd_notas > 1000 THEN 5 ELSE 0 END)
            )
          ) as score_risco
        FROM ceap_stats c
        LEFT JOIN emenda_stats e ON UPPER(TRIM(c.nome_parlamentar)) = UPPER(TRIM(e.nome_parlamentar))
        WHERE c.qtd_notas >= 10
        ORDER BY score_risco DESC, c.total_ceap DESC
        LIMIT 30
      `,
    });

    // Distribuição de risco
    const [distribuicao] = await bq.query({
      query: `
        WITH scores AS (
          SELECT
            nome_parlamentar,
            SUM(valor_documento) as total_ceap,
            COUNT(*) as qtd_notas,
            COUNT(DISTINCT cnpj_fornecedor) as fornecedores_distintos
          FROM \`transparenciabr.transparenciabr.ceap_despesas\`
          WHERE valor_documento > 0
          GROUP BY nome_parlamentar
          HAVING COUNT(*) >= 10
        )
        SELECT
          CASE
            WHEN total_ceap > 1000000 THEN 'Alto (>R$1M)'
            WHEN total_ceap > 500000 THEN 'Médio (R$500k-1M)'
            WHEN total_ceap > 100000 THEN 'Baixo (R$100k-500k)'
            ELSE 'Mínimo (<R$100k)'
          END as faixa_risco,
          COUNT(*) as qtd_parlamentares,
          SUM(total_ceap) as total_gasto
        FROM scores
        GROUP BY faixa_risco
        ORDER BY total_gasto DESC
      `,
    });

    return {
      source: "bigquery:transparenciabr.transparenciabr.ceap_despesas + emendas",
      updatedAt: new Date().toISOString(),
      status: "ativo",
      mensagem: "Score de risco composto baseado em gastos CEAP, concentração de fornecedores e volume de emendas. Dados de patrimônio TSE e folha de gabinete pendentes para score completo.",
      ranking,
      distribuicao,
      metodologia: {
        componentes: [
          "Volume CEAP (0-20 pts)",
          "Concentração top fornecedor (0-30 pts)",
          "Diversidade fornecedores (0-20 pts)",
          "Volume emendas (0-20 pts)",
          "Quantidade notas (0-10 pts)",
        ],
        escala: "0-100 (quanto maior, mais atenção requer)",
        pendente: ["Patrimônio TSE", "Folha gabinete", "Viagens", "Licitações municipais"],
      },
    };
  } catch (error) {
    console.error("Erro em getRiscoKPIs:", error);
    throw new Error(`Falha ao buscar KPIs de risco: ${error.message}`);
  }
}

module.exports = { getRiscoKPIs };
