/**
 * Scanner jurídico-previdenciário — classifica trechos do Querido Diário e enriquece com Gemini.
 * Persistência em `radar_dossiers` com `is_private: true`.
 */

const crypto = require("crypto");

const { VertexAI } = require("@google-cloud/vertexai");

// [FIX VERTEX 01-jun-2026] Migrado de @google/generative-ai (AI Studio) para @google-cloud/vertexai
// para queimar o crédito do projeto-codex-br.
const VERTEX_PROJECT = process.env.VERTEX_PROJECT || "projeto-codex-br";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "us-east1";

/**
 * Motor único de IA — Líder Supremo (Agent Builder agent_1777236402725)
 * usando Gemini 2.5 Pro. Não invente outros agentes nem modelos legados.
 */
const SUPREME_AGENT_ID = "agent_1777236402725";
const SUPREME_GEMINI_MODEL = "gemini-2.5-pro";

/** @typedef {'previdenciario'|'trabalhista'|'tributario'} AreaLegal */

/**
 * Keywords por tema (normalização lowercase no match).
 */
const TEMAS = {
  previdenciario: [
    "aposentadoria",
    "bpc",
    "cat",
    "auxilio",
    "indeferido",
    "beneficio por incapacidade",
    "servidor instituicao",
    "rpps",
    "previdenciario",
  ],
  trabalhista: [
    "exoneracao",
    "demissao",
    "processo administrativo",
    "reintegracao",
    "servidor estatutario",
    "estabilidade",
    "funcionario publico",
    "contrato temporario",
  ],
  tributario: [
    "execucao fiscal",
    "leilao",
    "penhora",
    "parcelamento",
    "divida ativa",
    "taxa municipal",
    "creditos tributarios",
  ],
};

const LEGAL_PROMPT =
  `Analise o texto do Diário Oficial. Se houver um direito violado ou oportunidade jurídica:
  1. Resuma o fato.
  2. Identifique a Tese Jurídica aplicável.
  3. Liste Documentos Necessários.
  4. Estime o Prazo de Prescrição.

Responda estritamente em JSON estruturado com este schema:
{
  "oportunidade_identificada": boolean,
  "resumo_fato": string,
  "tese_juridica": string,
  "documentos_necessarios": string[],
  "prazo_prescricao": string,
  "prazo_prescricao_dias_estimado": number | null
}`;

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {string} text
 * @returns {AreaLegal | null}
 */
function classifyArea(text) {
  const n = normalize(text);
  /** @type {AreaLegal[]} */
  const order = ["previdenciario", "trabalhista", "tributario"];
  for (const area of order) {
    const kws = TEMAS[area] || [];
    for (const kw of kws) {
      if (n.includes(normalize(kw))) return area;
    }
  }
  return null;
}

/**
 * @param {{ prazo_prescricao_dias_estimado?: number|null }} analysis
 * @returns {'ALTA'|'MEDIA'|'BAIXA'}
 */
function urgencyFromAnalysis(analysis) {
  const d = analysis?.prazo_prescricao_dias_estimado;
  if (typeof d === "number" && Number.isFinite(d)) {
    if (d <= 45) return "ALTA";
    if (d <= 365) return "MEDIA";
    return "BAIXA";
  }
  const txt = normalize(analysis?.prazo_prescricao || "");
  if (/\b(30|45|60)\s*d/.test(txt) || txt.includes("urgente")) return "ALTA";
  if (/\b(90|180)\s*d/.test(txt)) return "MEDIA";
  return "MEDIA";
}

/**
 * @param {string} raw
 * @returns {Record<string, unknown>}
 */
function parseGeminiJson(raw) {
  let t = String(raw || "").trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence) t = fence[1].trim();
  return JSON.parse(t);
}

/**
 * @param {string} trecho
 * @returns {Promise<Record<string, unknown>>}
 */
async function analyzeWithGemini(trecho) {
  const vertexAI = new VertexAI({ project: VERTEX_PROJECT, location: VERTEX_LOCATION });
  const model = vertexAI.getGenerativeModel({
    model: SUPREME_GEMINI_MODEL,
    systemInstruction:
      `Você é o agente ${SUPREME_AGENT_ID} (Líder Supremo / Gemini 2.5 Pro). ` +
      `Toda análise jurídico-previdenciária do Querido Diário passa por você. ` +
      `Não invente outros agentes nem invoque modelos legados (1.5-flash, 2.0-pro, etc.).`,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
    },
  });

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [
        { text: LEGAL_PROMPT },
        { text: `\n---\nTexto do diário:\n${trecho.slice(0, 48000)}` },
      ],
    }],
  });
  const response = result.response;
  const txt = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return parseGeminiJson(txt);
}

function dossierDocId(atoId, ownerUid) {
  return crypto
    .createHash("sha256")
    .update(`radar_dossier|${atoId}|${ownerUid}`)
    .digest("hex");
}

module.exports = {
  TEMAS,
  SUPREME_AGENT_ID,
  SUPREME_GEMINI_MODEL,
  classifyArea,
  urgencyFromAnalysis,
  analyzeWithGemini,
  dossierDocId,
};
