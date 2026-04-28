import { describe, it, expect, vi } from "vitest";
import { logStructured, renderPrometheusMetrics, recordMetric } from "../ingestors/core/observability.js";

vi.mock("@google-cloud/logging", () => ({
  Logging: class {
    log() {
      return Promise.resolve();
    }
  },
}));

describe("observability", () => {
  it("falls back to stderr without project", async () => {
    const prev = process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    await logStructured("INFO", "t", { x: 1 });
    process.env.GOOGLE_CLOUD_PROJECT = prev;
  });

  it("renders prometheus text", () => {
    recordMetric("a", { records: 2, bytes: 10, durationSec: 1, success: true });
    const txt = renderPrometheusMetrics();
    expect(txt).toContain("ingestor_records_total");
  });
});
