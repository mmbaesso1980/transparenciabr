#!/usr/bin/env node
/**
 * TBR Score Engine — engines/analysis/score_engine.js
 *
 * Calcula score de risco 0-100 para uma nota fiscal CEAP / contrato público /
 * emenda PIX e roteia para o LLM correto conforme nível de risco.
 *
 * Roteamento:
 *   score < 60  → Ollama local (gemma2:27b-instruct-q4_K_M), 1 passada
 *   60 ≤ s < 85 → Ollama local, 2 passadas (auditoria reforçada)
 *   score ≥ 85  → Vertex Gemini 2.5 Pro (Líder Supremo agent_1777236402725), hard cap US$ 95/mês
 *
 * Schema BigQuery de saída — tbr.analysis.score_results:
 *   id          STRING    NOT NULL  -- identificador da nota fiscal
 *   score       INT64     NOT NULL  -- score final 0-100
 *   components  JSON      NOT NULL  -- subscores { anomalia_estatistica, padrao_repetido, ... }
 *   llm_used    STRING    NOT NULL  -- 'ollama_1p' | 'ollama_2p' | 'vertex' | 'ollama_fallback'
 *   nivel       INT64     NOT NULL  -- 1 (baixo) | 3 (médio) | 5 (alto)
 *   analise     JSON                -- resultado bruto do LLM
 *   created_at  TIMESTAMP NOT NULL  -- UTC
 *
 * Pesos dos componentes (soma = 100):
 *   anomalia_estatistica  25  z-score gasto vs. pares (cargo/UF/mês)
 *   padrao_repetido       20  mesmo CNPJ em ≥ 3 parlamentares no mês
 *   vinculo_societario    25  sócio é servidor/parlamentar/parente [stub v1 → TODO v2]
 *   doc_divergente        15  OCR confidence < thresholds
 *   denuncia_externa      15  CPF/CNPJ em atos DOU/CGU últimos 24 meses
 */

import { BigQuery } from '@google-cloud/bigquery';
import { Storage }  from '@google-cloud/storage';
import { parseArgs } from 'node:util';
import pLimit from 'p-limit';

// ---------------------------------------------------------------------------
// Configurações globais
// ---------------------------------------------------------------------------

const PROJECT         = process.env.GCP_PROJECT             || 'transparenciabr';
const GCS_BUCKET      = process.env.GCS_BUCKET              || 'datalake-tbr-clean';
const OLLAMA_URL      = process.env.OLLAMA_URL               || 'http://localhost:11434';
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL             || 'gemma2:27b-instruct-q4_K_M';
/** Mesmo Agent Builder que Cloud Functions / Genkit — não inventar IDs alternativos. */
const SUPREME_AGENT_ID =
  process.env.VERTEX_SUPREME_AGENT_ID || 'agent_1777236402725';
const VERTEX_MODEL =
  process.env.VERTEX_MODEL || 'gemini-2.5-pro';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const VERTEX_CAP      = parseFloat(process.env.VERTEX_MONTHLY_CAP_USD || '95');
const BATCH_CONC      = parseInt(process.env.BATCH_CONCURRENCY         || '10', 10);
const DRY_RUN         = process.env.DRY_RUN === '1';

const bq  = new BigQuery({ projectId: PROJECT });
const gcs = new Storage();

// ---------------------------------------------------------------------------
// Logger estruturado JSON
// ---------------------------------------------------------------------------

const LOG_LEVELS   = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = LOG_LEVELS[(process.env.LOG_LEVEL || 'INFO').toUpperCase()] ?? 1;

function log(level, msg, extra = {}) {
  if ((LOG_LEVELS[level] ?? 0) < currentLevel) return;
  const entry = { timestamp: new Date().toISOString(), severity: level, engine: 'score_engine', message: msg, ...extra };
  (level === 'ERROR' ? process.stderr : process.stdout).write(JSON.stringify(entry) + '\n');
}

const logger = {
  debug: (msg, x) => log('DEBUG', msg, x),
  info:  (msg, x) => log('INFO',  msg, x),
  warn:  (msg, x) => log('WARN',  msg, x),
  error: (msg, x) => log('ERROR', msg, x),
};

// ---------------------------------------------------------------------------
// Helper BigQuery — executa query parametrizada e retorna rows
// ---------------------------------------------------------------------------

async function bqQuery(sql, params = {}) {
  const queryParameters = Object.entries(params).map(([name, value]) => {
    const type = typeof value === 'number'
      ? (Number.isInteger(value) ? 'INT64' : 'FLOAT64')
      : 'STRING';
    return { name, parameterType: { type }, parameterValue: { value: String(value) } };
  });

  const [job] = await bq.createQueryJob({
    query: sql,
    queryParameters: queryParameters.length ? queryParameters : undefined,
    useLegacySql: false,
    location: 'US',
  });
  const [rows] = await job.getQueryResults();
  return rows;
}

// ---------------------------------------------------------------------------
// Componente 1 — Anomalia estatística (peso 25)
//
// Compara o valor da nota com a média/desvio dos pares (mesmo cargo, UF, mês).
// Fórmula: min(100, |z| * 30)
// ---------------------------------------------------------------------------

export async function scoreAnomaliaEstatistica(nota) {
  const { valor_documento, cargo, uf, mes } = nota;
  if (!valor_documento || !cargo || !uf || !mes) return 0;

  const sql = `
    SELECT AVG(valor_documento) AS media, STDDEV_SAMP(valor_documento) AS desvio
    FROM \`${PROJECT}.ceap.notas_fato\`
    WHERE cargo = @cargo AND uf = @uf
      AND FORMAT_DATE('%Y-%m', data_emissao) = @mes
      AND valor_documento > 0
  `;
  try {
    const [row] = await bqQuery(sql, { cargo, uf, mes });
    const { media, desvio } = row || {};
    if (!media || !desvio || desvio === 0) return 0;
    const z     = Math.abs((valor_documento - media) / desvio);
    const score = Math.min(100, Math.round(z * 30));
    logger.debug('scoreAnomaliaEstatistica', { z, score, media, desvio });
    return score;
  } catch (err) {
    logger.warn('scoreAnomaliaEstatistica falhou', { error: err.message });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Componente 2 — Padrão repetido (peso 20)
//
// COUNT(DISTINCT cpf_parlamentar) por cnpj_fornecedor/mês.
// N ≥ 3 → score = 70 + 10 * min(N - 3, 3)
// ---------------------------------------------------------------------------

export async function scorePadraoRepetido(nota) {
  const { cnpj_fornecedor, mes } = nota;
  if (!cnpj_fornecedor || !mes) return 0;

  const sql = `
    SELECT COUNT(DISTINCT cpf_parlamentar) AS n_parlamentares
    FROM \`${PROJECT}.ceap.notas_fato\`
    WHERE cnpj_fornecedor = @cnpj
      AND FORMAT_DATE('%Y-%m', data_emissao) = @mes
  `;
  try {
    const [row] = await bqQuery(sql, { cnpj: cnpj_fornecedor, mes });
    const n = Number(row?.n_parlamentares ?? 0);
    if (n < 3) return 0;
    const score = Math.min(100, 70 + 10 * Math.min(n - 3, 3));
    logger.debug('scorePadraoRepetido', { n, score, cnpj: cnpj_fornecedor });
    return score;
  } catch (err) {
    logger.warn('scorePadraoRepetido falhou', { error: err.message });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Componente 3 — Vínculo societário (peso 25) — STUB v1
//
// TODO v2: cruzar QSA Receita Federal × RAIS × parentes_declarados.
//   - JOIN tbr.receita.qsa (sócios por CNPJ) × tbr.rais.vinculos (CPF servidores)
//   - JOIN × tbr.tse.bens_declarados (parentes declarados por parlamentar)
//   - Score proporcional: parente=80, servidor=60, parlamentar=90
// Requer ingestão do dump Receita (~85 GB) e RAIS individualizada (br_me_rais).
// ---------------------------------------------------------------------------

export async function scoreVinculoSocietario(_nota) {
  // TODO v2 — retorna 0 enquanto pipeline RAIS + QSA não está disponível.
  return 0;
}

// ---------------------------------------------------------------------------
// Componente 4 — Documento divergente (peso 15)
//
// Avalia confiança do OCR: se confidence < 0.5 → 90; < 0.7 → 60;
// < 0.85 → 30; caso contrário → 0. Sem campo OCR: retorna 0.
// ---------------------------------------------------------------------------

export function scoreDocDivergente(nota) {
  const conf = nota.ocr_confidence;
  if (conf === undefined || conf === null) return 0;
  const c = Number(conf);
  if (c < 0.5)  return 90;
  if (c < 0.7)  return 60;
  if (c < 0.85) return 30;
  return 0;
}

// ---------------------------------------------------------------------------
// Componente 5 — Denúncia externa (peso 15)
//
// Verifica se CPF/CNPJ constam em atos DOU (sanção, condenação, TAC)
// publicados nos últimos 24 meses.
// ---------------------------------------------------------------------------

export async function scoreDenunciaExterna(nota) {
  const { cpf_parlamentar, cnpj_fornecedor } = nota;
  if (!cpf_parlamentar && !cnpj_fornecedor) return 0;

  const dataLimite = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 24);
    return d.toISOString().slice(0, 10);
  })();

  const ids    = [cpf_parlamentar, cnpj_fornecedor].filter(Boolean);
  const termos = ids.map(id => `REGEXP_CONTAINS(texto, r'${id.replace(/\D/g, '')}')`).join(' OR ');

  const sql = `
    SELECT COUNT(*) AS total
    FROM \`${PROJECT}.dou.atos\`
    WHERE tipo IN ('sancao','condenacao','tac')
      AND data_publicacao >= DATE('${dataLimite}')
      AND (${termos})
  `;
  try {
    const [row] = await bqQuery(sql);
    const total = Number(row?.total ?? 0);
    const score = total > 0 ? Math.min(100, 50 + total * 10) : 0;
    logger.debug('scoreDenunciaExterna', { total, score });
    return score;
  } catch (err) {
    logger.warn('scoreDenunciaExterna falhou', { error: err.message });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Score agregado — pesos: anomalia 25, repetido 20, societario 25,
//                         doc 15, denuncia 15 (soma = 100)
// ---------------------------------------------------------------------------

export async function computeScore(nota) {
  logger.info('computeScore: iniciando', { nota_id: nota.id });

  const [s1, s2, s3, s4, s5] = await Promise.all([
    scoreAnomaliaEstatistica(nota),
    scorePadraoRepetido(nota),
    scoreVinculoSocietario(nota),
    Promise.resolve(scoreDocDivergente(nota)),
    scoreDenunciaExterna(nota),
  ]);

  const finalScore = Math.round(
    (s1 * 25 + s2 * 20 + s3 * 25 + s4 * 15 + s5 * 15) / 100
  );

  // nivel: 1 = baixo (<60), 3 = médio (60-84), 5 = alto Risco 5 (≥85)
  const nivel = finalScore >= 85 ? 5 : finalScore >= 60 ? 3 : 1;

  const result = {
    score: finalScore,
    components: {
      anomalia_estatistica: s1,
      padrao_repetido:      s2,
      vinculo_societario:   s3,
      doc_divergente:       s4,
      denuncia_externa:     s5,
    },
    nivel,
  };

  logger.info('computeScore: concluído', { nota_id: nota.id, score: finalScore, nivel });
  return result;
}

// ---------------------------------------------------------------------------
// Prompts Ollama por tipo de análise
// ---------------------------------------------------------------------------

const PROMPTS_OLLAMA = {
  classificacao_simples: (
    'Classifique esta nota em 1 das 4 categorias: legítima, suspeita_baixa, suspeita_média, ' +
    'suspeita_alta. Responda estritamente em JSON: {"categoria":"...","justificativa_curta":"..."}'
  ),
  auditoria_p1: (
    'Audite esta nota com rigor forense: identifique exatamente 3 anomalias específicas. ' +
    'JSON: {"anomalias":["...","...","..."],"precisa_p2":true|false,"nivel_urgencia":"baixo|medio|alto"}'
  ),
  auditoria_p2: (
    'Segunda passada de auditoria forense. Considere o campo contexto_p1 da primeira passada. ' +
    'JSON: {"veredito":"...","evidências":["..."],"recomendacao_acao":"..."}'
  ),
  auditoria_p2_fallback: (
    'Auditoria forense em passada única (Vertex indisponível — hard cap atingido). ' +
    'JSON: {"veredito":"...","evidências":["..."],"recomendacao_acao":"..."}'
  ),
};

// ---------------------------------------------------------------------------
// callOllama — chama Ollama via API OpenAI-compatible
// ---------------------------------------------------------------------------

export async function callOllama(payload, promptType) {
  const systemPrompt = PROMPTS_OLLAMA[promptType];
  if (!systemPrompt) throw new Error(`Tipo de prompt Ollama desconhecido: ${promptType}`);

  logger.info('callOllama', { model: OLLAMA_MODEL, prompt_type: promptType, nota_id: payload.id });

  const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:           OLLAMA_MODEL,
      messages:        [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: JSON.stringify(payload) },
      ],
      temperature:     0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data    = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Ollama retornou resposta vazia');

  let parsed;
  try   { parsed = JSON.parse(content); }
  catch { parsed = { texto_bruto: content }; }

  parsed._llm_used    = 'ollama';
  parsed._model       = OLLAMA_MODEL;
  parsed._prompt_type = promptType;
  return parsed;
}

// ---------------------------------------------------------------------------
// getVertexMonthlySpent — soma custo_usd do mês corrente em audit.vertex_calls
// Retorna 0 se a tabela ainda não existir.
// ---------------------------------------------------------------------------

export async function getVertexMonthlySpent() {
  const mes = new Date().toISOString().slice(0, 7);
  const sql = `
    SELECT COALESCE(SUM(custo_usd), 0) AS total_usd
    FROM \`${PROJECT}.audit.vertex_calls\`
    WHERE FORMAT_TIMESTAMP('%Y-%m', created_at) = '${mes}'
  `;
  try {
    const [row] = await bqQuery(sql);
    const total = Number(row?.total_usd ?? 0);
    logger.debug('getVertexMonthlySpent', { mes, total_usd: total });
    return total;
  } catch (err) {
    logger.warn('getVertexMonthlySpent: tabela ausente ou erro, assumindo 0', { error: err.message });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// callVertex — Gemini 2.5 Pro via Vertex AI REST (ADC), persona Líder Supremo.
// Registra custo estimado em tbr.audit.vertex_calls.
// ---------------------------------------------------------------------------

export async function callVertex(payload) {
  logger.info('callVertex', {
    model: VERTEX_MODEL,
    agent_id: SUPREME_AGENT_ID,
    nota_id: payload.id,
  });

  // Obtém token Application Default Credentials
  let token = '';
  try {
    const { GoogleAuth } = await import('google-auth-library');
    const client = await new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    }).getClient();
    token = (await client.getAccessToken()).token || '';
  } catch (err) {
    throw new Error(`Vertex ADC falhou: ${err.message}`);
  }

  const endpoint =
    `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/` +
    `${PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/` +
    `${VERTEX_MODEL}:generateContent`;

  const systemInstruction =
    `Voce e o Lider Supremo A.S.M.O.D.E.U.S. (Agent ID ${SUPREME_AGENT_ID}). ` +
    'Motor Gemini 2.5 Pro via Vertex — unico auditor forense; nao invoque modelos legados. ' +
    'Analise a nota com maximo rigor. ' +
    'JSON: {"veredito":"...","evidências":["..."],"recomendacao_acao":"...","nivel_risco_confirmado":1}';

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      contents:          [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig:  { temperature: 0.1, responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Vertex HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data    = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Vertex retornou resposta vazia');

  let parsed;
  try   { parsed = JSON.parse(content); }
  catch { parsed = { texto_bruto: content }; }

  // Estima custo aproximado (ajustar se pricing Vertex mudar para gemini-2.5-pro)
  const inputTokens  = data?.usageMetadata?.promptTokenCount     || 0;
  const outputTokens = data?.usageMetadata?.candidatesTokenCount || 0;
  const custoUsd     = (inputTokens * 0.00000125) + (outputTokens * 0.00000375);

  if (!DRY_RUN) {
    await bq.dataset('audit').table('vertex_calls').insert([{
      model: VERTEX_MODEL, input_tokens: inputTokens, output_tokens: outputTokens,
      custo_usd: custoUsd, created_at: BigQuery.timestamp(new Date()),
    }]).catch(err => logger.warn('registrar vertex_calls falhou', { error: err.message }));
  }

  parsed._llm_used      = 'vertex';
  parsed._model         = VERTEX_MODEL;
  parsed._custo_usd     = custoUsd;
  parsed._input_tokens  = inputTokens;
  parsed._output_tokens = outputTokens;
  return parsed;
}

// ---------------------------------------------------------------------------
// routeAndAnalyze — decide qual LLM usar com base no score final
// ---------------------------------------------------------------------------

export async function routeAndAnalyze(notaFiscal, score) {
  logger.info('routeAndAnalyze', { nota_id: notaFiscal.id, score });

  if (score < 60) {
    // Risco baixo — classificação simples em 1 passada Ollama
    const result = await callOllama(notaFiscal, 'classificacao_simples');
    result._llm_used = 'ollama_1p';
    return result;
  }

  if (score < 85) {
    // Risco médio — auditoria reforçada em 2 passadas Ollama
    const passada1 = await callOllama(notaFiscal, 'auditoria_p1');
    const passada2 = await callOllama({ ...notaFiscal, contexto_p1: passada1 }, 'auditoria_p2');
    passada2._llm_used = 'ollama_2p';
    passada2._passada1 = passada1;
    return passada2;
  }

  // Risco alto — verifica hard cap antes de escalar para Vertex
  const gastoMensal = await getVertexMonthlySpent();
  if (gastoMensal >= VERTEX_CAP) {
    logger.warn('Vertex hard cap atingido; rebaixando para local', {
      gasto_mensal_usd: gastoMensal, cap_usd: VERTEX_CAP,
    });
    const result = await callOllama(notaFiscal, 'auditoria_p2_fallback');
    result._llm_used     = 'ollama_fallback';
    result._cap_atingido = true;
    result._gasto_mensal = gastoMensal;
    return result;
  }

  // Vertex disponível
  const result = await callVertex(notaFiscal);
  result._llm_used = 'vertex';
  return result;
}

// ---------------------------------------------------------------------------
// fetchNota — busca nota fiscal no BigQuery
// ---------------------------------------------------------------------------

async function fetchNota(notaId) {
  const sql  = `SELECT * FROM \`${PROJECT}.ceap.notas_fato\` WHERE id = @id LIMIT 1`;
  const rows = await bqQuery(sql, { id: notaId });
  if (!rows?.length) throw new Error(`Nota fiscal não encontrada: ${notaId}`);
  return rows[0];
}

// ---------------------------------------------------------------------------
// persistResult — grava no BigQuery (score_results) e GCS (veredito bruto)
// ---------------------------------------------------------------------------

async function persistResult(notaId, scoreResult, analysis) {
  if (DRY_RUN) {
    logger.info('persistResult: DRY_RUN ativo, pulando gravação', { nota_id: notaId });
    return;
  }

  const now = new Date();
  const [ano, mes] = [now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, '0')];

  // BigQuery — tbr.analysis.score_results
  await bq.dataset('analysis').table('score_results').insert([{
    id:         notaId,
    score:      scoreResult.score,
    components: JSON.stringify(scoreResult.components),
    llm_used:   analysis._llm_used || 'unknown',
    nivel:      scoreResult.nivel,
    analise:    JSON.stringify(analysis),
    created_at: BigQuery.timestamp(now),
  }]).catch(err => logger.error('persistResult: falha BigQuery', { nota_id: notaId, error: err.message }));

  // GCS — gs://datalake-tbr-clean/analysis/<ano>/<mes>/<id>.json
  const gcsPath = `analysis/${ano}/${mes}/${notaId}.json`;
  await gcs.bucket(GCS_BUCKET).file(gcsPath).save(
    JSON.stringify({ nota_id: notaId, ...scoreResult, llm_used: analysis._llm_used,
                     analise: analysis, gravado_em: now.toISOString() }, null, 2),
    { contentType: 'application/json' }
  ).catch(err => logger.error('persistResult: falha GCS', { nota_id: notaId, error: err.message }));

  logger.info('persistResult: concluído', {
    nota_id: notaId,
    gcs_uri: `gs://${GCS_BUCKET}/${gcsPath}`,
  });
}

// ---------------------------------------------------------------------------
// processNotaFiscal — pipeline completo para uma nota
// ---------------------------------------------------------------------------

export async function processNotaFiscal(notaId) {
  logger.info('processNotaFiscal: iniciando', { nota_id: notaId });
  const nota        = await fetchNota(notaId);
  const scoreResult = await computeScore(nota);
  const analysis    = await routeAndAnalyze(nota, scoreResult.score);
  await persistResult(notaId, scoreResult, analysis);
  const output = { nota_id: notaId, ...scoreResult, llm_used: analysis._llm_used || 'unknown' };
  logger.info('processNotaFiscal: concluído', output);
  return output;
}

// ---------------------------------------------------------------------------
// processBatch — processa lote de notas sem score calculado
// ---------------------------------------------------------------------------

export async function processBatch(batchQuery, limit) {
  const sql = batchQuery ||
    `SELECT id FROM \`${PROJECT}.ceap.notas_fato\` WHERE score IS NULL LIMIT ${limit}`;

  logger.info('processBatch: buscando pendentes', { limit });
  const rows = await bqQuery(sql);
  const ids  = rows.map(r => r.id).filter(Boolean);

  if (!ids.length) {
    logger.info('processBatch: nenhuma nota pendente');
    return { processadas: 0, erros: 0, total: 0 };
  }

  logger.info('processBatch: iniciando', { total: ids.length, concurrency: BATCH_CONC });
  const limiter = pLimit(BATCH_CONC);
  let processadas = 0, erros = 0;

  await Promise.all(ids.map((id, idx) => limiter(async () => {
    try {
      await processNotaFiscal(id);
      processadas++;
      if (processadas % 100 === 0) {
        logger.info('processBatch: progresso', {
          processadas, erros, total: ids.length,
          pct: Math.round((processadas / ids.length) * 100),
        });
      }
    } catch (err) {
      erros++;
      logger.error('processBatch: erro na nota', { nota_id: id, idx, error: err.message });
    }
  })));

  const summary = { processadas, erros, total: ids.length };
  logger.info('processBatch: concluído', summary);
  return summary;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values: cliArgs } = parseArgs({
  options: {
    nota:      { type: 'string'  },
    batch:     { type: 'string'  },
    limit:     { type: 'string',  default: '1000' },
    'dry-run': { type: 'boolean', default: false },
    model:     { type: 'string'  },
    help:      { type: 'boolean', default: false },
  },
  strict: false,
});

if (cliArgs.model)       process.env.OLLAMA_MODEL = cliArgs.model;
if (cliArgs['dry-run'])  process.env.DRY_RUN      = '1';

if (cliArgs.help) {
  process.stdout.write(`
TBR Score Engine — engines/analysis/score_engine.js

Uso:
  node score_engine.js --nota <id>
  node score_engine.js --batch [sql] --limit 500
  node score_engine.js --batch --dry-run --limit 10

Opções:
  --nota       ID da nota fiscal (processamento individual)
  --batch      Modo lote; SQL de seleção opcional (usa query padrão se omitido)
  --limit      Máximo de notas no lote (padrão: 1000)
  --dry-run    Calcula scores sem persistir resultados
  --model      Override de OLLAMA_MODEL
  --help       Exibe esta mensagem

Variáveis de ambiente: GCP_PROJECT, GCS_BUCKET, OLLAMA_URL, OLLAMA_MODEL,
  VERTEX_MODEL, VERTEX_LOCATION, VERTEX_MONTHLY_CAP_USD, BATCH_CONCURRENCY, DRY_RUN
`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      if (cliArgs.nota) {
        const result = await processNotaFiscal(cliArgs.nota);
        console.log(JSON.stringify(result, null, 2));
      } else if (cliArgs.batch !== undefined) {
        const sql = typeof cliArgs.batch === 'string' && cliArgs.batch.length > 0
          ? cliArgs.batch : null;
        const summary = await processBatch(sql, parseInt(cliArgs.limit, 10));
        console.log(JSON.stringify(summary, null, 2));
      } else {
        logger.error('Nenhuma ação especificada. Use --nota, --batch ou --help.');
        process.exit(1);
      }
    } catch (err) {
      logger.error('Erro fatal', { error: err.message, stack: err.stack });
      process.exit(1);
    }
  })();
}
