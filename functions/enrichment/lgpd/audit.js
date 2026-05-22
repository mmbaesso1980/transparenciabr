'use strict';

const crypto = require('crypto');
const { BigQuery } = require('@google-cloud/bigquery');
const { resolveBasis } = require('./basis.js');
const { DEFAULT_RETENTION_DAYS } = require('./retention.js');
const { sha256Hex, hashCpfDigits } = require('../utils/cryptoHash.js');

let _bq;
function getBq() {
  if (!_bq) _bq = new BigQuery();
  return _bq;
}

function newAuditId() {
  return `aud_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Regista auditoria LGPD em BigQuery. Nunca grava CPF em claro em `cpf_hash`.
 * @returns {Promise<string>} audit_id
 */
async function logAudit({
  cpf,
  finalidade,
  sourceConnector,
  agentUserId = null,
  ipOrigem = null,
  payload = {},
}) {
  const audit_id = newAuditId();
  const cpf_hash = hashCpfDigits(cpf);
  const base_legal = resolveBasis(finalidade);
  const payload_hash = sha256Hex(JSON.stringify(payload));
  const row = {
    audit_id,
    cpf_hash,
    finalidade,
    base_legal,
    source_connector: sourceConnector,
    agent_user_id: agentUserId,
    ip_origem: ipOrigem,
    timestamp: new Date(),
    payload_hash,
    ttl_dias: DEFAULT_RETENTION_DAYS,
  };
  const table = getBq().dataset('tbr_leads_prev').table('lgpd_audit_log');
  await table.insert([row]);
  return audit_id;
}

/**
 * Marca o contexto como auditado (após `logAudit` bem-sucedido).
 * Connectors devem exigir `ctx.lgpdAuditLogged === true`.
 */
function markAudited(ctx, auditId) {
  if (!ctx || typeof ctx !== 'object') return;
  ctx.lgpdAuditLogged = true;
  ctx.auditId = auditId;
}

module.exports = {
  logAudit,
  markAudited,
  hashCpfDigits,
  sha256Hex,
  /** @deprecated use hashCpfDigits */
  hashCpf: hashCpfDigits,
};
