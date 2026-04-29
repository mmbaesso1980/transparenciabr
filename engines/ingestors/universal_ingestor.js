#!/usr/bin/env node
/**
 * ============================================================
 * universal_ingestor.js — Ingestor Universal TransparênciaBR
 * ============================================================
 *
 * Responsável por:
 *   1. Ler o mapa de fontes em arsenal_apis.json
 *   2. Executar chamadas HTTP com retry/backoff exponencial
 *   3. Gravar cada resposta em gs://datalake-tbr-raw/<path>.json
 *   4. Garantir idempotência (skip se blob já existe no GCS)
 *   5. Respeitar rate limits com worker pool (máx 5 paralelas/fonte)
 *
 * Destino EXCLUSIVO: GCS (zero Firestore na ingestão)
 * Exclusão permanente: dadosabertos.camara.leg.br — ver §6 doc mestre
 *
 * Uso:
 *   node universal_ingestor.js --priority P0
 *   node universal_ingestor.js --source cgu_portal_transparencia --since 2024-01-01
 *   node universal_ingestor.js --priority P0 --force
 *   node universal_ingestor.js --source tcu_acordaos --dry-run
 *
 * Variáveis de ambiente obrigatórias:
 *   DATALAKE_BUCKET_RAW         — ex: datalake-tbr-raw
 *   GOOGLE_APPLICATION_CREDENTIALS — path para service account JSON
 *
 * Variáveis opcionais por fonte:
 *   CGU_API_KEY, INLABS_API_KEY, NEWSAPI_KEY, MEDIASTACK_API_KEY,
 *   APITUBE_API_KEY, SIAFI_CERT_PATH
 *
 * Dependências: @google-cloud/storage, p-limit, node-fetch (ou fetch nativo Node ≥18)
 * ============================================================
 */

import { readFileSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

// ---------- Google Cloud Storage ----------
import { Storage } from "@google-cloud/storage";

// ---------- Worker pool com concorrência limitada ----------
// p-limit ≥ 4 exporta default como named export em ESM
import pLimit from "p-limit";

// ------------------------------------------------------------
// Caminhos e constantes globais
// ------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Localização do mapa de fontes (mesmo diretório que este script) */
const ARSENAL_PATH = join(__dirname, "arsenal_apis.json");

/** Bucket GCS de destino — obrigatório via env */
const BUCKET_RAW = process.env.DATALAKE_BUCKET_RAW || "datalake-tbr-raw";

/** Máximo de chamadas paralelas por fonte (conforme spec do projeto) */
const MAX_CONCURRENT_PER_SOURCE = 5;

/**
 * Configuração de backoff exponencial para erros 429/5xx
 * Delays: 1s → 2s → 4s → 8s → 16s (5 tentativas)
 */
const RETRY_CONFIG = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  retryStatuses: new Set([429, 500, 502, 503, 504]),
};

/** Domínio excluído por diretiva do projeto — nunca deve ser ingerido */
const EXCLUDED_DOMAINS = new Set(["dadosabertos.camara.leg.br"]);

// ------------------------------------------------------------
// Mapeamento de prioridades (string → número para filtrar)
// ------------------------------------------------------------
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

// ------------------------------------------------------------
// Inicialização do cliente GCS
// ------------------------------------------------------------
const gcsClient = new Storage();
const bucket = gcsClient.bucket(BUCKET_RAW);

// ============================================================
// BLOCO 1 — Carregamento do arsenal de fontes
// ============================================================

/**
 * Carrega e valida o arquivo arsenal_apis.json.
 * Lança erro se o arquivo não existir ou for inválido.
 * @returns {{ version: string, sources: Array }} catálogo
 */
function loadArsenal(path = ARSENAL_PATH) {
  const raw = readFileSync(path, "utf-8");
  const catalog = JSON.parse(raw);

  if (!catalog.sources || !Array.isArray(catalog.sources)) {
    throw new Error(`arsenal_apis.json inválido: campo 'sources' ausente em ${path}`);
  }

  log("INFO", "arsenal_carregado", {
    versao: catalog.version,
    total_fontes: catalog.sources.length,
    exclusoes: catalog.exclusions,
  });

  return catalog;
}

// ============================================================
// BLOCO 2 — Filtragem de fontes por prioridade ou ID
// ============================================================

/**
 * Seleciona fontes do catálogo conforme flags da CLI.
 * Aplica exclusão de domínios por segurança.
 *
 * @param {Array} sources    - lista completa de fontes
 * @param {object} options   - { priority, source }
 * @returns {Array} fontes selecionadas
 */
function selectSources(sources, { priority, source }) {
  let selected = sources;

  // Filtro por ID de fonte específica
  if (source) {
    selected = sources.filter((s) => s.id === source);
    if (selected.length === 0) {
      throw new Error(`Fonte '${source}' não encontrada no arsenal.`);
    }
  }

  // Filtro por prioridade (P0 inclui apenas P0; P1 inclui P0+P1; etc.)
  if (priority && !source) {
    const maxLevel = PRIORITY_ORDER[priority];
    if (maxLevel === undefined) {
      throw new Error(`Prioridade inválida: '${priority}'. Use P0, P1, P2 ou P3.`);
    }
    selected = selected.filter((s) => {
      const level = PRIORITY_ORDER[s.priority];
      return level !== undefined && level <= maxLevel;
    });
  }

  // Garantia: nunca processar domínio excluído
  selected = selected.filter((s) => {
    try {
      const hostname = new URL(s.base_url).hostname;
      if (EXCLUDED_DOMAINS.has(hostname)) {
        log("WARN", "fonte_excluida_por_diretiva", { id: s.id, hostname });
        return false;
      }
    } catch {
      // URL inválida ou FTP — mantém para runner especializado
    }
    return true;
  });

  return selected;
}

// ============================================================
// BLOCO 3 — Construção de headers de autenticação
// ============================================================

/**
 * Resolve os headers HTTP de autenticação conforme o tipo definido na fonte.
 * Suporta: none, api_key_header, api_key_query, cert, oauth
 *
 * @param {object} auth - objeto auth da fonte
 * @param {URL} url     - URL que pode receber query param de auth
 * @returns {object} headers adicionais
 */
function resolveAuthHeaders(auth, url) {
  if (!auth || auth.type === "none") return {};

  if (auth.type === "api_key_header") {
    const key = process.env[auth.env];
    if (!key) {
      log("WARN", "env_ausente", { env: auth.env, tipo: "api_key_header" });
      return {};
    }
    return { [auth.header]: key };
  }

  if (auth.type === "api_key_query") {
    const key = process.env[auth.env];
    if (!key) {
      log("WARN", "env_ausente", { env: auth.env, tipo: "api_key_query" });
      return {};
    }
    // Adiciona como query param na URL (mutação intencional)
    url.searchParams.set(auth.param, key);
    return {};
  }

  if (auth.type === "oauth" || auth.type === "cert") {
    // Autenticação delegada ao Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS)
    // ou certificado especificado em env. Não adiciona header manual — SDK cuida disso.
    return {};
  }

  log("WARN", "auth_type_desconhecido", { tipo: auth.type });
  return {};
}

// ============================================================
// BLOCO 4 — Requisição HTTP com retry/backoff exponencial
// ============================================================

/**
 * Pausa a execução por `ms` milissegundos.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa uma requisição HTTP com retry automático em caso de erros
 * 429 (rate limit) e 5xx (erros de servidor).
 *
 * Backoff exponencial: 1s → 2s → 4s → 8s → 16s (máx 5 tentativas)
 *
 * @param {string} url         - URL completa da requisição
 * @param {object} options     - opções fetch (headers, method, etc.)
 * @returns {Response}         - resposta HTTP
 */
async function fetchWithRetry(url, options = {}) {
  let lastError;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    const startMs = Date.now();

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": "TransparenciaBR/2.0 (+https://transparenciabr.org/bot)",
          Accept: "application/json, application/xml, */*",
          ...options.headers,
        },
      });

      const latencyMs = Date.now() - startMs;

      // Sucesso — retorna imediatamente
      if (response.ok) {
        log("DEBUG", "http_ok", { url: url.toString().slice(0, 120), status: response.status, latency_ms: latencyMs, attempt });
        return response;
      }

      // Erro que merece retry
      if (RETRY_CONFIG.retryStatuses.has(response.status)) {
        const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1);
        log("WARN", "http_retry", {
          url: url.toString().slice(0, 120),
          status: response.status,
          attempt,
          proximo_retry_ms: delayMs,
        });
        lastError = new Error(`HTTP ${response.status} em ${url}`);
        await sleep(delayMs);
        continue;
      }

      // Erro não-retriable (404, 401, etc.) — lança imediatamente
      throw new Error(`HTTP ${response.status} em ${url}`);
    } catch (err) {
      // Erros de rede (ECONNRESET, ETIMEDOUT, etc.) também fazem retry
      if (err.message?.startsWith("HTTP ")) throw err; // não-retriable
      const delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1);
      log("WARN", "http_network_error", {
        url: url.toString().slice(0, 120),
        erro: String(err.message),
        attempt,
        proximo_retry_ms: delayMs,
      });
      lastError = err;
      await sleep(delayMs);
    }
  }

  throw lastError || new Error(`Máximo de tentativas esgotado para ${url}`);
}

// ============================================================
// BLOCO 5 — Construção do caminho GCS
// ============================================================

/**
 * Constrói o caminho (blob key) no GCS para um registro específico.
 * Estrutura: <fonte>/<ano>/<mes>/<entidade>/<id>.json
 * Exemplo:   cgu/contratos_federais/2024/01/run_20240115T103045_p1.json
 *
 * @param {object} source      - objeto da fonte do arsenal
 * @param {object} endpoint    - objeto do endpoint
 * @param {string} runId       - identificador único da execução (ulid ou timestamp)
 * @param {number} page        - número de página (para paginação)
 * @returns {string}           - path relativo no bucket GCS
 */
function buildGcsPath(source, endpoint, runId, page = 1) {
  const now = new Date();
  const ano = now.getFullYear().toString();
  const mes = String(now.getMonth() + 1).padStart(2, "0");
  const entidade = endpoint.name || "default";
  const fileName = `${runId}_p${page}.json`;

  // Template definido na fonte (substitui placeholders)
  const template = source.gcs_path || `${source.id}/{endpoint_name}/{ano}/{mes}`;
  const pathBase = template
    .replace("{endpoint_name}", entidade)
    .replace("{ano}", ano)
    .replace("{mes}", mes)
    .replace("{source_id}", source.id);

  return `${pathBase}/${fileName}`;
}

// ============================================================
// BLOCO 6 — Idempotência (verificação se blob já existe no GCS)
// ============================================================

/**
 * Verifica se um blob já existe no GCS (idempotência).
 * Permite pular re-ingestão de dados já presentes.
 *
 * @param {string} gcsPath - caminho do blob no bucket
 * @returns {boolean}      - true se já existir
 */
async function blobExists(gcsPath) {
  try {
    const [exists] = await bucket.file(gcsPath).exists();
    return exists;
  } catch {
    return false;
  }
}

// ============================================================
// BLOCO 7 — Gravação no GCS
// ============================================================

/**
 * Grava um objeto JSON no GCS como blob (application/json).
 * Adiciona metadata de rastreabilidade (source_id, endpoint, timestamp).
 *
 * @param {string} gcsPath  - caminho do blob no bucket
 * @param {object} data     - dados a gravar
 * @param {object} meta     - metadados adicionais para o blob
 */
async function writeToGcs(gcsPath, data, meta = {}) {
  const payload = JSON.stringify(
    {
      _meta: {
        ingested_at: new Date().toISOString(),
        bucket: BUCKET_RAW,
        path: gcsPath,
        ...meta,
      },
      data,
    },
    null,
    0 // sem indentação para economizar bytes
  );

  const file = bucket.file(gcsPath);
  await file.save(payload, {
    contentType: "application/json",
    metadata: {
      source_id: meta.source_id || "unknown",
      endpoint_name: meta.endpoint_name || "unknown",
      ingested_at: new Date().toISOString(),
    },
  });

  return Buffer.byteLength(payload, "utf-8");
}

// ============================================================
// BLOCO 8 — Execução de um endpoint específico
// ============================================================

/**
 * Executa a ingestão de um único endpoint de uma fonte.
 * Aplica auth, paginação simples e idempotência GCS.
 *
 * @param {object} source    - objeto da fonte (do arsenal)
 * @param {object} endpoint  - objeto do endpoint específico
 * @param {object} ctx       - contexto: { runId, since, force, dryRun }
 */
async function ingestEndpoint(source, endpoint, ctx) {
  const { runId, since, force, dryRun } = ctx;
  const startMs = Date.now();

  // Verifica se é FTP ou BigQuery — tipos especiais (apenas log por enquanto)
  if (source.base_url?.startsWith("ftp://")) {
    log("INFO", "endpoint_skip_ftp", { source_id: source.id, endpoint: endpoint.name });
    return { source_id: source.id, endpoint: endpoint.name, status: "skip_ftp" };
  }

  if (source.auth?.type === "oauth" && source.bigquery_table) {
    log("INFO", "endpoint_skip_bigquery", {
      source_id: source.id,
      endpoint: endpoint.name,
      bigquery_table: source.bigquery_table || endpoint.bigquery_table,
    });
    return { source_id: source.id, endpoint: endpoint.name, status: "skip_bigquery" };
  }

  // Constrói URL base
  let urlStr = source.base_url.replace(/\/+$/, "") + endpoint.path;

  // Substitui path params com valores de contexto (ano, mes, etc.)
  const now = new Date();
  urlStr = urlStr
    .replace("{ano}", now.getFullYear().toString())
    .replace("{mes}", String(now.getMonth() + 1).padStart(2, "0"))
    .replace("{AAAAMMDD}", now.toISOString().slice(0, 10).replace(/-/g, ""));

  // Não tenta se ainda tiver path params não resolvidos (ex: {cnpj}, {codigo})
  if (urlStr.includes("{") && urlStr.includes("}")) {
    log("DEBUG", "endpoint_skip_param_obrigatorio", {
      source_id: source.id,
      endpoint: endpoint.name,
      url: urlStr,
      motivo: "endpoint parametrizado requer chamada com params específicos",
    });
    return { source_id: source.id, endpoint: endpoint.name, status: "skip_parametrizado" };
  }

  const url = new URL(urlStr);

  // Adiciona parâmetro de data "desde" se especificado na CLI
  if (since) {
    url.searchParams.set("dataInicial", since);
    url.searchParams.set("dataIdaDe", since);
  }

  // Resolve autenticação (pode adicionar query params ou headers)
  const authHeaders = resolveAuthHeaders(source.auth, url);

  // Verifica idempotência
  const page = 1;
  const gcsPath = buildGcsPath(source, endpoint, runId, page);
  if (!force && await blobExists(gcsPath)) {
    log("INFO", "endpoint_skip_ja_existe", { source_id: source.id, endpoint: endpoint.name, gcs_path: gcsPath });
    return { source_id: source.id, endpoint: endpoint.name, status: "skip_existente", gcs_path: gcsPath };
  }

  if (dryRun) {
    log("INFO", "dry_run_endpoint", {
      source_id: source.id,
      endpoint: endpoint.name,
      url: url.toString().slice(0, 120),
      gcs_path: gcsPath,
    });
    return { source_id: source.id, endpoint: endpoint.name, status: "dry_run" };
  }

  // Executa requisição HTTP com retry
  let response;
  try {
    response = await fetchWithRetry(url, { headers: authHeaders });
  } catch (err) {
    log("ERROR", "endpoint_falha_http", {
      source_id: source.id,
      endpoint: endpoint.name,
      url: url.toString().slice(0, 120),
      erro: String(err.message),
      latency_ms: Date.now() - startMs,
    });
    return { source_id: source.id, endpoint: endpoint.name, status: "erro", erro: String(err.message) };
  }

  // Lê body como texto (para suportar JSON e XML)
  const bodyText = await response.text();
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    // Não-JSON (XML, CSV, HTML) — armazena como string
    data = { _raw_text: bodyText, _content_type: response.headers.get("content-type") };
  }

  // Grava no GCS
  const bytesGravados = await writeToGcs(gcsPath, data, {
    source_id: source.id,
    endpoint_name: endpoint.name,
    url: url.toString().slice(0, 200),
    priority: source.priority,
  });

  const latencyMs = Date.now() - startMs;
  log("INFO", "endpoint_ok", {
    source_id: source.id,
    endpoint: endpoint.name,
    gcs_path: gcsPath,
    bytes: bytesGravados,
    latency_ms: latencyMs,
    status: response.status,
  });

  return {
    source_id: source.id,
    endpoint: endpoint.name,
    status: "ok",
    gcs_path: gcsPath,
    bytes: bytesGravados,
    latency_ms: latencyMs,
  };
}

// ============================================================
// BLOCO 9 — Execução de uma fonte completa (todos endpoints)
// ============================================================

/**
 * Executa todos os endpoints de uma fonte com worker pool (pLimit).
 * Respeita o rate limit configurado na fonte (concurrent por fonte).
 *
 * @param {string} sourceId   - ID da fonte (ex: "cgu_portal_transparencia")
 * @param {object} options    - { since, force, dryRun }
 * @param {Array}  [catalog]  - catálogo opcional (carrega arsenal se omitido)
 * @returns {object}          - resultado agregado da fonte
 */
async function runSource(sourceId, options = {}, catalog = null) {
  const arsenal = catalog || loadArsenal();
  const source = arsenal.sources.find((s) => s.id === sourceId);

  if (!source) {
    throw new Error(`Fonte '${sourceId}' não encontrada no arsenal.`);
  }

  const runId = buildRunId();
  const concurrent = Math.min(
    source.rate_limit?.concurrent || MAX_CONCURRENT_PER_SOURCE,
    MAX_CONCURRENT_PER_SOURCE
  );
  const limit = pLimit(concurrent);
  const ctx = { runId, ...options };

  log("INFO", "fonte_inicio", {
    source_id: sourceId,
    nome: source.name,
    priority: source.priority,
    total_endpoints: source.endpoints.length,
    concurrent,
  });

  const startMs = Date.now();
  const tasks = source.endpoints.map((ep) => limit(() => ingestEndpoint(source, ep, ctx)));
  const results = await Promise.all(tasks);

  const resumo = {
    source_id: sourceId,
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    skip: results.filter((r) => r.status.startsWith("skip")).length,
    erro: results.filter((r) => r.status === "erro").length,
    duration_ms: Date.now() - startMs,
  };

  log("INFO", "fonte_concluida", resumo);
  return resumo;
}

// ============================================================
// BLOCO 10 — Execução de todas as fontes por prioridade
// ============================================================

/**
 * Executa todas as fontes de uma determinada prioridade em paralelo.
 * Cada fonte tem seu próprio pLimit interno (worker pool isolado por fonte).
 *
 * @param {string} priority  - "P0", "P1", "P2" ou "P3"
 * @param {object} options   - { since, force, dryRun }
 * @returns {Array}          - resultados por fonte
 */
async function runAll(priority = "P0", options = {}) {
  const arsenal = loadArsenal();
  const selected = selectSources(arsenal.sources, { priority });

  if (selected.length === 0) {
    log("WARN", "nenhuma_fonte_selecionada", { priority });
    return [];
  }

  log("INFO", "run_all_inicio", {
    priority,
    fontes_selecionadas: selected.length,
    ids: selected.map((s) => s.id),
  });

  const startMs = Date.now();

  // Executa todas as fontes selecionadas em paralelo
  // (cada fonte já tem seu worker pool interno via pLimit)
  const results = await Promise.allSettled(
    selected.map((source) => runSource(source.id, options, arsenal))
  );

  const resumos = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    log("ERROR", "fonte_excecao", {
      source_id: selected[i].id,
      erro: String(r.reason?.message || r.reason),
    });
    return { source_id: selected[i].id, status: "excecao", erro: String(r.reason?.message) };
  });

  const totais = resumos.reduce(
    (acc, r) => {
      acc.total += r.total || 0;
      acc.ok += r.ok || 0;
      acc.skip += r.skip || 0;
      acc.erro += r.erro || 0;
      return acc;
    },
    { total: 0, ok: 0, skip: 0, erro: 0 }
  );

  log("INFO", "run_all_concluido", {
    priority,
    duration_ms: Date.now() - startMs,
    ...totais,
  });

  return resumos;
}

// ============================================================
// BLOCO 11 — Logger estruturado
// ============================================================

/**
 * Logger estruturado com timestamp ISO, nível, evento e payload JSON.
 * Formato compatível com Cloud Logging / Stackdriver.
 *
 * Exemplo de saída:
 * {"timestamp":"2026-04-29T18:00:00.123Z","severity":"INFO","event":"endpoint_ok","source_id":"cgu_portal_transparencia",...}
 *
 * @param {"DEBUG"|"INFO"|"WARN"|"ERROR"} severity
 * @param {string} event   - identificador do evento (snake_case)
 * @param {object} payload - dados adicionais
 */
function log(severity, event, payload = {}) {
  // Suprime DEBUG se não estiver em modo verbose
  if (severity === "DEBUG" && !process.env.LOG_VERBOSE) return;

  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    severity,
    event,
    ...payload,
  });

  if (severity === "ERROR" || severity === "WARN") {
    process.stderr.write(entry + "\n");
  } else {
    process.stdout.write(entry + "\n");
  }
}

// ============================================================
// BLOCO 12 — Utilitários
// ============================================================

/**
 * Gera um ID de execução único baseado em timestamp.
 * Formato: run_<YYYYMMDDTHHmmss>
 */
function buildRunId() {
  const now = new Date();
  const ts = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "T")
    .slice(0, 15);
  return `run_${ts}`;
}

/**
 * Exibe lista de todas as fontes disponíveis no arsenal.
 * @param {Array} sources
 */
function printSourcesList(sources) {
  process.stdout.write(`\nFontes disponíveis no arsenal (${sources.length} total):\n\n`);
  const byPriority = {};
  for (const s of sources) {
    const p = s.priority || "?";
    if (!byPriority[p]) byPriority[p] = [];
    byPriority[p].push(s);
  }
  for (const p of ["P0", "P1", "P2", "P3"]) {
    const group = byPriority[p] || [];
    process.stdout.write(`  ${p} (${group.length}):\n`);
    for (const s of group) {
      process.stdout.write(`    - ${s.id.padEnd(40)} ${s.name}\n`);
    }
  }
  process.stdout.write("\n");
}

// ============================================================
// BLOCO 13 — CLI (ponto de entrada)
// ============================================================

/**
 * Ponto de entrada via linha de comando.
 *
 * Flags suportadas:
 *   --priority P0|P1|P2|P3   Executa todas as fontes até essa prioridade
 *   --source   <id>           Executa apenas a fonte especificada
 *   --since    YYYY-MM-DD     Data de início para endpoints que aceitam dataInicial
 *   --force                   Ignora idempotência (re-ingere mesmo se blob existe)
 *   --dry-run                 Apenas loga o que seria ingerido, sem gravar no GCS
 *   --list                    Lista todas as fontes disponíveis e sai
 *   --arsenal  <path>         Usa arquivo arsenal_apis.json alternativo
 */
async function main() {
  const { values } = parseArgs({
    options: {
      priority: { type: "string", default: undefined },
      source:   { type: "string", default: undefined },
      since:    { type: "string", default: undefined },
      force:    { type: "boolean", default: false },
      "dry-run":{ type: "boolean", default: false },
      list:     { type: "boolean", default: false },
      arsenal:  { type: "string", default: ARSENAL_PATH },
    },
    allowPositionals: false,
    strict: true,
  });

  // Carrega arsenal (pode ser path alternativo)
  const arsenal = loadArsenal(values.arsenal);

  // --list: apenas exibe as fontes disponíveis
  if (values.list) {
    printSourcesList(arsenal.sources);
    process.exit(0);
  }

  // Validação: --priority ou --source é obrigatório
  if (!values.priority && !values.source) {
    process.stderr.write(
      "Erro: informe --priority (P0|P1|P2|P3) ou --source <id>.\n" +
      "Use --list para ver fontes disponíveis.\n"
    );
    process.exit(1);
  }

  // Contexto de execução compartilhado
  const ctx = {
    since:  values.since,
    force:  values.force,
    dryRun: values["dry-run"],
  };

  // Log de início com configuração
  log("INFO", "cli_inicio", {
    priority: values.priority,
    source:   values.source,
    since:    values.since,
    force:    values.force,
    dry_run:  values["dry-run"],
    bucket:   BUCKET_RAW,
  });

  let results;

  if (values.source) {
    // Modo: fonte única
    const resumo = await runSource(values.source, ctx, arsenal);
    results = [resumo];
  } else {
    // Modo: todas as fontes até a prioridade especificada
    results = await runAll(values.priority, ctx);
  }

  // Sumário final no stdout
  const total = results.reduce((a, r) => a + (r.total || 0), 0);
  const ok    = results.reduce((a, r) => a + (r.ok    || 0), 0);
  const skip  = results.reduce((a, r) => a + (r.skip  || 0), 0);
  const erro  = results.reduce((a, r) => a + (r.erro  || 0), 0);

  log("INFO", "execucao_finalizada", {
    total_endpoints: total,
    ok,
    skip,
    erro,
    exitCode: erro > 0 ? 1 : 0,
  });

  process.exit(erro > 0 ? 1 : 0);
}

// Executa se for o script principal (não importado como módulo)
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    log("ERROR", "erro_fatal", { mensagem: String(err.message), stack: err.stack });
    process.exit(1);
  });
}

// ============================================================
// Exports para uso como módulo em outros scripts
// ============================================================
export { loadArsenal, runSource, runAll, ingestEndpoint, log, buildRunId, BUCKET_RAW };
