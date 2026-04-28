#!/usr/bin/env node
/**
 * Applica DDL em external_tables.sql no BigQuery (requer GOOGLE_APPLICATION_CREDENTIALS / ADC).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BigQuery } from "@google-cloud/bigquery";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname);

async function main() {
  const bq = new BigQuery();
  const sql = await readFile(join(root, "external_tables.sql"), "utf8");
  const blocks = sql
    .split(/\n(?=CREATE OR REPLACE)/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of blocks) {
    const clean = statement.replace(/^--[^\n]*/gm, "").trim();
    if (!clean) continue;
    const [job] = await bq.createQueryJob({ query: clean });
    await job.getQueryResults();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
