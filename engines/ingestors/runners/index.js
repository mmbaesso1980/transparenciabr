/**
 * Runner registry — maps pagination strategies that need specialized handling
 * (BigQuery, bulk ZIP, FTP, scrape) to their dedicated runner.
 *
 * The universal_ingestor.js calls dispatchSpecializedRunner(api, ctx) early in
 * its loop. If it returns null/undefined, the ingestor falls through to the
 * standard HTTP+pagination flow.
 *
 * @example
 *   const runnerResult = await dispatchSpecializedRunner(api, ctx);
 *   if (runnerResult) return runnerResult;
 *   // ... fallthrough to HTTP path
 */
import { runBigQueryQuery } from "./bigquery_query_runner.js";
import { runBulkDownload } from "./bulk_download_runner.js";
import { runFtpDbc } from "./ftp_dbc_runner.js";
import { runCatalogScrape } from "./catalog_scrape_runner.js";

const REGISTRY = {
  bigquery_query: runBigQueryQuery,
  bulk_download: runBulkDownload,
  year_zip: runBulkDownload,
  ftp_dbc: runFtpDbc,
  catalog_scrape: runCatalogScrape,
};

export function isSpecializedStrategy(type) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, type);
}

export async function dispatchSpecializedRunner(api, ctx) {
  const type = api.pagination?.type;
  const fn = REGISTRY[type];
  if (!fn) return null;
  return fn(api, ctx);
}

export { runBigQueryQuery, runBulkDownload, runFtpDbc, runCatalogScrape };
