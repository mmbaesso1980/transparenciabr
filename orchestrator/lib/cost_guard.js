/**
 * @fileoverview BigQuery Cost Guard — prevents runaway query costs.
 *
 * Wraps BigQuery job execution to enforce:
 *   1. Per-query maximumBytesBilled cap
 *   2. Daily cumulative bytes quota (env BQ_DAILY_BUDGET_BYTES)
 *
 * Usage:
 *   import { wrapBigQueryJob } from '../lib/cost_guard.js';
 *   const [rows] = await wrapBigQueryJob(
 *     'SELECT * FROM `project.dataset.table`',
 *     { maxBytesBilled: 5 * 1024**3 }   // 5 GB per query
 *   );
 *
 * Environment variables:
 *   BQ_DAILY_BUDGET_BYTES  – cumulative daily limit in bytes (default: 100 GB)
 *   GCP_PROJECT_ID         – Google Cloud project
 */

import { BigQuery } from '@google-cloud/bigquery';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEN_GB = 10 * 1_024 ** 3;           // 10,737,418,240 bytes
const HUNDRED_GB = 100 * 1_024 ** 3;      // default daily budget

// ─── Custom errors ────────────────────────────────────────────────────────────

/**
 * Thrown when a query would exceed the daily BigQuery cost budget.
 */
export class BudgetExceededError extends Error {
  /**
   * @param {number} used        – bytes used so far today
   * @param {number} limit       – daily limit in bytes
   * @param {number} queryCost   – bytes the current query attempted to bill
   */
  constructor(used, limit, queryCost) {
    super(
      `BigQuery daily budget exceeded: used=${fmtBytes(used)}, ` +
        `limit=${fmtBytes(limit)}, query_cost=${fmtBytes(queryCost)}`,
    );
    this.name = 'BudgetExceededError';
    this.used = used;
    this.limit = limit;
    this.queryCost = queryCost;
  }
}

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

/** @param {number} bytes @returns {string} */
function fmtBytes(bytes) {
  if (bytes >= 1_024 ** 3) return `${(bytes / 1_024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1_024 ** 2) return `${(bytes / 1_024 ** 2).toFixed(2)} MB`;
  return `${bytes} B`;
}

// ─── In-process daily accumulator ────────────────────────────────────────────
// This is an in-process accumulator that resets each calendar day (UTC).
// In a multi-instance Cloud Run deployment the accumulator is not shared;
// for cross-instance enforcement use a shared store (Redis/Firestore) — but
// per DIRETIVA SUPREMA Firestore is disallowed, so this is the best viable
// stateless option.  Set BQ_DAILY_BUDGET_BYTES conservatively.

let _dailyBytesUsed = 0;
let _dailyBudgetResetDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

/**
 * Reset the accumulator if the UTC date has changed.
 */
function maybeResetDaily() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== _dailyBudgetResetDate) {
    log('INFO', 'Resetting daily BigQuery byte accumulator', {
      previous_date: _dailyBudgetResetDate,
      bytes_used: _dailyBytesUsed,
    });
    _dailyBytesUsed = 0;
    _dailyBudgetResetDate = today;
  }
}

/**
 * Expose accumulator for testing.
 * @returns {{ used:number, date:string }}
 */
export function getDailyUsage() {
  return { used: _dailyBytesUsed, date: _dailyBudgetResetDate };
}

/**
 * Reset accumulator — for tests only.
 * @internal
 */
export function _resetDailyUsage() {
  _dailyBytesUsed = 0;
  _dailyBudgetResetDate = new Date().toISOString().slice(0, 10);
}

// ─── Observability stub ───────────────────────────────────────────────────────

/**
 * Record a metric event.  In production this would emit to Cloud Monitoring.
 * @param {string} name
 * @param {number} value
 * @param {Record<string,string>} [labels]
 */
function recordMetric(name, value, labels = {}) {
  log('DEBUG', 'metric', { metric_name: name, value, labels });
  // TODO: replace with google-cloud/monitoring custom metric write in S3
}

// ─── BigQuery client ──────────────────────────────────────────────────────────

const bq = new BigQuery({ projectId: process.env.GCP_PROJECT_ID });

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Execute a BigQuery query with byte-billed guards.
 *
 * @param {string} query  – Standard SQL query string
 * @param {{
 *   maxBytesBilled?: number,
 *   location?: string,
 *   params?: unknown[],
 *   queryParameters?: unknown[],
 *   useLegacySql?: boolean,
 * }} [options]
 * @returns {Promise<[unknown[], import('@google-cloud/bigquery').QueryResponse[1]]>}
 * @throws {BudgetExceededError} if daily budget would be exceeded
 * @throws {Error} if BigQuery rejects due to bytesBilled limit exceeded
 */
export async function wrapBigQueryJob(query, options = {}) {
  maybeResetDaily();

  const dailyLimit = parseInt(
    process.env.BQ_DAILY_BUDGET_BYTES ?? String(HUNDRED_GB),
    10,
  );
  const perQueryLimit = options.maxBytesBilled ?? TEN_GB;

  // Pre-flight: run a dry-run to estimate bytes processed
  let estimatedBytes = 0;
  try {
    const [dryJob] = await bq.createQueryJob({
      query,
      dryRun: true,
      useLegacySql: options.useLegacySql ?? false,
      location: options.location,
      ...(options.params && { params: options.params }),
      ...(options.queryParameters && { queryParameters: options.queryParameters }),
    });
    estimatedBytes = parseInt(
      dryJob.metadata?.statistics?.totalBytesProcessed ?? '0',
      10,
    );
  } catch (_dryErr) {
    // Dry-run failure is non-fatal — proceed with actual job
    log('WARNING', 'BigQuery dry-run estimation failed', { error: _dryErr.message });
  }

  if (estimatedBytes > 0 && _dailyBytesUsed + estimatedBytes > dailyLimit) {
    throw new BudgetExceededError(_dailyBytesUsed, dailyLimit, estimatedBytes);
  }

  log('DEBUG', 'BigQuery job starting', {
    estimated_bytes: estimatedBytes,
    daily_used: _dailyBytesUsed,
    daily_limit: dailyLimit,
    per_query_limit: perQueryLimit,
  });

  // Execute with maximumBytesBilled enforcement
  const [rows, queryResponse] = await bq.query({
    query,
    maximumBytesBilled: String(perQueryLimit),
    useLegacySql: options.useLegacySql ?? false,
    location: options.location,
    ...(options.params && { params: options.params }),
    ...(options.queryParameters && { queryParameters: options.queryParameters }),
  });

  // Post-run: update accumulator with actual bytes billed
  const actualBytes = parseInt(
    queryResponse?.totalBytesProcessed ?? String(estimatedBytes),
    10,
  );

  _dailyBytesUsed += actualBytes;

  recordMetric('bq_bytes_billed', actualBytes, {
    project: process.env.GCP_PROJECT_ID ?? 'unknown',
  });
  recordMetric('bq_daily_bytes_used', _dailyBytesUsed, {
    project: process.env.GCP_PROJECT_ID ?? 'unknown',
  });

  log('INFO', 'BigQuery job complete', {
    actual_bytes: actualBytes,
    daily_bytes_used: _dailyBytesUsed,
    daily_limit: dailyLimit,
    rows_returned: rows.length,
  });

  // Check post-run whether we've now exceeded the daily limit (warn, not throw)
  if (_dailyBytesUsed > dailyLimit) {
    log('WARNING', 'Daily BigQuery budget exceeded after job completion', {
      daily_bytes_used: _dailyBytesUsed,
      daily_limit: dailyLimit,
    });
  }

  return [rows, queryResponse];
}
