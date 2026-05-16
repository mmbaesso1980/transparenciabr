const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery({ projectId: "transparenciabr" });

/**
 * Retorna KPIs de patrimônio TSE
 * Tabela tse_patrimonio ainda não ingerida - retorna dados parciais do dossiê Aurora
 */
async function getPatrimonioKPIs() {
  try {
    const [rows] = await bq.query({
      query: `
        SELECT
          parlamentar_id,
          nome_parlamentar,
          dossie_texto_base
        FROM \`transparenciabr.transparenciabr.tb_dossie_aurora_360\`
        LIMIT 50
      `,
    });

    return {
      source: "bigquery:transparenciabr.transparenciabr.tb_dossie_aurora_360",
      updatedAt: new Date().toISOString(),
      status: "parcial",
      mensagem: "Dados de patrimônio TSE ainda não foram ingeridos no BigQuery. Informações parciais extraídas dos dossiês Aurora 360.",
      total_parlamentares_dossie: rows.length,
      parlamentares: rows.map(r => ({
        parlamentar_id: r.parlamentar_id,
        nome: r.nome_parlamentar,
      })),
      engenharia_pendente: [
        "Ingestão de dados TSE (declaração de bens)",
        "Tabela destino: tse_patrimonio",
        "Fonte: https://dadosabertos.tse.jus.br/",
      ],
    };
  } catch (error) {
    console.error("Erro em getPatrimonioKPIs:", error);
    throw new Error(`Falha ao buscar KPIs de patrimônio: ${error.message}`);
  }
}

module.exports = { getPatrimonioKPIs };
