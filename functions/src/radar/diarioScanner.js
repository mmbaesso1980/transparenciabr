/**
 * Scanner jurídico-previdenciário — classifica trechos do Querido Diário e enriquece com Gemini.
 * Persistência em `radar_dossiers` com `is_private: true`.
 */

const crypto = require("crypto");

const { GoogleGenerativeAI } = require("@google/generative-ai");

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
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY ausente");
  }
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent([
    { text: LEGAL_PROMPT },
    { text: `\n---\nTexto do diário:\n${trecho.slice(0, 48000)}` },
  ]);
  const response = result.response;
  const txt = response.text();
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
  classifyArea,
  urgencyFromAnalysis,
  analyzeWithGemini,
  dossierDocId,
};
