'use strict';

const { BigQuery } = require('@google-cloud/bigquery');
const { sha256Hex } = require('../utils/cryptoHash.js');
const { bqLocation } = require('../utils/bqLocation.js');

let _bq;
function getBq() {
  if (!_bq) _bq = new BigQuery();
  return _bq;
}

/**
 * MERGE idempotente — chave `_row_hash`.
 * Atenção: a carga massiva oficial (`engines/26_inss_indeferimentos_bq_load.py`) usa o schema
 * INSS/dados.gov (sem `nome`, com `mes_referencia`, etc.). Este MERGE segue o contrato legado
 * de `bqLeadFetcher` (`id_hash`, `nome`, …). Garanta compatibilidade de schema antes de usar.
 */
async function mergeIndeferimentoRow(row) {
  const cpfDigits = String(row.cpf || '').replace(/\D/g, '');
  const dt = String(row.dt_indeferimento || row.data_indeferimento || '').slice(0, 10);
  const source = String(row.source || row.source_file || 'AURORA_ENRICHMENT');
  const row_hash = sha256Hex(`${cpfDigits}|${dt}|${source}`);
  const id_hash = row.id_hash || row_hash;

  const query = `
    MERGE \`transparenciabr.tbr_leads_prev.indeferimentos_brasil_raw\` T
    USING (SELECT @row_hash AS _row_hash) S
    ON T._row_hash = S._row_hash
    WHEN NOT MATCHED THEN INSERT (
      _row_hash,
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
    ) VALUES (
      @row_hash,
      @id_hash,
      @cpf,
      @nome,
      @especie_beneficio,
      @tipo_acao,
      @motivo_indeferimento,
      @dt_indeferimento,
      @uf,
      @municipio,
      @status_lead
    )
  `;

  await getBq().query({
    query,
    params: {
      row_hash,
      id_hash,
      cpf: cpfDigits,
      nome: row.nome ?? '',
      especie_beneficio: row.especie_beneficio ?? '',
      tipo_acao: row.tipo_acao ?? 'enrichment',
      motivo_indeferimento: row.motivo_indeferimento ?? '',
      dt_indeferimento: dt || null,
      uf: row.uf ?? '',
      municipio: row.municipio ?? '',
      status_lead: row.status_lead ?? null,
    },
    location: bqLocation(),
  });
  return { _row_hash: row_hash, id_hash };
}

module.exports = { mergeIndeferimentoRow, getBq };
