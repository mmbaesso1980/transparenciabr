#!/usr/bin/env node
/**
 * Universal declarative ingestor — reads engines/config/arsenal_apis.json,
 * streams NDJSON.gz to GCS (DATALAKE_BUCKET_RAW), checkpoints to DATALAKE_BUCKET_STATE.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import micromatch from "micromatch";
import CircuitBreaker from "opossum";
import { ulid } from "ulid";

import { BUCKET_RAW } from "../gcp_storage.js";
import { buildExternalTableDDL } from "./base_ingestor.js";
import { resolveAuth } from "./strategies/auth/index.js";
import { loadCheckpoint, saveCheckpoint } from "./core/checkpoint.js";
import { writeNDJSONGzipParts, buildRawLakePrefix } from "./core/gcs_writer.js";
import { requestHttp } from "./core/http_client.js";
import { getLimiterForHost } from "./core/rate_limiter.js";
import { logStructured, recordMetric } from "./core/observability.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "../config/arsenal_apis.json");

const PRIORS = ["imediata", "sprint_2", "sprint_3", "futuro"];

const DEFAULT_UA =
  process.env.HTTP_USER_AGENT ||
  "TransparenciaBR/2.0 (+https://transparenciabr.org/bot)";

function loadCatalog() {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

function shortHash(s) {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
}

function maskPII(value) {
  if (typeof value !== "string") return value;
  let out = value.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, (m) => `sha256:${shortHash(m)}…`);
  const emailRe = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  out = out.replace(emailRe, (m) => `sha256:${shortHash(m)}…`);
  return out;
}

function normalizeRecord(api, obj, meta = {}) {
  const base =
    typeof obj === "object" && obj !== null && !Array.isArray(obj)
      ? { ...obj }
      : { _value: obj };
  for (const k of Object.keys(base)) {
    if (typeof base[k] === "string") base[k] = maskPII(base[k]);
  }
  return {
    _api_id: api.id,
    _dominio: api.dominio,
    _fonte: api.fonte,
    ...meta,
    ...base,
  };
}

function recordsFromBody(api, body) {
  if (body == null) return [];
  if (Array.isArray(body)) return body.map((x) => normalizeRecord(api, x));
  const arrKeys = Object.keys(body).filter((k) => Array.isArray(body[k]));
  if (arrKeys.length === 1) {
    return body[arrKeys[0]].map((x) => normalizeRecord(api, x));
  }
  return [normalizeRecord(api, body)];
}

function applyPathTemplate(endpoint, replacements) {
  let e = endpoint;
  for (const [k, v] of Object.entries(replacements)) {
    e = e.split(`{${k}}`).join(v);
  }
  return e;
}

function buildUrl(baseUrl, endpoint, _query) {
  const base = baseUrl.replace(/\/+$/, "");
  const path = endpoint.startsWith("http") ? endpoint : `${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  if (endpoint.startsWith("http")) return new URL(path);
  return new URL(base + (endpoint.startsWith("/") ? endpoint : `/${endpoint}`));
}

function safeHostname(baseUrl) {
  try {
    const u = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
    return new URL(u).hostname;
  } catch {
    return "invalid.local";
  }
}

function filterApis(catalog, target) {
  const all = catalog.apis;
  if (target === "all") return all;
  if (PRIORS.includes(target)) {
    return all.filter((a) => a.prioridade === target);
  }
  const dominioMatch = all.filter((a) => a.dominio === target);
  if (dominioMatch.length) return dominioMatch;
  return all.filter((a) => micromatch.isMatch(a.id, target));
}

async function runHttp(api, opts) {
  const auth = await resolveAuth(api);
  const url = buildUrl(api.base_url, api.endpoint, {});
  for (const [k, v] of Object.entries(auth.query || {})) {
    url.searchParams.set(k, v);
  }
  for (const [k, v] of Object.entries(opts.query || {})) {
    url.searchParams.set(k, String(v));
  }
  const headers = {
    "User-Agent": catalogDefaults()?.user_agent || DEFAULT_UA,
    Accept: "application/json",
    ...auth.headers,
  };
  return requestHttp(url.toString(), {
    method: api.method || "GET",
    headers,
    httpsAgent: auth.httpsAgent,
    timeout: catalogDefaults()?.timeout_ms ?? 30000,
    params: undefined,
  });
}

function catalogDefaults() {
  try {
    const c = loadCatalog();
    return c.defaults;
  } catch {
    return null;
  }
}

let _catalogCache;
function getCatalog() {
  if (!_catalogCache) _catalogCache = loadCatalog();
  return _catalogCache;
}

async function ingestOne(api, argv) {
  const catalog = getCatalog();
  const defaults = catalog.defaults || {};
  const started = Date.now();
  const dry = argv.dryRun;
  const hostname = safeHostname(api.base_url);

  const breaker = new CircuitBreaker(
    async (fn) => fn(),
    {
      timeout: defaults.timeout_ms ?? 60000,
      errorThresholdPercentage: 80,
      resetTimeout: 60000,
      volumeThreshold: 5,
    },
  );

  const limiter = getLimiterForHost(hostname, api.rate_limit || defaults.rate_limit);

  let checkpoint = argv.resume ? await loadCheckpoint(api.id).catch(() => null) : null;
  if (argv.since) {
    checkpoint = { ...(checkpoint || {}), last_date: argv.since };
  }

  /** @type {Record<string, unknown>[]} */
  const buffer = [];

  async function pumpRecords(res) {
    const body = res?.data !== undefined ? res.data : res;
    for (const r of recordsFromBody(api, body)) {
      buffer.push(r);
    }
  }

  const pag = api.pagination || { type: "none" };

  if (dry) {
    await logStructured("INFO", "dry-run", {
      api_id: api.id,
      pagination: pag.type,
      sample_keys: Object.keys(api),
    });
    recordMetric(api.id, { records: 0, success: true, durationSec: 0 });
    return { api_id: api.id, records: 0, dry: true };
  }

  if (
    ["bigquery_query", "bulk_download", "ftp_dbc", "catalog_scrape", "zip_csv", "year_zip"].includes(pag.type) ||
    api.format === "ftp_dbc"
  ) {
    buffer.push(
      normalizeRecord(
        api,
        {
          _skipped: true,
          reason: "strategy_requires_dedicated_runner",
          pagination: pag.type,
          format: api.format,
        },
        {},
      ),
    );
  } else if (pag.type === "none") {
    await limiter.schedule(() =>
      breaker.fire(() =>
        runHttp(api, { query: {} }).then((res) => pumpRecords(res)),
      ),
    );
  } else if (pag.type === "page") {
    let page = pag.start_page ?? 1;
    const maxPages = 200;
    while (page <= maxPages) {
      const before = buffer.length;
      const qp = {};
      qp[pag.page_param || "pagina"] = page;
      if (pag.per_page_param) qp[pag.per_page_param] = pag.page_size ?? 15;
      await limiter.schedule(() =>
        breaker.fire(() => runHttp(api, { query: qp }).then((res) => pumpRecords(res))),
      );
      const added = buffer.length - before;
      if (added === 0) break;
      page += 1;
      if (added < (pag.page_size ?? 15)) break;
    }
  } else if (pag.type === "offset") {
    let offset = Number(checkpoint?.last_offset ?? 0);
    const limit = pag.page_size ?? 50;
    let rounds = 0;
    while (rounds < 100) {
      const qp = {};
      qp[pag.limit_param || "limite"] = limit;
      qp[pag.offset_param || "offset"] = offset;
      const before = buffer.length;
      await limiter.schedule(() =>
        breaker.fire(() => runHttp(api, { query: qp }).then((res) => pumpRecords(res))),
      );
      if (buffer.length === before) break;
      offset += limit;
      rounds += 1;
    }
    await saveCheckpoint(api.id, {
      last_offset: offset,
      last_run_at: new Date().toISOString(),
      total_records: buffer.length,
    }).catch(() => {});
  } else if (pag.type === "date_window") {
    const qp = {};
    qp[pag.start_param || "dataInicial"] =
      checkpoint?.last_date || argv.since || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    qp[pag.end_param || "dataFinal"] = new Date().toISOString().slice(0, 10);
    await limiter.schedule(() =>
      breaker.fire(() => runHttp(api, { query: qp }).then((res) => pumpRecords(res))),
    );
  } else if (pag.type === "year_loop") {
    const y0 = pag.start_year ?? 2000;
    const y1 = pag.end_year ?? new Date().getFullYear();
    for (let y = y0; y <= y1; y++) {
      const ep = applyPathTemplate(api.endpoint, { ano: String(y), year: String(y) });
      const apiYear = { ...api, endpoint: ep };
      await limiter.schedule(() =>
        breaker.fire(() => runHttp(apiYear, { query: {} }).then((res) => pumpRecords(res))),
      );
    }
  } else if (pag.type === "uf_loop") {
    const ufs = [
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ];
    for (const uf of ufs) {
      const ep = applyPathTemplate(api.endpoint, { UF: uf, uf });
      const apiUf = { ...api, endpoint: ep };
      await limiter.schedule(() =>
        breaker.fire(() => runHttp(apiUf, { query: { uf } }).then((res) => pumpRecords(res))),
      );
    }
  } else {
    await limiter.schedule(() =>
      breaker.fire(() => runHttp(api, { query: {} }).then((res) => pumpRecords(res))),
    );
  }

  const ingestionDate = new Date().toISOString().slice(0, 10);
  const runId = ulid();
  const sourceTag = api.fonte.replace(/\s+/g, "_").toLowerCase();
  const prefix = buildRawLakePrefix(sourceTag, api.id, ingestionDate, runId);

  async function* iterable() {
    for (const row of buffer) {
      yield row;
    }
  }

  const bucket = process.env.DATALAKE_BUCKET_RAW || BUCKET_RAW;
  const manifestExtra = {
    source_url: api.base_url + api.endpoint,
    params: { pagination: pag.type },
  };

  const result = await writeNDJSONGzipParts(iterable(), {
    bucket,
    prefix,
    manifestExtra,
  });

  const durationSec = (Date.now() - started) / 1000;
  recordMetric(api.id, {
    records: result.nRecords,
    bytes: result.nBytes,
    durationSec,
    success: true,
  });

  await logStructured("INFO", "ingest_complete", {
    api_id: api.id,
    n_records: result.nRecords,
    duration_ms: Date.now() - started,
    sample_keys: buffer[0] ? Object.keys(buffer[0]).slice(0, 12) : [],
  });

  return { api_id: api.id, records: result.nRecords, prefix };
}

async function appendExternalDDL(api) {
  const project = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "PROJECT";
  const bucket = process.env.DATALAKE_BUCKET_RAW || BUCKET_RAW;
  const fonte = api.fonte.replace(/\s+/g, "_").toLowerCase();
  const ddl = buildExternalTableDDL({
    projectId: project,
    dominio: api.dominio,
    apiId: api.id,
    bucket,
    fonte,
  });
  const fs = await import("node:fs/promises");
  const path = join(__dirname, "../bigquery/external_tables.sql");
  await fs.appendFile(path, `\n${ddl}\n`);
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("target", { type: "string", default: "all" })
    .option("dry-run", { type: "boolean", default: false })
    .option("since", { type: "string" })
    .option("concurrency", { type: "number", default: 4 })
    .option("resume", { type: "boolean", default: false })
    .strict()
    .parse();

  const catalog = loadCatalog();
  const selected = filterApis(catalog, argv.target);

  if (!argv.dryRun) {
    const fs = await import("node:fs/promises");
    const ddlPath = join(__dirname, "../bigquery/external_tables.sql");
    await fs.writeFile(
      ddlPath,
      `-- Auto-generated by universal_ingestor — ${new Date().toISOString()}\n\n`,
      "utf8",
    );
  }

  await logStructured("INFO", "run_start", {
    target: argv.target,
    n_apis: selected.length,
    dry_run: argv.dryRun,
  });

  const queue = selected;
  const concurrency = Math.max(1, argv.concurrency || 4);
  /** @type {Promise<void>[]} */
  const workers = [];

  async function worker() {
    while (queue.length) {
      const api = queue.shift();
      if (!api) return;
      try {
        await ingestOne(api, argv);
        if (!argv.dryRun) await appendExternalDDL(api);
      } catch (err) {
        recordMetric(api.id, { error: true, code: err.code || "ERR" });
        await logStructured("ERROR", "ingest_failed", {
          api_id: api.id,
          message: String(err.message || err),
        });
      }
    }
  }

  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  await logStructured("INFO", "run_end", { target: argv.target });
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
});
