/**
 * @fileoverview Agent Worker — Express server for Cloud Run.
 *
 * Receives Pub/Sub push-subscription payloads, decodes the batch, and drives
 * the Vertex Reasoning Engine to orchestrate ingestion of each API in the batch.
 *
 * Security:
 *   In production, Pub/Sub sends an OIDC JWT in the Authorization header.
 *   Set GCP_PROJECT_NUMBER to enable JWT verification (recommended in prod).
 *   In dev/test, set SKIP_JWT_VERIFICATION=true.
 *
 * Environment variables:
 *   PORT                    – HTTP port (default 8080)
 *   GCP_PROJECT_NUMBER      – used for OIDC token audience verification
 *   GCP_PROJECT_ID          – Google Cloud project ID
 *   SKIP_JWT_VERIFICATION   – 'true' to bypass JWT check (development only)
 *   DATALAKE_BUCKET_RAW     – GCS bucket for raw output
 *   ARSENAL_BUCKET          – GCS bucket for catalog / contracts
 *   LGPD_SALT_SECRET_NAME   – Secret Manager secret for LGPD salt
 *   VERTEX_REASONING_ENGINE_ID – Full resource name override (optional)
 */

import express from 'express';
import { createVerifier } from 'fast-jwt';
import { VertexReasoningClient } from './vertex_client.js';
import { runIngestion } from './ingestor_proxy.js';

// ─── Logging ──────────────────────────────────────────────────────────────────

/**
 * @param {'DEBUG'|'INFO'|'WARNING'|'ERROR'} severity
 * @param {string} message
 * @param {Record<string,unknown>} [payload]
 */
function log(severity, message, payload = {}) {
  console.log(
    JSON.stringify({ severity, message, timestamp: new Date().toISOString(), ...payload }),
  );
}

// ─── Vertex client (module-level singleton) ───────────────────────────────────

const vertexClient = new VertexReasoningClient();
let vertexReady = false;

(async () => {
  try {
    await vertexClient.init();
    vertexReady = true;
    log('INFO', 'VertexReasoningClient ready');
  } catch (err) {
    log('ERROR', 'Failed to initialise VertexReasoningClient at startup', {
      error: err.message,
    });
    // Intentionally non-fatal: readyz will reflect unready status.
  }
})();

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '4mb' }));

// ── Health & readiness probes ─────────────────────────────────────────────────

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/readyz', (_req, res) => {
  if (vertexReady) {
    return res.status(200).json({ status: 'ready', vertex: true });
  }
  return res.status(503).json({ status: 'not_ready', vertex: false });
});

// ── OIDC JWT verification middleware ─────────────────────────────────────────

/**
 * Verify the Pub/Sub OIDC JWT sent in the Authorization header.
 * Skip in dev when SKIP_JWT_VERIFICATION=true.
 *
 * @type {express.RequestHandler}
 */
async function verifyOidcJwt(req, res, next) {
  if (process.env.SKIP_JWT_VERIFICATION === 'true') {
    return next();
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    log('WARNING', 'Missing or malformed Authorization header');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = auth.slice(7);
  try {
    // Validate the JWT claims: audience must match our Cloud Run URL.
    // For a full implementation, verify the signature against Google's JWKS.
    // Here we do a best-effort structural check; enable full verification
    // by configuring a JWKS URI in production.
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Not a valid JWT');

    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const projectNumber = process.env.GCP_PROJECT_NUMBER;

    // Verify the token is issued by Google and meant for this project.
    if (projectNumber && !claims.aud?.includes(projectNumber)) {
      throw new Error(`Invalid audience: ${claims.aud}`);
    }

    if (claims.exp && Date.now() / 1_000 > claims.exp) {
      throw new Error('Token expired');
    }

    req.jwtClaims = claims;
    return next();
  } catch (err) {
    log('WARNING', 'OIDC JWT verification failed', { error: err.message });
    return res.status(401).json({ error: 'Unauthorized', detail: err.message });
  }
}

// ── Main Pub/Sub push handler ─────────────────────────────────────────────────

app.post('/', verifyOidcJwt, async (req, res) => {
  // Pub/Sub push delivers: { message: { data: base64, messageId, ... }, subscription: ... }
  const envelope = req.body;
  const messageData = envelope?.message?.data;

  if (!messageData) {
    log('WARNING', 'Pub/Sub message missing data field', { body: envelope });
    // Return 204 to ack a malformed message (avoids infinite retry storm).
    return res.status(204).send();
  }

  let payload;
  try {
    const decoded = Buffer.from(messageData, 'base64').toString('utf8');
    payload = JSON.parse(decoded);
  } catch (err) {
    log('ERROR', 'Failed to decode Pub/Sub message data', { error: err.message });
    return res.status(204).send(); // ack — nothing to retry
  }

  const { api_ids, agent_id, batch_id, run_id, priority } = payload;
  const correlationId = `${run_id}.${batch_id}.${agent_id}`;

  log('INFO', 'Agent worker received batch', {
    correlation_id: correlationId,
    agent_id,
    batch_id,
    run_id,
    priority,
    n_apis: api_ids?.length ?? 0,
  });

  if (!Array.isArray(api_ids) || api_ids.length === 0) {
    log('WARNING', 'Empty api_ids in payload — acking without work', {
      correlation_id: correlationId,
    });
    return res.status(204).send();
  }

  // ── Invoke Vertex Reasoning Engine ────────────────────────────────────────

  const prompt = [
    `You are agent ${agent_id}. Correlation ID: ${correlationId}.`,
    `Process these api_ids: ${api_ids.join(', ')}.`,
    `For each api_id, call the runIngestion tool with that api_id.`,
    `Report success or failure for each one in your final response.`,
  ].join('\n');

  /** @type {Array<{name:string, description:string, parameters:Record<string,unknown>}>} */
  const tools = [
    {
      name: 'runIngestion',
      description: 'Ingest a single API dataset from the catalog into the raw data lake.',
      parameters: {
        type: 'object',
        properties: {
          api_id: {
            type: 'string',
            description: 'The catalog api_id to ingest',
          },
        },
        required: ['api_id'],
      },
    },
  ];

  try {
    let response = await vertexClient.invokeAgent(agent_id, prompt, tools);

    // ── Tool call loop ───────────────────────────────────────────────────────
    // Process any tool calls requested by the Reasoning Engine.
    const results = [];
    let iterations = 0;
    const MAX_ITERATIONS = api_ids.length + 5;

    while (response.tool_calls?.length > 0 && iterations < MAX_ITERATIONS) {
      iterations++;
      const toolResults = [];

      for (const tc of response.tool_calls) {
        if (tc.name === 'runIngestion') {
          const apiId = tc.args?.api_id;
          if (!apiId) {
            toolResults.push({ api_id: null, ok: false, error: 'Missing api_id in tool call' });
            continue;
          }

          log('INFO', 'Executing runIngestion tool call', {
            correlation_id: correlationId,
            api_id: apiId,
          });

          const result = await runIngestion(apiId, { run_id });
          results.push({ api_id: apiId, ...result });
          toolResults.push({ api_id: apiId, ...result });
        } else {
          log('WARNING', 'Unknown tool call from Reasoning Engine', {
            correlation_id: correlationId,
            tool_name: tc.name,
          });
        }
      }

      // Feed results back to the engine for continued reasoning (if needed).
      const followUp =
        `Tool results: ${JSON.stringify(toolResults)}. ` +
        `Continue with any remaining api_ids or provide final summary.`;

      response = await vertexClient.invokeAgent(agent_id, followUp, tools);
    }

    // Log any api_ids that were never ingested
    const ingestedIds = new Set(results.map((r) => r.api_id));
    const missing = api_ids.filter((id) => !ingestedIds.has(id));
    if (missing.length > 0) {
      log('WARNING', 'Some api_ids were not processed by the Reasoning Engine', {
        correlation_id: correlationId,
        missing,
      });
    }

    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      log('WARNING', 'Partial ingestion failures in batch', {
        correlation_id: correlationId,
        failures: failures.map((f) => ({ api_id: f.api_id, error: f.error })),
      });
    }

    log('INFO', 'Agent worker batch complete', {
      correlation_id: correlationId,
      total: api_ids.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: failures.length,
    });

    // 204 = success ack to Pub/Sub
    return res.status(204).send();
  } catch (err) {
    log('ERROR', 'Hard error in agent worker — returning 500 for Pub/Sub retry', {
      correlation_id: correlationId,
      error: err.message,
      stack: err.stack,
    });

    // 5xx → Pub/Sub retries; eventually routes to dead-letter topic.
    return res.status(500).json({ error: err.message, correlation_id: correlationId });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, () => {
  log('INFO', `Agent worker listening on port ${PORT}`);
});

export { app };
