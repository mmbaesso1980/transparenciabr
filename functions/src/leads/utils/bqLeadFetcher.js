/**
 * @fileoverview Utilitário de busca de leads no BigQuery.
 *
 * Tabela alvo: transparenciabr.tbr_leads_prev.indeferimentos_brasil_raw
 *
 * DIRETIVA: Zero dados governamentais no Firestore.
 * Todos os dados de leads residem exclusivamente no BigQuery (Data Lake GCS/BQ).
 *
 * @module utils/bqLeadFetcher
 */

'use strict';

const { BigQuery } = require('@google-cloud/bigquery');
const { logger } = require('firebase-functions');

/** Projeto GCP */
const GCP_PROJECT = process.env.GCLOUD_PROJECT || 'transparenciabr';

/** Referência completa da tabela de leads */
const BQ_TABLE = `${GCP_PROJECT}.tbr_leads_prev.indeferimentos_brasil_raw`;

/**
 * @typedef {Object} LeadBQ
 * @property {string} id_hash              - Hash identificador único do lead
 * @property {string} cpf                  - CPF do requerente (dado sensível)
 * @property {string} nome                 - Nome do requerente
 * @property {string} especie_beneficio    - Código da espécie (ex: '32', '92')
 * @property {string} tipo_acao            - Tipo de ação (ex: 'pcd_idade', 'bpc_def')
 * @property {string} motivo_indeferimento - Motivo do indeferimento INSS
 * @property {string} dt_indeferimento     - Data do indeferimento (YYYY-MM-DD)
 * @property {string} uf                   - UF do requerente
 * @property {string} municipio            - Município do requerente
 * @property {string|null} status_lead     - Status: null | 'desqualificado' | 'convertido'
 */

/**
 * Busca um lead pelo hash identificador.
 *
 * @param {string} leadId - Hash do lead (campo id_hash na tabela BQ)
 * @returns {Promise<LeadBQ|null>} Lead encontrado ou null
 * @throws {Error} Se a consulta BQ falhar
 */
async function fetchLeadByHash(leadId) {
  if (!leadId || typeof leadId !== 'string' || leadId.length < 8) {
    throw new Error(`leadId inválido: ${leadId}`);
  }

  logger.info('bqLeadFetcher.fetchLeadByHash: consultando BigQuery.', {
    leadId: leadId.slice(0, 8) + '...',
  });

  const bq = new BigQuery({ projectId: GCP_PROJECT });

  // Parameterized query — previne SQL injection
  const query = `
    SELECT
      id_hash,
      cpf,
      nome,
      especie_beneficio,
      tipo_acao,
      motivo_indeferimento,
      dt_indeferimento,
      uf,
      municipio,
      status_lead
    FROM \`${BQ_TABLE}\`
    WHERE id_hash = @leadId
    LIMIT 1
  `;

  const options = {
    query,
    params: { leadId },
    location: 'US', // Ajustar se dataset estiver em outra região
  };

  try {
    const [rows] = await bq.query(options);

    if (!rows || rows.length === 0) {
      logger.info('bqLeadFetcher.fetchLeadByHash: lead não encontrado.', {
        leadId: leadId.slice(0, 8) + '...',
      });
      return null;
    }

    const lead = rows[0];

    logger.info('bqLeadFetcher.fetchLeadByHash: lead encontrado.', {
      especie: lead.especie_beneficio,
      tipo_acao: lead.tipo_acao,
      uf: lead.uf,
      status: lead.status_lead,
    });

    return lead;
  } catch (err) {
    logger.error('bqLeadFetcher.fetchLeadByHash: erro na consulta BigQuery.', {
      message: err.message,
      code: err.code,
    });
    throw new Error(`BigQuery falhou: ${err.message}`);
  }
}

/**
 * Marca um lead como 'desqualificado' no BigQuery.
 *
 * Utilizado quando o PJe indica que o CPF já possui processo ativo.
 * Nota: BigQuery DML (UPDATE) pode demorar alguns segundos — operação assíncrona.
 *
 * @param {string} leadId       - Hash do lead
 * @param {string} motivoDq     - Motivo da desqualificação
 * @returns {Promise<void>}
 */
async function marcarDesqualificado(leadId, motivoDq) {
  logger.info('bqLeadFetcher.marcarDesqualificado: atualizando status no BigQuery.', {
    leadId: leadId.slice(0, 8) + '...',
    motivoDq,
  });

  const bq = new BigQuery({ projectId: GCP_PROJECT });

  const query = `
    UPDATE \`${BQ_TABLE}\`
    SET
      status_lead = 'desqualificado',
      motivo_desqualificacao = @motivoDq,
      dt_desqualificacao = CURRENT_TIMESTAMP()
    WHERE id_hash = @leadId
  `;

  const options = {
    query,
    params: { leadId, motivoDq },
    location: 'US',
  };

  try {
    await bq.query(options);
    logger.info('bqLeadFetcher.marcarDesqualificado: lead marcado como desqualificado.', {
      leadId: leadId.slice(0, 8) + '...',
    });
  } catch (err) {
    // Não lança exceção — o erro de atualização não deve bloquear a resposta ao cliente.
    // O lead será desqualificado novamente na próxima tentativa.
    logger.error('bqLeadFetcher.marcarDesqualificado: falha ao atualizar BigQuery.', {
      message: err.message,
      leadId: leadId.slice(0, 8) + '...',
    });
  }
}

module.exports = { fetchLeadByHash, marcarDesqualificado };
