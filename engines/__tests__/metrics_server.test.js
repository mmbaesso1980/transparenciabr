import { describe, it, expect, afterAll } from "vitest";
import { startMetricsServer, markSuccess } from "../ingestors/core/metrics_server.js";
import { recordMetric } from "../ingestors/core/observability.js";

let server;
let port;

describe("metrics_server", () => {
  it("starts and serves /healthz", async () => {
    server = startMetricsServer({ port: 0 }); // OS-assigned
    await server.ready;
    port = server.server.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });

  it("returns 503 on /readyz before any success", async () => {
    const r = await fetch(`http://127.0.0.1:${port}/readyz`);
    expect(r.status).toBe(503);
  });

  it("returns 200 on /readyz after markSuccess()", async () => {
    markSuccess();
    const r = await fetch(`http://127.0.0.1:${port}/readyz`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ready).toBe(true);
  });

  it("serves /metrics in Prometheus format", async () => {
    recordMetric("test_api", { records: 10, bytes: 1024, success: true });
    const r = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/plain");
    const txt = await r.text();
    expect(txt).toContain("ingestor_records_total");
  });

  afterAll(async () => {
    if (server) await server.close();
  });
});
