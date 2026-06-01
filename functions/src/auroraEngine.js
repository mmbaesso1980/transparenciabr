/**
 * auroraEngine.js — AURORA ENGINE v2.0
 * Orquestra 16 agentes Vertex AI especializados em análise forense
 * Processamento paralelo via map tool
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { VertexAI } = require("@google-cloud/vertexai");
const { BigQuery } = require("@google-cloud/bigquery");

const db = admin.firestore();
const bq = new BigQuery();
// [FIX VERTEX 01-jun-2026] Migrado de @google/generative-ai (AI Studio) para @google-cloud/vertexai
// para queimar o crédito do projeto-codex-br (Trial GenAI App Builder).
const VERTEX_PROJECT = process.env.VERTEX_PROJECT || "projeto-codex-br";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "us-east1";
const vertexAI = new VertexAI({ project: VERTEX_PROJECT, location: VERTEX_LOCATION });
const genAI = {
  getGenerativeModel: (opts) => vertexAI.getGenerativeModel(opts),
};

const DOSSIER_COST = 800;

/**
 * 16 Agentes AURORA — cada um especializado em um domínio
 */
const AURORA_AGENTS = {
  CEAP: {
    name: "AURORA-CEAP",
    domain: "Cota para Exercício Atividade Parlamentar",
    query: `
      SELECT 
        COUNT(*) as total_notas,
        SUM(SAFE_CAST(vlrLiquido AS FLOAT64)) as total_ceap,
        MAX(SAFE_CAST(vlrLiquido AS FLOAT64)) as maior_nota,
        COUNT(DISTINCT txtFornecedor) as fornecedores_distintos,
        ARRAY_AGG(DISTINCT txtDescricao LIMIT 10) as categorias
      FROM \`projeto-codex-br.fiscalizapa.despesas_ceap\`
      WHERE parlamentar_id = @id
    `,
  },
  VERBA: {
    name: "AURORA-VERBA",
    domain: "Verba de Gabinete + Folha de Pagamento",
    query: `
      SELECT 
        SUM(SAFE_CAST(valor AS FLOAT64)) as total_verba,
        COUNT(DISTINCT servidor_id) as total_servidores,
        MAX(SAFE_CAST(valor AS FLOAT64)) as maior_salario,
        ARRAY_AGG(DISTINCT cargo LIMIT 5) as cargos
      FROM \`projeto-codex-br.fiscalizapa.folha_gabinete\`
      WHERE parlamentar_id = @id
    `,
  },
  EMENDAS: {
    name: "AURORA-EMENDAS",
    domain: "Emendas Parlamentares (RP6, RP7, RP8, RP9, RP99)",
    query: `
      SELECT 
        tipo_emenda,
        COUNT(*) as total_emendas,
        SUM(SAFE_CAST(valor AS FLOAT64)) as total_valor,
        COUNT(DISTINCT beneficiario_cnpj) as beneficiarios_distintos,
        ARRAY_AGG(STRUCT(
          tipo_emenda, 
          valor, 
          beneficiario_cnpj, 
          municipio
        ) LIMIT 10) as top_emendas
      FROM \`projeto-codex-br.fiscalizapa.emendas_parlamentares\`
      WHERE parlamentar_id = @id
      GROUP BY tipo_emenda
    `,
  },
  PATRIMONIO: {
    name: "AURORA-PATRIMONIO",
    domain: "TSE Patrimônio Declarado",
    query: `
      SELECT 
        ano,
        total_patrimonio,
        variacao_ano_anterior,
        bens_declarados,
        CASE 
          WHEN variacao_ano_anterior > 0.5 THEN 'CRESCIMENTO_SUSPEITO'
          ELSE 'NORMAL'
        END as flag_risco
      FROM \`projeto-codex-br.fiscalizapa.tse_patrimonio\`
      WHERE parlamentar_id = @id
      ORDER BY ano DESC
    `,
  },
  VENDOR: {
    name: "AURORA-VENDOR",
    domain: "Fornecedores CEAP (CNPJ, Sócios)",
    query: `
      SELECT 
        cnpj_fornecedor,
        razao_social,
        COUNT(*) as num_notas,
        SUM(SAFE_CAST(vlrLiquido AS FLOAT64)) as total_gasto,
        ARRAY_AGG(DISTINCT socios LIMIT 5) as socios
      FROM \`projeto-codex-br.fiscalizapa.despesas_ceap\`
      WHERE parlamentar_id = @id
      GROUP BY cnpj_fornecedor, razao_social
      ORDER BY total_gasto DESC
      LIMIT 20
    `,
  },
  PNCP: {
    name: "AURORA-PNCP",
    domain: "Contratos Públicos (PNCP)",
    query: `
      SELECT 
        COUNT(*) as total_contratos,
        SUM(SAFE_CAST(valor_contrato AS FLOAT64)) as total_contratado,
        COUNT(DISTINCT fornecedor_cnpj) as fornecedores,
        ARRAY_AGG(DISTINCT modalidade_licitacao LIMIT 5) as modalidades
      FROM \`projeto-codex-br.fiscalizapa.pncp_contratos\`
      WHERE parlamentar_id = @id
    `,
  },
  LICITACAO: {
    name: "AURORA-LICITACAO",
    domain: "Licitações (Municípios + Estados)",
    query: `
      SELECT 
        COUNT(*) as total_licitacoes,
        COUNT(DISTINCT municipio) as municipios_envolvidos,
        SUM(SAFE_CAST(valor_licitacao AS FLOAT64)) as total_licitado,
        COUNTIF(flag_direcionamento = TRUE) as licitacoes_direcionadas
      FROM \`projeto-codex-br.fiscalizapa.licitacoes_municipais\`
      WHERE parlamentar_id = @id OR beneficiario_parlamentar = @id
    `,
  },
  CONEXAO: {
    name: "AURORA-CONEXAO",
    domain: "Conexões Políticas & Comerciais",
    query: `
      SELECT 
        COUNT(DISTINCT outro_parlamentar) as conexoes_politicas,
        COUNT(DISTINCT empresa_comum) as empresas_comuns,
        ARRAY_AGG(STRUCT(
          outro_parlamentar,
          partido,
          num_empresas_comuns
        ) LIMIT 10) as top_conexoes
      FROM \`projeto-codex-br.fiscalizapa.rede_politica\`
      WHERE parlamentar_id = @id
    `,
  },
  LEGISLATIVO: {
    name: "AURORA-LEGISLATIVO",
    domain: "Atividade Legislativa",
    query: `
      SELECT 
        COUNT(*) as total_votacoes,
        COUNTIF(presente = TRUE) as presencas,
        ROUND(COUNTIF(presente = TRUE) / COUNT(*) * 100, 2) as pct_presenca,
        COUNT(DISTINCT projeto_id) as projetos_votados
      FROM \`projeto-codex-br.fiscalizapa.votacoes_parlamentares\`
      WHERE parlamentar_id = @id
    `,
  },
  COMISSOES: {
    name: "AURORA-COMISSOES",
    domain: "Comissões & Cargos",
    query: `
      SELECT 
        COUNT(*) as total_comissoes,
        ARRAY_AGG(STRUCT(
          nome_comissao,
          cargo,
          data_inicio,
          data_fim
        )) as comissoes_historico
      FROM \`projeto-codex-br.fiscalizapa.comissoes_parlamentares\`
      WHERE parlamentar_id = @id
    `,
  },
  AGENDA: {
    name: "AURORA-AGENDA",
    domain: "Agenda Oficial & Viagens",
    query: `
      SELECT 
        COUNT(*) as total_eventos,
        COUNT(DISTINCT municipio) as municipios_visitados,
        ARRAY_AGG(DISTINCT tipo_evento LIMIT 5) as tipos_eventos,
        COUNT(DISTINCT DATE(data_evento)) as dias_com_eventos
      FROM \`projeto-codex-br.fiscalizapa.agenda_parlamentar\`
      WHERE parlamentar_id = @id
    `,
  },
  MIDIA: {
    name: "AURORA-MIDIA",
    domain: "Cobertura Jornalística",
    query: `
      SELECT 
        COUNT(*) as total_mencoes,
        COUNT(DISTINCT fonte) as fontes_distintas,
        COUNTIF(sentimento = 'NEGATIVO') as mencoes_negativas,
        ARRAY_AGG(DISTINCT tema LIMIT 5) as temas_principais
      FROM \`projeto-codex-br.fiscalizapa.midia_parlamentar\`
      WHERE parlamentar_id = @id
    `,
  },
  ANOMALIA: {
    name: "AURORA-ANOMALIA",
    domain: "Detecção de Anomalias (Lei de Benford)",
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
  },
  CORRELACAO: {
    name: "AURORA-CORRELACAO",
    domain: "Correlação Comportamental",
    query: `
      SELECT 
        tipo_correlacao,
        score_correlacao,
        descricao,
        CASE 
          WHEN score_correlacao > 0.8 THEN 'FORTE'
          WHEN score_correlacao > 0.5 THEN 'MODERADA'
          ELSE 'FRACA'
        END as forca
      FROM \`projeto-codex-br.fiscalizapa.correlacoes_comportamentais\`
      WHERE parlamentar_id = @id
    `,
  },
  RISCO: {
    name: "AURORA-RISCO",
    domain: "Score de Risco Quantitativo",
    query: `
      SELECT 
        score_risco_total,
        CASE 
          WHEN score_risco_total >= 80 THEN 'CRITICO'
          WHEN score_risco_total >= 60 THEN 'ALTO'
          WHEN score_risco_total >= 40 THEN 'MEDIO'
          ELSE 'BAIXO'
        END as nivel_risco,
        ARRAY_AGG(STRUCT(
          fator,
          peso,
          contribuicao
        )) as fatores_risco
      FROM \`projeto-codex-br.fiscalizapa.score_risco_parlamentar\`
      WHERE parlamentar_id = @id
    `,
  },
};

/**
 * Executar um agente AURORA específico
 */
async function executeAuroraAgent(agentKey, parlamentarId) {
  const agent = AURORA_AGENTS[agentKey];
  
  try {
    const [rows] = await bq.query({
      query: agent.query,
      location: "us-central1",
      params: { id: parlamentarId },
    });

    return {
      agent: agent.name,
      domain: agent.domain,
      data: rows[0] || {},
      status: "SUCCESS",
    };
  } catch (error) {
    console.error(`Erro em ${agent.name}:`, error);
    return {
      agent: agent.name,
      domain: agent.domain,
      data: {},
      status: "ERROR",
      error: error.message,
    };
  }
}

/**
 * Cloud Function: Gerar Dossier Forense AURORA
 */
exports.generateDossierAurora = functions
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

      console.log(`[AURORA] Iniciando dossier para ${parlamentarNome} (${parlamentarId})`);

      // Executar todos os 16 agentes em paralelo
      const agentKeys = Object.keys(AURORA_AGENTS);
      const agentResults = await Promise.all(
        agentKeys.map((key) => executeAuroraAgent(key, parlamentarId))
      );

      console.log(`[AURORA] 16 agentes completados. Compilando dossier...`);

      // Compilar resultados com GEMINI 2.5 PRO
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

      const compilationPrompt = `
Você é o AURORA-COMPILADOR, o coordenador supremo da análise forense.

Dados brutos dos 16 agentes:
${JSON.stringify(agentResults, null, 2)}

Parlamentar: ${parlamentarNome}
ID: ${parlamentarId}

Gere um JSON estruturado com:
{
  "sumario_executivo": "...",
  "findings": [
    {
      "id": "F-01",
      "titulo": "...",
      "severity": "CRITICO|ALTO|MEDIO|BAIXO",
      "classificacao": "ILEGAL|IRREGULAR|IMORAL|SUSPEITO",
      "descricao": "...",
      "evidencias": ["..."],
      "contraditorio": "..."
    }
  ],
  "score_risco": 0-100,
  "recomendacoes": ["..."],
  "disclaimer": "Este documento não constitui denúncia..."
}

Seja rigoroso. Cada finding deve ter fonte primária.
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
        agentResults,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      console.log(`[AURORA] Dossier gerado: ${dossierRef.id}`);

      return {
        dossier: dossierData,
        dossierRef: dossierRef.id,
        creditsUsed: DOSSIER_COST,
      };
    } catch (error) {
      console.error("[AURORA] Erro:", error);
      throw new functions.https.HttpsError(
        "internal",
        error.message || "Erro ao gerar dossier"
      );
    }
  });

/**
 * Cloud Function: Exportar Dossier para PDF
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

      // Header
      doc.fontSize(24).text("TRANSPARÊNCIABR", { align: "center" });
      doc.fontSize(12).text("Plataforma Forense de Inteligência Cívica", { align: "center" });
      doc.fontSize(10).text("AURORA ENGINE v2.0 · 16 AGENTES VERTEX", { align: "center" });
      doc.moveDown();

      // Título
      doc.fontSize(20).text(`Dossier Forense: ${parlamentarNome}`, { align: "center" });
      doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, { align: "center" });
      doc.moveDown();

      // Sumário Executivo
      doc.fontSize(14).text("SUMÁRIO EXECUTIVO", { underline: true });
      doc.moveDown();
      doc.fontSize(11).text(dossier.sumario_executivo || "");
      doc.moveDown();

      // Findings
      doc.fontSize(14).text("FINDINGS — RIGOR 100%", { underline: true });
      doc.moveDown();

      for (const finding of dossier.findings || []) {
        doc.fontSize(12).text(`${finding.id} · ${finding.titulo}`, { bold: true });
        doc.fontSize(10).text(`Severity: ${finding.severity} | Classificação: ${finding.classificacao}`);
        doc.fontSize(11).text(finding.descricao);
        doc.moveDown();
      }

      // Score de Risco
      doc.fontSize(14).text("SCORE DE RISCO", { underline: true });
      doc.fontSize(16).text(`${dossier.score_risco}/100`, { bold: true });
      doc.moveDown();

      // Disclaimer
      doc.fontSize(8).text(dossier.disclaimer || "");

      // Retornar PDF
      return new Promise((resolve, reject) => {
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
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
