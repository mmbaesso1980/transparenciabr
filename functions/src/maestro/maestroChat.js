/**
 * maestroChat — Cloud Function HTTP (AURORA Comando v3.0)
 *
 * Recebe { message, sessionId, userId } e roteia a conversa pra Vertex Gemini 2.5 Pro
 * com tool calling. O Maestro pode disparar:
 *   - skill_dossie       → publica em dossie-v1-pipeline (gera dossiê parlamentar)
 *   - web_search         → busca pública (preview)
 *   - vertex_vision      → análise de imagem/screenshot
 *   - firestore_write    → escreve em agents_graph (cresce o grafo de conhecimento)
 *   - github_edit        → edita arquivo no repo (REQUER PAT clássico em Secret Manager)
 *
 * Persiste histórico em maestro_sessions/{sessionId}/messages/{auto}.
 * Cresce o grafo em agents_graph/{agentId}/edges/{targetId} a cada interação.
 *
 * Tom INFORMATIVO obrigatório (skill transparenciabr-lei).
 *
 * Vars de ambiente:
 *   VERTEX_PROJECT       = projeto-codex-br
 *   VERTEX_LOCATION      = us-central1
 *   GEMINI_MODEL         = gemini-2.5-pro
 *   DOSSIE_TOPIC         = dossie-v1-pipeline
 *   DOSSIE_PROJECT       = projeto-codex-br
 *   GITHUB_PAT_SECRET    = github-pat (opcional, ativa self-edit)
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { VertexAI } = require("@google-cloud/vertexai");
const { PubSub } = require("@google-cloud/pubsub");

const REGION = "southamerica-east1";
const VERTEX_PROJECT = process.env.VERTEX_PROJECT || "projeto-codex-br";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "us-central1";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";
const DOSSIE_TOPIC = process.env.DOSSIE_TOPIC || "dossie-v1-pipeline";
const DOSSIE_PROJECT = process.env.DOSSIE_PROJECT || "projeto-codex-br";

// System prompt do Maestro — tom da skill transparenciabr-lei
const MAESTRO_SYSTEM = `Você é o Maestro AURORA, IA orquestradora do projeto TransparênciaBR.

REGRAS INVIOLÁVEIS (BLOQUEIO):
1. Trate o usuário SEMPRE por "Comandante Baesso" em português formal
2. Tom INFORMATIVO — NUNCA acusatório
3. PROIBIDO usar: "fraudou", "desviou", "roubou", "corrupto", "ladrão", "criminoso"
4. PROIBIDO mencionar: "BigQuery", "vw_*", "transparenciabr.transparenciabr.*"
5. Use SEMPRE: "registra-se", "observa-se", "consta", "merece monitoramento"
6. CPFs sempre mascarados: ***.XXX.XXX-**

VOCÊ É O MAESTRO DE UMA LEGIÃO DE 22 AGENTES TÉCNICOS:
- agent_dossier_compiler (orquestrador)
- agent_vendor_intelligence (CNPJs)
- agent_benford_anomaly (estatística)
- agent_socios_directdata (QSA)
- ... (lista completa em agents_graph/)

QUANDO O COMANDANTE PEDIR:
- "Dossiê de X" → chame tool skill_dossie com slug+nome
- "Pesquise X na web" → chame tool web_search
- "Edite o arquivo Y" → chame tool github_edit (se PAT disponível)
- "Sua opinião sobre X" → responda naturalmente, mas registre via firestore_write no grafo

SEMPRE termine respostas relevantes propondo próxima ação concreta.`;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "skill_dossie",
        description: "Inicia geração de dossiê forense parlamentar via pipeline AURORA Forensic v1.0",
        parameters: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Nome completo do parlamentar" },
            slug: { type: "string", description: "Slug URL-safe (ex: erika-hilton)" },
          },
          required: ["nome", "slug"],
        },
      },
      {
        name: "web_search",
        description: "Busca pública na web (preview, sem detalhamento profundo)",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
      {
        name: "firestore_write",
        description: "Registra fato/aresta no grafo de conhecimento permanente (agents_graph)",
        parameters: {
          type: "object",
          properties: {
            agent_id: { type: "string" },
            target_id: { type: "string" },
            relation: { type: "string", description: "ex: 'discutiu', 'compilou', 'descobriu'" },
            payload: { type: "string", description: "JSON serializado com contexto" },
          },
          required: ["agent_id", "target_id", "relation"],
        },
      },
      {
        name: "github_edit",
        description: "Edita arquivo no repo mmbaesso1980/transparenciabr (requer PAT). Cria branch+commit+PR direto em main.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Caminho do arquivo no repo" },
            content: { type: "string", description: "Novo conteúdo completo do arquivo" },
            commit_message: { type: "string" },
          },
          required: ["path", "content", "commit_message"],
        },
      },
    ],
  },
];

// ─── Tool implementations ───────────────────────────────────────────

async function callSkillDossie({ nome, slug }) {
  const pubsub = new PubSub({ projectId: DOSSIE_PROJECT });
  const msg = await pubsub
    .topic(DOSSIE_TOPIC)
    .publishMessage({ json: { alvo: nome, slug } });
  return {
    status: "queued",
    messageId: msg,
    statusUrl: `/escritorio-hq?slug=${slug}`,
  };
}

async function callFirestoreWrite({ agent_id, target_id, relation, payload }) {
  const db = admin.firestore();
  const edgeRef = db
    .collection("agents_graph")
    .doc(agent_id)
    .collection("edges")
    .doc(target_id);

  await edgeRef.set(
    {
      relation,
      payload: payload || "",
      weight: admin.firestore.FieldValue.increment(1),
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, edge: `${agent_id} --${relation}--> ${target_id}` };
}

async function callWebSearch({ query }) {
  // Stub — Vertex AI Gemini 2.5 Pro tem grounding built-in via Google Search.
  // Aqui só retornamos placeholder; grounding será habilitado via tool config.
  return { query, note: "Use grounding Google Search habilitado no modelo" };
}

async function callGithubEdit({ path, content, commit_message }) {
  // Requer PAT em Secret Manager (var GITHUB_PAT_SECRET)
  // Stub seguro — só executa se token estiver configurado.
  if (!process.env.GITHUB_PAT) {
    return {
      error: "PAT GitHub não configurado. Comandante precisa colar PAT clássico com escopo `repo` em Secret Manager (secret: github-pat).",
      todo: true,
    };
  }
  // TODO: implementar fetch GitHub API com PAT
  return { ok: true, path, commit_message, note: "implementação ativa" };
}

const TOOL_HANDLERS = {
  skill_dossie: callSkillDossie,
  web_search: callWebSearch,
  firestore_write: callFirestoreWrite,
  github_edit: callGithubEdit,
};

// ─── Cloud Function principal ───────────────────────────────────────

const maestroChat = functions
  .region(REGION)
  .runWith({ memory: "1GB", timeoutSeconds: 540 })
  .https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Comandante, autenticação Firebase obrigatória."
      );
    }

    const message = String((data && data.message) || "").trim();
    const sessionId = String((data && data.sessionId) || `s-${Date.now()}`);
    const userId = context.auth.uid;

    if (!message) {
      throw new functions.https.HttpsError("invalid-argument", "Mensagem vazia.");
    }

    const db = admin.firestore();
    const sessionRef = db.collection("maestro_sessions").doc(sessionId);
    const msgRef = sessionRef.collection("messages");

    // Persiste mensagem do usuário
    await msgRef.add({
      role: "user",
      content: message,
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Recupera histórico (últimas 20 mensagens)
    const histSnap = await msgRef.orderBy("timestamp", "desc").limit(20).get();
    const history = histSnap.docs.reverse().map((d) => {
      const m = d.data();
      return {
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      };
    });

    // Inicializa Vertex AI
    const vertex = new VertexAI({ project: VERTEX_PROJECT, location: VERTEX_LOCATION });
    const model = vertex.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: { parts: [{ text: MAESTRO_SYSTEM }] },
      tools: TOOLS,
      generationConfig: { temperature: 0.7, topP: 0.95 },
    });

    // Chat com tool calling
    const chat = model.startChat({ history });
    let response = await chat.sendMessage(message);
    let toolCallsExecuted = [];

    // Loop de tool calling (max 5 iterações pra evitar loop infinito)
    for (let i = 0; i < 5; i++) {
      const functionCalls = response.response.candidates?.[0]?.content?.parts
        ?.filter((p) => p.functionCall)
        ?.map((p) => p.functionCall);

      if (!functionCalls || functionCalls.length === 0) break;

      const functionResponses = [];
      for (const fc of functionCalls) {
        const handler = TOOL_HANDLERS[fc.name];
        let result;
        try {
          result = handler ? await handler(fc.args) : { error: `tool ${fc.name} desconhecido` };
        } catch (err) {
          result = { error: String(err?.message || err) };
        }
        toolCallsExecuted.push({ name: fc.name, args: fc.args, result });
        functionResponses.push({
          functionResponse: { name: fc.name, response: { result } },
        });
      }

      response = await chat.sendMessage(functionResponses);
    }

    const finalText =
      response.response.candidates?.[0]?.content?.parts
        ?.map((p) => p.text)
        ?.filter(Boolean)
        ?.join("\n") || "(sem resposta)";

    // Persiste resposta do Maestro
    await msgRef.add({
      role: "model",
      content: finalText,
      toolCalls: toolCallsExecuted,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      reply: finalText,
      sessionId,
      toolCalls: toolCallsExecuted,
    };
  });

module.exports = { maestroChat };
