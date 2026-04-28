/**
 * Embedded HTTP server exposing Prometheus metrics + health endpoints.
 * Designed to run alongside the universal_ingestor as a sidecar in Cloud Run.
 *
 * Endpoints:
 *   GET /metrics  → Prometheus text format (renderPrometheusMetrics)
 *   GET /healthz  → 200 "ok"
 *   GET /readyz   → 200 if at least one ingestion succeeded since startup
 *
 * Usage:
 *   import { startMetricsServer } from "./core/metrics_server.js";
 *   const server = startMetricsServer({ port: process.env.METRICS_PORT || 9100 });
 *   // ... run ingestors ...
 *   await server.close();
 */
import { createServer } from "node:http";
import { renderPrometheusMetrics } from "./observability.js";

let lastSuccessAt = 0;

export function markSuccess() {
  lastSuccessAt = Date.now();
}

/**
 * @param {{ port?: number, host?: string }} opts
 */
export function startMetricsServer(opts = {}) {
  const port = Number(opts.port || process.env.METRICS_PORT || 9100);
  const host = opts.host || "0.0.0.0";

  const server = createServer((req, res) => {
    const url = req.url || "/";
    if (url.startsWith("/metrics")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; version=0.0.4");
      res.end(renderPrometheusMetrics());
      return;
    }
    if (url.startsWith("/healthz")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain");
      res.end("ok");
      return;
    }
    if (url.startsWith("/readyz")) {
      const ready = lastSuccessAt > 0;
      res.statusCode = ready ? 200 : 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ready, last_success_at: lastSuccessAt }));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  const ready = new Promise((resolve) => {
    server.listen(port, host, () => resolve());
  });

  return {
    server,
    port,
    host,
    ready,
    close: () =>
      new Promise((resolve) => server.close(() => resolve())),
  };
}
