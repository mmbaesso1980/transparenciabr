/** Valida dígitos verificadores do CPF (apenas números, 11 posições). */
export function validaCpf(cpf) {
  cpf = String(cpf).replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i], 10) * (10 - i);
  let d1 = (s * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i], 10) * (11 - i);
  let d2 = (s * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10], 10);
}

/**
 * Máscara LGPD: primeiros 3 dígitos + .***.** + nono dígito + hífen + dois últimos.
 * Ex.: 12345678901 → 123.***.**9-01
 */
export function mascaraCpf(cpf) {
  cpf = String(cpf).replace(/\D/g, '');
  if (cpf.length !== 11) return cpf;
  const d9 = cpf.charAt(8);
  const ult = cpf.slice(9, 11);
  return `${cpf.slice(0, 3)}.***.**${d9}-${ult}`;
}
