import { Storage } from "@google-cloud/storage";
import { gzipSync } from "node:zlib";

const PART_MAX_BYTES = 256 * 1024 * 1024;
const PART_MAX_LINES = 500_000;

/**
 * Path segment: raw/source={source}/dataset={dataset}/ingestion_date={YYYY-MM-DD}/run_id={ulid}/
 */
export function buildRawLakePrefix(source, dataset, ingestionDateIso, runId) {
  const s = String(source).replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const d = String(dataset).replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  return `raw/source=${s}/dataset=${d}/ingestion_date=${ingestionDateIso}/run_id=${runId}`;
}

/**
 * Streams NDJSON.gz parts to GCS with rollover; writes _MANIFEST.json and _SUCCESS.
 *
 * @param {AsyncIterable<Record<string, unknown>>} recordIterable
 * @param {{ bucket: string, prefix: string, manifestExtra?: Record<string, unknown> }} opts
 */
export async function writeNDJSONGzipParts(recordIterable, opts) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT_ID;
  const storage = new Storage(projectId ? { projectId } : {});
  const bucket = storage.bucket(opts.bucket);
  const basePrefix = opts.prefix.replace(/\/+$/, "");

  let partIndex = 0;
  let lineCount = 0;
  let chunkBytes = 0;
  /** @type {Buffer[]} */
  let chunk = [];
  let totalRecords = 0;
  let gzBytesTotal = 0;
  const parts = [];

  async function flush() {
    if (chunk.length === 0) return;
    const gz = gzipSync(Buffer.concat(chunk), { level: 6 });
    const name = `${basePrefix}/part-${String(partIndex).padStart(5, "0")}.ndjson.gz`;
    await bucket.file(name).save(gz, {
      contentType: "application/gzip",
      resumable: gz.length > 5 * 1024 * 1024,
      metadata: { cacheControl: "no-cache" },
    });
    parts.push(name);
    gzBytesTotal += gz.length;
    partIndex += 1;
    chunk = [];
    chunkBytes = 0;
    lineCount = 0;
  }

  for await (const rec of recordIterable) {
    const lineBuf = Buffer.from(`${JSON.stringify(rec)}\n`, "utf8");
    totalRecords += 1;
    chunk.push(lineBuf);
    chunkBytes += lineBuf.length;
    lineCount += 1;
    if (chunkBytes >= PART_MAX_BYTES || lineCount >= PART_MAX_LINES) {
      await flush();
    }
  }
  await flush();

  const runIdMatch = basePrefix.match(/run_id=([^/]+)/);
  const runId = runIdMatch ? runIdMatch[1] : "";

  const manifest = {
    run_id: runId,
    n_records: totalRecords,
    n_bytes: gzBytesTotal,
    started: new Date().toISOString(),
    ended: new Date().toISOString(),
    parts,
    bucket: opts.bucket,
    prefix: basePrefix,
    ...opts.manifestExtra,
  };
  const manifestKey = `${basePrefix}/_MANIFEST.json`;
  await bucket.file(manifestKey).save(JSON.stringify(manifest, null, 2), {
    contentType: "application/json",
    resumable: false,
  });

  await bucket.file(`${basePrefix}/_SUCCESS`).save("", {
    contentType: "text/plain",
    resumable: false,
  });

  return { nRecords: totalRecords, nBytes: gzBytesTotal, parts, manifestKey };
}
