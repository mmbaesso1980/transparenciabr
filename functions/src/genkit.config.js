/**
 * Configuração Genkit — motor único: Gemini 2.5 Pro via Vertex AI,
 * orquestrado pelo Agent Builder do Líder Supremo (Agent ID:
 * agent_1777236402725). Não invente outros agentes.
 */
const { genkit } = require('genkit');
const { vertexAI } = require('@genkit-ai/vertexai');
const { firebase } = require('@genkit-ai/firebase');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'transparenciabr';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';

/** ID estável do Agent Builder do Líder Supremo (Gemini 2.5 Pro). */
const SUPREME_AGENT_ID = 'agent_1777236402725';

/** Motor único: gemini-2.5-pro via Vertex AI. */
const SUPREME_MODEL = 'vertexai/gemini-2.5-pro';

const ai = genkit({
  plugins: [
    vertexAI({ location: VERTEX_LOCATION, projectId: PROJECT_ID }),
    firebase(),
  ],
  model: SUPREME_MODEL,
});

module.exports = { ai, SUPREME_AGENT_ID, SUPREME_MODEL };
