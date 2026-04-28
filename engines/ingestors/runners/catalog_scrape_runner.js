/**
 * Catalog scrape runner — reads CKAN/dataset listing pages and extracts
 * dataset IDs to seed downstream `iter_ids` ingestors.
 *
 * Catalog entry:
 *   pagination: {
 *     type: "catalog_scrape",
 *     ckan_endpoint?: "https://dadosabertos.tse.jus.br/api/3/action/package_list",
 *     index_url?: "https://dadosabertos.tse.jus.br/dataset"
 *   }
 *
 * Strategy precedence:
 *   1. CKAN API (if `ckan_endpoint` set) — preferred, structured JSON.
 *   2. Sitemap.xml (if hosted) — secondary fallback.
 *   3. HTML deferred — emit manifest pointing to Sprint 2 cheerio runner.
 */
import { writeNDJSONGzipParts } from "../core/gcs_writer.js";
import { logStructured, recordMetric } from "../core/observability.js";

async function ckanList(url) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`CKAN HTTP ${r.status}`);
  const json = await r.json();
  if (json && json.success && Array.isArray(json.result)) return json.result;
  return [];
}

async function fetchSitemap(url) {
  try {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) return null;
    const txt = await r.text();
    const matches = txt.match(/<loc>([^<]+)<\/loc>/gi) || [];
    return matches.map((m) => m.replace(/<\/?loc>/gi, ""));
  } catch {
    return null;
  }
}

export async function runCatalogScrape(api, ctx) {
  const pag = api.pagination || {};
  const start = Date.now();
  await logStructured("INFO", "catalog_scrape.start", { api_id: api.id });

  if (ctx.dryRun) {
    return { rows_written: 0, dry_run: true, strategy: "catalog_scrape" };
  }

  // Strategy 1: CKAN API
  if (pag.ckan_endpoint) {
    const ids = await ckanList(pag.ckan_endpoint);
    async function* it() {
      for (const id of ids) yield { dataset_id: id, scraped_at: new Date().toISOString(), source: "ckan" };
    }
    const result = await writeNDJSONGzipParts(it(), {
      bucket: ctx.bucket,
      prefix: ctx.gcsPrefix,
      manifestExtra: {
        strategy: "catalog_scrape",
        api_id: api.id,
        source: "ckan",
        ckan_endpoint: pag.ckan_endpoint,
      },
    });
    recordMetric(api.id, {
      records: result.nRecords,
      bytes: result.nBytes,
      durationSec: (Date.now() - start) / 1000,
      success: true,
    });
    await logStructured("INFO", "catalog_scrape.done", { api_id: api.id, datasets: result.nRecords, source: "ckan" });
    return { rows_written: result.nRecords, parts: result.parts.length, strategy: "catalog_scrape", source: "ckan" };
  }

  // Strategy 2: sitemap.xml
  if (pag.index_url) {
    const sitemapUrl = new URL("/sitemap.xml", pag.index_url).toString();
    const urls = await fetchSitemap(sitemapUrl);
    if (urls && urls.length > 0) {
      async function* it() {
        for (const u of urls) yield { dataset_url: u, scraped_at: new Date().toISOString(), source: "sitemap" };
      }
      const result = await writeNDJSONGzipParts(it(), {
        bucket: ctx.bucket,
        prefix: ctx.gcsPrefix,
        manifestExtra: { strategy: "catalog_scrape", api_id: api.id, source: "sitemap" },
      });
      await logStructured("INFO", "catalog_scrape.done", { api_id: api.id, urls: result.nRecords, source: "sitemap" });
      return { rows_written: result.nRecords, parts: result.parts.length, strategy: "catalog_scrape", source: "sitemap" };
    }
  }

  // Strategy 3: deferred HTML scrape
  async function* def() {
    yield {
      _deferred: true,
      _strategy: "catalog_scrape",
      _api_id: api.id,
      _index_url: pag.index_url,
      _scheduled_runner: "cheerio HTML scraper (Sprint 2)",
      _ingestion_timestamp: new Date().toISOString(),
    };
  }
  await writeNDJSONGzipParts(def(), {
    bucket: ctx.bucket,
    prefix: ctx.gcsPrefix,
    manifestExtra: { strategy: "catalog_scrape", api_id: api.id, deferred: true },
  });
  await logStructured("WARNING", "catalog_scrape.deferred", { api_id: api.id });
  return { rows_written: 1, parts: 1, strategy: "catalog_scrape", deferred: true };
}
