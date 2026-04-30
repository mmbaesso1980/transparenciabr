// engines/normalizer/normalizer.js
// Pipeline de normalização pós-ingestão para dados governamentais brasileiros.
//
// Trata os 5 problemas clássicos de CSVs/JSONs do gov.br:
//   1. Encoding (ISO-8859-1 / Latin-1 / cp1252 → UTF-8)
//   2. Headers com acentos/espaços/caps inconsistentes
//   3. Vírgula decimal "1.234,56" → number 1234.56
//   4. Datas BR "29/04/2026" → ISO "2026-04-29"
//   5. Campos vazios "—", "-", "N/A", "" → null
//
// Estrutura de saída: cada registro vira um JSON com:
//   - normalized: campos tratados, tipados, validados
//   - meta: { ingested_at, source, year, raw_path, normalizer_version, issues[] }
//   - raw_hash: SHA256 do registro original (auditoria)
// Registros que falham validação vão pra quarantine layer (não para clean).

import crypto from 'node:crypto';
import iconv from 'iconv-lite';
import chardet from 'chardet';
import { logger } from '../utils/logger.js';

const NORMALIZER_VERSION = '1.0.0';

// ─────────────────────────────────────────────────────────────────────────────
// 1. ENCODING DETECTION + CONVERSION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detecta encoding e converte para UTF-8.
 * Heurística: tenta chardet; se inconclusivo, testa UTF-8 → fallback Latin-1.
 */
export function ensureUtf8(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return { text: String(buffer), encoding_detected: 'string', confidence: 100 };
  }

  // Detectar encoding
  const detected = chardet.detect(buffer);
  const encoding = (detected || 'UTF-8').toUpperCase();

  // Validar se é UTF-8 puro (sem caracteres de substituição)
  let text;
  try {
    text = buffer.toString('utf-8');
    // Se tiver U+FFFD (replacement character), provavelmente é Latin-1
    if (text.includes('\uFFFD')) {
      text = iconv.decode(buffer, 'iso-8859-1');
      return { text, encoding_detected: 'iso-8859-1', confidence: 80, note: 'utf8_had_replacement_chars' };
    }
    return { text, encoding_detected: encoding, confidence: 95 };
  } catch (err) {
    text = iconv.decode(buffer, 'iso-8859-1');
    return { text, encoding_detected: 'iso-8859-1', confidence: 70, note: 'utf8_decode_failed' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. HEADER NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza nome de campo: remove acentos, lowercase, snake_case.
 *   "Nº Lote" → "nº_lote" → "n_lote"... NÃO. Vamos fazer:
 *   "Nº Lote" → "n_lote" (mantém ASCII puro, sufixo numérico ok)
 *   "txNomeParlamentar" → "tx_nome_parlamentar"
 *   "VL_LIQUIDO_DOCUMENTO" → "vl_liquido_documento"
 *   "Data Emissão" → "data_emissao"
 */
export function normalizeFieldName(name) {
  if (!name) return null;
  return String(name)
    .normalize('NFD')                    // decompose accents
    .replace(/[\u0300-\u036f]/g, '')     // strip combining marks
    .replace(/[°º]/g, '')                // strip degree/ordinal marks
    .replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase → snake_case
    .replace(/[^a-zA-Z0-9]+/g, '_')      // non-alphanum → underscore
    .replace(/^_+|_+$/g, '')             // trim underscores
    .replace(/_+/g, '_')                 // collapse double underscores
    .toLowerCase();
}

export function normalizeHeaders(headers) {
  if (!Array.isArray(headers)) return headers;
  const seen = new Set();
  return headers.map((h, idx) => {
    let normalized = normalizeFieldName(h) || `col_${idx}`;
    // Resolve duplicates
    let suffix = 0;
    let candidate = normalized;
    while (seen.has(candidate)) {
      suffix++;
      candidate = `${normalized}_${suffix}`;
    }
    seen.add(candidate);
    return candidate;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TYPE COERCION (número, data, boolean, null)
// ─────────────────────────────────────────────────────────────────────────────

const NULL_LITERALS = new Set(['', '-', '—', '–', 'n/a', 'na', 'null', 'nulo', 'nd', 'sem informação', 'sem informacao', 'não informado', 'nao informado']);

/**
 * Detecta e coage valores para tipos JS apropriados.
 * Estratégia:
 *   - null literais → null
 *   - "1.234,56" / "1234,56" → 1234.56 (decimal BR)
 *   - "1,234.56" / "1234.56" → 1234.56 (decimal US)
 *   - "29/04/2026" → "2026-04-29" (ISO)
 *   - "2026-04-29T00:00:00" → "2026-04-29T00:00:00.000Z"
 *   - "true"/"false"/"sim"/"não" → boolean
 */
export function coerceValue(raw, hint = null) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string') return raw;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Null literals
  if (NULL_LITERALS.has(trimmed.toLowerCase())) return null;

  // Hint-based: se schema diz que é string, retorna trimmed sem mais conversões
  if (hint === 'string' || hint === 'text') return trimmed;

  // Boolean
  if (/^(true|sim|s|yes|y)$/i.test(trimmed)) return true;
  if (/^(false|não|nao|n|no)$/i.test(trimmed)) return false;

  // Number (BR style: "1.234,56" or "1234,56")
  // Reconhece se tem vírgula como decimal
  const brNumber = trimmed.match(/^-?[\d.]+,\d+$/);
  if (brNumber) {
    const cleaned = trimmed.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    if (!isNaN(num)) return num;
  }

  // Number (US style: "1,234.56" or simple "1234.56" or "1234")
  const usNumber = trimmed.match(/^-?[\d,]*\.?\d+$/);
  if (usNumber && !trimmed.includes(',') ) {
    const num = parseFloat(trimmed);
    if (!isNaN(num) && isFinite(num)) return num;
  }

  // Number with thousands separator US
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed)) {
    const num = parseFloat(trimmed.replace(/,/g, ''));
    if (!isNaN(num)) return num;
  }

  // Integer puro
  if (/^-?\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // Date BR "DD/MM/YYYY" or "DD/MM/YY"
  const dateBr = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dateBr) {
    let [, d, m, y] = dateBr;
    if (y.length === 2) y = parseInt(y, 10) > 50 ? `19${y}` : `20${y}`;
    return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // ISO datetime
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(trimmed)) {
    return trimmed;
  }

  // Default: cleaned string
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. RECORD NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza um registro completo aplicando todas as transformações.
 * Retorna { normalized, issues[], raw_hash }
 */
export function normalizeRecord(rawRecord, options = {}) {
  const issues = [];
  const normalized = {};

  // Hash do raw para auditoria
  const raw_hash = crypto.createHash('sha256')
    .update(JSON.stringify(rawRecord))
    .digest('hex')
    .slice(0, 16); // 16 chars suficiente

  // Normaliza cada campo
  for (const [rawKey, rawValue] of Object.entries(rawRecord)) {
    const normalizedKey = normalizeFieldName(rawKey);
    if (!normalizedKey) {
      issues.push({ type: 'invalid_field_name', original: rawKey });
      continue;
    }

    const hint = options.schema?.[normalizedKey]?.type || null;
    let coerced;
    try {
      coerced = coerceValue(rawValue, hint);
    } catch (err) {
      issues.push({ type: 'coerce_error', field: normalizedKey, error: err.message });
      coerced = rawValue; // fallback raw
    }

    // Validação contra schema (se fornecida)
    if (options.schema?.[normalizedKey]?.required && (coerced === null || coerced === undefined)) {
      issues.push({ type: 'missing_required', field: normalizedKey });
    }

    normalized[normalizedKey] = coerced;
  }

  return {
    normalized,
    issues,
    raw_hash,
    normalizer_version: NORMALIZER_VERSION,
  };
}

/**
 * Normaliza um lote de registros, separando válidos de quarantined.
 */
export function normalizeBatch(records, options = {}) {
  const valid = [];
  const quarantine = [];
  let totalIssues = 0;

  for (const record of records) {
    const result = normalizeRecord(record, options);
    if (result.issues.length === 0) {
      valid.push({ ...result.normalized, _meta: { raw_hash: result.raw_hash } });
    } else {
      const isFatal = result.issues.some(i => i.type === 'missing_required');
      if (isFatal) {
        quarantine.push({
          original: record,
          normalized: result.normalized,
          issues: result.issues,
          raw_hash: result.raw_hash,
        });
      } else {
        // Issues não-fatais: vai pro clean com warning
        valid.push({
          ...result.normalized,
          _meta: { raw_hash: result.raw_hash, warnings: result.issues },
        });
      }
      totalIssues += result.issues.length;
    }
  }

  logger.info('normalize_batch_done', {
    total: records.length,
    valid: valid.length,
    quarantined: quarantine.length,
    total_issues: totalIssues,
  });

  return { valid, quarantine, stats: { total: records.length, valid: valid.length, quarantined: quarantine.length, totalIssues } };
}
