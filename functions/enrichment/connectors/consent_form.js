'use strict';

const { validaCpf } = require('../utils/cpf.js');
const { mergeLeadFinalizado } = require('../sinks/bq_leads_finalizados.js');
const { AuroraEnricherBase } = require('./_base.js');

function simpleEmailOk(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function e164Ok(tel) {
  const s = String(tel || '').trim();
  return /^\+[1-9]\d{7,14}$/.test(s);
}

class ConsentFormConnector extends AuroraEnricherBase {
  /**
   * @param {object} body
   * @param {object} ctx
   */
  async persistConsent(body, ctx) {
    this.assertLgpd(ctx);
    const {
      cpf,
      nome,
      telefone,
      email,
      uf,
      municipio,
      especie_beneficio_indeferido,
      consent_checkboxes,
    } = body || {};

    if (!validaCpf(cpf)) {
      const e = new Error('CPF inválido — Comandante Baesso, motor AURORA rejeita dados inconsistentes.');
      e.statusCode = 400;
      throw e;
    }
    if (!nome || String(nome).trim().length < 3) {
      const e = new Error('Nome completo obrigatório.');
      e.statusCode = 400;
      throw e;
    }
    if (!e164Ok(telefone)) {
      const e = new Error('Telefone deve estar em formato E.164 (ex.: +5511999998888).');
      e.statusCode = 400;
      throw e;
    }
    if (email && !simpleEmailOk(email)) {
      const e = new Error('E-mail inválido.');
      e.statusCode = 400;
      throw e;
    }
    if (!consent_checkboxes?.lgpd_art7_i) {
      const e = new Error('Consentimento LGPD art. 7º I obrigatório.');
      e.statusCode = 400;
      throw e;
    }

    const auditId = ctx.auditId || `consent_${Date.now()}`;
    const lead_id = auditId;

    await mergeLeadFinalizado({
      job_id: 'consent_landing',
      lead_id,
      cpf,
      nome: String(nome).trim(),
      uf: String(uf || '').toUpperCase().slice(0, 2),
      municipio: String(municipio || ''),
      categoria: String(especie_beneficio_indeferido || ''),
      celular: telefone,
      fonte_celular: 'consent_form',
      confianca_celular: 'alta',
      email: email || '',
      status: 'CONSENTIDO',
      oab_solicitante: '',
      csv_url: '',
      origem: 'consent_form',
      _consent_log_id: auditId,
      _enrichment_path: 'C',
    });

    return { lead_id, audit_id: auditId, origem: 'consent_form' };
  }
}

module.exports = { ConsentFormConnector, simpleEmailOk, e164Ok };
