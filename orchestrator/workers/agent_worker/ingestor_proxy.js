/**
 * @fileoverview Ingestor Proxy — bridges Vertex agent tool-calls to actual ingestion.
 *
 * The Vertex Reasoning Engine requests ingestion via a tool-call.  This module
 * handles that call by:
 *   1. Loading the API catalog entry from GCS
 *   2. Building the GCS prefix (Hive-partitioned)
 *   3. Dispatching to a specialized runner OR the universal ingestor
 *   4. Returning a structured result summary
 *
 * Relative import path note:
 *   engines/ingestors/runners/index.js  is resolved from the project root.
 *   When running in Cloud Run, /app/engines/... must be copied in at Docker build.
 *   At development time, ENGINES_ROOT env var can override the engines/ directory.
 *
 * Environment variables:
 *   ARSENAL_BUCKET      – GCS bucket for catalog and contracts
 *   DATALAKE_BUCKET_RAW – GCS bucket for raw data output
 *   GCP_PROJECT_ID      – Google Cloud project (used by Storage client)
 *   ENGINES_ROOT        – override path for engines directory (default: ../../../engines)
 *   LGPD_SALT_SECRET_NAME / LGPD_SALT – passed through to lgpd_shield
 */

import { Storage } from '@google-cloud/storage';
import { monotonicFactory } from 'ulid';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { format } from 'util';

// ─── Path resolution ──────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINES_ROOT =
  process.env.ENGINES_ROOT ??
  path.resolve(__dirname, '../../../engines');

// ─── Clients ──────────────────────────────────────────────────────────────────

const storage = new Storage();
const ulid = monotonicFactory();

// ─── Cache ────────────────────────────────────────────────────────────────────

/** @type {Map<string, Record<string,unknown>>} */
const catalogCache = new Map();
const CATALOG_TTL_MS = 5 * 60 * 1_000; // 5 minutes
let catalogLoadedAt = 0;
/** @type {Array<Record<string,unknown>>|null} */
let catalogData = null;

// ─── Logging ──────────────────────────────────────────────────────────────────

/**
 * @param {'DEBUG'|'INFO'|'WARNING'|'ERROR'} severity
 * @param {string} message
 * @param {Record<string,unknown>} [payload]
 */
function log(severity, message, payload = {}) {
  console.log(
    JSON.stringify({ severity, message, timestamp: new Date().toISOString(), ...payload }),
  );
}

// ─── Catalog helpers ─────────────────────────────────────────────────────────

/**
 * Load the API catalog from GCS with in-memory TTL caching.
 * @returns {Promise<Array<Record<string,unknown>>>}
 */
async function getCatalog() {
  const now = Date.now();
  if (catalogData && now - catalogLoadedAt < CATALOG_TTL_MS) {
    return catalogData;
  }

  const bucket = process.env.ARSENAL_BUCKET;
  if (!bucket) throw new Error('ARSENAL_BUCKET not set');

  const [contents] = await storage
    .bucket(bucket)
    .file('config/arsenal_apis.json')
    .download();

  catalogData = JSON.parse(contents.toString('utf8'));
  catalogLoadedAt = now;
  return catalogData;
}

/**
 * Find a single API catalog entry by id.
 * @param {string} apiId
 * @returns {Promise<Record<string,unknown>>}
 */
async function findCatalogEntry(apiId) {
  const catalog = await getCatalog();
  const entry = catalog.find((e) => e.id === apiId);
  if (!entry) throw new Error(`Catalog entry not found for api_id: ${apiId}`);
  return entry;
}

// ─── GCS prefix builder ───────────────────────────────────────────────────────

/**
 * Build the Hive-partitioned GCS prefix for a run.
 *
 * Pattern: raw/source={fonte}/dataset={api_id}/ingestion_date=YYYY-MM-DD/run_id={ULID}/
 *
 * @param {string} fonte        – source/provider name from catalog
 * @param {string} apiId        – api_id
 * @param {string} runId        – ULID run identifier
 * @param {string} [dateStr]    – ISO date override (YYYY-MM-DD), defaults to today UTC
 * @returns {string}
 */
export function buildRawLakePrefix(fonte, apiId, runId, dateStr) {
  const date = dateStr ?? new Date().toISOString().slice(0, 10);
  return `raw/source=${encodeURIComponent(fonte)}/dataset=${encodeURIComponent(apiId)}/ingestion_date=${date}/run_id=${runId}/`;
}

// ─── Dispatch strategy ────────────────────────────────────────────────────────

/**
 * Whether the API requires a specialized pagination runner rather than the
 * generic HTTP fetcher in universal_ingestor.
 *
 * @param {string|undefined} paginationType
 * @returns {boolean}
 */
export function isSpecializedStrategy(paginationType) {
  const SPECIALIZED = new Set(['cursor', 'graphql', 'soap', 'sftp', 'jdbc']);
  return SPECIALIZED.has(paginationType);
}

// ─── Lazy engine imports ──────────────────────────────────────────────────────

/** @type {Promise<{dispatchSpecializedRunner:Function}>|null} */
let runnersModuleP = null;

/** @type {Promise<{processSingleApi:Function}>|null} */
let universalModuleP = null;

function getRunnersModule() {
  if (!runnersModuleP) {
    const target = path.join(ENGINES_ROOT, 'ingestors/runners/index.js');
    // eslint-disable-next-line no-unsanitized/method -- controlled path
    runnersModuleP = import(target).catch((err) => {
      log('WARNING', 'engines/ingestors/runners/index.js not available — specialized runners disabled', {
        error: err.message,
        engines_root: ENGINES_ROOT,
      });
      return { dispatchSpecializedRunner: null };
    });
  }
  return runnersModuleP;
}

function getUniversalModule() {
  if (!universalModuleP) {
    const target = path.join(ENGINES_ROOT, 'ingestors/universal_ingestor.js');
    // eslint-disable-next-line no-unsanitized/method -- controlled path
    universalModuleP = import(target).catch((err) => {
      log('WARNING', 'engines/ingestors/universal_ingestor.js not available', {
        error: err.message,
        engines_root: ENGINES_ROOT,
      });
      return { processSingleApi: null };
    });
  }
  return universalModuleP;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Result returned after a successful (or partial) ingestion run.
 * @typedef {Object} IngestionResult
 * @property {boolean} ok
 * @property {number} rows_written
 * @property {number} parts
 * @property {string} manifest_uri
 * @property {string} [error]
 */

/**
 * Run ingestion for a single API ID.  Called by the Vertex agent tool dispatch.
 *
 * @param {string} apiId       – identifier from the catalog
 * @param {{ run_id?:string, ingestion_date?:string, dryRun?:boolean }} [ctxOverrides]
 * @returns {Promise<IngestionResult>}
 */
export async function runIngestion(apiId, ctxOverrides = {}) {
  const rawBucket = process.env.DATALAKE_BUCKET_RAW;
  if (!rawBucket) throw new Error('DATALAKE_BUCKET_RAW not set');

  // 1. Load catalog entry
  const api = await findCatalogEntry(apiId);
  const fonte = api.fonte ?? api.source ?? 'unknown';
  const runId = ctxOverrides.run_id ?? ulid();
  const ingestionDate =
    ctxOverrides.ingestion_date ?? new Date().toISOString().slice(0, 10);

  // 2. Build GCS prefix
  const gcsPrefix = buildRawLakePrefix(fonte, apiId, runId, ingestionDate);

  const ctx = {
    bucket: rawBucket,
    gcsPrefix,
    runId,
    ingestionDate,
    dryRun: ctxOverrides.dryRun ?? false,
    apiId,
    fonte,
  };

  log('INFO', 'runIngestion started', {
    api_id: apiId,
    run_id: runId,
    gcs_prefix: gcsPrefix,
    dry_run: ctx.dryRun,
  });

  try {
    let result;
    const paginationType = api.pagination?.type;

    if (isSpecializedStrategy(paginationType)) {
      // ── Specialized runner path ──────────────────────────────────────────
      const { dispatchSpecializedRunner } = await getRunnersModule();

      if (typeof dispatchSpecializedRunner !== 'function') {
        throw new Error(
          `Specialized runner required for ${paginationType} but runners/index.js is unavailable`,
        );
      }

      result = await dispatchSpecializedRunner(api, ctx);
    } else {
      // ── Universal ingestor path ──────────────────────────────────────────
      const { processSingleApi } = await getUniversalModule();

      if (typeof processSingleApi !== 'function') {
        // TODO: remove this fallback once universal_ingestor.js exports processSingleApi
        throw new Error(
          'universal_ingestor.js does not export processSingleApi — ' +
            'ensure engines/ingestors/universal_ingestor.js exports this function',
        );
      }

      result = await processSingleApi(api, ctx);
    }

    const ingestionResult = {
      ok: true,
      rows_written: result?.rows_written ?? result?.rowsWritten ?? 0,
      parts: result?.parts ?? result?.fileCount ?? 1,
      manifest_uri: `gs://${rawBucket}/${gcsPrefix}_MANIFEST.json`,
    };

    log('INFO', 'runIngestion complete', {
      api_id: apiId,
      run_id: runId,
      ...ingestionResult,
    });

    return ingestionResult;
  } catch (err) {
    log('ERROR', 'runIngestion failed', {
      api_id: apiId,
      run_id: runId,
      error: err.message,
      stack: err.stack,
    });

    return {
      ok: false,
      rows_written: 0,
      parts: 0,
      manifest_uri: '',
      error: err.message,
    };
  }
}
