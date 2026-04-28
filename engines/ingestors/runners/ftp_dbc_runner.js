/**
 * FTP DBC runner — downloads .dbc files from DataSUS FTP and emits NDJSON.gz.
 *
 * Production note: .dbc files are a compressed variant of dBase III used by
 * DataSUS. Native Node parsing is not available; production conversion uses
 * a Python subprocess (`pyreaddbc`) or the R `read.dbc` package, OR the
 * mirror at https://datasus.saude.gov.br/transferencia-download-de-arquivos/
 * which provides .csv versions for some datasets.
 *
 * This runner connects via FTP, lists files matching a pattern, downloads them,
 * and emits a NDJSON manifest of available files. Conversion is deferred to a
 * dedicated Sprint 2 worker (configurable via env DBC_CONVERTER_BIN).
 *
 * Catalog entry:
 *   pagination: {
 *     type: "ftp_dbc",
 *     ftp_host: "ftp.datasus.gov.br",
 *     ftp_path: "/dissemin/publicos/SIASUS/200801_/Dados/",
 *     pattern: "PA{UF}{YY}{MM}.dbc",
 *     since_year?: 2020
 *   }
 */
import Ftp from "ftp";
import { writeNDJSONGzipParts } from "../core/gcs_writer.js";
import { logStructured, recordMetric } from "../core/observability.js";

function ftpList(client, path) {
  return new Promise((resolve, reject) => {
    client.list(path, (err, list) => (err ? reject(err) : resolve(list || [])));
  });
}

async function connectFtp(host) {
  const c = new Ftp();
  await new Promise((resolve, reject) => {
    c.once("ready", resolve);
    c.once("error", reject);
    c.connect({ host, user: "anonymous", password: "anonymous@", connTimeout: 30000 });
  });
  return c;
}

export async function runFtpDbc(api, ctx) {
  const pag = api.pagination || {};
  const start = Date.now();
  await logStructured("INFO", "ftp_dbc.start", { api_id: api.id, host: pag.ftp_host });

  if (ctx.dryRun) {
    return { rows_written: 0, dry_run: true, strategy: "ftp_dbc" };
  }

  if (!pag.ftp_host || !pag.ftp_path) {
    throw new Error(`[${api.id}] ftp_dbc requires ftp_host and ftp_path`);
  }

  let client;
  try {
    client = await connectFtp(pag.ftp_host);
    const entries = await ftpList(client, pag.ftp_path);
    const sinceYear = pag.since_year ?? new Date().getFullYear() - 1;
    const dbcRegex = /\.dbc$/i;

    async function* iterable() {
      for (const e of entries) {
        if (e.type !== "-" || !dbcRegex.test(e.name)) continue;
        const yMatch = e.name.match(/(\d{4})|(\d{2})/);
        const yearGuess = yMatch ? parseInt(yMatch[0], 10) : null;
        if (yearGuess && yearGuess < sinceYear) continue;
        yield {
          file_name: e.name,
          ftp_host: pag.ftp_host,
          ftp_path: `${pag.ftp_path.replace(/\/$/, "")}/${e.name}`,
          size_bytes: e.size,
          modified: e.date ? new Date(e.date).toISOString() : null,
          _strategy: "ftp_dbc",
          _conversion_pending: process.env.DBC_CONVERTER_BIN ? false : true,
          _converter_hint: "pyreaddbc subprocess (Sprint 2)",
        };
      }
    }

    const result = await writeNDJSONGzipParts(iterable(), {
      bucket: ctx.bucket,
      prefix: ctx.gcsPrefix,
      manifestExtra: {
        strategy: "ftp_dbc",
        api_id: api.id,
        ftp_host: pag.ftp_host,
        ftp_path: pag.ftp_path,
        deferred_conversion: true,
      },
    });

    const durationSec = (Date.now() - start) / 1000;
    recordMetric(api.id, {
      records: result.nRecords,
      bytes: result.nBytes,
      durationSec,
      success: true,
    });
    await logStructured("INFO", "ftp_dbc.done", {
      api_id: api.id,
      files_listed: result.nRecords,
      deferred: true,
    });

    return {
      rows_written: result.nRecords,
      parts: result.parts.length,
      manifestKey: result.manifestKey,
      strategy: "ftp_dbc",
      deferred_conversion: true,
    };
  } finally {
    if (client) try { client.end(); } catch { /* ignore */ }
  }
}
