/**
 * @fileoverview Vertex AI Reasoning Engine client wrapper.
 *
 * Wraps the @google-cloud/aiplatform ReasoningEngineExecutionService to invoke
 * a named Reasoning Engine, handling streaming responses, tool-call extraction,
 * and exponential back-off on quota errors.
 *
 * Environment variables:
 *   VERTEX_REASONING_ENGINE_ID  – full resource name (required), e.g.
 *                                 projects/PROJECT/locations/REGION/reasoningEngines/NUMERIC_ID
 *   VERTEX_TIMEOUT_SECONDS      – per-request timeout in seconds (default 600)
 *   GCP_PROJECT_ID              – Google Cloud project ID
 */

// Dynamically import protobufjs Value helper from aiplatform bundle.
// The actual gRPC client is accessed through the v1beta1 namespace.
import aiplatform from '@google-cloud/aiplatform';

const { v1beta1 } = aiplatform;

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * ID literal do Agent Builder (Líder Supremo). Os backends devem invocar apenas o motor
 * Gemini 2.5 exposto por esse agente — aqui o recurso Vertex Reasoning Engine deve ser o
 * deployment correspondente (env VERTEX_REASONING_ENGINE_ID). Os bins Pub/Sub agent_id 1–12
 * são apenas shards de carga, não agentes alternativos.
 */
export const SUPREME_AGENT_BUILDER_ID = 'agent_1777236402725';

/**
 * @param {string} resourceName Full reasoning engine resource name
 * @returns {string} Regional Vertex API host (e.g. us-central1-aiplatform.googleapis.com)
 */
function apiEndpointFromReasoningEngineResource(resourceName) {
  const m = String(resourceName).match(/\/locations\/([^/]+)\//);
  const location = m ? m[1] : 'us-central1';
  return `${location}-aiplatform.googleapis.com`;
}

function requireReasoningEngineResource() {
  const id = (process.env.VERTEX_REASONING_ENGINE_ID || '').trim();
  if (!id) {
    throw new Error(
      'VERTEX_REASONING_ENGINE_ID ausente: defina o nome completo do recurso Reasoning Engine ' +
        '(projects/.../locations/.../reasoningEngines/...). Não use fallback hardcoded (SecOps G.O.A.T.).',
    );
  }
  return id;
}

const TIMEOUT_SECONDS = parseInt(
  process.env.VERTEX_TIMEOUT_SECONDS ?? '600',
  10,
);

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;

// ─── Logging helper ───────────────────────────────────────────────────────────

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

// ─── Retry helper ─────────────────────────────────────────────────────────────

/**
 * Execute `fn` with exponential back-off, retrying only on 429/RESOURCE_EXHAUSTED.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} maxRetries
 * @returns {Promise<T>}
 */
async function withBackoff(fn, maxRetries = MAX_RETRIES) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const isQuota =
        err?.code === 429 ||
        err?.code === 8 /* RESOURCE_EXHAUSTED gRPC */ ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('quota');

      attempt++;
      if (!isQuota || attempt > maxRetries) throw err;

      const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 500;
      log('WARNING', 'Quota error from Vertex — retrying with back-off', {
        attempt,
        delay_ms: Math.round(delayMs),
        error: err.message,
      });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ─── VertexReasoningClient ────────────────────────────────────────────────────

/**
 * Client for the Vertex AI Reasoning Engine ExecutionService.
 *
 * Usage:
 * ```js
 * const client = new VertexReasoningClient();
 * await client.init();
 * const result = await client.invokeAgent(3, 'Process api_ids: [...]', tools);
 * ```
 */
export class VertexReasoningClient {
  #client = null;
  #initialized = false;
  /** @type {string|null} */
  #reasoningEngineResource = null;

  /** @returns {boolean} */
  get isReady() {
    return this.#initialized;
  }

  /**
   * Initialise the gRPC client.  Must be called before invokeAgent.
   * @returns {Promise<void>}
   */
  async init() {
    this.#reasoningEngineResource = requireReasoningEngineResource();
    const apiEndpoint = apiEndpointFromReasoningEngineResource(this.#reasoningEngineResource);
    this.#client = new v1beta1.ReasoningEngineExecutionServiceClient({
      apiEndpoint,
    });
    // Eagerly warm up credentials
    await this.#client.initialize();
    this.#initialized = true;
    log('INFO', 'VertexReasoningClient initialised', {
      resource: this.#reasoningEngineResource,
      api_endpoint: apiEndpoint,
    });
  }

  /**
   * Invoke the Reasoning Engine with a text prompt and optional tool definitions.
   *
   * @param {number} workerSlot – 1–12: shard de carga Pub/Sub (sessão); o motor Vertex é sempre o Líder Supremo ({@link SUPREME_AGENT_BUILDER_ID}).
   * @param {string} prompt    – instruction text sent to the reasoning engine
   * @param {Array<Record<string,unknown>>} [tools]  – optional tool declarations
   * @returns {Promise<{text:string, tool_calls: Array<{name:string, args:Record<string,unknown>}> }>}
   */
  async invokeAgent(workerSlot, prompt, tools = []) {
    if (!this.#initialized) {
      throw new Error('VertexReasoningClient not initialised — call init() first');
    }

    const sessionId = `shard_${workerSlot}`;

    log('DEBUG', 'Invoking Reasoning Engine', {
      worker_slot: workerSlot,
      session_id: sessionId,
      lider_supremo_agent_builder_id: SUPREME_AGENT_BUILDER_ID,
      prompt_length: prompt.length,
      tool_count: tools.length,
    });

    const request = {
      reasoningEngine: this.#reasoningEngineResource,
      input: {
        input: prompt,
        ...(tools.length > 0 && { tools }),
      },
    };

    const callOptions = {
      timeout: TIMEOUT_SECONDS * 1_000,
    };

    const responseText = await withBackoff(async () => {
      // queryReasoningEngine returns a streaming iterable.
      const [stream] = await this.#client.streamQueryReasoningEngine(
        request,
        callOptions,
      );

      const chunks = [];
      const toolCalls = [];

      for await (const chunk of stream) {
        // Accumulate text output
        const text = chunk?.output?.output ?? chunk?.text ?? '';
        if (text) chunks.push(text);

        // Extract any tool call requests
        const calls = chunk?.output?.toolCalls ?? chunk?.toolCalls ?? [];
        for (const tc of calls) {
          toolCalls.push({
            name: tc.name ?? tc.functionCall?.name,
            args: tc.args ?? tc.functionCall?.args ?? {},
          });
        }
      }

      return { text: chunks.join(''), tool_calls: toolCalls };
    });

    log('DEBUG', 'Reasoning Engine response received', {
      worker_slot: workerSlot,
      session_id: sessionId,
      response_length: responseText.text.length,
      tool_calls: responseText.tool_calls.length,
    });

    return responseText;
  }

  /**
   * Release underlying gRPC connections.
   * @returns {Promise<void>}
   */
  async close() {
    if (this.#client) {
      await this.#client.close();
      this.#initialized = false;
    }
  }
}
