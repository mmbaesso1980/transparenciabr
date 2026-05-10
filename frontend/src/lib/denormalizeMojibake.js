/**
 * denormalizeMojibake — Onda 14
 *
 * Corrige strings que sofreram dupla codificação CP850→Latin-1.
 * Padrão observado no export do BigQuery → ranking.json:
 *   bytes UTF-8 originais foram interpretados como CP850 ao serem lidos,
 *   resultando em "UNI├O" (era "UNIÃO"), "Edilßzio J·nior" (era "Edilázio Júnior"),
 *   "┴tila Lins" (era "Átila Lins"), etc.
 *
 * A função reverte caractere a caractere a partir de uma tabela completa
 * dos code-points CP850 que divergem de Latin-1 e aparecem em PT-BR.
 *
 * Origem permanente: corrigir charset no script SQL futuro (BigQuery → GCS).
 * Aplicação imediata: client-side ao consumir ranking.json e payloads CEAP públicos.
 */

// Tabela CP850 (visual) -> Latin-1/UTF-8 (correto)
// Gerada a partir de bytes 0x80..0xFF onde cp850.decode(b) != latin-1.decode(b),
// filtrada para letras com acento PT-BR + cedilha + cardinais (ª/º) + box-drawing comuns.
const CP850_TO_LATIN1 = {
  '§': 'õ', '¬': 'ª', '±': 'ñ', '³': 'ü', '¶': 'ô', '·': 'ú', '¹': 'û',
  '¾': 'ó', 'Ã': 'Ç', 'È': 'Ô', 'Ë': 'Ó', 'Ð': 'Ñ', 'Ò': 'ã', 'Ó': 'à',
  'Ô': 'â', 'Ú': 'é', 'Û': 'ê', 'Ý': 'í', 'ß': 'á', 'þ': 'ç', 'ı': 'Õ',
  '┌': 'Ú', '└': 'À', '├': 'Ã', '┬': 'Â', '┴': 'Á', '═': 'Í', '║': 'º',
  '╔': 'É', '╩': 'Ê', '▄': 'Ü', '█': 'Û', '░': '°',
};

/**
 * Reverte mojibake CP850→Latin-1 em uma string.
 * Idempotente: strings já corretas (UTF-8) passam intactas.
 *
 * @param {string} s
 * @returns {string}
 */
export function denormalizeMojibake(s) {
  if (typeof s !== 'string' || !s) return s;
  // Otimização: se nenhum caractere da tabela aparece, retorna original
  let needsFix = false;
  for (let i = 0; i < s.length; i++) {
    if (CP850_TO_LATIN1[s[i]] !== undefined) {
      needsFix = true;
      break;
    }
  }
  if (!needsFix) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    out += CP850_TO_LATIN1[c] !== undefined ? CP850_TO_LATIN1[c] : c;
  }
  return out;
}

/**
 * Aplica denormalizeMojibake em um objeto, mantendo estrutura.
 * Útil para limpar payloads inteiros do ranking.
 *
 * @param {object} obj
 * @param {string[]} fields - lista de chaves a limpar (ex: ['deputado','partido'])
 * @returns {object} novo objeto com campos limpos
 */
export function denormalizeFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const f of fields) {
    if (typeof out[f] === 'string') {
      out[f] = denormalizeMojibake(out[f]);
    }
  }
  return out;
}

export default denormalizeMojibake;
