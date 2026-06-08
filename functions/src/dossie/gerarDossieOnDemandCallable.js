/**
 * gerarDossieOnDemand — Callable (Inferno Edition v3)
 *
 * Aceita `parlamentarId` ou `politicoId` + `contextoInvestigativo`.
 * Vertex AI é inicializado explicitamente no projeto de faturação Gemini/Vertex
 * (equivalente a vertexai.init(project="projeto-codex-br", location="us-central1")).
 *
 * Persistência: anexa findings em `transparency_reports/{id}.alertas_anexados`
 * e replica sinais em `alertas_bodes` para o feed SOC.
 */

const VERTEX_PROJECT = "projeto-codex-br";
const VERTEX_LOCATION = "us-central1";
const VERTEX_MODEL = "gemini-1.5-pro";

/** Cérebro forense compartilhado (Caso Gilson — rigor tripartite CEAP × Emendas × Mandato). */
const AURORA_SYSTEM_INSTRUCTION = `
Você é o AURORA, um Auditor Forense Especialista em Gastos Públicos.
Sua missão é cruzar dados para expor anomalias estruturais em três pilares:

[PILAR 1: COTA PARLAMENTAR (CEAP)]
- Aplique o escrutínio logístico e de terceiros. Identifique desvios de finalidade e simulações de despesas (notas frias).

[PILAR 2: A CAIXA PRETA DAS EMENDAS]
- Rastreie o destino final das emendas (RP6, RP7, RP99). O dinheiro foi para prefeituras ou ONGs geridas por aliados, familiares ou doadores de campanha?
- Cruze o CNPJ do favorecido da emenda com os fornecedores da CEAP. Identifique o fluxo de retorno financeiro e conflitos de interesse latentes.

[PILAR 3: PRODUTIVIDADE VS CUSTO DO MANDATO]
- Avalie a atividade legislativa real: presença em plenário, comissões e proposições protocoladas.
- Conclua com o índice de eficiência: o parlamentar justifica o uso do teto da verba pública com entregas reais ou o mandato opera como um sumidouro ineficiente de recursos?
`.trim();

function sanitizeContext(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.length > 4000 ? s.slice(0, 4000) : s;
}

function safeJsonParseFromModel(text) {
  const t = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Resposta do modelo não é JSON válido.");
  }
}

function normalizeFinding(f, idx) {
  if (!f || typeof f !== "object") return null;
  const codigo = String(f.codigo || `F-${String(idx + 1).padStart(2, "0")}`).slice(0, 16);
  const tipo = String(f.tipo || "Auditoria on-demand").slice(0, 120);
  const severidade = String(f.severidade || "SUSPEITO").slice(0, 32);
  const trecho = String(f.trecho || f.mensagem || f.texto || "—").slice(0, 8000);
  const fonte_primaria = String(f.fonte_primaria || f.fonte || "").slice(0, 500);
  const resumo_forense = String(f.resumo_forense || f.resumo_oraculo || "").slice(0, 2000);
  return { codigo, tipo, severidade, trecho, fonte_primaria, resumo_forense };
}

function compactForPrompt(obj, maxLen) {
  try {
    const s = JSON.stringify(obj ?? {});
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  } catch (err) {
    console.warn("compactForPrompt: JSON.stringify failed, falling back to {}", err.message);
    return "{}";
  }
}

async function loadRawBundle(db, politicoId) {
  const [repSnap, polSnap] = await Promise.all([
    db.collection("transparency_reports").doc(politicoId).get(),
    db.collection("politicos").doc(politicoId).get(),
  ]);

  const pick = (snap, keys) => {
    if (!snap.exists) return {};
    const d = snap.data() || {};
    const out = {};
    for (const k of keys) {
      if (d[k] != null) out[k] = d[k];
    }
    return out;
  };

  const reportKeys = [
    "nome",
    "nome_completo",
    "apelido_publico",
    "uf",
    "partido",
    "siglaPartido",
    "emendas_parlamentares",
    "emendas",
    "alertas_anexados",
    "alertas_bodes",
    "proposicoes",
    "proposicoes_filtradas",
    "presenca_plenaria_pct",
    "presenca_pct",
    "presenca",
    "qtd_proposicoes",
    "qtd_proposicoes_autoria",
    "score_aurora",
    "score_asmodeus",
    "indice_risco_aurora",
    "llm_summary",
    "conteudo_premium",
    "metadados",
  ];

  const polKeys = [
    "nome",
    "nome_civil",
    "nome_parlamentar",
    "uf",
    "partido",
    "siglaPartido",
    "urlFoto",
    "cargo",
  ];

  return {
    transparency_reports: pick(repSnap, reportKeys),
    politicos: pick(polSnap, polKeys),
  };
}

async function runGeminiFindings(contextoInvestigativo, bundle) {
  const { VertexAI } = require("@google-cloud/vertexai");
  // Billing / quota explícitos no projeto Vertex (créditos Codex BR)
  const vertexAI = new VertexAI({
    project: VERTEX_PROJECT,
    location: VERTEX_LOCATION,
  });
  const model = vertexAI.getGenerativeModel({
    model: VERTEX_MODEL,
    systemInstruction: {
      role: "system",
      parts: [{ text: AURORA_SYSTEM_INSTRUCTION }],
    },
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.2,
    },
  });

  const payload = compactForPrompt(bundle, 100_000);
  const prompt = [
    "Recebeu um envelope JSON com: registros Firestore (transparency_reports, politicos) e",
    "`datalake_context` (emendas BigQuery, cruzamento emendas×CEAP fornecedor, proposições API Câmara quando id numérico).",
    "Não invente fatos ausentes dos dados. Classifique achados como hipóteses de trabalho quando a evidência for fraca.",
    "",
    `Contexto investigativo (analista): ${contextoInvestigativo || "(não informado)"}`,
    "",
    "Dados brutos (JSON):",
    payload,
    "",
    "Responda APENAS com JSON válido no formato:",
    '{"findings":[{"codigo":"F-01","tipo":"string","severidade":"ILEGAL|IRREGULAR|IMORAL|SUSPEITO","trecho":"string","fonte_primaria":"string","resumo_forense":"string"}]}',
    "Gere entre 3 e 12 findings cobrindo os três pilares (CEAP, emendas/cruzamentos, produtividade legislativa) quando houver base nos dados.",
    "Use severidade SUSPEITO salvo quando os dados sustentem gradação maior.",
  ].join("\n");

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const text =
    result?.response?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  const parsed = safeJsonParseFromModel(text);
  const rawList = Array.isArray(parsed.findings) ? parsed.findings : [];
  return rawList.map((f, i) => normalizeFinding(f, i)).filter(Boolean).slice(0, 15);
}

function mountGerarDossieOnDemand(functionsApi, adminApp) {
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const { buildParlamentarDatalakeContext } = require("./parlamentarInvestigationContext.js");

  return functionsApi
    .region("southamerica-east1")
    .runWith({ memory: "512MB", timeoutSeconds: 120 })
    .https.onCall(async (data, context) => {
      if (!context.auth?.uid) {
        throw new functionsApi.https.HttpsError(
          "unauthenticated",
          "Autenticação necessária para auditoria on-demand.",
        );
      }

      const politicoId = String(
        data?.parlamentarId || data?.politicoId || data?.id || "",
      ).trim();
      if (!politicoId) {
        throw new functionsApi.https.HttpsError(
          "invalid-argument",
          "Informe `parlamentarId` ou `politicoId`.",
        );
      }

      const contextoInvestigativo = sanitizeContext(data?.contextoInvestigativo);

      const bundle0 = await loadRawBundle(db, politicoId);
      let bundle = bundle0;
      try {
        const datalake_context = await buildParlamentarDatalakeContext(politicoId, bundle0);
        bundle = { ...bundle0, datalake_context };
      } catch (e) {
        console.warn("gerarDossieOnDemand datalake_context:", e?.message || e);
      }
      let findings;
      try {
        findings = await runGeminiFindings(contextoInvestigativo, bundle);
      } catch (err) {
        console.error("gerarDossieOnDemand Vertex/Gemini:", err);
        throw new functionsApi.https.HttpsError(
          "internal",
          err instanceof Error ? err.message : "Falha ao invocar Gemini (Vertex).",
        );
      }
      if (!findings.length) {
        throw new functionsApi.https.HttpsError(
          "internal",
          "O modelo não retornou findings válidos.",
        );
      }

      const runId = `${Date.now()}_${context.auth.uid}`;
      const stamped = findings.map((f) => ({
        ...f,
        origem: "gerarDossieOnDemand",
        run_id: runId,
        gerado_em: new Date().toISOString(),
        contexto_investigativo: contextoInvestigativo || null,
      }));

      const reportRef = db.collection("transparency_reports").doc(politicoId);
      const repSnap = await reportRef.get();
      const repData = repSnap.exists ? repSnap.data() || {} : {};
      const prev = Array.isArray(repData.alertas_anexados) ? repData.alertas_anexados : [];
      const merged = [...prev, ...stamped].slice(-100);

      await reportRef.set(
        {
          report_id: politicoId,
          alertas_anexados: merged,
          auditoria_on_demand: {
            ultima_execucao: FieldValue.serverTimestamp(),
            usuario_uid: context.auth.uid,
            contexto_snippet: (contextoInvestigativo || "").slice(0, 500),
            findings_count: stamped.length,
            vertex_project: VERTEX_PROJECT,
            vertex_location: VERTEX_LOCATION,
            model: VERTEX_MODEL,
          },
        },
        { merge: true },
      );

      const batch = db.batch();
      for (const f of stamped) {
        const ref = db.collection("alertas_bodes").doc();
        batch.set(ref, {
          politico_id: politicoId,
          parlamentar_id: politicoId,
          tipo_risco: f.tipo,
          tipo: "gerarDossieOnDemand",
          mensagem: f.trecho,
          severidade: f.severidade,
          codigo: f.codigo,
          resumo_forense: f.resumo_forense || "",
          fonte_primaria: f.fonte_primaria || "",
          contexto_investigativo: contextoInvestigativo || null,
          origem: "gerarDossieOnDemand",
          run_id: runId,
          criado_em: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      return {
        ok: true,
        politicoId,
        findingsCount: stamped.length,
        runId,
      };
    });
}

module.exports = { mountGerarDossieOnDemand };
