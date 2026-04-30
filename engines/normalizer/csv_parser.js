// engines/normalizer/csv_parser.js
// Parser CSV robusto para arquivos governamentais brasileiros.
// Lida com:
//   - Aspas escapadas ("foo ""bar""")
//   - Delimitador interno em campos com aspas
//   - Linhas vazias
//   - BOM (Byte Order Mark) UTF-8
//   - Quebras de linha mistas (\r\n, \n, \r)
//   - Detecção automática de delimitador (;, ,, \t, |)

import { logger } from '../utils/logger.js';

/**
 * Detecta o delimitador mais provável analisando primeiras N linhas.
 */
export function detectDelimiter(text, sampleLines = 5) {
  const candidates = [';', ',', '\t', '|'];
  const lines = text.split(/\r?\n/).slice(0, sampleLines);
  let bestDelim = ';';
  let bestScore = 0;

  for (const delim of candidates) {
    const counts = lines.map(l => (l.match(new RegExp(`\\${delim}`, 'g')) || []).length);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((a, b) => a + (b - avg) ** 2, 0) / counts.length;
    // Score: muitas ocorrências consistentes = bom delimitador
    const score = avg > 0 && variance < 1 ? avg * 10 - variance : 0;
    if (score > bestScore) {
      bestScore = score;
      bestDelim = delim;
    }
  }

  logger.debug('delimiter_detected', { delimiter: bestDelim, score: bestScore });
  return bestDelim;
}

/**
 * Parse robusto de uma linha CSV respeitando aspas.
 */
export function parseLine(line, delimiter = ';') {
  const result = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
      i++;
      continue;
    }

    current += char;
    i++;
  }

  result.push(current);
  return result;
}

/**
 * Parse completo de um CSV em memória → array de objetos.
 * Para arquivos grandes (>500MB), use parseStream() ao invés.
 */
export function parseCSV(text, options = {}) {
  // Remove BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const delimiter = options.delimiter || detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter(l => l.trim());

  if (lines.length === 0) return { headers: [], records: [] };

  const headers = parseLine(lines[0], delimiter);
  const records = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseLine(lines[i], delimiter);
      // Tolerância: se número de campos não bate, pad ou trunca
      const record = {};
      for (let j = 0; j < headers.length; j++) {
        record[headers[j]] = values[j] !== undefined ? values[j] : null;
      }
      records.push(record);
    } catch (err) {
      errors.push({ line: i + 1, error: err.message, content: lines[i].slice(0, 200) });
    }
  }

  if (errors.length > 0) {
    logger.warn('csv_parse_errors', { total_errors: errors.length, sample: errors.slice(0, 3) });
  }

  logger.info('csv_parsed', {
    headers: headers.length,
    records: records.length,
    errors: errors.length,
    delimiter,
  });

  return { headers, records, errors };
}
