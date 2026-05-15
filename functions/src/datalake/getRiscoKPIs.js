const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery({ projectId: "transparenciabr" });

/**
 * Retorna Score de Risco composto por parlamentar
 * v3: Fix concentração (% real via subquery ROW_NUMBER), expandido para TODOS os parlamentares (594+)
 * Combina ceap_despesas + emendas para gerar score de risco
 */
async function getRiscoKPIs() {
  try {
    // Score composto v3: concentração REAL do top fornecedor + TODOS os parlamentares
    const [ranking] = await bq.query({
      query: `
        WITH fornecedor_rank AS (
          SELECT
            nome_parlamentar,
            cnpj_fornecedor,
            nome_fornecedor,
            SUM(valor_documento) as valor_fornecedor,
            ROW_NUMBER() OVER(PARTITION BY nome_parlamentar ORDER BY SUM(valor_documento) DESC) as rn
          FROM \`transparenciabr.transparenciabr.ceap_despesas\`
          WHERE valor_documento > 0
          GROUP BY nome_parlamentar, cnpj_fornecedor, nome_fornecedor
        ),
        ceap_stats AS (
          SELECT
            nome_parlamentar,
            SUM(valor_documento) as total_ceap,
            COUNT(*) as qtd_notas,
            COUNT(DISTINCT COALESCE(cnpj_fornecedor, nome_fornecedor)) as fornecedores_distintos
          FROM \`transparenciabr.transparenciabr.ceap_despesas\`
          WHERE valor_documento > 0
          GROUP BY nome_parlamentar
        ),
        top_fornecedor AS (
          SELECT nome_parlamentar, valor_fornecedor as top_fornecedor_valor, nome_fornecedor as top_fornecedor_nome
          FROM fornecedor_rank
          WHERE rn = 1
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
          ROUND(100.0 * COALESCE(t.top_fornecedor_valor, 0) / NULLIF(c.total_ceap, 0), 1) as concentracao_top_fornecedor,
          t.top_fornecedor_nome,
          COALESCE(e.total_emendas, 0) as total_emendas,
          COALESCE(e.qtd_emendas, 0) as qtd_emendas,
          -- Score de risco v3: normalizado 0-100, 5 componentes
          ROUND(
            LEAST(100,
              -- Componente 1: Volume CEAP (0-20 pts)
              (CASE WHEN c.total_ceap > 2000000 THEN 20 WHEN c.total_ceap > 1000000 THEN 15 WHEN c.total_ceap > 500000 THEN 10 WHEN c.total_ceap > 200000 THEN 7 ELSE 3 END) +
              -- Componente 2: Concentração top fornecedor (0-30 pts) — % real
              (CASE
                WHEN ROUND(100.0 * COALESCE(t.top_fornecedor_valor, 0) / NULLIF(c.total_ceap, 0), 1) > 60 THEN 30
                WHEN ROUND(100.0 * COALESCE(t.top_fornecedor_valor, 0) / NULLIF(c.total_ceap, 0), 1) > 40 THEN 22
                WHEN ROUND(100.0 * COALESCE(t.top_fornecedor_valor, 0) / NULLIF(c.total_ceap, 0), 1) > 25 THEN 15
                WHEN ROUND(100.0 * COALESCE(t.top_fornecedor_valor, 0) / NULLIF(c.total_ceap, 0), 1) > 15 THEN 8
                ELSE 3
              END) +
              -- Componente 3: Diversidade fornecedores (0-20 pts) — poucos = pior
              (CASE WHEN c.fornecedores_distintos < 3 THEN 20 WHEN c.fornecedores_distintos < 8 THEN 15 WHEN c.fornecedores_distintos < 15 THEN 10 WHEN c.fornecedores_distintos < 30 THEN 5 ELSE 2 END) +
              -- Componente 4: Volume emendas (0-20 pts)
              (CASE WHEN COALESCE(e.total_emendas, 0) > 200000000 THEN 20 WHEN COALESCE(e.total_emendas, 0) > 100000000 THEN 15 WHEN COALESCE(e.total_emendas, 0) > 50000000 THEN 10 WHEN COALESCE(e.total_emendas, 0) > 10000000 THEN 7 ELSE 3 END) +
              -- Componente 5: Quantidade notas (0-10 pts) — muitas notas = mais exposição
              (CASE WHEN c.qtd_notas > 3000 THEN 10 WHEN c.qtd_notas > 2000 THEN 8 WHEN c.qtd_notas > 1000 THEN 5 WHEN c.qtd_notas > 500 THEN 3 ELSE 1 END)
            )
          ) as score_risco
        FROM ceap_stats c
        LEFT JOIN top_fornecedor t ON c.nome_parlamentar = t.nome_parlamentar
        LEFT JOIN emenda_stats e ON UPPER(TRIM(c.nome_parlamentar)) = UPPER(TRIM(e.nome_parlamentar))
        WHERE c.qtd_notas >= 5
        ORDER BY score_risco DESC, c.total_ceap DESC
      `,
    });

    // Distribuição de risco por faixa
    const [distribuicao] = await bq.query({
      query: `
        WITH scores AS (
          SELECT
            nome_parlamentar,
            SUM(valor_documento) as total_ceap,
            COUNT(*) as qtd_notas,
            COUNT(DISTINCT COALESCE(cnpj_fornecedor, nome_fornecedor)) as fornecedores_distintos
          FROM \`transparenciabr.transparenciabr.ceap_despesas\`
          WHERE valor_documento > 0
          GROUP BY nome_parlamentar
          HAVING COUNT(*) >= 5
        )
        SELECT
          CASE
            WHEN total_ceap > 2000000 THEN 'Crítico (>R$2M)'
            WHEN total_ceap > 1000000 THEN 'Alto (R$1M-2M)'
            WHEN total_ceap > 500000 THEN 'Médio (R$500k-1M)'
            WHEN total_ceap > 100000 THEN 'Baixo (R$100k-500k)'
            ELSE 'Mínimo (<R$100k)'
          END as faixa_risco,
          COUNT(*) as qtd_parlamentares,
          ROUND(SUM(total_ceap), 2) as total_gasto
        FROM scores
        GROUP BY faixa_risco
        ORDER BY total_gasto DESC
      `,
    });

    return {
      source: "bigquery:transparenciabr.transparenciabr.ceap_despesas + emendas",
      updatedAt: new Date().toISOString(),
      status: "ativo",
      versao: "v3",
      totalParlamentares: ranking.length,
      mensagem: `Score de risco composto v3: ${ranking.length} parlamentares ranqueados. Concentração real do top fornecedor via ROW_NUMBER. Sem LIMIT — todos os parlamentares com >= 5 notas incluídos.`,
      ranking,
      distribuicao,
      metodologia: {
        componentes: [
          "Volume CEAP (0-20 pts) — escalonado por faixa de gasto total",
          "Concentração top fornecedor (0-30 pts) — % real do gasto no maior fornecedor",
          "Diversidade fornecedores (0-20 pts) — poucos fornecedores distintos = maior risco",
          "Volume emendas (0-20 pts) — escalonado por valor empenhado",
          "Quantidade notas (0-10 pts) — mais notas = mais exposição a auditoria",
        ],
        escala: "0-100 (quanto maior, mais atenção requer)",
        pendente: ["Patrimônio TSE", "Folha gabinete", "Viagens", "Licitações municipais", "Benford por parlamentar"],
      },
    };
  } catch (error) {
    console.error("Erro em getRiscoKPIs:", error);
    throw new Error(`Falha ao buscar KPIs de risco: ${error.message}`);
  }
}

module.exports = { getRiscoKPIs };
