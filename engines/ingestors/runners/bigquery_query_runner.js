/**
 * BigQuery query runner — executes a parameterized SQL query (typically against
 * Base dos Dados `basedosdados.br_*`) and streams resulting rows to GCS as NDJSON.gz.
 *
 * Catalog entry expected:
 *   pagination: {
 *     type: "bigquery_query",
 *     query: "SELECT * FROM `basedosdados.br_inep_ideb.escola` WHERE ano >= @since",
 *     params?: { since: "year" | "iso_date" }
 *   }
 *
 * Returns { rows_written, parts, manifestKey, strategy }.
 */
import { BigQuery } from "@google-cloud/bigquery";
import { writeNDJSONGzipParts } from "../core/gcs_writer.js";
import { logStructured, recordMetric } from "../core/observability.js";

let bqClient = null;
function getBQ() {
  if (!bqClient) {
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT_ID;
    bqClient = new BigQuery(projectId ? { projectId } : {});
  }
  return bqClient;
}

function buildParams(api, ctx) {
  const params = {};
  const spec = api.pagination?.params || {};
  if (spec.since) {
    if (spec.since === "year") params.since = new Date().getFullYear();
    else if (spec.since === "iso_date") params.since = ctx.since || new Date().toISOString().slice(0, 10);
  }
  if (spec.year) params.year = new Date().getFullYear();
  if (spec.uf && ctx.uf) params.uf = ctx.uf;
  return Object.keys(params).length ? params : undefined;
}

export async function runBigQueryQuery(api, ctx) {
  const pag = api.pagination || {};
  const sql = pag.query || pag.sql;
  if (!sql) throw new Error(`[${api.id}] bigquery_query without 'query' field`);

  const start = Date.now();
  await logStructured("INFO", "bigquery_query.start", { api_id: api.id, sql_preview: sql.slice(0, 200) });

  if (ctx.dryRun) {
    return { rows_written: 0, dry_run: true, strategy: "bigquery_query" };
  }

  const bq = getBQ();
  const [job] = await bq.createQueryJob({
    query: sql,
    params: buildParams(api, ctx),
    useLegacySql: false,
  });

  const stream = job.getQueryResultsStream();
  async function* asyncRowIterable() {
    for await (const row of stream) yield row;
  }

  const result = await writeNDJSONGzipParts(asyncRowIterable(), {
    bucket: ctx.bucket,
    prefix: ctx.gcsPrefix,
    manifestExtra: {
      strategy: "bigquery_query",
      api_id: api.id,
      bq_job_id: job.id,
    },
  });

  const durationSec = (Date.now() - start) / 1000;
  recordMetric(api.id, {
    records: result.nRecords,
    bytes: result.nBytes,
    durationSec,
    success: true,
  });
  await logStructured("INFO", "bigquery_query.done", {
    api_id: api.id,
    rows: result.nRecords,
    bytes: result.nBytes,
    duration_sec: durationSec,
  });

  return {
    rows_written: result.nRecords,
    parts: result.parts.length,
    manifestKey: result.manifestKey,
    strategy: "bigquery_query",
  };
}
