/**
 * @fileoverview Adapter Vertex AI — geração de tese jurídica via Gemini 2.5 Pro.
 *
 * Implementa hard-stop US$50/dia conforme padrão das demais Cloud Functions
 * do projeto TransparênciaBR. O controle é feito via documento Firestore
 * /vertex_daily_cap/{YYYY-MM-DD} com campo `total_usd_spent`.
 *
 * Modelo utilizado: gemini-2.5-pro-preview-05-06
 * (verificar nome exato em https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models)
 *
 * @module adapters/vertexProAdapter
 */

'use strict';

const { VertexAI } = require('@google-cloud/aiplatform');
const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

/** Projeto GCP */
const GCP_PROJECT = process.env.GCLOUD_PROJECT || 'transparenciabr';

/** Região Vertex AI */
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';

/**
 * Modelo Gemini 2.5 Pro.
 * Verificar nome atual em: https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models
 */
const GEMINI_MODEL = 'gemini-2.5-pro-preview-05-06';

/** Custo estimado por 1M tokens de OUTPUT (USD) — usado para controle de cap */
const COST_PER_1M_OUTPUT_TOKENS_USD = 10.00;

/** Custo estimado por 1M tokens de INPUT (USD) */
const COST_PER_1M_INPUT_TOKENS_USD = 1.25;

/** Hard-stop diário em USD */
const DAILY_CAP_USD = 50.00;

/**
 * @typedef {Object} TesesJuridicas
 * @property {string} tese                 - Tese principal fundamentada
 * @property {string[]} fundamentos        - Fundamentos legais (artigos, leis)
 * @property {string[]} jurisprudencias    - Precedentes e súmulas relevantes
 * @property {string[]} pedidos            - Pedidos a incluir na petição
 */

/**
 * Verifica se o gasto diário no Vertex atingiu o hard-stop.
 *
 * @returns {Promise<{blocked: boolean, totalUsd: number}>}
 */
async function checkDailyCap() {
  const db = getFirestore();
  const hoje = _getDataHoje();
  const capRef = db.doc(`vertex_daily_cap/${hoje}`);
  const snap = await capRef.get();

  if (!snap.exists) {
    return { blocked: false, totalUsd: 0 };
  }

  const totalUsd = snap.data().total_usd_spent || 0;
  return {
    blocked: totalUsd >= DAILY_CAP_USD,
    totalUsd,
  };
}

/**
 * Registra custo de uma chamada Vertex no acumulador diário.
 *
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {Promise<number>} Custo estimado em USD desta chamada
 */
async function _registrarCusto(inputTokens, outputTokens) {
  const db = getFirestore();
  const hoje = _getDataHoje();
  const capRef = db.doc(`vertex_daily_cap/${hoje}`);

  const custoUsd =
    (inputTokens / 1_000_000) * COST_PER_1M_INPUT_TOKENS_USD +
    (outputTokens / 1_000_000) * COST_PER_1M_OUTPUT_TOKENS_USD;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(capRef);
    const atual = snap.exists ? (snap.data().total_usd_spent || 0) : 0;
    tx.set(
      capRef,
      {
        total_usd_spent: atual + custoUsd,
        ultima_atualizacao: new Date().toISOString(),
        modelo: GEMINI_MODEL,
        projeto: GCP_PROJECT,
      },
      { merge: true }
    );
  });

  logger.info('vertexProAdapter._registrarCusto: custo registrado.', {
    inputTokens,
    outputTokens,
    custoUsd: custoUsd.toFixed(4),
    data: hoje,
  });

  return custoUsd;
}

/**
 * Gera tese jurídica fundamentada para petição de revisão de indeferimento INSS.
 *
 * @param {Object} leadData           - Dados do lead vindos do BigQuery
 * @param {string} leadData.cpf
 * @param {string} leadData.nome
 * @param {string} leadData.motivo_indeferimento
 * @param {string} leadData.especie_beneficio
 * @param {string} leadData.tipo_acao
 * @param {string} leadData.dt_indeferimento
 * @param {string} leadData.uf
 * @returns {Promise<TesesJuridicas>}
 * @throws {Error} Se daily-cap atingido ou Vertex API falhar
 */
async function generateLegalThesis(leadData) {
  // ── Verificação hard-stop ────────────────────────────────────────────────
  const { blocked, totalUsd } = await checkDailyCap();

  if (blocked) {
    logger.error('vertexProAdapter.generateLegalThesis: HARD-STOP US$50/dia atingido.', {
      totalUsd,
    });
    throw new Error(`VERTEX_DAILY_CAP_EXCEEDED: gasto diário de US$${totalUsd.toFixed(2)} atingiu o limite de US$${DAILY_CAP_USD}`);
  }

  logger.info('vertexProAdapter.generateLegalThesis: iniciando geração de tese.', {
    especie: leadData.especie_beneficio,
    tipo_acao: leadData.tipo_acao,
    motivo: leadData.motivo_indeferimento,
    gastoHoje: `US$${totalUsd.toFixed(2)}`,
  });

  // ── Construção do prompt ─────────────────────────────────────────────────
  const prompt = _buildPrompt(leadData);

  // ── Chamada Vertex AI ────────────────────────────────────────────────────
  const vertexAI = new VertexAI({ project: GCP_PROJECT, location: VERTEX_LOCATION });
  const model = vertexAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,       // baixo: respostas jurídicas devem ser precisas
      maxOutputTokens: 4096,
    },
    safetySettings: [
      // Sem filtros de conteúdo que possam bloquear linguagem jurídica
    ],
  });

  let response;
  try {
    response = await model.generateContent(prompt);
  } catch (err) {
    logger.error('vertexProAdapter.generateLegalThesis: erro na API Vertex.', {
      message: err.message,
    });
    throw new Error(`Vertex AI falhou: ${err.message}`);
  }

  // ── Parsing e registro de custo ──────────────────────────────────────────
  const candidate = response.response?.candidates?.[0];
  const usageMetadata = response.response?.usageMetadata || {};

  const inputTokens = usageMetadata.promptTokenCount || 0;
  const outputTokens = usageMetadata.candidatesTokenCount || 0;

  await _registrarCusto(inputTokens, outputTokens);

  const rawText = candidate?.content?.parts?.[0]?.text || '{}';

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    logger.error('vertexProAdapter.generateLegalThesis: resposta não é JSON válido.', {
      rawText: rawText.slice(0, 500),
    });
    throw new Error('Vertex AI retornou resposta em formato inválido');
  }

  // Validação mínima da estrutura
  const teses = {
    tese: parsed.tese || 'Tese jurídica não gerada — revisar manualmente.',
    fundamentos: Array.isArray(parsed.fundamentos) ? parsed.fundamentos : [],
    jurisprudencias: Array.isArray(parsed.jurisprudencias) ? parsed.jurisprudencias : [],
    pedidos: Array.isArray(parsed.pedidos) ? parsed.pedidos : [],
  };

  logger.info('vertexProAdapter.generateLegalThesis: tese gerada com sucesso.', {
    fundamentosCount: teses.fundamentos.length,
    jurisprudenciasCount: teses.jurisprudencias.length,
    pedidosCount: teses.pedidos.length,
    inputTokens,
    outputTokens,
  });

  return teses;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Constrói o prompt para geração de tese jurídica.
 * @param {Object} leadData
 * @returns {string}
 */
function _buildPrompt(leadData) {
  return `
Você é um especialista em Direito Previdenciário Brasileiro com mais de 20 anos de experiência
em revisão de indeferimentos do INSS perante o Poder Judiciário Federal.

Elabore uma fundamentação jurídica COMPLETA e TECNICAMENTE PRECISA para uma petição inicial
de revisão de indeferimento de benefício previdenciário, com base nos dados abaixo:

═══════════════════════════
DADOS DO CASO
═══════════════════════════
Espécie do benefício: ${leadData.especie_beneficio || 'não informado'}
Tipo de ação: ${leadData.tipo_acao || 'não informado'}
Motivo do indeferimento INSS: ${leadData.motivo_indeferimento || 'não informado'}
Data do indeferimento: ${leadData.dt_indeferimento || 'não informado'}
UF do requerente: ${leadData.uf || 'não informado'}

═══════════════════════════
INSTRUÇÕES
═══════════════════════════
1. A tese deve refutar especificamente o motivo do indeferimento "${leadData.motivo_indeferimento}".
2. Cite artigos da Lei 8.213/91, Decreto 3.048/99 e legislação correlata aplicável.
3. Inclua pelo menos 3 julgados relevantes (STJ, TRF ou TNU) com números reais se disponíveis.
4. Os pedidos devem ser concretos e adequados à espécie "${leadData.especie_beneficio}".
5. Linguagem formal jurídica em português brasileiro.

═══════════════════════════
FORMATO DE RESPOSTA (JSON PURO, SEM MARKDOWN)
═══════════════════════════
{
  "tese": "Texto da tese principal (2-4 parágrafos)",
  "fundamentos": [
    "Artigo X da Lei Y — descrição",
    "Súmula Z do STJ — texto",
    ...
  ],
  "jurisprudencias": [
    "Tribunal — Número — Ementa resumida",
    ...
  ],
  "pedidos": [
    "Pedido 1",
    "Pedido 2",
    ...
  ]
}
`.trim();
}

/**
 * Retorna a data atual no formato YYYY-MM-DD (fuso horário UTC).
 * @returns {string}
 */
function _getDataHoje() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { generateLegalThesis, checkDailyCap };
