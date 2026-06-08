'use strict';

const { randomUUID } = require('crypto');
const { AuroraEnricher } = require('./orchestrator.js');
const { logAudit, markAudited } = require('./lgpd/audit.js');
const { ConsentFormConnector } = require('./connectors/consent_form.js');

function sendJson(res, code, body) {
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.status(code).send(JSON.stringify(body));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.rawBody ? req.rawBody.toString('utf8') : '{}');
  } catch {
    return {};
  }
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || '';
}

const ENRICHMENT_CORS_ALLOWLIST = [
  'https://transparenciabr.web.app',
  'https://transparenciabr.firebaseapp.com',
];

function enrichmentCorsOrigin(req) {
  const origin = req.headers.origin || '';
  if (ENRICHMENT_CORS_ALLOWLIST.includes(origin)) return origin;
  const extra = String(process.env.ENRICHMENT_CORS_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (extra.includes(origin)) return origin;
  return ENRICHMENT_CORS_ALLOWLIST[0];
}

/**
 * HTTP Gen2 — `/api/consent` (hosting rewrite) e POST raiz para orquestrador.
 */
async function enrichmentHttp(req, res) {
  const corsOrigin = enrichmentCorsOrigin(req);
  res.set('Access-Control-Allow-Origin', corsOrigin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agent-User');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const path = String(req.path || req.url || '').split('?')[0];

  try {
    if (req.method === 'POST' && (path.endsWith('/api/consent') || path === '/consent' || path.endsWith('/consent'))) {
      const body = parseBody(req);
      const ip = clientIp(req);
      let auditId;
      try {
        auditId = await logAudit({
          cpf: body.cpf,
          finalidade: 'consentimento_landing',
          sourceConnector: 'consent_form',
          agentUserId: req.headers['x-agent-user'] || null,
          ipOrigem: ip,
          payload: { uf: body.uf, municipio: body.municipio, especie: body.especie_beneficio_indeferido },
        });
      } catch (e) {
        return sendJson(res, 500, {
          error: 'lgpd_audit_failed',
          detail: String(e.message || e),
          mensagem: 'Comandante Baesso: o motor AURORA não conseguiu registar a auditoria LGPD.',
        });
      }
      const ctx = {};
      markAudited(ctx, auditId);
      ctx.auditId = auditId;
      const c = new ConsentFormConnector();
      const r = await c.persistConsent(body, ctx);
      return sendJson(res, 200, {
        ok: true,
        ...r,
        mensagem:
          'Comandante Baesso: o seu consentimento foi registado. A equipa poderá contactá-lo apenas para a finalidade declarada.',
      });
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'method_not_allowed' });
    }

    const body = parseBody(req);
    const lead = body.lead || body;
    const strategy = body.strategy || 'cascade';
    const cpfForAudit = lead.cpf || body.cpf || (body.dados_cliente && body.dados_cliente.cpf);
    if (!cpfForAudit) {
      return sendJson(res, 400, {
        error: 'cpf_required',
        mensagem: 'Comandante Baesso: indique o CPF (apenas para hash de auditoria LGPD).',
      });
    }

    const ip = clientIp(req);
    let auditId;
    try {
      auditId = await logAudit({
        cpf: cpfForAudit,
        finalidade: body.finalidade || 'revisao_indeferimento_inss',
        sourceConnector: 'aurora_orchestrator',
        agentUserId: body.agent_user_id || req.headers['x-agent-user'] || null,
        ipOrigem: ip,
        payload: { lead_id: body.lead_id, strategy },
      });
    } catch (e) {
      return sendJson(res, 500, {
        error: 'lgpd_audit_failed',
        detail: String(e.message || e),
      });
    }

    const ctx = { lgpdAuditLogged: true, auditId, trace_id: body.trace_id || randomUUID() };
    const engine = new AuroraEnricher();
    const out = await engine.enrich(lead, strategy, ctx);
    return sendJson(res, 200, out);
  } catch (err) {
    const sc = err && err.statusCode;
    const code = Number.isInteger(sc) && sc >= 400 && sc < 600 ? sc : 500;
    return sendJson(res, code, {
      error: 'enrichment_failed',
      detail: String(err.message || err),
      mensagem: 'Comandante Baesso: o motor AURORA informa falha controlada (sem dados fictícios).',
    });
  }
}

module.exports = enrichmentHttp;
