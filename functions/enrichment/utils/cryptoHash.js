'use strict';

const crypto = require('crypto');

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

/** Hash do CPF somente dígitos — usar em logs e idempotência. */
function hashCpfDigits(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  return sha256Hex(d);
}

module.exports = { sha256Hex, hashCpfDigits };
