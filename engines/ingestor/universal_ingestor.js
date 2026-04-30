// engines/ingestor/universal_ingestor.js
// Núcleo do ingestor universal — lê config YAML, faz fetch paginado/streaming,
// NORMALIZA (encoding, decimal BR, datas BR, headers), anonimiza, e salva no GCS.
//
// 3 layers:
//   - raw         (imutável, sem normalização, sem anonimização — auditoria)
//   - clean       (normalizado + anonimizado, NDJSON)
//   - quarantine  (registros corrompidos com metadados de erro)
//
// Uso:
//   node universal_ingestor.js --source ceap_camara --year 2024
//   node universal_ingestor.js --source emendas_pix --year 2024
//   node universal_ingestor.js --source emendas_parlamentares --year 2024

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import pLimit from 'p-limit';
import { Storage } from '@google-cloud/storage';
import unzipper from 'unzipper';
import { logger } from '../utils/logger.js';
import { anonymizeObject } from '../lgpd/anonymizer_light.js';
import { ensureUtf8, normalizeBatch } from '../normalizer/normalizer.js';
import { parseCSV } from '../normalizer/csv_parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = new Storage();
const RAW_BUCKET = process.env.GCS_RAW_BUCKET || 'datalake-tbr-raw';
const CLEAN_BUCKET = process.env.GCS_CLEAN_BUCKET || 'datalake-tbr-clean';
const QUARANTINE_BUCKET = process.env.GCS_QUARANTINE_BUCKET || 'datalake-tbr-quarantine';

// ─────────────────────────────────────────────────────────────────────────────
// FETCH HELPERS — com retry exponencial e respeito a rate limit
// ─────────────────────────────────────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, opts = {}, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...opts,
        signal: AbortSignal.timeout(opts.timeout || 120_000),
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
        logger.warn('rate_limit_hit', { url, retry_after: retryAfter, attempt });
        await sleep(retryAfter * 1000);
        continue;
      }

      if (response.status >= 500 && response.status < 600) {
        const backoff = Math.min(60_000, 2 ** attempt * 1000);
        logger.warn('server_error_retry', { url, status: response.status, backoff, attempt });
        await sleep(backoff);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }

      return response;
    } catch (err) {
      if (attempt === maxAttempts) {
        logger.error('fetch_failed_final', { url, error: err.message, attempts: attempt });
        throw err;
      }
      const backoff = Math.min(60_000, 2 ** attempt * 1000);
      logger.warn('fetch_retry', { url, error: err.message, attempt, backoff });
      await sleep(backoff);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE — uploads para GCS com gzip transparente
// ─────────────────────────────────────────────────────────────────────────────

async function uploadToGCS(bucketName, gcsPath, content, contentType = 'application/json', meta = {}) {
  const bucket = STORAGE.bucket(bucketName);
  const file = bucket.file(gcsPath);
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(typeof content === 'string' ? content : JSON.stringify(content));
  const gzipped = zlib.gzipSync(buffer);
  await file.save(gzipped, {
    metadata: {
      contentType,
      contentEncoding: 'gzip',
      metadata: {
        ingestor_version: '1.1.0',
        ingested_at: new Date().toISOString(),
        ...meta,
      },
    },
    resumable: false,
  });
  return `gs://${bucketName}/${gcsPath}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZE + ANONYMIZE PIPELINE
// Dado um array de registros brutos:
//   1) normalizeBatch (encoding já tratado upstream para CSV; aqui vai header + tipo + null)
//   2) anonymizeObject em cada normalized record
//   3) separa válidos vs quarantine
// ─────────────────────────────────────────────────────────────────────────────

function processBatch(rawRecords, options = {}) {
  // 1. Normalize
  const { valid: normalizedValid, quarantine, stats } = normalizeBatch(rawRecords, options);

  // 2. Anonymize cada normalized record
  const cleanRecords = [];
  const totalRedactions = {};

  for (const rec of normalizedValid) {
    const { _meta, ...payload } = rec;
    const { anonymized, redactions } = anonymizeObject(payload);
    cleanRecords.push({ ...anonymized, _meta });
    for (const [type, count] of Object.entries(redactions)) {
      totalRedactions[type] = (totalRedactions[type] || 0) + count;
    }
  }

  return { cleanRecords, quarantine, stats, redactions: totalRedactions };
}

// ─────────────────────────────────────────────────────────────────────────────
// FONTE: csv_yearly_file (CEAP Câmara, TSE, etc.)
// ─────────────────────────────────────────────────────────────────────────────

async function ingestCsvYearlyFile(source, args) {
  const { name, fetch_config } = source;
  const year = args.year || new Date().getFullYear();
  const url = fetch_config.url_template.replace('{year}', year);

  logger.info('csv_yearly_start', { source: name, year, url });

  const response = await fetchWithRetry(url, { headers: fetch_config.headers || {} }, 3);
  const buffer = Buffer.from(await response.arrayBuffer());

  // Salva raw imutável (sem normalizar, sem anonimizar)
  const rawExt = fetch_config.file_extension || 'csv';
  const rawPath = `${name}/year=${year}/raw.${rawExt}`;
  const rawUrl = await uploadToGCS(RAW_BUCKET, rawPath, buffer,
    response.headers.get('content-type') || 'application/octet-stream',
    { source_url: url, year: String(year) });

  logger.info('csv_yearly_raw_saved', { source: name, year, url: rawUrl, size_bytes: buffer.length });

  // Se for ZIP, extrai o CSV interno
  let csvBuffer = buffer;
  if (rawExt.includes('zip') || url.toLowerCase().endsWith('.zip')) {
    const directory = await unzipper.Open.buffer(buffer);
    const csvEntry = directory.files.find(f => f.path.toLowerCase().endsWith('.csv'));
    if (!csvEntry) {
      throw new Error('ZIP não contém CSV');
    }
    csvBuffer = await csvEntry.buffer();
    logger.info('csv_yearly_unzipped', { source: name, year, csv_name: csvEntry.path, size: csvBuffer.length });
  }

  // 1. Encoding fix (ISO-8859-1 → UTF-8 quando necessário)
  const { text, encoding_detected, confidence, note } = ensureUtf8(csvBuffer);
  logger.info('csv_yearly_encoding', { source: name, year, encoding_detected, confidence, note });

  // 2. Parse CSV robusto (detecta delimiter, lida com aspas)
  const { headers, records: rawRecords, errors: parseErrors } = parseCSV(text, {
    delimiter: fetch_config.delimiter || undefined, // undefined = auto-detect
  });

  // 3. Normalize + anonymize
  const { cleanRecords, quarantine, stats, redactions } = processBatch(rawRecords, {
    schema: source.schema_strict || null,
  });

  // 4. Upload clean
  const cleanPath = `${name}/year=${year}/clean.ndjson`;
  const cleanUrl = await uploadToGCS(CLEAN_BUCKET, cleanPath,
    cleanRecords.map(r => JSON.stringify(r)).join('\n'),
    'application/x-ndjson',
    { records: String(cleanRecords.length), year: String(year) });

  // 5. Upload quarantine (se houver)
  let quarantineUrl = null;
  if (quarantine.length > 0) {
    const quarantinePath = `${name}/year=${year}/quarantine.ndjson`;
    quarantineUrl = await uploadToGCS(QUARANTINE_BUCKET, quarantinePath,
      quarantine.map(r => JSON.stringify(r)).join('\n'),
      'application/x-ndjson',
      { records: String(quarantine.length), year: String(year) });
  }

  logger.info('csv_yearly_done', {
    source: name,
    year,
    raw_records: rawRecords.length,
    clean_records: cleanRecords.length,
    quarantined: quarantine.length,
    parse_errors: parseErrors?.length || 0,
    redactions,
    raw_url: rawUrl,
    clean_url: cleanUrl,
    quarantine_url: quarantineUrl,
    encoding: encoding_detected,
  });

  return { records: cleanRecords.length, quarantined: quarantine.length, redactions };
}

// ─────────────────────────────────────────────────────────────────────────────
// FONTE: csv_static_file (snapshot único, sem partição por ano)
// Usado para: funcionarios_camara, servidores_senado (folhas de pessoal).
// Path GCS particionado por data de coleta (snapshot=YYYY-MM-DD).
// ─────────────────────────────────────────────────────────────────────────────

async function ingestCsvStaticFile(source, args) {
  const { name, fetch_config } = source;
  const url = fetch_config.url;
  const snapshotDate = (args.snapshot || new Date().toISOString().slice(0, 10));

  logger.info('csv_static_start', { source: name, snapshot: snapshotDate, url });

  const response = await fetchWithRetry(url, { headers: fetch_config.headers || {} }, 3);
  const buffer = Buffer.from(await response.arrayBuffer());

  // Salva raw imutável (sem normalizar, sem anonimizar)
  const rawExt = fetch_config.file_extension || 'csv';
  const rawPath = `${name}/snapshot=${snapshotDate}/raw.${rawExt}`;
  const rawUrl = await uploadToGCS(RAW_BUCKET, rawPath, buffer,
    response.headers.get('content-type') || 'application/octet-stream',
    { source_url: url, snapshot: snapshotDate });

  logger.info('csv_static_raw_saved', { source: name, snapshot: snapshotDate, url: rawUrl, size_bytes: buffer.length });

  // Encoding fix
  const { text, encoding_detected, confidence, note } = ensureUtf8(buffer);
  logger.info('csv_static_encoding', { source: name, snapshot: snapshotDate, encoding_detected, confidence, note });

  // Parse CSV
  const { headers, records: rawRecords, errors: parseErrors } = parseCSV(text, {
    delimiter: fetch_config.delimiter || undefined,
  });

  // Normalize + anonymize
  const { cleanRecords, quarantine, redactions } = processBatch(rawRecords, {
    schema: source.schema_strict || null,
  });

  // Upload clean
  const cleanPath = `${name}/snapshot=${snapshotDate}/clean.ndjson`;
  const cleanUrl = await uploadToGCS(CLEAN_BUCKET, cleanPath,
    cleanRecords.map(r => JSON.stringify(r)).join('\n'),
    'application/x-ndjson',
    { records: String(cleanRecords.length), snapshot: snapshotDate });

  // Upload quarantine
  let quarantineUrl = null;
  if (quarantine.length > 0) {
    const quarantinePath = `${name}/snapshot=${snapshotDate}/quarantine.ndjson`;
    quarantineUrl = await uploadToGCS(QUARANTINE_BUCKET, quarantinePath,
      quarantine.map(r => JSON.stringify(r)).join('\n'),
      'application/x-ndjson',
      { records: String(quarantine.length), snapshot: snapshotDate });
  }

  logger.info('csv_static_done', {
    source: name, snapshot: snapshotDate,
    raw_records: rawRecords.length,
    clean_records: cleanRecords.length,
    quarantined: quarantine.length,
    parse_errors: parseErrors?.length || 0,
    redactions,
    raw_url: rawUrl,
    clean_url: cleanUrl,
    quarantine_url: quarantineUrl,
    encoding: encoding_detected,
  });

  return { records: cleanRecords.length, quarantined: quarantine.length, redactions };
}

// ─────────────────────────────────────────────────────────────────────────────
// FONTE: rest_paginated (Portal Transparência, Senado, etc.)
// ─────────────────────────────────────────────────────────────────────────────

async function ingestRestPaginated(source, args) {
  const { name, fetch_config } = source;
  const year = args.year || new Date().getFullYear();
  const allRawItems = [];
  const baseUrl = fetch_config.url_template.replace('{year}', year);

  let page = fetch_config.page_start || 1;
  let pagesFetched = 0;

  while (true) {
    const pageParam = fetch_config.page_param || 'pagina';
    const sep = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${sep}${pageParam}=${page}`;

    const headers = { ...(fetch_config.headers || {}) };
    if (fetch_config.api_key_env && process.env[fetch_config.api_key_env]) {
      const headerName = fetch_config.api_key_header || 'chave-api-dados';
      headers[headerName] = process.env[fetch_config.api_key_env];
    }

    let response;
    try {
      response = await fetchWithRetry(url, { headers });
    } catch (err) {
      logger.error('rest_paginated_fetch_failed', { source: name, year, page, error: err.message });
      break;
    }

    const data = await response.json();
    const items = Array.isArray(data) ? data : (data.itens || data.items || data.data || []);

    if (!items || items.length === 0) {
      logger.info('rest_paginated_end', { source: name, year, total_pages: pagesFetched });
      break;
    }

    pagesFetched++;
    allRawItems.push(...items);
    logger.debug('rest_paginated_page', { source: name, year, page, items: items.length, accumulated: allRawItems.length });

    if (fetch_config.max_pages && pagesFetched >= fetch_config.max_pages) {
      logger.warn('rest_paginated_max_pages_hit', { source: name, max: fetch_config.max_pages });
      break;
    }
    if (fetch_config.delay_ms) await sleep(fetch_config.delay_ms);
    page++;
  }

  // Salva raw IMUTÁVEL (sem normalizar)
  const rawPath = `${name}/year=${year}/raw.json`;
  const rawUrl = await uploadToGCS(RAW_BUCKET, rawPath, JSON.stringify(allRawItems),
    'application/json', { records: String(allRawItems.length), year: String(year) });

  // Normalize + anonymize
  const { cleanRecords, quarantine, redactions } = processBatch(allRawItems, {
    schema: source.schema_strict || null,
  });

  const cleanPath = `${name}/year=${year}/clean.ndjson`;
  const cleanUrl = await uploadToGCS(CLEAN_BUCKET, cleanPath,
    cleanRecords.map(r => JSON.stringify(r)).join('\n'),
    'application/x-ndjson',
    { records: String(cleanRecords.length), year: String(year) });

  let quarantineUrl = null;
  if (quarantine.length > 0) {
    const quarantinePath = `${name}/year=${year}/quarantine.ndjson`;
    quarantineUrl = await uploadToGCS(QUARANTINE_BUCKET, quarantinePath,
      quarantine.map(r => JSON.stringify(r)).join('\n'),
      'application/x-ndjson',
      { records: String(quarantine.length), year: String(year) });
  }

  logger.info('rest_paginated_done', {
    source: name, year,
    raw_records: allRawItems.length,
    clean_records: cleanRecords.length,
    quarantined: quarantine.length,
    pages: pagesFetched,
    redactions,
    raw_url: rawUrl,
    clean_url: cleanUrl,
    quarantine_url: quarantineUrl,
  });

  return { records: cleanRecords.length, quarantined: quarantine.length, redactions };
}

// ─────────────────────────────────────────────────────────────────────────────
// FONTE: postgrest (Transferegov)
// ─────────────────────────────────────────────────────────────────────────────

async function ingestPostgrest(source, args) {
  const { name, fetch_config } = source;
  const year = args.year || new Date().getFullYear();
  const url = `${fetch_config.url_template}?${fetch_config.year_param || 'ano_emenda'}=eq.${year}`;

  logger.info('postgrest_start', { source: name, year, url });

  const headers = {
    'Range-Unit': 'items',
    'Prefer': 'count=exact',
    ...(fetch_config.headers || {}),
  };

  const pageSize = fetch_config.page_size || 5000;
  let offset = 0;
  const allRawItems = [];

  while (true) {
    const rangeHeaders = {
      ...headers,
      'Range': `${offset}-${offset + pageSize - 1}`,
    };

    let response;
    try {
      response = await fetchWithRetry(url, { headers: rangeHeaders });
    } catch (err) {
      logger.error('postgrest_fetch_failed', { source: name, year, offset, error: err.message });
      break;
    }

    const items = await response.json();
    if (!items || items.length === 0) break;

    allRawItems.push(...items);
    logger.debug('postgrest_page', { source: name, year, offset, items: items.length, accumulated: allRawItems.length });

    if (items.length < pageSize) break;
    offset += pageSize;
    if (fetch_config.delay_ms) await sleep(fetch_config.delay_ms);
  }

  const rawPath = `${name}/year=${year}/raw.json`;
  const rawUrl = await uploadToGCS(RAW_BUCKET, rawPath, JSON.stringify(allRawItems),
    'application/json', { records: String(allRawItems.length), year: String(year) });

  const { cleanRecords, quarantine, redactions } = processBatch(allRawItems, {
    schema: source.schema_strict || null,
  });

  const cleanPath = `${name}/year=${year}/clean.ndjson`;
  const cleanUrl = await uploadToGCS(CLEAN_BUCKET, cleanPath,
    cleanRecords.map(r => JSON.stringify(r)).join('\n'),
    'application/x-ndjson',
    { records: String(cleanRecords.length), year: String(year) });

  let quarantineUrl = null;
  if (quarantine.length > 0) {
    const quarantinePath = `${name}/year=${year}/quarantine.ndjson`;
    quarantineUrl = await uploadToGCS(QUARANTINE_BUCKET, quarantinePath,
      quarantine.map(r => JSON.stringify(r)).join('\n'),
      'application/x-ndjson',
      { records: String(quarantine.length), year: String(year) });
  }

  logger.info('postgrest_done', {
    source: name, year,
    raw_records: allRawItems.length,
    clean_records: cleanRecords.length,
    quarantined: quarantine.length,
    redactions,
    raw_url: rawUrl,
    clean_url: cleanUrl,
    quarantine_url: quarantineUrl,
  });

  return { records: cleanRecords.length, quarantined: quarantine.length, redactions };
}

// ─────────────────────────────────────────────────────────────────────────────
// FONTE: postgrest_no_year (Transferegov endpoints sem ano_emenda — paga tudo de uma vez)
//   Usado por: executor_especial, relatorio_gestao_especial.
//   Salva em snapshot=YYYY-MM-DD ao invés de year= (porque é o universo completo).
// ─────────────────────────────────────────────────────────────────────────────

async function ingestPostgrestNoYear(source, args) {
  const { name, fetch_config } = source;
  const url = fetch_config.url_template;
  const snapshotDate = (args.snapshot || new Date().toISOString().slice(0, 10));

  logger.info('postgrest_no_year_start', { source: name, snapshot: snapshotDate, url });

  const baseHeaders = {
    'Range-Unit': 'items',
    ...(fetch_config.headers || {}),
  };
  const pageSize = fetch_config.page_size || 5000;
  let offset = 0;
  const allRawItems = [];

  while (true) {
    const rangeHeaders = { ...baseHeaders, 'Range': `${offset}-${offset + pageSize - 1}` };
    let response;
    try {
      response = await fetchWithRetry(url, { headers: rangeHeaders });
    } catch (err) {
      logger.error('postgrest_no_year_fetch_failed', { source: name, offset, error: err.message });
      break;
    }
    const items = await response.json();
    if (!items || items.length === 0) break;
    allRawItems.push(...items);
    logger.debug('postgrest_no_year_page', { source: name, offset, items: items.length, accumulated: allRawItems.length });
    if (items.length < pageSize) break;
    offset += pageSize;
    if (fetch_config.delay_ms) await sleep(fetch_config.delay_ms);
  }

  const rawPath = `${name}/snapshot=${snapshotDate}/raw.json`;
  const rawUrl = await uploadToGCS(RAW_BUCKET, rawPath, JSON.stringify(allRawItems),
    'application/json', { records: String(allRawItems.length), snapshot: snapshotDate });

  const { cleanRecords, quarantine, redactions } = processBatch(allRawItems, {
    schema: source.schema_strict || null,
  });

  const cleanPath = `${name}/snapshot=${snapshotDate}/clean.ndjson`;
  const cleanUrl = await uploadToGCS(CLEAN_BUCKET, cleanPath,
    cleanRecords.map(r => JSON.stringify(r)).join('\n'),
    'application/x-ndjson',
    { records: String(cleanRecords.length), snapshot: snapshotDate });

  let quarantineUrl = null;
  if (quarantine.length > 0) {
    const quarantinePath = `${name}/snapshot=${snapshotDate}/quarantine.ndjson`;
    quarantineUrl = await uploadToGCS(QUARANTINE_BUCKET, quarantinePath,
      quarantine.map(r => JSON.stringify(r)).join('\n'),
      'application/x-ndjson',
      { records: String(quarantine.length), snapshot: snapshotDate });
  }

  logger.info('postgrest_no_year_done', {
    source: name, snapshot: snapshotDate,
    raw_records: allRawItems.length,
    clean_records: cleanRecords.length,
    quarantined: quarantine.length,
    redactions, raw_url: rawUrl, clean_url: cleanUrl, quarantine_url: quarantineUrl,
  });
  return { records: cleanRecords.length, quarantined: quarantine.length, redactions };
}

// ─────────────────────────────────────────────────────────────────────────────
// FONTE: rest_paginated_monthly (PNCP — varre mês a mês de um ano)
// Particiona por year=, agrega contratos de janeiro a dezembro.
// ─────────────────────────────────────────────────────────────────────────────

function monthBounds(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end) };
}

async function ingestRestPaginatedMonthly(source, args) {
  const { name, fetch_config } = source;
  const year = args.year || new Date().getFullYear();
  const monthsArg = args.months || (year === new Date().getFullYear() ? null : '1-12');
  // default = todos os meses até o atual quando ano = corrente
  const today = new Date();
  const lastMonth = (year === today.getFullYear()) ? today.getMonth() + 1 : 12;

  let monthList;
  if (monthsArg && monthsArg.includes('-')) {
    const [a, b] = monthsArg.split('-').map(n => parseInt(n, 10));
    monthList = [];
    for (let m = a; m <= b; m++) monthList.push(m);
  } else if (monthsArg) {
    monthList = monthsArg.split(',').map(n => parseInt(n, 10));
  } else {
    monthList = [];
    for (let m = 1; m <= lastMonth; m++) monthList.push(m);
  }

  const allRawItems = [];
  const dataField = fetch_config.data_field || 'data';
  const pageSize = fetch_config.page_size || 50;
  const maxPagesPerMonth = fetch_config.max_pages_per_month || 200;

  for (const month of monthList) {
    const { start, end } = monthBounds(year, month);
    let page = 1;
    let pagesThisMonth = 0;
    while (true) {
      const sep = fetch_config.url_template.includes('?') ? '&' : '?';
      const url = `${fetch_config.url_template}${sep}` +
        `${fetch_config.date_initial_param || 'dataInicial'}=${start}&` +
        `${fetch_config.date_final_param || 'dataFinal'}=${end}&` +
        `${fetch_config.page_param || 'pagina'}=${page}&` +
        `${fetch_config.page_size_param || 'tamanhoPagina'}=${pageSize}`;
      let response;
      try {
        response = await fetchWithRetry(url, { headers: fetch_config.headers || {} });
      } catch (err) {
        logger.error('rest_monthly_fetch_failed', { source: name, year, month, page, error: err.message });
        break;
      }
      const body = await response.json();
      const items = body?.[dataField] || [];
      if (!items || items.length === 0) break;
      allRawItems.push(...items);
      pagesThisMonth++;
      logger.debug('rest_monthly_page', { source: name, year, month, page, items: items.length, accumulated: allRawItems.length });
      if (items.length < pageSize) break;
      if (pagesThisMonth >= maxPagesPerMonth) {
        logger.warn('rest_monthly_max_pages_hit', { source: name, year, month, max: maxPagesPerMonth });
        break;
      }
      page++;
      if (fetch_config.delay_ms) await sleep(fetch_config.delay_ms);
    }
    logger.info('rest_monthly_month_done', { source: name, year, month, pagesThisMonth, accumulated: allRawItems.length });
  }

  const rawPath = `${name}/year=${year}/raw.json`;
  const rawUrl = await uploadToGCS(RAW_BUCKET, rawPath, JSON.stringify(allRawItems),
    'application/json', { records: String(allRawItems.length), year: String(year) });

  const { cleanRecords, quarantine, redactions } = processBatch(allRawItems, {
    schema: source.schema_strict || null,
  });
  const cleanPath = `${name}/year=${year}/clean.ndjson`;
  const cleanUrl = await uploadToGCS(CLEAN_BUCKET, cleanPath,
    cleanRecords.map(r => JSON.stringify(r)).join('\n'),
    'application/x-ndjson',
    { records: String(cleanRecords.length), year: String(year) });

  let quarantineUrl = null;
  if (quarantine.length > 0) {
    const quarantinePath = `${name}/year=${year}/quarantine.ndjson`;
    quarantineUrl = await uploadToGCS(QUARANTINE_BUCKET, quarantinePath,
      quarantine.map(r => JSON.stringify(r)).join('\n'),
      'application/x-ndjson',
      { records: String(quarantine.length), year: String(year) });
  }

  logger.info('rest_monthly_done', {
    source: name, year,
    raw_records: allRawItems.length,
    clean_records: cleanRecords.length,
    quarantined: quarantine.length,
    redactions, raw_url: rawUrl, clean_url: cleanUrl, quarantine_url: quarantineUrl,
  });
  return { records: cleanRecords.length, quarantined: quarantine.length, redactions };
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

const STRATEGIES = {
  csv_yearly_file: ingestCsvYearlyFile,
  csv_static_file: ingestCsvStaticFile,
  rest_paginated: ingestRestPaginated,
  rest_paginated_monthly: ingestRestPaginatedMonthly,
  postgrest: ingestPostgrest,
  postgrest_no_year: ingestPostgrestNoYear,
};

export async function ingestSource(sourceName, args = {}) {
  const sourcePath = path.join(__dirname, 'sources', `${sourceName}.yaml`);
  const yamlContent = await fsp.readFile(sourcePath, 'utf-8');
  const source = yaml.load(yamlContent);

  const strategy = STRATEGIES[source.type];
  if (!strategy) {
    throw new Error(`Estratégia desconhecida: ${source.type}`);
  }

  logger.info('ingest_start', { source: source.name, type: source.type, args });
  const start = Date.now();
  try {
    const result = await strategy(source, args);
    const duration_s = ((Date.now() - start) / 1000).toFixed(1);
    logger.info('ingest_complete', { source: source.name, ...result, duration_s });
    return result;
  } catch (err) {
    logger.error('ingest_failed', { source: source.name, error: err.message, stack: err.stack });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, '');
    args[key] = process.argv[i + 1];
  }

  if (!args.source) {
    console.error('Uso: node universal_ingestor.js --source <name> [--year <year>]');
    process.exit(1);
  }

  ingestSource(args.source, {
    year: args.year ? parseInt(args.year, 10) : undefined,
    snapshot: args.snapshot || undefined,
    months: args.months || undefined,
  })
    .then(result => {
      console.error(`✅ ${args.source} done: ${result.records} records, quarantined: ${result.quarantined}, redactions: ${JSON.stringify(result.redactions)}`);
      process.exit(0);
    })
    .catch(err => {
      console.error(`❌ ${args.source} failed: ${err.message}`);
      process.exit(1);
    });
}
