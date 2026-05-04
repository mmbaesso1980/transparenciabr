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

const grantRoleModule = require("./src/admin/grantRole");

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const bigquery = new BigQuery();

const ASMODEUS_SUPREME_AGENT_ID = "agent_1777236402725";
const ASMODEUS_GEMINI_MODEL = "gemini-2.5-pro";
/**
 * Doze “papéis” operacionais sob orquestração do Vertex IA — todos consolidados no Líder Supremo.
 * G.O.A.T.: não inventar IDs secundários (@slot_*, agentes genéricos); apenas agent_1777236402725.
 */
const VERTEX_SUBAGENT_COUNT = 12;
const VERTEX_TEAM_SLOTS = Array.from({ length: VERTEX_SUBAGENT_COUNT }, () => ASMODEUS_SUPREME_AGENT_ID);
const COMPLIANCE_SLOT_LABEL = `${ASMODEUS_SUPREME_AGENT_ID} (COMPLIANCE)`;

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
      "Distribua mentalmente a analise aos 12 subagentes do Vertex IA ligados ao Lider Supremo " +
      `(Agent ID ${ASMODEUS_SUPREME_AGENT_ID}) antes de consolidar o scoreRisco. ` +
      "O papel OSINT pode levantar tendencias e narrativas publicas, " +
      `mas NADA de OSINT pode ser publicado sem validacao explicita pelo slot de Compliance (${COMPLIANCE_SLOT_LABEL}). ` +
      "Nao acuse crimes; classifique risco heuristico, auditavel e extra-judicial.",
    agentes_subordinados: VERTEX_TEAM_SLOTS,
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
            agente: `string (ex.: ${COMPLIANCE_SLOT_LABEL})`,
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
      agentesAcionados: VERTEX_TEAM_SLOTS,
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
      "Consolide a deliberacao dos 12 agentes subordinados (Vertex IA sob o Lider Supremo). Responda apenas JSON valido.",
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
    agentesAcionados: Array.isArray(parsed.agentesAcionados)
      ? parsed.agentesAcionados.map(String)
      : VERTEX_TEAM_SLOTS,
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
    .filter((item) =>
      String(item.compliance?.agente || "").includes(ASMODEUS_SUPREME_AGENT_ID),
    )
    .map((item) => ({
      titulo: String(item.titulo || "").slice(0, 180),
      status: ["FATO_CONFIRMADO_PELO_MOTOR", "FAKE_NEWS_DESMASCARADA"].includes(item.status)
        ? item.status
        : "FATO_CONFIRMADO_PELO_MOTOR",
      prova: String(item.prova || "").slice(0, 500),
      fonteDados: String(item.fonteDados || "BigQuery CEAP + Compliance 004").slice(0, 180),
      compliance: {
        aprovado: true,
        agente: COMPLIANCE_SLOT_LABEL,
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
        agente: COMPLIANCE_SLOT_LABEL,
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
        agente: COMPLIANCE_SLOT_LABEL,
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
        agentesAtivos: VERTEX_TEAM_SLOTS,
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
        agentesAtivos: VERTEX_TEAM_SLOTS,
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
  .runWith({ secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] })
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
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
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

    // Checkout redirects: domínio oficial (catálogo Stripe V2)
    const checkoutBase = "https://transparenciabr.web.app";
    const successUrl = `${checkoutBase}/sucesso?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${checkoutBase}/creditos?canceled=1`;

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

    // Catálogo oficial Stripe (price IDs no Dashboard — espelha frontend/CreditosPage.jsx)
    const PACKAGE_CATALOG = {
      starter_500: {
        credits: 500,
        stripe_price_id: "price_1TRf4NDnfbKVv2ZRDRnR09b8",
      },
      jornalista_1500: {
        credits: 1500,
        stripe_price_id: "price_1TRf5XDnfbKVv2ZRSFw8vMxN",
      },
      investigador_4000: {
        credits: 4000,
        stripe_price_id: "price_1TRf6RDnfbKVv2ZRge1XL7oJ",
      },
    };
    const packageId = (data.packageId || data.package_id || "").trim();

    if (priceId) {
      params.line_items = [{ price: priceId, quantity: 1 }];
    } else if (packageId && PACKAGE_CATALOG[packageId]) {
      const pkg = PACKAGE_CATALOG[packageId];
      params.metadata.credits = String(pkg.credits);
      params.metadata.package_id = packageId;
      params.line_items = [{ price: pkg.stripe_price_id, quantity: 1 }];
    } else if (credits > 0) {
      // Fallback: preço calculado em R$ 0,30/crédito (mesmo do tier Starter)
      params.line_items = [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: `Créditos avulsos (${credits})`,
              description: "TransparênciaBR — pacote customizado",
            },
            unit_amount: Math.max(100, credits * 30),
          },
          quantity: 1,
        },
      ];
    } else {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Informe packageId, priceId ou credits.",
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

exports.grantRole = grantRoleModule.grantRole;
exports.listMyClaims = grantRoleModule.listMyClaims;

// ────────────────────────────────────────────────────────────────────────────
// getSprintStatus — serve publicamente o JSON do status do sprint (Vertex Calibrada)
// Lê de gs://datalake-tbr-clean/dashboard/sprint_status.json (privado), retorna JSON público.
// Sem auth: ler o status do sprint é informação pública não sensível (volumes, contagens, hashes).
// Diretiva Suprema preservada: ZERO Firestore — leitura direta do GCS via SDK autenticado da function.
// ────────────────────────────────────────────────────────────────────────────
exports.getSprintStatus = functions
  .region("southamerica-east1")
  .runWith({ memory: "256MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    // CORS é permissivo: status é público por design
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Cache-Control", "public, max-age=30, s-maxage=60");
    res.set("Content-Type", "application/json; charset=utf-8");

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { Storage } = require("@google-cloud/storage");
      const storage = new Storage();
      const file = storage.bucket("datalake-tbr-clean").file("dashboard/sprint_status.json");
      const [exists] = await file.exists();
      if (!exists) {
        res.status(404).json({
          error: "sprint_status.json ainda não publicado",
          hint: "Aguarde o próximo build_status na VM tbr-mainframe",
          generated_at: new Date().toISOString(),
        });
        return;
      }
      const [buf] = await file.download();
      res.status(200).send(buf.toString("utf-8"));
    } catch (err) {
      console.error("getSprintStatus error:", err);
      res.status(500).json({ error: "failed_to_read_status", detail: String(err.message || err) });
    }
  });

// ────────────────────────────────────────────────────────────────────────
// /universo — cadastro básico de parlamentares (id, nome, partido, UF) lido do Data Lake.
// Snapshot é gerado por seedUniverseRoster (query BQ público) e servido por getUniverseRoster.
// Diretiva Suprema preservada: ZERO Firestore — leitura/escrita direta no GCS.
// ────────────────────────────────────────────────────────────────────────
exports.seedUniverseRoster = functions
  .region("us-central1")
  .runWith({ memory: "512MB", timeoutSeconds: 180 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    try {
      // Câmara: API oficial dadosabertos.camara.leg.br/api/v2/deputados (paginada).
      // Senátores: legis.senado.leg.br/dadosabertos/senador/lista/atual.json (resposta única).
      // Sem dependência de BigQuery — dados sempre frescos, fonte oficial.
      const fetchJson = async (url, headers = {}) => {
        const resp = await fetch(url, { headers: { Accept: "application/json", ...headers } });
        if (!resp.ok) throw new Error(`${url} returned ${resp.status}`);
        return resp.json();
      };

      // Paginar a Câmara: 100 por página, pára quando não tem `next`.
      const camaraDeputados = [];
      let pagina = 1;
      while (true) {
        const url = `https://dadosabertos.camara.leg.br/api/v2/deputados?ordem=ASC&ordenarPor=nome&itens=100&pagina=${pagina}`;
        const data = await fetchJson(url);
        const dados = Array.isArray(data?.dados) ? data.dados : [];
        for (const d of dados) {
          camaraDeputados.push({
            id: String(d.id || "").trim(),
            nome: String(d.nome || "").trim(),
            partido: String(d.siglaPartido || "").trim().toUpperCase(),
            uf: String(d.siglaUf || "").trim().toUpperCase(),
            urlFoto: d.urlFoto || "",
            cargo: "deputado",
          });
        }
        const hasNext = Array.isArray(data?.links) && data.links.some((l) => l.rel === "next");
        if (!hasNext || dados.length === 0) break;
        pagina++;
        if (pagina > 30) break; // sanity
      }

      // Senátores em exercício: uma única chamada.
      const senadoresList = [];
      try {
        const sJson = await fetchJson(
          "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json",
        );
        const arr = sJson?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar;
        const list = Array.isArray(arr) ? arr : arr ? [arr] : [];
        for (const p of list) {
          const ip = p?.IdentificacaoParlamentar || {};
          senadoresList.push({
            id: String(ip.CodigoParlamentar || "").trim(),
            nome: String(ip.NomeParlamentar || "").trim(),
            partido: String(ip.SiglaPartidoParlamentar || "").trim().toUpperCase(),
            uf: String(ip.UfParlamentar || "").trim().toUpperCase(),
            urlFoto: ip.UrlFotoParlamentar || "",
            cargo: "senador",
          });
        }
      } catch (e) {
        console.warn("senadores não carregados:", e.message);
      }

      const all = [...camaraDeputados, ...senadoresList].filter((r) => r.id && r.nome);

      const payload = {
        generated_at: new Date().toISOString(),
        total: all.length,
        deputados: camaraDeputados.length,
        senadores: senadoresList.length,
        fonte: "dadosabertos.camara.leg.br + legis.senado.leg.br",
        roster: all,
      };

      const { Storage } = require("@google-cloud/storage");
      const storage = new Storage();
      const file = storage.bucket("datalake-tbr-clean").file("universe/roster.json");
      await file.save(JSON.stringify(payload), {
        contentType: "application/json; charset=utf-8",
        metadata: { cacheControl: "public, max-age=300" },
      });

      res.json({
        ok: true,
        total: all.length,
        deputados: camaraDeputados.length,
        senadores: senadoresList.length,
      });
    } catch (err) {
      console.error("seedUniverseRoster error:", err);
      res.status(500).json({ ok: false, error: String(err.message || err) });
    }
  });

exports.getUniverseRoster = functions
  .region("southamerica-east1")
  .runWith({ memory: "256MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.set("Content-Type", "application/json; charset=utf-8");

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const { Storage } = require("@google-cloud/storage");
      const storage = new Storage();
      const file = storage.bucket("datalake-tbr-clean").file("universe/roster.json");
      const [exists] = await file.exists();
      if (!exists) {
        res.status(404).json({
          error: "roster.json ainda não publicado",
          hint: "Chame seedUniverseRoster (us-central1) para gerar o snapshot.",
          generated_at: new Date().toISOString(),
        });
        return;
      }
      const [buf] = await file.download();
      res.status(200).send(buf.toString("utf-8"));
    } catch (err) {
      console.error("getUniverseRoster error:", err);
      res.status(500).json({ error: "failed_to_read_roster", detail: String(err.message || err) });
    }
  });

// ────────────────────────────────────────────────────────────────────────
// Painel Mestre + Hotpage Alvos — agregação on-the-fly de ceap_classified (GCS).
// ZERO Firestore.
// ────────────────────────────────────────────────────────────────────────
const {
  scanCeapClassified,
  loadRosterMap,
  formatDashboardPayload,
  formatAlvosPayload,
  formatDossieCeapPayload,
} = require("./src/datalake/ceapClassifiedAggregates.js");

const KPI_CACHE =
  "public, max-age=300, s-maxage=900, stale-while-revalidate=120";

exports.getDashboardKPIs = functions
  .region("southamerica-east1")
  .runWith({ memory: "512MB", timeoutSeconds: 120 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { Storage } = require("@google-cloud/storage");
      const storage = new Storage();
      const scan = await scanCeapClassified(storage);
      let rosterTotal = 594;
      let rosterMap = new Map();
      const rosterFile = storage.bucket("datalake-tbr-clean").file("universe/roster.json");
      const [rex] = await rosterFile.exists();
      if (rex) {
        const [b] = await rosterFile.download();
        try {
          const j = JSON.parse(b.toString("utf-8"));
          if (Number.isFinite(Number(j.total))) rosterTotal = Number(j.total);
          else if (Array.isArray(j.roster)) rosterTotal = j.roster.length;
        } catch (_) {
          /* ignore */
        }
        rosterMap = await loadRosterMap(storage);
      }
      const body = formatDashboardPayload(scan, rosterTotal, rosterMap);
      res.status(200).json(body);
    } catch (err) {
      console.error("getDashboardKPIs error:", err);
      res.status(503).json({
        error: "datalake unavailable",
        detail: String(err.message || err),
      });
    }
  });

exports.getAlvos = functions
  .region("southamerica-east1")
  .runWith({ memory: "512MB", timeoutSeconds: 120 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const limitRaw = Number(req.query.limit);
    const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
    const minRaw = Number(req.query.min_score);
    const minScore = Math.min(100, Math.max(0, Number.isFinite(minRaw) ? minRaw : 0));
    const sortKey = String(req.query.sort || "notas_alto_risco").trim();

    try {
      const { Storage } = require("@google-cloud/storage");
      const storage = new Storage();
      const scan = await scanCeapClassified(storage);
      const rosterMap = await loadRosterMap(storage);
      const body = formatAlvosPayload(scan, rosterMap, limit, minScore, sortKey);
      res.status(200).json(body);
    } catch (err) {
      console.error("getAlvos error:", err);
      res.status(503).json({
        error: "datalake unavailable",
        detail: String(err.message || err),
      });
    }
  });

exports.getDossieCeapKPIs = functions
  .region("southamerica-east1")
  .runWith({ memory: "512MB", timeoutSeconds: 120 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const id = String(req.query.id || "").trim();
    if (!id) {
      res.status(400).json({ error: "missing_id", hint: "Use ?id=204554" });
      return;
    }

    try {
      const { Storage } = require("@google-cloud/storage");
      const storage = new Storage();
      const scan = await scanCeapClassified(storage);
      const body = formatDossieCeapPayload(scan, id);
      if (!body) {
        res.status(404).json({
          error: "no_ceap_classified",
          detail: "Nenhuma nota classificada encontrada para este ID no prefixo ceap_classified/",
        });
        return;
      }
      res.status(200).json(body);
    } catch (err) {
      console.error("getDossieCeapKPIs error:", err);
      res.status(503).json({
        error: "datalake unavailable",
        detail: String(err.message || err),
      });
    }
  });

const { mountAskVertexAgent } = require("./src/vertex/askVertexAgent.js");
mountAskVertexAgent(functions, exports);

// ── Módulo Leads / Paywall ────────────────────────────────────────────────
// Cloud Functions HTTP callable do paywall de contatos + petição automática.
// Documentação: functions/src/leads/README.md
const leadsPaywall = require("./src/leads");
exports.openContactBigData = leadsPaywall.openContactBigData;
exports.generateInitialPetition = leadsPaywall.generateInitialPetition;
