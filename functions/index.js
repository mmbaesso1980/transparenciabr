/**
 * Firebase Functions — Stripe Checkout (callable) + webhook de créditos.
 *
 * Definir em ambiente Firebase:
 *   stripeWebhook: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 *   createCheckoutSession: STRIPE_SECRET_KEY
 */

/** API v1 (region + https.onCall etc.) — o pacote principal exporta v2 desde firebase-functions v6 */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { BigQuery } = require("@google-cloud/bigquery");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Stripe = require("stripe");

const {
  classifyArea,
  urgencyFromAnalysis,
  analyzeWithGemini,
  dossierDocId,
} = require("./src/radar/diarioScanner");

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const bigquery = new BigQuery();

const ASMODEUS_SUPREME_AGENT_ID = "agent_1777236402725";
const ASMODEUS_GEMINI_MODEL = "gemini-2.5-pro";
const ASMODEUS_SUB_AGENTS = [
  "ASIMODEUS-001 // MAESTRO",
  "ASIMODEUS-002 // BACKEND",
  "ASIMODEUS-003 // FORENSE",
  "ASIMODEUS-004 // COMPLIANCE",
  "ASIMODEUS-005 // SRE",
  "ASIMODEUS-006 // FINOPS",
  "ASIMODEUS-007 // UX",
  "ASIMODEUS-008 // GROWTH",
  "ASIMODEUS-009 // MEDIA",
  "ASIMODEUS-010 // DATAOPS",
  "ASIMODEUS-011 // EXEC",
  "ASIMODEUS-012 // OSINT",
];

function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function parseJsonLoose(raw) {
  const text = String(raw || "")
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(text);
}

function heuristicCeapRisk(row) {
  const total = Number(row.total_ceap || 0);
  const fornecedores = Number(row.fornecedores_distintos || 0);
  const docs = Number(row.documentos || 0);
  const maior = Number(row.maior_documento || 0);
  const concentration = total > 0 ? maior / total : 0;
  const volume = Math.min(35, Math.log10(total + 1) * 5);
  const concentrationRisk = Math.min(35, concentration * 80);
  const frequencyRisk = docs > 120 ? 18 : docs > 60 ? 10 : docs > 20 ? 5 : 0;
  const supplierRisk = fornecedores <= 2 && total > 50000 ? 12 : 0;
  return clampScore(volume + concentrationRisk + frequencyRisk + supplierRisk);
}

async function analyzeCeapWithSupremeLeader(row) {
  const heuristic = heuristicCeapRisk(row);
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const payload = {
    lider_supremo_agent_id: ASMODEUS_SUPREME_AGENT_ID,
    modelo_obrigatorio: ASMODEUS_GEMINI_MODEL,
    protocolo: "A.S.M.O.D.E.U.S. CEAP",
    instrucao_orquestracao:
      "Distribua mentalmente a analise aos 12 agentes subordinados antes de consolidar o scoreRisco. " +
      "O ASIMODEUS-012 // OSINT pode levantar tendencias, boatos e narrativas publicas, " +
      "mas NADA de OSINT pode ser publicado sem validacao explicita do ASIMODEUS-004 // COMPLIANCE. " +
      "Nao acuse crimes; classifique risco heuristico, auditavel e extra-judicial.",
    agentes_subordinados: ASMODEUS_SUB_AGENTS,
    registro_ceap_agregado: row,
    schema_saida: {
      scoreRisco: "integer 0..100",
      nivelRisco: "BAIXO|MEDIO|ALTO|CRITICO",
      fraudesDetectadas: ["string"],
      resumoAuditoria: "string curta",
      agentesAcionados: ["string"],
      radarOsint: [
        {
          titulo: "string",
          status: "FATO_CONFIRMADO_PELO_MOTOR|FAKE_NEWS_DESMASCARADA|VETADO_COMPLIANCE",
          prova: "string baseada em CEAP/BigQuery/nota fiscal",
          fonteDados: "string",
          compliance: {
            aprovado: "boolean",
            agente: "ASIMODEUS-004 // COMPLIANCE",
            motivo: "string",
          },
        },
      ],
    },
  };

  if (!key) {
    return {
      scoreRisco: heuristic,
      nivelRisco: heuristic >= 85 ? "CRITICO" : heuristic >= 70 ? "ALTO" : heuristic >= 40 ? "MEDIO" : "BAIXO",
      fraudesDetectadas: heuristic >= 70 ? ["concentracao_ceap", "volume_atipico"] : [],
      resumoAuditoria: "Classificacao heuristica local; GEMINI_API_KEY/GOOGLE_API_KEY ausente na Cloud Function.",
      agentesAcionados: ASMODEUS_SUB_AGENTS,
      radarOsint: buildDeterministicOsint(row),
      modelo: "heuristic-fallback",
      liderSupremoAgentId: ASMODEUS_SUPREME_AGENT_ID,
    };
  }

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: ASMODEUS_GEMINI_MODEL,
    systemInstruction:
      "Voce e o Lider Supremo A.S.M.O.D.E.U.S. (Agent ID agent_1777236402725). " +
      "Atue como auditor forense de CEAP, direito administrativo e gasto parlamentar brasileiro. " +
      "Consolide a deliberacao dos 11 agentes subordinados. Responda apenas JSON valido.",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      maxOutputTokens: 2048,
    },
  });

  const result = await model.generateContent(JSON.stringify(payload));
  const parsed = parseJsonLoose(result.response.text());
  const score = clampScore(parsed.scoreRisco ?? heuristic);
  return {
    scoreRisco: score,
    nivelRisco:
      parsed.nivelRisco ||
      (score >= 85 ? "CRITICO" : score >= 70 ? "ALTO" : score >= 40 ? "MEDIO" : "BAIXO"),
    fraudesDetectadas: Array.isArray(parsed.fraudesDetectadas) ? parsed.fraudesDetectadas.map(String) : [],
    resumoAuditoria: String(parsed.resumoAuditoria || "Analise CEAP consolidada pelo Lider Supremo."),
    agentesAcionados: Array.isArray(parsed.agentesAcionados) ? parsed.agentesAcionados.map(String) : ASMODEUS_SUB_AGENTS,
    radarOsint: filterComplianceApprovedOsint(parsed.radarOsint, row),
    modelo: ASMODEUS_GEMINI_MODEL,
    liderSupremoAgentId: ASMODEUS_SUPREME_AGENT_ID,
  };
}

function filterComplianceApprovedOsint(items, row) {
  const fromModel = Array.isArray(items) ? items : [];
  const safe = fromModel
    .filter((item) => item && typeof item === "object")
    .filter((item) => item.compliance?.aprovado === true)
    .filter((item) => String(item.compliance?.agente || "").includes("ASIMODEUS-004"))
    .map((item) => ({
      titulo: String(item.titulo || "").slice(0, 180),
      status: ["FATO_CONFIRMADO_PELO_MOTOR", "FAKE_NEWS_DESMASCARADA"].includes(item.status)
        ? item.status
        : "FATO_CONFIRMADO_PELO_MOTOR",
      prova: String(item.prova || "").slice(0, 500),
      fonteDados: String(item.fonteDados || "BigQuery CEAP + Compliance 004").slice(0, 180),
      compliance: {
        aprovado: true,
        agente: "ASIMODEUS-004 // COMPLIANCE",
        motivo: String(item.compliance?.motivo || "Publicacao autorizada por estar baseada em dados verificaveis.").slice(0, 280),
      },
    }))
    .filter((item) => item.titulo && item.prova);
  return safe.length ? safe : buildDeterministicOsint(row);
}

function buildDeterministicOsint(row) {
  const total = Number(row.total_ceap || 0);
  const docs = Number(row.documentos || 0);
  const top = Array.isArray(row.top_despesas) ? row.top_despesas : [];
  const withReceipt = top.filter((item) => item?.url_documento).length;
  const out = [];
  if (total > 0) {
    out.push({
      titulo: "Volume CEAP auditado no recorte selecionado",
      status: "FATO_CONFIRMADO_PELO_MOTOR",
      prova: `BigQuery consolidou ${docs.toLocaleString("pt-BR")} documentos CEAP no recorte, totalizando ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      fonteDados: "transparenciabr.ceap_despesas",
      compliance: {
        aprovado: true,
        agente: "ASIMODEUS-004 // COMPLIANCE",
        motivo: "Afirmação puramente quantitativa, baseada em tabela pública CEAP.",
      },
    });
  }
  if (top.length > 0) {
    out.push({
      titulo: "Alegação genérica de ausência de comprovantes na amostra principal",
      status: withReceipt > 0 ? "FAKE_NEWS_DESMASCARADA" : "FATO_CONFIRMADO_PELO_MOTOR",
      prova: withReceipt > 0
        ? `${withReceipt} das maiores despesas auditadas incluem link de nota/recibo público para conferência.`
        : "A amostra principal ainda não trouxe URL de recibo nos campos públicos disponíveis.",
      fonteDados: "CEAP Câmara / campo urlDocumento",
      compliance: {
        aprovado: true,
        agente: "ASIMODEUS-004 // COMPLIANCE",
        motivo: "Classificação limitada à disponibilidade documental nos dados públicos, sem imputação pessoal.",
      },
    });
  }
  return out;
}

function buildCeapQuery({ startYear, endYear, limit, targetId, targetName }) {
  const targetFilters = [];
  const params = { startYear, endYear, limit };
  const cleanTargetId = String(targetId || "").trim();
  const cleanTargetName = String(targetName || "").trim();
  if (cleanTargetId) {
    targetFilters.push("CAST(parlamentar_id AS STRING) = @targetId");
    params.targetId = cleanTargetId;
  }
  if (cleanTargetName) {
    targetFilters.push("LOWER(CAST(nome_parlamentar AS STRING)) LIKE LOWER(@targetNameLike)");
    params.targetNameLike = `%${cleanTargetName}%`;
  }
  const targetWhere = targetFilters.length ? `AND (${targetFilters.join(" OR ")})` : "";
  return {
    query: `
      WITH base AS (
        SELECT
          CAST(parlamentar_id AS STRING) AS parlamentar_id,
          CAST(nome_parlamentar AS STRING) AS nome_parlamentar,
          SAFE_CAST(valor_documento AS FLOAT64) AS valor_documento,
          CAST(cnpj_fornecedor AS STRING) AS cnpj_fornecedor,
          CAST(tipo_despesa AS STRING) AS tipo_despesa,
          CAST(numero_documento AS STRING) AS numero_documento,
          DATE(data_emissao) AS data_emissao
        FROM \`transparenciabr.ceap_despesas\`
        WHERE EXTRACT(YEAR FROM DATE(data_emissao)) BETWEEN @startYear AND @endYear
          AND parlamentar_id IS NOT NULL
          AND SAFE_CAST(valor_documento AS FLOAT64) IS NOT NULL
          ${targetWhere}
      ),
      agg AS (
        SELECT
          parlamentar_id,
          ANY_VALUE(nome_parlamentar) AS nome_parlamentar,
          SUM(valor_documento) AS total_ceap,
          COUNT(1) AS documentos,
          COUNT(DISTINCT NULLIF(cnpj_fornecedor, '')) AS fornecedores_distintos,
          MAX(valor_documento) AS maior_documento,
          ARRAY_AGG(
            STRUCT(
              data_emissao,
              numero_documento,
              tipo_despesa,
              cnpj_fornecedor,
              valor_documento,
              IF(
                REGEXP_CONTAINS(CAST(numero_documento AS STRING), r'^[0-9]+$'),
                CONCAT('https://www.camara.leg.br/cota-parlamentar/documentos/publ/', CAST(numero_documento AS STRING), '.pdf'),
                NULL
              ) AS url_documento
            )
            ORDER BY valor_documento DESC
            LIMIT 120
          ) AS top_despesas
        FROM base
        GROUP BY parlamentar_id
      )
      SELECT *
      FROM agg
      ORDER BY total_ceap DESC
      LIMIT @limit
    `,
    params,
  };
}

async function countCeapRows(startYear, endYear) {
  const [job] = await bigquery.createQueryJob({
    query: `
      SELECT COUNT(1) AS total
      FROM \`transparenciabr.ceap_despesas\`
      WHERE EXTRACT(YEAR FROM DATE(data_emissao)) BETWEEN @startYear AND @endYear
    `,
    params: { startYear, endYear },
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  return Number(rows?.[0]?.total || 0);
}

async function loadPublicCeapColumns() {
  const [job] = await bigquery.createQueryJob({
    query: `
      SELECT column_name
      FROM \`basedosdados.br_camara_dados_abertos.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = 'despesa'
    `,
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  const byLower = {};
  for (const row of rows) {
    const name = String(row.column_name || "");
    if (name) byLower[name.toLowerCase()] = name;
  }
  return byLower;
}

function pickPublicColumn(columns, candidates) {
  for (const candidate of candidates) {
    const found = columns[String(candidate).toLowerCase()];
    if (found) return found;
  }
  return null;
}

function publicColumnRef(column) {
  return `\`${column}\``;
}

function publicStringExpr(columns, candidates, fallback = "''") {
  const col = pickPublicColumn(columns, candidates);
  return col ? `CAST(${publicColumnRef(col)} AS STRING)` : fallback;
}

function publicNumberExpr(columns, candidates, fallback = "0.0") {
  const col = pickPublicColumn(columns, candidates);
  return col ? `SAFE_CAST(${publicColumnRef(col)} AS FLOAT64)` : fallback;
}

function publicDateExpr(columns, candidates) {
  const col = pickPublicColumn(columns, candidates);
  if (!col) return null;
  const ref = publicColumnRef(col);
  return (
    `COALESCE(` +
    `SAFE_CAST(${ref} AS DATE), ` +
    `DATE(SAFE_CAST(${ref} AS TIMESTAMP)), ` +
    `SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(CAST(${ref} AS STRING), 1, 10)), ` +
    `SAFE.PARSE_DATE('%d/%m/%Y', SUBSTR(CAST(${ref} AS STRING), 1, 10))` +
    `)`
  );
}

async function ensureCeapTableSeeded(startYear, endYear) {
  const existing = await countCeapRows(startYear, endYear).catch((error) => {
    console.warn("CEAP count falhou; tabela sera criada/semeada:", error.message || error);
    return 0;
  });
  if (existing > 0) {
    return { seeded: false, rowsBefore: existing, inserted: 0 };
  }

  const sourceColumns = await loadPublicCeapColumns();
  const parlamentarExpr = publicStringExpr(sourceColumns, [
    "id_deputado",
    "ide_cadastro",
    "idecadastro",
    "nudeputadoid",
    "cpf",
  ]);
  const nomeExpr = publicStringExpr(sourceColumns, [
    "nome_parlamentar",
    "tx_nome_parlamentar",
    "txnomeparlamentar",
    "nome",
  ]);
  const cnpjExpr = publicStringExpr(sourceColumns, [
    "txt_cnpj_cpf",
    "txtcnpjcpf",
    "cnpj_cpf",
    "cpf_cnpj",
    "cpf_cnpj_fornecedor",
  ]);
  const fornecedorExpr = publicStringExpr(sourceColumns, [
    "txt_fornecedor",
    "txtfornecedor",
    "nome_fornecedor",
    "fornecedor",
  ]);
  const valorExpr = publicNumberExpr(sourceColumns, [
    "valor_liquido",
    "vlr_liquido",
    "vlrliquido",
    "valor_documento",
    "vlr_documento",
    "vlrdocumento",
  ]);
  const numeroExpr = publicStringExpr(sourceColumns, [
    "txt_numero",
    "txtnumero",
    "id_documento",
    "idedocumento",
    "numero_documento",
  ]);
  const tipoExpr = publicStringExpr(sourceColumns, [
    "categoria_despesa",
    "txt_descricao",
    "txtdescricao",
    "tipo_despesa",
  ]);
  const codigoEleitoralExpr = publicStringExpr(sourceColumns, [
    "id_deputado",
    "ide_cadastro",
    "idecadastro",
    "nudeputadoid",
  ]);
  const dateExpr = publicDateExpr(sourceColumns, [
    "data_emissao",
    "dat_emissao",
    "datemissao",
    "data",
  ]);
  if (!dateExpr) {
    throw new Error(
      `Nao foi possivel identificar coluna de data em basedosdados.br_camara_dados_abertos.despesa. ` +
      `Colunas: ${Object.keys(sourceColumns).sort().join(", ")}`,
    );
  }

  const [job] = await bigquery.createQueryJob({
    query: `
      CREATE TABLE IF NOT EXISTS \`transparenciabr.ceap_despesas\` (
        parlamentar_id STRING NOT NULL,
        nome_parlamentar STRING,
        cnpj_fornecedor STRING,
        nome_fornecedor STRING,
        uf_fornecedor STRING,
        codigo_ibge_municipio STRING,
        municipio_nome STRING,
        valor_documento FLOAT64,
        numero_documento STRING,
        tipo_despesa STRING,
        codigo_eleitoral STRING,
        data_emissao DATE,
        ingest_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
      )
      PARTITION BY data_emissao
      CLUSTER BY parlamentar_id, cnpj_fornecedor;

      INSERT INTO \`transparenciabr.ceap_despesas\` (
        parlamentar_id,
        nome_parlamentar,
        cnpj_fornecedor,
        nome_fornecedor,
        uf_fornecedor,
        codigo_ibge_municipio,
        municipio_nome,
        valor_documento,
        numero_documento,
        tipo_despesa,
        codigo_eleitoral,
        data_emissao,
        ingest_ts
      )
      SELECT
        ${parlamentarExpr} AS parlamentar_id,
        ${nomeExpr} AS nome_parlamentar,
        REGEXP_REPLACE(${cnpjExpr}, r'[^0-9]', '') AS cnpj_fornecedor,
        ${fornecedorExpr} AS nome_fornecedor,
        CAST(NULL AS STRING) AS uf_fornecedor,
        CAST(NULL AS STRING) AS codigo_ibge_municipio,
        CAST(NULL AS STRING) AS municipio_nome,
        ${valorExpr} AS valor_documento,
        ${numeroExpr} AS numero_documento,
        ${tipoExpr} AS tipo_despesa,
        ${codigoEleitoralExpr} AS codigo_eleitoral,
        ${dateExpr} AS data_emissao,
        CURRENT_TIMESTAMP() AS ingest_ts
      FROM \`basedosdados.br_camara_dados_abertos.despesa\`
      WHERE EXTRACT(YEAR FROM ${dateExpr}) BETWEEN @startYear AND @endYear
        AND ${parlamentarExpr} IS NOT NULL
        AND ${parlamentarExpr} != ''
        AND ${valorExpr} IS NOT NULL
        AND ${dateExpr} IS NOT NULL
    `,
    params: { startYear, endYear },
    location: "US",
  });
  await job.getQueryResults();
  const inserted = await countCeapRows(startYear, endYear);
  return { seeded: true, rowsBefore: existing, inserted };
}

function plainValue(v) {
  if (v == null) return v;
  if (typeof v.value === "function") return v.value();
  if (Array.isArray(v)) return v.map(plainValue);
  if (typeof v === "object") {
    if (typeof v.toISOString === "function") return v.toISOString().slice(0, 10);
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = plainValue(val);
    return out;
  }
  return v;
}

async function loadCeapAggregates(startYear, endYear, limit, targetId, targetName) {
  const q = buildCeapQuery({ startYear, endYear, limit, targetId, targetName });
  const [job] = await bigquery.createQueryJob({
    query: q.query,
    params: q.params,
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  return rows.map((row) => plainValue(row));
}

async function commitReports(reports) {
  let batch = db.batch();
  let pending = 0;
  let committed = 0;
  for (const report of reports) {
    const pid = String(report.parlamentar_id || "").trim();
    if (!pid) continue;
    const publicDoc = {
      id: pid,
      nome: report.nome_parlamentar || pid,
      nome_completo: report.nome_parlamentar || pid,
      apelido_publico: report.nome_parlamentar || pid,
      partido_sigla: "CEAP",
      score_forense: report.analise_asmodeus.scoreRisco,
      indice_risco: report.analise_asmodeus.scoreRisco,
      alertas_anexados: report.alertas_anexados,
      investigacoes_top: report.investigacoes_top,
      ceap_resumo: report.ceap_resumo,
      analise_asmodeus: report.analise_asmodeus,
      atualizado_em: FieldValue.serverTimestamp(),
    };
    const transparencyDoc = {
      report_id: `politico_${pid}`,
      tipo_dossie: "politico_ceap",
      identidade: { parlamentar_id: pid, nome: report.nome_parlamentar || pid },
      contratos: {
        total_contratos: Number(report.ceap_resumo.documentos || 0),
        valor_total_contratos: Number(report.ceap_resumo.total_ceap || 0),
        contratos_relevantes: report.investigacoes_top,
      },
      alertas: {
        empresas_fachada: [],
        surtos_orcamentarios: [],
      },
      analise_semantica: {
        indice_risco: report.analise_asmodeus.scoreRisco,
        fraudes_detectadas: report.analise_asmodeus.fraudesDetectadas,
        resumo_auditoria: report.analise_asmodeus.resumoAuditoria,
        confianca: 0.72,
      },
      metadados: {
        fonte: "retroactiveScanBigQueryToFirestore",
        modelo: report.analise_asmodeus.modelo,
        lider_supremo_agent_id: ASMODEUS_SUPREME_AGENT_ID,
        sincronizado_em: new Date().toISOString(),
      },
      updated_at: FieldValue.serverTimestamp(),
    };
    batch.set(db.collection("politicos").doc(pid), publicDoc, { merge: true });
    batch.set(db.collection("transparency_reports").doc(pid), transparencyDoc, { merge: true });
    pending += 2;
    if (pending >= 498) {
      await batch.commit();
      committed += 1;
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending) {
    await batch.commit();
    committed += 1;
  }
  return committed;
}

async function runCeapScan({ startYear, endYear, limit, targetId, targetName }) {
  const seed = await ensureCeapTableSeeded(startYear, endYear);
  const rows = await loadCeapAggregates(startYear, endYear, limit, targetId, targetName);
  const reports = [];
  for (const row of rows) {
    const analysis = await analyzeCeapWithSupremeLeader(row);
    const top = Array.isArray(row.top_despesas) ? row.top_despesas : [];
    reports.push({
      parlamentar_id: row.parlamentar_id,
      nome_parlamentar: row.nome_parlamentar,
      ceap_resumo: {
        periodo: { startYear, endYear },
        total_ceap: Number(row.total_ceap || 0),
        documentos: Number(row.documentos || 0),
        fornecedores_distintos: Number(row.fornecedores_distintos || 0),
        maior_documento: Number(row.maior_documento || 0),
      },
      investigacoes_top: top.map((d, idx) => ({
        ref: d.numero_documento || `CEAP-${idx + 1}`,
        titulo: d.tipo_despesa || "Despesa CEAP",
        foco: d.cnpj_fornecedor || "fornecedor nao identificado",
        valor: Number(d.valor_documento || 0),
        data_referencia: d.data_emissao || "",
        url_documento: d.url_documento || "",
      })),
      historico_ceap: top.map((d, idx) => ({
        ref: d.numero_documento || `CEAP-${idx + 1}`,
        tipo_despesa: d.tipo_despesa || "Despesa CEAP",
        cnpj_fornecedor: d.cnpj_fornecedor || "",
        valor_documento: Number(d.valor_documento || 0),
        data_emissao: d.data_emissao || "",
      })),
      alertas_anexados: [
        {
          tipo: "ASMODEUS_CEAP",
          severidade: analysis.nivelRisco,
          trecho: analysis.resumoAuditoria,
          fonte: "gemini-2.5-pro/lider-supremo",
        },
      ],
      analise_asmodeus: analysis,
    });
  }
  const batches = await commitReports(reports);
  return { processed: reports.length, batches, startYear, endYear, seed, targetId, targetName };
}

exports.syncBigQueryToFirestore = functions
  .region("us-central1")
  .runWith({ memory: "1GB", timeoutSeconds: 300 })
  .https.onRequest(async (req, res) => {
    try {
      const year = new Date().getUTCFullYear();
      const payload = typeof req.body === "object" && req.body ? req.body : {};
      const limit = Math.max(1, Math.min(Number(payload.limit || 80), 250));
      const targetId = payload.targetId || payload.parlamentarId || payload.idParlamentar;
      const targetName = payload.targetName || payload.nomeParlamentar || payload.name;
      const result = await runCeapScan({ startYear: year, endYear: year, limit, targetId, targetName });
      res.json({
        ok: true,
        sensor: "syncBigQueryToFirestore",
        liderSupremoAgentId: ASMODEUS_SUPREME_AGENT_ID,
        modelo: ASMODEUS_GEMINI_MODEL,
        agentesAtivos: ASMODEUS_SUB_AGENTS,
        ...result,
      });
    } catch (err) {
      console.error("syncBigQueryToFirestore failed:", err);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

exports.retroactiveScanBigQueryToFirestore = functions
  .region("us-central1")
  .runWith({ memory: "2GB", timeoutSeconds: 540 })
  .https.onRequest(async (req, res) => {
    try {
      const payload = typeof req.body === "object" && req.body ? req.body : {};
      const startYear = Math.max(2009, Number(payload.startYear || 2023));
      const endYear = Math.max(startYear, Math.min(Number(payload.endYear || new Date().getUTCFullYear()), 2030));
      const limit = Math.max(1, Math.min(Number(payload.limit || 120), 500));
      const targetId = payload.targetId || payload.parlamentarId || payload.idParlamentar;
      const targetName = payload.targetName || payload.nomeParlamentar || payload.name;
      const result = await runCeapScan({ startYear, endYear, limit, targetId, targetName });
      res.json({
        ok: true,
        sensor: "retroactiveScanBigQueryToFirestore",
        liderSupremoAgentId: ASMODEUS_SUPREME_AGENT_ID,
        modelo: ASMODEUS_GEMINI_MODEL,
        agentesAtivos: ASMODEUS_SUB_AGENTS,
        ...result,
      });
    } catch (err) {
      console.error("retroactiveScanBigQueryToFirestore failed:", err);
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

function requireStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY ausente");
  }
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

function creditsFromSession(session) {
  const meta = session.metadata || {};
  const direct = parseInt(meta.credits || meta.creditos || "0", 10);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const total = session.amount_total;
  if (total && total > 0) return Math.max(1, Math.round(total / 100));
  return 0;
}

/** HTTP — Stripe webhook (checkout.session.completed) */
exports.stripeWebhook = functions
  .region("southamerica-east1")
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET ausente");
      res.status(500).send("webhook_not_configured");
      return;
    }

    let stripe;
    try {
      stripe = requireStripe();
    } catch (e) {
      console.error(e.message);
      res.status(500).send("stripe_init_error");
      return;
    }

    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
      console.warn("Webhook signature:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const uid =
        session.client_reference_id ||
        (session.metadata && session.metadata.uid) ||
        "";

      const credits = creditsFromSession(session);

      if (uid && credits > 0) {
        await db.collection("usuarios").doc(uid).set(
          {
            creditos: FieldValue.increment(credits),
            updated_at: FieldValue.serverTimestamp(),
            ultima_compra_stripe: FieldValue.serverTimestamp(),
            ultima_compra_creditos: credits,
          },
          { merge: true },
        );
        console.log(`Créditos +${credits} → usuarios/${uid}`);
      } else {
        console.warn("Sessão sem uid ou créditos:", session.id, uid, credits);
      }
    }

    res.json({ received: true });
  });

/** Callable — devolve { url } para Checkout Stripe */
exports.createCheckoutSession = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "É necessário iniciar sessão.",
      );
    }

    let stripe;
    try {
      stripe = requireStripe();
    } catch (e) {
      throw new functions.https.HttpsError("failed-precondition", e.message);
    }

    const uid = context.auth.uid;
    const credits = parseInt(data.credits || data.creditos || "0", 10);
    const priceId = (data.priceId || data.price_id || "").trim();

    // 🛡️ Sentinel: Validate origin to prevent Open Redirect
    let origin = (data.origin || "").replace(/\/$/, "");
    const allowedOrigins = [
      "https://transparenciabr.com.br",
      "https://transparenciabr.web.app",
      "https://transparenciabr.firebaseapp.com"
    ];
    // Allow localhost for local development
    if (!origin.startsWith("http://localhost:") && !allowedOrigins.includes(origin)) {
      origin = "https://transparenciabr.web.app";
    }

    // 🛡️ Sentinel: Hardcode path to prevent redirection to arbitrary URLs
    const successUrl = `${origin}/creditos?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/creditos?canceled=1`;

    /** @type {import('stripe').Stripe.Checkout.SessionCreateParams} */
    const params = {
      mode: "payment",
      client_reference_id: uid,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        uid,
        credits: String(credits),
      },
    };

    if (priceId) {
      params.line_items = [{ price: priceId, quantity: 1 }];
      // 🛡️ Sentinel: Prevent parameter tampering by zeroing credits when using a predefined priceId
      params.metadata = { ...params.metadata, credits: "0" };
    } else if (credits > 0) {
      params.line_items = [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: `Créditos investigativos (${credits})`,
              description: "A.S.M.O.D.E.U.S. — Transparência BR",
            },
            unit_amount: Math.max(100, credits * 10),
          },
          quantity: 1,
        },
      ];
    } else {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Informe priceId ou credits.",
      );
    }

    const session = await stripe.checkout.sessions.create(params);
    return { url: session.url, id: session.id };
  });

/**
 * Novo ato em diarios_atos → classificação + Gemini (Flash) → radar_dossiers (privado).
 * Env: GEMINI_API_KEY, RADAR_OWNER_UID (Firebase Auth UID do operador jurídico).
 */
exports.onDiarioAtoCreated = functions
  .region("southamerica-east1")
  .firestore.document("diarios_atos/{atoId}")
  .onCreate(async (snap, context) => {
    const ownerUid = (process.env.RADAR_OWNER_UID || "").trim();
    if (!ownerUid) {
      console.warn("RADAR_OWNER_UID ausente — scanner jurídico ignorado.");
      return null;
    }

    const data = snap.data() || {};
    const trecho = String(data.trecho_ato || data.texto || "").trim();
    if (!trecho) return null;

    const area = classifyArea(trecho);
    if (!area) return null;

    let analysis;
    try {
      analysis = await analyzeWithGemini(trecho);
    } catch (e) {
      console.error("Gemini (diário):", e.message || e);
      return null;
    }

    if (analysis.oportunidade_identificada === false) return null;

    const urgencia = urgencyFromAnalysis(analysis);
    const atoId = context.params.atoId;
    const docId = dossierDocId(atoId, ownerUid);

    await db
      .collection("radar_dossiers")
      .doc(docId)
      .set(
        {
          painel_area: "juridico",
          area,
          municipio: String(data.municipio || "").slice(0, 512),
          urgencia,
          uid_proprietario: ownerUid,
          is_private: true,
          fontes: [
            {
              tipo: "diario_oficial",
              url_fonte: String(data.url_fonte || ""),
              territory_id: String(data.territory_id || ""),
              data_ato: String(data.data || ""),
              trecho_ref: trecho.slice(0, 1200),
              source_ato_id: atoId,
            },
          ],
          analise_gemini: analysis,
          criado_em: FieldValue.serverTimestamp(),
          atualizado_em: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    console.log(`radar_dossiers/${docId} gerado a partir de diarios_atos/${atoId}`);
    return null;
  });
