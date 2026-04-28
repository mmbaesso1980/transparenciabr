/**
 * Bulk download runner — handles `year_zip` and `bulk_download` strategies.
 * Downloads ZIP/CSV from a static URL, extracts CSVs, converts to NDJSON.gz in GCS.
 *
 * Catalog entry expected:
 *   pagination: {
 *     type: "year_zip" | "bulk_download",
 *     url_template: "https://cdn.tse.jus.br/.../bem_candidato_{year}.zip",
 *     start_year?: 2018,
 *     end_year?: 2024,
 *     csv_delimiter?: ";",
 *     csv_encoding?: "latin1"
 *   }
 *
 * Streams large files to disk to avoid OOM. Files > 5GB get explicit warning
 * (recommend Cloud Storage Transfer Service via separate path).
 */
import { mkdtempSync, createWriteStream, createReadStream, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import StreamZip from "node-stream-zip";
import { parse } from "csv-parse";
import { writeNDJSONGzipParts } from "../core/gcs_writer.js";
import { logStructured, recordMetric } from "../core/observability.js";

async function downloadFile(url, destPath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`bulk_download HTTP ${res.status} for ${url}`);
  await pipeline(res.body, createWriteStream(destPath));
  return destPath;
}

async function unzipAll(zipPath, destDir) {
  const zip = new StreamZip.async({ file: zipPath });
  await zip.extract(null, destDir);
  await zip.close();
}

async function* csvRowIterable(csvPath, delimiter, encoding) {
  const headers = [];
  let isFirst = true;
  const parser = createReadStream(csvPath, { encoding: encoding || "utf-8" })
    .pipe(parse({
      delimiter: delimiter || ";",
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }));
  for await (const row of parser) {
    if (isFirst) {
      headers.push(...row.map((h) => String(h).trim()));
      isFirst = false;
      continue;
    }
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    yield obj;
  }
}

async function* multiCsvIterable(csvPaths, delimiter, encoding) {
  for (const p of csvPaths) {
    yield* csvRowIterable(p, delimiter, encoding);
  }
}

export async function runBulkDownload(api, ctx) {
  const pag = api.pagination || {};
  const tpl = pag.url_template || api.endpoint;
  if (!tpl) throw new Error(`[${api.id}] bulk_download without url_template`);

  const start = Date.now();
  await logStructured("INFO", "bulk_download.start", { api_id: api.id, template: tpl });

  if (ctx.dryRun) {
    return { rows_written: 0, dry_run: true, strategy: pag.type };
  }

  const isYearLoop = pag.type === "year_zip";
  const years = isYearLoop
    ? Array.from(
        { length: (pag.end_year ?? new Date().getFullYear()) - (pag.start_year ?? 2018) + 1 },
        (_, i) => (pag.start_year ?? 2018) + i,
      )
    : [null];

  const tmp = mkdtempSync(join(tmpdir(), `bulk_${api.id}_`));
  const allCsvs = [];

  try {
    for (const y of years) {
      const url = y ? tpl.replace(/\{year\}|\{ano\}|\{AAAA\}/g, String(y)) : tpl;
      const fname = url.toLowerCase().endsWith(".zip") ? `data_${y || "static"}.zip` : `data_${y || "static"}.csv`;
      const localPath = join(tmp, fname);
      await logStructured("INFO", "bulk_download.fetch", { api_id: api.id, url, year: y });
      await downloadFile(url, localPath);

      const stat = statSync(localPath);
      if (stat.size > 5 * 1024 * 1024 * 1024) {
        await logStructured("WARNING", "bulk_download.large_file", {
          api_id: api.id,
          size_gb: (stat.size / 1e9).toFixed(2),
        });
      }

      if (fname.endsWith(".zip")) {
        const ext = join(tmp, `ext_${y || "static"}`);
        await unzipAll(localPath, ext);
        const csvs = readdirSync(ext).filter((f) => /\.csv$/i.test(f)).map((f) => join(ext, f));
        allCsvs.push(...csvs);
      } else {
        allCsvs.push(localPath);
      }
    }

    if (allCsvs.length === 0) {
      await logStructured("WARNING", "bulk_download.no_csv", { api_id: api.id });
      return { rows_written: 0, parts: 0, strategy: pag.type };
    }

    const result = await writeNDJSONGzipParts(
      multiCsvIterable(allCsvs, pag.csv_delimiter, pag.csv_encoding),
      {
        bucket: ctx.bucket,
        prefix: ctx.gcsPrefix,
        manifestExtra: {
          strategy: pag.type,
          api_id: api.id,
          source_url_template: tpl,
          n_csv_files: allCsvs.length,
        },
      },
    );

    const durationSec = (Date.now() - start) / 1000;
    recordMetric(api.id, {
      records: result.nRecords,
      bytes: result.nBytes,
      durationSec,
      success: true,
    });
    await logStructured("INFO", "bulk_download.done", {
      api_id: api.id,
      rows: result.nRecords,
      parts: result.parts.length,
      duration_sec: durationSec,
    });

    return {
      rows_written: result.nRecords,
      parts: result.parts.length,
      manifestKey: result.manifestKey,
      strategy: pag.type,
    };
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
