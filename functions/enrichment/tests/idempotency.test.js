'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sha256Hex } = require('../utils/cryptoHash.js');

test('idempotência: _row_hash estável para mesma tripla lógica', () => {
  const cpf = '52998224725';
  const dt = '2024-01-02';
  const src = 'fonte_x';
  const a = sha256Hex(`${cpf}|${dt}|${src}`);
  const b = sha256Hex(`${cpf}|${dt}|${src}`);
  assert.equal(a, b);
});
