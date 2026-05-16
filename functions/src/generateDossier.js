/**
 * generateDossier.js — Cloud Function para gerar dossier forense
 * Usa GEMINI 2.5 PRO para análise profunda
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { BigQuery } = require("@google-cloud/bigquery");

const db = admin.firestore();
const bq = new BigQuery();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const COST_PER_DOSSIER = 800;

/**
 * Gerar dossier forense com GEMINI 2.5 PRO
 */
exports.generateDossierForense = functions
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

      if (userCredits < COST_PER_DOSSIER) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Créditos insuficientes: ${userCredits} < ${COST_PER_DOSSIER}`
        );
      }

      // Buscar dados do BigQuery
      const query = `
        SELECT 
          COUNT(*) as total_documentos,
          SUM(SAFE_CAST(vlrLiquido AS FLOAT64)) as total_ceap,
          MAX(SAFE_CAST(vlrLiquido AS FLOAT64)) as maior_documento,
          COUNT(DISTINCT txtFornecedor) as fornecedores_distintos,
          ARRAY_AGG(DISTINCT txtFornecedor LIMIT 10) as top_fornecedores,
          ARRAY_AGG(DISTINCT txtDescricao LIMIT 5) as categorias
        FROM \`projeto-codex-br.fiscalizapa.despesas_ceap\`
        WHERE nomeParlamentar = @nome OR parlamentar_id = @id
      `;

      const options = {
        query: query,
        location: "us-central1",
        params: {
          nome: parlamentarNome,
          id: parlamentarId,
        },
      };

      const [rows] = await bq.query(options);
      const ceapData = rows[0] || {};

      // Construir contexto para GEMINI
      const context_text = `
Parlamentar: ${parlamentarNome}
ID: ${parlamentarId}

Dados CEAP:
- Total de documentos: ${ceapData.total_documentos || 0}
- Total gasto: R$ ${(ceapData.total_ceap || 0).toFixed(2)}
- Maior documento: R$ ${(ceapData.maior_documento || 0).toFixed(2)}
- Fornecedores distintos: ${ceapData.fornecedores_distintos || 0}
- Top fornecedores: ${(ceapData.top_fornecedores || []).join(", ")}
- Categorias: ${(ceapData.categorias || []).join(", ")}
      `;

      // Chamar GEMINI 2.5 PRO para análise forense
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

      const prompt = `Analise os dados públicos deste parlamentar e gere um dossier forense estruturado.

${context_text}

Gere um JSON com as seguintes seções:
{
  "sections": [
    {
      "title": "Resumo Executivo",
      "content": "..."
    },
    {
      "title": "Análise de Padrões de Gastos",
      "content": "...",
      "flags": [
        {"severity": "ALTO", "message": "..."}
      ]
    },
    {
      "title": "Análise de Fornecedores",
      "content": "...",
      "flags": [...]
    },
    {
      "title": "Score de Risco",
      "content": "...",
      "flags": [...]
    }
  ],
  "riskScore": 0-100,
  "disclaimer": "Indícios quantitativos derivados de dados públicos..."
}

Sempre inclua o disclaimer. Seja técnico e objetivo. Não faça acusações.`;

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      });

      const responseText = result.response.text();

      // Extrair JSON da resposta
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const dossierData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      // Deduzir créditos
      await db
        .collection("users")
        .doc(uid)
        .update({
          credits: admin.firestore.FieldValue.increment(-COST_PER_DOSSIER),
          lastDossierGenerated: new Date(),
        });

      // Salvar dossier no Firestore
      const dossierRef = await db.collection("dossiers").add({
        uid,
        parlamentarId,
        parlamentarNome,
        dossier: dossierData,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias
      });

      return {
        dossier: dossierData,
        dossierRef: dossierRef.id,
        creditsUsed: COST_PER_DOSSIER,
      };
    } catch (error) {
      console.error("Erro em generateDossierForense:", error);
      throw new functions.https.HttpsError(
        "internal",
        error.message || "Erro ao gerar dossier"
      );
    }
  });

/**
 * Exportar dossier para PDF
 */
exports.exportDossierPDF = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Autenticação necessária"
      );
    }

    const { dossier, parlamentarNome } = data;

    try {
      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument();

      // Adicionar conteúdo ao PDF
      doc.fontSize(24).text(`Dossier Forense: ${parlamentarNome}`, { align: "center" });
      doc.moveDown();
      doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`);
      doc.moveDown();

      // Seções
      for (const section of dossier.sections || []) {
        doc.fontSize(14).text(section.title, { underline: true });
        doc.moveDown();
        doc.fontSize(11).text(section.content);
        doc.moveDown();

        // Flags
        if (section.flags && section.flags.length > 0) {
          doc.fontSize(10).text("Alertas:", { bold: true });
          for (const flag of section.flags) {
            doc.text(`[${flag.severity}] ${flag.message}`);
          }
          doc.moveDown();
        }
      }

      // Disclaimer
      doc.moveDown();
      doc.fontSize(8).text(dossier.disclaimer || "");

      // Retornar PDF como buffer
      return new Promise((resolve, reject) => {
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => {
          resolve(Buffer.concat(chunks));
        });
        doc.on("error", reject);
        doc.end();
      });
    } catch (error) {
      console.error("Erro em exportDossierPDF:", error);
      throw new functions.https.HttpsError(
        "internal",
        error.message || "Erro ao exportar PDF"
      );
    }
  });
