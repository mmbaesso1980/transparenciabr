import axios from 'axios';

/**
 * Consulta HTTP documentada no sprint — validar TOS e disponibilidade antes de produção.
 */
export async function cadastroPreLookup({ cpf }) {
  const digits = String(cpf).replace(/\D/g, '');
  if (digits.length !== 11) return { celular: null };
  try {
    const url = `https://www.cadastropre.com.br/api/cpf/${digits}`;
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'TransparenciaBR-AURORA/1.0 (LGPD; contato@transparenciabr.com.br)' },
      validateStatus: () => true,
    });
    if (data && typeof data === 'object') {
      return { celular: data?.telefone || data?.celular || null, raw: data };
    }
    return { celular: null };
  } catch {
    return { celular: null };
  }
}
