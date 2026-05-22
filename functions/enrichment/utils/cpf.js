'use strict';

/** Valida CPF (11 dígitos, não sequência repetida, dígitos verificadores). */
function validaCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i], 10) * (10 - i);
  let d1 = (s * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(d[9], 10)) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i], 10) * (11 - i);
  let d2 = (s * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(d[10], 10);
}

/** Máscara exibível LGPD (não substitui hash em logs). */
function mascaraCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.***.**${d.charAt(8)}-${d.slice(9, 11)}`;
}

module.exports = { validaCpf, mascaraCpf };
