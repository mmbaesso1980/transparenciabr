'use strict';

const { BigQuery } = require('@google-cloud/bigquery');
const { mascaraCpf } = require('../utils/cpf.js');
const { hashCpfDigits } = require('../utils/cryptoHash.js');
const { bqLocation } = require('../utils/bqLocation.js');

let _bq;
function getBq() {
  if (!_bq) _bq = new BigQuery();
  return _bq;
}

/**
 * MERGE idempotente em `leads_finalizados` pela chave `lead_id` (única por operação).
 */
async function mergeLeadFinalizado(row) {
  const cpfDigits = String(row.cpf || '').replace(/\D/g, '');
  const cpf_mascarado = row.cpf_mascarado || mascaraCpf(cpfDigits);
  const lead_id = String(row.lead_id || '').trim();
  if (!lead_id) throw new Error('lead_id obrigatório para MERGE em leads_finalizados.');

  const query = `
    MERGE \`transparenciabr.tbr_leads_prev.leads_finalizados\` T
    USING (SELECT @lead_id AS lead_id) S
    ON T.lead_id = S.lead_id
    WHEN NOT MATCHED THEN INSERT (
      job_id,
      lead_id,
      cpf_mascarado,
      nome,
      uf,
      municipio,
      categoria,
      celular,
      fonte_celular,
      confianca_celular,
      email,
      score,
      ticket_estimado_brl,
      status,
      oab_solicitante,
      csv_url,
      gerado_em,
      origem,
      _consent_log_id,
      _enrichment_path,
      _cpf_hash
    ) VALUES (
      @job_id,
      @lead_id,
      @cpf_mascarado,
      @nome,
      @uf,
      @municipio,
      @categoria,
      @celular,
      @fonte_celular,
      @confianca_celular,
      @email,
      @score,
      @ticket_estimado_brl,
      @status,
      @oab_solicitante,
      @csv_url,
      @gerado_em,
      @origem,
      @_consent_log_id,
      @_enrichment_path,
      @_cpf_hash
    )
  `;

  await getBq().query({
    query,
    params: {
      job_id: row.job_id ?? 'enrichment',
      lead_id,
      cpf_mascarado,
      nome: row.nome ?? '',
      uf: row.uf ?? '',
      municipio: row.municipio ?? '',
      categoria: row.categoria ?? '',
      celular: row.celular ?? '',
      fonte_celular: row.fonte_celular ?? '',
      confianca_celular: row.confianca_celular ?? '',
      email: row.email ?? '',
      score: row.score != null ? Number(row.score) : null,
      ticket_estimado_brl: row.ticket_estimado_brl != null ? Number(row.ticket_estimado_brl) : null,
      status: row.status ?? 'CONSENTIDO',
      oab_solicitante: row.oab_solicitante ?? '',
      csv_url: row.csv_url ?? '',
      gerado_em: row.gerado_em || new Date(),
      origem: row.origem ?? 'enrichment',
      _consent_log_id: row._consent_log_id ?? null,
      _enrichment_path: row._enrichment_path ?? null,
      _cpf_hash: row._cpf_hash ?? hashCpfDigits(cpfDigits),
    },
    location: bqLocation(),
  });
  return { lead_id };
}

module.exports = { mergeLeadFinalizado, getBq };
