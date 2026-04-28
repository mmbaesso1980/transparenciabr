/**
 * Lazy Cloud Logging to avoid import failures offline.
 */
let loggingLib = null;

async function getLogging() {
  if (loggingLib !== undefined) return loggingLib;
  try {
    const mod = await import("@google-cloud/logging");
    loggingLib = mod.Logging ? new mod.Logging() : null;
  } catch {
    loggingLib = null;
  }
  return loggingLib;
}

const metrics = {
  ingestor_records_total: new Map(),
  ingestor_bytes_total: new Map(),
  ingestor_errors_total: new Map(),
  ingestor_duration_seconds: new Map(),
  ingestor_last_success_timestamp: new Map(),
};

export function recordMetric(apiId, partial) {
  if (partial.records != null) {
    metrics.ingestor_records_total.set(apiId, (metrics.ingestor_records_total.get(apiId) || 0) + partial.records);
  }
  if (partial.bytes != null) {
    metrics.ingestor_bytes_total.set(apiId, (metrics.ingestor_bytes_total.get(apiId) || 0) + partial.bytes);
  }
  if (partial.error && partial.code) {
    const k = `${apiId}:${partial.code}`;
    metrics.ingestor_errors_total.set(k, (metrics.ingestor_errors_total.get(k) || 0) + 1);
  }
  if (partial.durationSec != null) {
    metrics.ingestor_duration_seconds.set(apiId, partial.durationSec);
  }
  if (partial.success) {
    metrics.ingestor_last_success_timestamp.set(apiId, Date.now() / 1000);
  }
}

export function renderPrometheusMetrics() {
  const lines = [];
  for (const [apiId, v] of metrics.ingestor_records_total) {
    lines.push(`ingestor_records_total{api_id="${apiId}"} ${v}`);
  }
  for (const [apiId, v] of metrics.ingestor_bytes_total) {
    lines.push(`ingestor_bytes_total{api_id="${apiId}"} ${v}`);
  }
  for (const [k, v] of metrics.ingestor_errors_total) {
    const [apiId, code] = k.split(":");
    lines.push(`ingestor_errors_total{api_id="${apiId}",code="${code}"} ${v}`);
  }
  for (const [apiId, v] of metrics.ingestor_duration_seconds) {
    lines.push(`ingestor_duration_seconds{api_id="${apiId}"} ${v}`);
  }
  for (const [apiId, v] of metrics.ingestor_last_success_timestamp) {
    lines.push(`ingestor_last_success_timestamp{api_id="${apiId}"} ${v}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function logStructured(severity, message, payload = {}) {
  const entry = { severity, message, ...payload };
  const log = await getLogging();
  const pid =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT_ID ||
    "";
  if (log && pid) {
    await log.log(`${pid}`, { severity, jsonPayload: entry }).catch(() => {});
    return;
  }
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}
