'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AuroraEnricher } = require('../orchestrator.js');

test('cascade: A e B falham → sugere C e executa D mock', async () => {
  const engine = new AuroraEnricher({
    dataprev: {
      async enrich() {
        const e = new Error('convénio pendente');
        e.statusCode = 503;
        throw e;
      },
    },
    bureau: {
      async enrich() {
        const e = new Error('bureau off');
        e.statusCode = 503;
        throw e;
      },
    },
    peticao: {
      async enrich() {
        return { docx_url: 'https://example.com/doc', pdf_url: '', audit_id: 'mock' };
      },
    },
    log: { info() {} },
  });
  const ctx = { lgpdAuditLogged: true, auditId: 'aud_test', trace_id: 'tr_test' };
  const out = await engine.enrich({ cpf: '52998224725', lead_id: 'L1' }, 'cascade', ctx);
  assert.ok(out.results.C);
  assert.ok(out.results.D);
  assert.equal(out.results.D.docx_url, 'https://example.com/doc');
});

test('circuito: bureau devolve 429 na estratégia B', async () => {
  const engine = new AuroraEnricher({
    bureau: {
      async enrich() {
        const e = new Error('teto');
        e.statusCode = 429;
        throw e;
      },
    },
    log: { info() {} },
  });
  const ctx = { lgpdAuditLogged: true, auditId: 'aud2', trace_id: 'tr2' };
  try {
    await engine.enrich({ cpf: '52998224725' }, 'B', ctx);
    assert.fail('esperado erro');
  } catch (e) {
    assert.equal(e.statusCode, 429);
  }
});
