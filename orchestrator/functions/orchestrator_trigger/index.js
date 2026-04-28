/**
 * @fileoverview Orchestrator Trigger — HTTP / Cloud Scheduler Cloud Function (gen2)
 *
 * Reads the API catalog from GCS, partitions APIs into 12 balanced Pub/Sub messages
 * using greedy bin-packing by cost_weight, then fans out to the `ingest-fan` topic.
 *
 * Environment variables expected:
 *   ARSENAL_BUCKET       – GCS bucket holding arsenal_apis.json and contracts
 *   PUBSUB_TOPIC         – Pub/Sub topic name (default: ingest-fan)
 *   GCP_PROJECT_ID       – Google Cloud project ID
 *   NUM_AGENTS           – number of agent bins (default: 12)
 */

import { PubSub } from '@google-cloud/pubsub';
import { Storage } from '@google-cloud/storage';
import { monotonicFactory } from 'ulid';

// ─── Constants ────────────────────────────────────────────────────────────────

const NUM_AGENTS = parseInt(process.env.NUM_AGENTS ?? '12', 10);
const TOPIC_NAME = process.env.PUBSUB_TOPIC ?? 'ingest-fan';
const ARSENAL_BUCKET = process.env.ARSENAL_BUCKET;
const CATALOG_OBJECT = 'config/arsenal_apis.json';
const VALID_PRIORITIES = new Set(['imediata', 'sprint_2', 'all']);
const STD_DEV_WARN_THRESHOLD = 0.15; // 15 %

// ─── Logging helpers ──────────────────────────────────────────────────────────

/**
 * Emit a structured Cloud Logging JSON line to stdout.
 * @param {'DEBUG'|'INFO'|'WARNING'|'ERROR'} severity
 * @param {string} message
 * @param {Record<string,unknown>} [payload]
 */
function log(severity, message, payload = {}) {
  console.log(
    JSON.stringify({
      severity,
      message,
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  );
}

// ─── GCS helpers ─────────────────────────────────────────────────────────────

/**
 * Load and parse the API catalog JSON from GCS.
 * @param {Storage} storage
 * @returns {Promise<Array<{id:string, priority:string, cost_weight?:number}>>}
 */
async function loadCatalog(storage) {
  if (!ARSENAL_BUCKET) {
    throw new Error('ARSENAL_BUCKET environment variable is not set');
  }
  const [contents] = await storage
    .bucket(ARSENAL_BUCKET)
    .file(CATALOG_OBJECT)
    .download();
  const catalog = JSON.parse(contents.toString('utf8'));
  if (!Array.isArray(catalog)) {
    throw new TypeError(
      `Expected catalog to be an array, got ${typeof catalog}`,
    );
  }
  return catalog;
}

// ─── Partitioning algorithm ───────────────────────────────────────────────────

/**
 * Filter APIs by priority flag.
 * @param {Array<{id:string, priority:string, cost_weight?:number}>} catalog
 * @param {'imediata'|'sprint_2'|'all'} priority
 * @returns {Array<{id:string, priority:string, cost_weight:number}>}
 */
export function filterByPriority(catalog, priority) {
  return catalog
    .filter((api) => {
      const p = api.priority ?? 'imediata';
      if (priority === 'all') return p !== 'deferred' && p !== 'futuro';
      return p === priority;
    })
    .map((api) => ({
      ...api,
      cost_weight: typeof api.cost_weight === 'number' ? api.cost_weight : 1.0,
    }));
}

/**
 * Greedy bin-packing: sort by cost_weight descending, assign each API to the
 * currently-lightest bin.  Returns an array of NUM_AGENTS bins.
 *
 * @param {Array<{id:string, cost_weight:number}>} apis
 * @param {number} numBins
 * @returns {Array<{apis: Array<{id:string,cost_weight:number}>, total_cost:number}>}
 */
export function partitionIntoBins(apis, numBins) {
  /** @type {Array<{apis: Array<{id:string,cost_weight:number}>, total_cost:number}>} */
  const bins = Array.from({ length: numBins }, () => ({
    apis: [],
    total_cost: 0,
  }));

  if (apis.length === 0) return bins;

  // Sort descending so heavy items are placed first (better balance).
  const sorted = [...apis].sort((a, b) => b.cost_weight - a.cost_weight);

  for (const api of sorted) {
    // Find the bin with the current minimum total cost.
    let minIdx = 0;
    for (let i = 1; i < numBins; i++) {
      if (bins[i].total_cost < bins[minIdx].total_cost) minIdx = i;
    }
    bins[minIdx].apis.push(api);
    bins[minIdx].total_cost += api.cost_weight;
  }

  return bins;
}

/**
 * Compute the relative standard deviation (σ / μ) of bin costs.
 * @param {number[]} costs
 * @returns {number} coefficient of variation (0–1)
 */
export function relativeStdDev(costs) {
  const n = costs.length;
  if (n === 0) return 0;
  const mean = costs.reduce((s, c) => s + c, 0) / n;
  if (mean === 0) return 0;
  const variance = costs.reduce((s, c) => s + (c - mean) ** 2, 0) / n;
  return Math.sqrt(variance) / mean;
}

// ─── Pub/Sub helpers ──────────────────────────────────────────────────────────

/**
 * Publish one message per bin to the Pub/Sub fan-out topic.
 *
 * @param {PubSub} pubsub
 * @param {string} topicName
 * @param {string} runId
 * @param {'imediata'|'sprint_2'|'all'} priority
 * @param {ReturnType<typeof partitionIntoBins>} bins
 * @returns {Promise<Array<{agent_id:number, message_id:string}>>}
 */
async function publishBatches(pubsub, topicName, runId, priority, bins) {
  const topic = pubsub.topic(topicName);
  const results = [];

  for (let i = 0; i < bins.length; i++) {
    const agentId = i + 1; // 1-indexed
    const bin = bins[i];
    const batchId = `${runId}.${agentId}`;

    const payload = {
      api_ids: bin.apis.map((a) => a.id),
      agent_id: agentId,
      batch_id: batchId,
      run_id: runId,
      priority,
    };

    const messageId = await topic.publishMessage({
      data: Buffer.from(JSON.stringify(payload), 'utf8'),
      attributes: {
        agent_id: String(agentId),
        batch_id: batchId,
        run_id: runId,
        priority,
      },
    });

    log('DEBUG', 'Published batch to Pub/Sub', {
      agent_id: agentId,
      batch_id: batchId,
      run_id: runId,
      n_apis: bin.apis.length,
      total_cost: bin.total_cost,
      message_id: messageId,
    });

    results.push({ agent_id: agentId, message_id: messageId });
  }

  return results;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

const storage = new Storage();
const pubsub = new PubSub({ projectId: process.env.GCP_PROJECT_ID });
const ulid = monotonicFactory();

/**
 * HTTP Cloud Function entry point.
 * Accepts ?priority=imediata|sprint_2|all  (default: imediata)
 *
 * @param {import('@google-cloud/functions-framework').Request} req
 * @param {import('@google-cloud/functions-framework').Response} res
 */
export async function orchestratorTrigger(req, res) {
  const rawPriority =
    req.query.priority ?? req.body?.priority ?? 'imediata';
  const priority = VALID_PRIORITIES.has(rawPriority) ? rawPriority : 'imediata';
  const runId = ulid();

  log('INFO', 'Orchestrator trigger started', { run_id: runId, priority });

  let catalog;
  try {
    catalog = await loadCatalog(storage);
    log('INFO', 'Catalog loaded', {
      run_id: runId,
      total_entries: catalog.length,
    });
  } catch (err) {
    log('ERROR', 'Failed to load catalog from GCS', {
      run_id: runId,
      error: err.message,
      stack: err.stack,
    });
    return res.status(500).json({ error: 'Failed to load catalog', run_id: runId });
  }

  // Filter by priority
  const filtered = filterByPriority(catalog, priority);
  log('INFO', 'APIs selected after priority filter', {
    run_id: runId,
    priority,
    selected: filtered.length,
  });

  if (filtered.length === 0) {
    log('WARNING', 'No APIs selected for this priority — nothing to publish', {
      run_id: runId,
      priority,
    });
    return res.status(200).json({
      run_id: runId,
      priority,
      batches: [],
      warning: 'No APIs matched the requested priority',
    });
  }

  // Partition into bins
  const bins = partitionIntoBins(filtered, NUM_AGENTS);
  const costs = bins.map((b) => b.total_cost);
  const cv = relativeStdDev(costs);

  if (cv > STD_DEV_WARN_THRESHOLD) {
    log('WARNING', 'Cost distribution across agents exceeds 15% relative std dev', {
      run_id: runId,
      cv: cv.toFixed(4),
      bin_costs: costs.map((c) => c.toFixed(2)),
    });
  } else {
    log('INFO', 'Cost distribution within acceptable bounds', {
      run_id: runId,
      cv: cv.toFixed(4),
    });
  }

  // Publish to Pub/Sub
  let publishResults;
  try {
    publishResults = await publishBatches(pubsub, TOPIC_NAME, runId, priority, bins);
  } catch (err) {
    log('ERROR', 'Failed to publish Pub/Sub messages', {
      run_id: runId,
      error: err.message,
      stack: err.stack,
    });
    return res.status(500).json({ error: 'Pub/Sub publish failed', run_id: runId });
  }

  const summary = {
    run_id: runId,
    priority,
    total_apis: filtered.length,
    cv: parseFloat(cv.toFixed(4)),
    batches: bins.map((bin, idx) => ({
      agent_id: idx + 1,
      n_apis: bin.apis.length,
      total_cost: parseFloat(bin.total_cost.toFixed(4)),
      message_id: publishResults[idx]?.message_id,
    })),
  };

  log('INFO', 'Orchestrator trigger complete', { run_id: runId, summary });
  return res.status(200).json(summary);
}
