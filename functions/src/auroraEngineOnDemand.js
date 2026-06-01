/**
 * auroraEngineOnDemand.js — AURORA ENGINE v2.0 ON-DEMAND
 * Gera dossiers forenses em tempo real com dados atualizados
 * Integra: BigQuery + Google News + Vertex Search + GEMINI 2.5 PRO
 * 
 * Exemplo: Flávio Bolsonaro + Vorcaro (130M + prisão)
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { VertexAI } = require("@google-cloud/vertexai");
const { BigQuery } = require("@google-cloud/bigquery");
const axios = require("axios");

const db = admin.firestore();
const bq = new BigQuery();
// [FIX VERTEX 01-jun-2026] Migrado de @google/generative-ai (AI Studio) para @google-cloud/vertexai
// para queimar o crédito do projeto-codex-br.
const VERTEX_PROJECT = process.env.VERTEX_PROJECT || "projeto-codex-br";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "us-east1";
const vertexAI = new VertexAI({ project: VERTEX_PROJECT, location: VERTEX_LOCATION });
const genAI = {
  getGenerativeModel: (opts) => vertexAI.getGenerativeModel(opts),
};

const DOSSIER_COST = 800;
const NEWS_API_KEY = process.env.NEWS_API_KEY || "demo";

/**
 * Buscar dados ATUAIS do parlamentar
 */
async function fetchCurrentData(parlamentarId, parlamentarNome) {
  console.log(`[AURORA] Buscando dados atuais para ${parlamentarNome}...`);

  const data = {};

  try {
    // 1. CEAP 2026 (últimos 90 dias)
    const [ceapRows] = await bq.query({
      query: `
        SELECT 
          COUNT(*) as total_notas,
          SUM(SAFE_CAST(vlrLiquido AS FLOAT64)) as total_ceap,
          MAX(SAFE_CAST(vlrLiquido AS FLOAT64)) as maior_nota,
          COUNT(DISTINCT txtFornecedor) as fornecedores_distintos,
          ARRAY_AGG(DISTINCT txtDescricao LIMIT 5) as categorias_principais,
          ARRAY_AGG(STRUCT(
            txtDescricao,
            txtFornecedor,
            SAFE_CAST(vlrLiquido AS FLOAT64) as valor,
            datEmissao
          ) ORDER BY SAFE_CAST(vlrLiquido AS FLOAT64) DESC LIMIT 10) as top_10_notas
        FROM \`projeto-codex-br.fiscalizapa.despesas_ceap\`
        WHERE parlamentar_id = @id
          AND DATE(datEmissao) >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
      `,
      location: "us-central1",
      params: { id: parlamentarId },
    });
    data.ceap = ceapRows[0] || {};

    // 2. EMENDAS 2026 (TODAS as RP: RP6, RP7, RP8, RP9, RP99)
    const [emendasRows] = await bq.query({
      query: `
        SELECT 
          tipo_emenda,
          COUNT(*) as total,
          SUM(SAFE_CAST(valor AS FLOAT64)) as total_valor,
          ARRAY_AGG(STRUCT(
            tipo_emenda,
            SAFE_CAST(valor AS FLOAT64) as valor,
            beneficiario_cnpj,
            beneficiario_nome,
            municipio,
            uf,
            data_emenda,
            status_execucao,
            pct_executado
          ) ORDER BY SAFE_CAST(valor AS FLOAT64) DESC LIMIT 5) as top_5_emendas
        FROM \`projeto-codex-br.fiscalizapa.emendas_parlamentares\`
        WHERE parlamentar_id = @id
          AND YEAR(data_emenda) = 2026
        GROUP BY tipo_emenda
      `,
      location: "us-central1",
      params: { id: parlamentarId },
    });
    data.emendas = emendasRows || [];

    // 3. FORNECEDORES SUSPEITOS (últimos 6 meses)
    const [vendorRows] = await bq.query({
      query: `
        SELECT 
          cnpj_fornecedor,
          razao_social,
          COUNT(*) as num_notas,
          SUM(SAFE_CAST(vlrLiquido AS FLOAT64)) as total_gasto,
          CASE 
            WHEN flag_ceis = TRUE THEN 'SANCIONADO_CEIS'
            WHEN flag_cnep = TRUE THEN 'SANCIONADO_CNEP'
            WHEN dias_abertura < 180 THEN 'EMPRESA_NOVA'
            WHEN num_notas > 50 THEN 'FORNECEDOR_RECORRENTE'
            ELSE 'NORMAL'
          END as flag_risco,
          ARRAY_AGG(DISTINCT socios LIMIT 3) as socios
        FROM \`projeto-codex-br.fiscalizapa.despesas_ceap\`
        WHERE parlamentar_id = @id
          AND DATE(datEmissao) >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
        GROUP BY cnpj_fornecedor, razao_social, flag_ceis, flag_cnep, dias_abertura
        HAVING flag_risco != 'NORMAL'
        ORDER BY total_gasto DESC
        LIMIT 10
      `,
      location: "us-central1",
      params: { id: parlamentarId },
    });
    data.fornecedores_suspeitos = vendorRows || [];

    // 4. ANOMALIAS (Lei de Benford)
    const [benfordRows] = await bq.query({
      query: `
        SELECT 
          score_benford,
          digitos_anomalos,
          flag_investigacao,
          CASE 
            WHEN score_benford > 0.30 THEN 'CRITICO'
            WHEN score_benford > 0.20 THEN 'ALTO'
            ELSE 'NORMAL'
          END as severidade
        FROM \`projeto-codex-br.fiscalizapa.ml_benford_score\`
        WHERE parlamentar_id = @id
      `,
      location: "us-central1",
      params: { id: parlamentarId },
    });
    data.benford = benfordRows[0] || {};

    // 5. VOTAÇÕES RECENTES (últimas 30 dias)
    const [votacaoRows] = await bq.query({
      query: `
        SELECT 
          COUNT(*) as total_votacoes,
          COUNTIF(presente = TRUE) as presencas,
          ROUND(COUNTIF(presente = TRUE) / COUNT(*) * 100, 2) as pct_presenca,
          ARRAY_AGG(STRUCT(
            descricao_votacao,
            voto,
            data_votacao,
            resultado
          ) LIMIT 10) as votacoes_recentes
        FROM \`projeto-codex-br.fiscalizapa.votacoes_parlamentares\`
        WHERE parlamentar_id = @id
          AND DATE(data_votacao) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
      `,
      location: "us-central1",
      params: { id: parlamentarId },
    });
    data.votacoes = votacaoRows[0] || {};

    console.log(`[AURORA] Dados atuais coletados com sucesso`);
    return data;
  } catch (error) {
    console.error(`[AURORA] Erro ao buscar dados:`, error);
    throw error;
  }
}

/**
 * Buscar notícias recentes sobre o parlamentar
 */
async function fetchRecentNews(parlamentarNome) {
  console.log(`[AURORA] Buscando notícias sobre ${parlamentarNome}...`);

  try {
    const response = await axios.get("https://newsapi.org/v2/everything", {
      params: {
        q: parlamentarNome,
        sortBy: "publishedAt",
        language: "pt",
        pageSize: 10,
        apiKey: NEWS_API_KEY,
      },
      timeout: 5000,
    });

    const articles = response.data.articles || [];
    console.log(`[AURORA] ${articles.length} notícias encontradas`);

    return articles.map((article) => ({
      titulo: article.title,
      descricao: article.description,
      fonte: article.source.name,
      data: article.publishedAt,
      url: article.url,
    }));
  } catch (error) {
    console.warn(`[AURORA] Erro ao buscar notícias (não crítico):`, error.message);
    return [];
  }
}

/**
 * Buscar contexto do Vertex Search (45.191 docs indexados)
 */
async function fetchVertexSearchContext(parlamentarNome) {
  console.log(`[AURORA] Buscando contexto em Vertex Search...`);

  try {
    // Aqui você integraria com Vertex AI Search
    // Por enquanto, retornamos um placeholder
    return {
      documentos_encontrados: 0,
      contexto: "Vertex Search integration pending",
    };
  } catch (error) {
    console.warn(`[AURORA] Erro em Vertex Search:`, error.message);
    return {};
  }
}

/**
 * Cloud Function: Gerar Dossier ON-DEMAND
 */
exports.generateDossierOnDemand = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Autenticação necessária"
      );
    }

    const uid = context.auth.uid;
    const { parlamentarId, parlamentarNome } = data;

    if (!parlamentarId || !parlamentarNome) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "parlamentarId e parlamentarNome obrigatórios"
      );
    }

    try {
      // Verificar créditos
      const userDoc = await db.collection("users").doc(uid).get();
      const userCredits = userDoc.data()?.credits || 0;

      if (userCredits < DOSSIER_COST) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Créditos insuficientes: ${userCredits} < ${DOSSIER_COST}`
        );
      }

      console.log(`[AURORA] Iniciando dossier ON-DEMAND para ${parlamentarNome}`);

      // Coletar dados ATUAIS em paralelo
      const [currentData, recentNews, vertexContext] = await Promise.all([
        fetchCurrentData(parlamentarId, parlamentarNome),
        fetchRecentNews(parlamentarNome),
        fetchVertexSearchContext(parlamentarNome),
      ]);

      console.log(`[AURORA] Dados coletados. Compilando com GEMINI 2.5 PRO...`);

      // Compilar com GEMINI 2.5 PRO
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

      const compilationPrompt = `
Você é o AURORA-COMPILADOR, auditor forense especializado em transparência pública brasileira.

DADOS ATUAIS DO PARLAMENTAR ${parlamentarNome}:
${JSON.stringify(currentData, null, 2)}

NOTÍCIAS RECENTES:
${recentNews.map((n) => `- ${n.titulo} (${n.fonte}, ${n.data})`).join("\n")}

CONTEXTO VERTEX SEARCH:
${JSON.stringify(vertexContext, null, 2)}

TAREFA: Gere um dossier forense com rigor 100% que:
1. Identifique PADRÕES SUSPEITOS nos dados
2. Cruze EMENDAS com FORNECEDORES
3. Analise ANOMALIAS (Lei de Benford)
4. Contextualize com NOTÍCIAS RECENTES
5. Classifique cada achado: ILEGAL | IRREGULAR | IMORAL | SUSPEITO

RETORNE JSON ESTRUTURADO:
{
  "sumario_executivo": "Resumo impactante (200-300 palavras)",
  "findings": [
    {
      "id": "F-01",
      "titulo": "Título impactante",
      "severity": "CRITICO|ALTO|MEDIO|BAIXO",
      "classificacao": "ILEGAL|IRREGULAR|IMORAL|SUSPEITO",
      "descricao": "Descrição com dados concretos",
      "evidencias": ["Evidência 1", "Evidência 2"],
      "contraditorio": "Resposta oficial ou 'Sem resposta'"
    }
  ],
  "score_risco": 0-100,
  "recomendacoes": ["Recomendação 1", "Recomendação 2"],
  "disclaimer": "Este documento não constitui denúncia..."
}

Seja RIGOROSO. Cada finding deve ter FONTE PRIMÁRIA.
Não invente. Se não tiver dados, retorne null no campo.
`;

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: compilationPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      });

      // [FIX VERTEX 01-jun-2026] Vertex SDK: response.candidates[0].content.parts[0].text
      const responseText =
        result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const dossierData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      // Deduzir créditos
      await db
        .collection("users")
        .doc(uid)
        .update({
          credits: admin.firestore.FieldValue.increment(-DOSSIER_COST),
          lastDossierGenerated: new Date(),
        });

      // Salvar dossier no Firestore
      const dossierRef = await db.collection("dossiers").add({
        uid,
        parlamentarId,
        parlamentarNome,
        dossier: dossierData,
        dataColetada: new Date(),
        noticiasEncontradas: recentNews.length,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      console.log(`[AURORA] Dossier ON-DEMAND gerado: ${dossierRef.id}`);

      return {
        dossier: dossierData,
        dossierRef: dossierRef.id,
        creditsUsed: DOSSIER_COST,
        dataGerada: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[AURORA] Erro:", error);
      throw new functions.https.HttpsError(
        "internal",
        error.message || "Erro ao gerar dossier"
      );
    }
  });
