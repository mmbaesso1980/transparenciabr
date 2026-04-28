import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeNDJSONGzipParts, buildRawLakePrefix } from "../ingestors/core/gcs_writer.js";

vi.mock("@google-cloud/storage", () => {
  return {
    Storage: class {
      bucket() {
        return {
          file: () => ({
            save: vi.fn().mockResolvedValue(undefined),
          }),
        };
      }
    },
  };
});

describe("gcs_writer", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLOUD_PROJECT = "test-proj";
    process.env.DATALAKE_BUCKET_RAW = "test-bucket";
  });

  it("buildRawLakePrefix follows hive-style segments", () => {
    const p = buildRawLakePrefix("CGU", "cgu_test", "2026-04-28", "01J...");
    expect(p).toContain("source=cgu");
    expect(p).toContain("dataset=cgu_test");
    expect(p).toContain("ingestion_date=2026-04-28");
    expect(p).toContain("run_id=01J...");
  });

  it("writes gzipped ndjson parts and manifest", async () => {
    async function* gen() {
      yield { a: 1 };
      yield { b: 2 };
    }
    const r = await writeNDJSONGzipParts(gen(), {
      bucket: "test-bucket",
      prefix: "raw/source=x/dataset=y/ingestion_date=2026-04-28/run_id=z",
      manifestExtra: { source_url: "https://x" },
    });
    expect(r.nRecords).toBe(2);
    expect(r.parts.length).toBeGreaterThan(0);
    expect(r.manifestKey).toContain("_MANIFEST.json");
  });
});
