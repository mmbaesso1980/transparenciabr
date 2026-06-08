/**
 * chatIA.js — Cloud Function para análise com GEMINI 2.5 PRO
 * Análise forense de parlamentares em tempo real
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { VertexAI } = require("@google-cloud/vertexai");

const db = admin.firestore();

// [FIX VERTEX 01-jun-2026] Migrado de @google/generative-ai (AI Studio) para @google-cloud/vertexai
// para queimar o crédito do projeto-codex-br.
const VERTEX_PROJECT = process.env.VERTEX_PROJECT || "projeto-codex-br";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "us-east1";
const vertexAI = new VertexAI({ project: VERTEX_PROJECT, location: VERTEX_LOCATION });
const genAI = {
  getGenerativeModel: (opts) => vertexAI.getGenerativeModel(opts),
};

const COST_PER_QUERY = 50; // Créditos por consulta

/**
 * Análise com GEMINI 2.5 PRO
 */
exports.chatIAAnalysis = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Autenticação necessária"
      );
    }

    const uid = context.auth.uid;
    const { query, parlamentarId, context: conversationContext } = data;

    if (!query || query.trim().length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Query vazia"
      );
    }

    try {
      // Verificar créditos do usuário
      const userDoc = await db.collection("users").doc(uid).get();
      const userCredits = userDoc.data()?.credits || 0;

      if (userCredits < COST_PER_QUERY) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Créditos insuficientes: ${userCredits} < ${COST_PER_QUERY}`
        );
      }

      // Buscar dados do parlamentar
      let parlamentarContext = "";
      if (parlamentarId) {
        const politicoDoc = await db
          .collection("politicos")
          .doc(parlamentarId)
          .get();
        if (politicoDoc.exists) {
          const data = politicoDoc.data();
          parlamentarContext = `
Parlamentar: ${data.nome}
Partido: ${data.partido}
UF: ${data.uf}
Total CEAP: R$ ${data.total_ceap || 0}
Maior documento: R$ ${data.maior_documento || 0}
Fornecedores distintos: ${data.fornecedores_distintos || 0}
Score de risco: ${data.risk_score || 0}/100
          `;
        }
      }

      // Construir prompt com contexto
      const systemPrompt = `Você é um analista forense especializado em transparência governamental brasileira.
Analise dados públicos de parlamentares com rigor técnico, sem acusações.
Sempre cite fontes e dados públicos.
Use disclaimers: "Indícios quantitativos derivados de dados públicos. Não configuram ilícito."
Seja conciso e direto.`;

      const userPrompt = `${parlamentarContext}

Pergunta do usuário: ${query}

Contexto da conversa anterior:
${conversationContext
  ?.map((m) => `${m.role}: ${m.content}`)
  .join("\n")}

Análise:`;

      // Chamar GEMINI 2.5 PRO
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      });

      // [FIX VERTEX 01-jun-2026] Vertex SDK: response.candidates[0].content.parts[0].text
      const analysis =
        result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // Deduzir créditos
      await db
        .collection("users")
        .doc(uid)
        .update({
          credits: admin.firestore.FieldValue.increment(-COST_PER_QUERY),
          lastChatQuery: new Date(),
        });

      // Log da análise
      await db.collection("chat_logs").add({
        uid,
        parlamentarId,
        query,
        analysis,
        creditsUsed: COST_PER_QUERY,
        timestamp: new Date(),
      });

      return {
        analysis,
        creditsUsed: COST_PER_QUERY,
      };
    } catch (error) {
      console.error("Erro em chatIAAnalysis:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError(
        "internal",
        error.message || "Erro ao processar análise"
      );
    }
  });

/**
 * Obter histórico de chat
 */
exports.getChatHistory = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Autenticação necessária"
      );
    }

    const uid = context.auth.uid;
    const { limit = 20 } = data;

    try {
      const snapshot = await db
        .collection("chat_logs")
        .where("uid", "==", uid)
        .orderBy("timestamp", "desc")
        .limit(limit)
        .get();

      const history = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      }));

      return { history };
    } catch (error) {
      console.error("Erro em getChatHistory:", error);
      throw new functions.https.HttpsError(
        "internal",
        error.message || "Erro ao recuperar histórico"
      );
    }
  });
