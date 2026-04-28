import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isSpecializedStrategy,
  dispatchSpecializedRunner,
} from "../ingestors/runners/index.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runner registry", () => {
  it("recognizes specialized strategies", () => {
    expect(isSpecializedStrategy("bigquery_query")).toBe(true);
    expect(isSpecializedStrategy("bulk_download")).toBe(true);
    expect(isSpecializedStrategy("year_zip")).toBe(true);
    expect(isSpecializedStrategy("ftp_dbc")).toBe(true);
    expect(isSpecializedStrategy("catalog_scrape")).toBe(true);
  });

  it("returns false for HTTP strategies", () => {
    expect(isSpecializedStrategy("page")).toBe(false);
    expect(isSpecializedStrategy("offset")).toBe(false);
    expect(isSpecializedStrategy("cursor")).toBe(false);
    expect(isSpecializedStrategy("none")).toBe(false);
  });

  it("returns null for unknown strategy", async () => {
    const result = await dispatchSpecializedRunner(
      { id: "x", pagination: { type: "page" } },
      { dryRun: true },
    );
    expect(result).toBeNull();
  });

  it("dispatches dry-run for bigquery_query", async () => {
    const result = await dispatchSpecializedRunner(
      {
        id: "test_bq",
        pagination: { type: "bigquery_query", query: "SELECT 1" },
      },
      { dryRun: true },
    );
    expect(result).toMatchObject({ dry_run: true, strategy: "bigquery_query" });
  });

  it("dispatches dry-run for bulk_download", async () => {
    const result = await dispatchSpecializedRunner(
      {
        id: "test_bulk",
        pagination: {
          type: "bulk_download",
          url_template: "https://example.com/data.zip",
        },
      },
      { dryRun: true },
    );
    expect(result).toMatchObject({ dry_run: true, strategy: "bulk_download" });
  });

  it("dispatches dry-run for ftp_dbc", async () => {
    const result = await dispatchSpecializedRunner(
      {
        id: "test_ftp",
        pagination: {
          type: "ftp_dbc",
          ftp_host: "ftp.example.com",
          ftp_path: "/x/",
          pattern: "*.dbc",
        },
      },
      { dryRun: true },
    );
    expect(result).toMatchObject({ dry_run: true, strategy: "ftp_dbc" });
  });

  it("dispatches dry-run for catalog_scrape", async () => {
    const result = await dispatchSpecializedRunner(
      {
        id: "test_scrape",
        pagination: { type: "catalog_scrape", index_url: "https://example.com" },
      },
      { dryRun: true },
    );
    expect(result).toMatchObject({ dry_run: true, strategy: "catalog_scrape" });
  });
});
