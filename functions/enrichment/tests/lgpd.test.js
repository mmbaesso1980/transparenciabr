'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SerasaQuodConnector } = require('../connectors/serasa_quod.js');

test('connector bureau sem contexto LGPD → 403', async () => {
  const c = new SerasaQuodConnector();
  try {
    await c.enrich({ cpf: '52998224725', produto: 'telefone' }, {});
    assert.fail('deveria lançar');
  } catch (e) {
    assert.equal(e.statusCode, 403);
    assert.match(String(e.message), /LGPD|audit/i);
  }
});

test('hash de CPF não aparece em mensagens de erro do connector base', async () => {
  const { AuroraEnricherBase } = require('../connectors/_base.js');
  class X extends AuroraEnricherBase {
    async run(ctx) {
      this.assertLgpd(ctx);
    }
  }
  const x = new X();
  try {
    await x.run({});
  } catch (e) {
    assert.equal(e.statusCode, 403);
    assert.equal(String(e.message).includes('52998224725'), false);
  }
});
