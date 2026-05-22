/**
 * Firebase Functions — Stripe Checkout (callable) + webhook de créditos.
 *
 * Genkit (`@genkit-ai/*`) não é importado por este ficheiro; motores Genkit vivem em `src/flows/*`
 * e `src/genkit.config.js` e só entram em runtime quando esses módulos são required.
 *
 * Definir em ambiente Firebase:
 *   stripeWebhook: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 *   createCheckoutSession: STRIPE_SECRET_KEY
 */

/** API v1 (region + https.onCall etc.) — o pacote principal exporta v2 desde firebase-functions v6 */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const grantRoleModule = require("./src/admin/grantRole");

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

/** BigQuery só sob demanda — reduz tempo de carga no `firebase deploy` (evita timeout 10s). */
function getBigQuery() {
  if (!global.__tbr_bq) {
    const { BigQuery } = require("@google-cloud/bigquery");
    global.__tbr_bq = new BigQuery();
  }
  return global.__tbr_bq;
}

const ASMODEUS_SUPREME_AGENT_ID = "agent_1777236402725";
const ASMODEUS_GEMINI_MODEL = "gemini-2.5-pro";
const COMPLIANCE_SLOT_LABEL = `${ASMODEUS_SUPREME_AGENT_ID} (COMPLIANCE)`;

/** Lista de agentes Aurora (Inferno) — require lazy para não alongar cold-parse do `index.js` no deploy. */
function getAuroraInfernoAgentsModule() {
  if (!global.__tbr_aurora_inferno_mod) {
    global.__tbr_aurora_inferno_mod = require("./src/aurora/auroraAgentsInferno.js");
  }
  return global.__tbr_aurora_inferno_mod;
}
function auroraAgentNames() {
  return getAuroraInfernoAgentsModule().AURORA_INFERNO_AGENTS;
}
function auroraAgentCount() {
  return getAuroraInfernoAgentsModule().AURORA_INFERNO_AGENT_COUNT;
}
function vertexTeamSlots() {
  return Array.from({ length: auroraAgentCount() }, () => ASMODEUS_SUPREME_AGENT_ID);
}
/**
 * 16 agentes Aurora (Inferno) — papéis nomeados; runtime Vertex continua no Líder Supremo.
 * G.O.A.T.: não inventar IDs secundários (@slot_*, agentes genéricos); apenas agent_1777236402725.
 */

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
    agentes_aurora_nomes: auroraAgentNames(),
    instrucao_orquestracao:
      `Distribua mentalmente a analise aos ${auroraAgentCount()} agentes Aurora (Inferno) ligados ao Lider Supremo ` +
      `(Agent ID ${ASMODEUS_SUPREME_AGENT_ID}) antes de consolidar o scoreRisco. ` +
      "O papel OSINT pode levantar tendencias e narrativas publicas, " +
      `mas NADA de OSINT pode ser publicado sem validacao explicita pelo slot de Compliance (${COMPLIANCE_SLOT_LABEL}). ` +
      "Nao acuse crimes; classifique risco heuristico, auditavel e extra-judicial.",
    agentes_subordinados: vertexTeamSlots(),
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
      agentesAcionados: vertexTeamSlots(),
      radarOsint: buildDeterministicOsint(row),
      modelo: "heuristic-fallback",
      liderSupremoAgentId: ASMODEUS_SUPREME_AGENT_ID,
    };
  }

  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: ASMODEUS_GEMINI_MODEL,
    systemInstruction:
      "Voce e o Lider Supremo A.S.M.O.D.E.U.S. (Agent ID agent_1777236402725). " +
      "Atue como auditor forense de CEAP, direito administrativo e gasto parlamentar brasileiro. " +
      `Consolide a deliberacao dos ${auroraAgentCount()} agentes Aurora nomeados (Inferno) sob o Lider Supremo. Responda apenas JSON valido.`,
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
      : vertexTeamSlots(),
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
  const [job] = await getBigQuery().createQueryJob({
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
  const [job] = await getBigQuery().createQueryJob({
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

  const [job] = await getBigQuery().createQueryJob({
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
  const [job] = await getBigQuery().createQueryJob({
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
        agentesAtivos: vertexTeamSlots(),
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
        agentesAtivos: vertexTeamSlots(),
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
  const Stripe = require("stripe");
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
  .runWith({ memory: "512MB", timeoutSeconds: 30 })
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

/**
 * Origem permitida para success/cancel do Checkout (evita open redirect; suporta domínio .com.br).
 * @param {unknown} raw
 * @returns {string | null}
 */
function sanitizeCheckoutOrigin(raw) {
  const s = String(raw || "")
    .trim()
    .replace(/\/$/, "");
  if (!/^https:\/\//i.test(s)) return null;
  let host;
  try {
    host = new URL(s).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (
    host === "transparenciabr.web.app" ||
    host === "transparenciabr.firebaseapp.com" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".transparenciabr.com.br") ||
    host === "transparenciabr.com.br"
  ) {
    return s;
  }
  return null;
}

/** Callable — devolve { url } para Checkout Stripe */
exports.createCheckoutSession = functions
  .region("southamerica-east1")
  .runWith({ memory: "512MB", timeoutSeconds: 30 })
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

    const safeOrigin = sanitizeCheckoutOrigin(data.origin);
    const checkoutBase = safeOrigin || "https://transparenciabr.web.app";

    // Checkout redirects: domínio atual quando permitido; fallback Hosting oficial.
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

    const { classifyArea, urgencyFromAnalysis, analyzeWithGemini, dossierDocId } =
      require("./src/radar/diarioScanner");

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
  .runWith({ memory: "512MB", timeoutSeconds: 60 })
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
// ZERO Firestore. (require do módulo datalake é lazy dentro de cada handler.)
// ────────────────────────────────────────────────────────────────────────
const KPI_CACHE =
  "public, max-age=300, s-maxage=900, stale-while-revalidate=120";

exports.getDashboardKPIs = functions
  .region("southamerica-east1")
  // Onda 20 — Versão otimizada: carrega roster + ranking público, agrega em memória
  .runWith({ memory: "512MB", timeoutSeconds: 60 })
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
      const {
        loadRosterJson,
        loadPublicRanking,
        aggregateDashboardKPIs,
      } = require("./src/datalake/dashboardKpisOptimized.js");

      const [roster, ranking] = await Promise.all([
        loadRosterJson(),
        loadPublicRanking(),
      ]);

      const rosterArr = roster.roster || roster || [];
      const kpis = aggregateDashboardKPIs(rosterArr, ranking);

      res.status(200).json(kpis);
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
  // Onda 19 — mesmo scan de getDashboardKPIs; sobe para 1GB/540s.
  .runWith({ memory: "1GB", timeoutSeconds: 540 })
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
    const partidoFiltro = String(req.query.partido || "").trim();

    try {
      const {
        scanCeapClassified,
        loadRosterMap,
        formatAlvosPayload,
      } = require("./src/datalake/ceapClassifiedAggregates.js");
      const { Storage } = require("@google-cloud/storage");
      const storage = new Storage();
      const scan = await scanCeapClassified(storage);
      const rosterMap = await loadRosterMap(storage);
      const body = formatAlvosPayload(
        scan,
        rosterMap,
        limit,
        minScore,
        sortKey,
        partidoFiltro,
      );
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
  // Onda 19 — sobe para 1GB/540s (mesmo scan).
  .runWith({ memory: "1GB", timeoutSeconds: 540 })
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
      const {
        scanCeapClassified,
        formatDossieCeapPayload,
      } = require("./src/datalake/ceapClassifiedAggregates.js");
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

try {
  const { mountAskVertexAgent } = require("./src/vertex/askVertexAgent.js");
  mountAskVertexAgent(functions, exports);
} catch (err) {
  console.warn("[functions] askVertexAgent não montado (lazy):", err && err.message);
}

// =============================================================================
// generateDossieOnDemand (Onda 1) — pay-per-dossier + desbloqueios parciais
//
// Callable. Debita créditos conforme `tipo` + `addons`, cria/atualiza o doc
// `transparency_reports/{politicoId}` com status=processing, requested_at,
// requested_by e ttl_categoria por camada.
// =============================================================================
const ON_DEMAND_TYPE_PRICES = {
  dossie_matador: 800,
  ceap_completo: 300,
  emendas_completas: 300,
};
const ON_DEMAND_ADDON_PRICES = {
  pdf_laudo: 150,
  comparacoes_avancadas: 200,
};

function resolveOnDemandPurchase(data) {
  const tipo = String(data?.tipo || "dossie_matador").trim();
  if (!Object.prototype.hasOwnProperty.call(ON_DEMAND_TYPE_PRICES, tipo)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `tipo invalido. Use: ${Object.keys(ON_DEMAND_TYPE_PRICES).join(", ")}`,
    );
  }
  let cost = ON_DEMAND_TYPE_PRICES[tipo];
  const addons = Array.isArray(data?.addons) ? data.addons.map(String) : [];
  for (const a of addons) {
    if (Object.prototype.hasOwnProperty.call(ON_DEMAND_ADDON_PRICES, a)) {
      cost += ON_DEMAND_ADDON_PRICES[a];
    }
  }
  return { cost, tipo, addons };
}
const DOSSIE_TTL_BY_CATEGORY_HOURS = {
  ceap: 24,
  emendas: 24,
  pncp: 24,
  folha: 24 * 7,
  tse: 24 * 30,
  viagens: 24,
  agenda: 1, // câmara live
  aurora: 24 * 7,
};

exports.generateDossieOnDemand = functions
  .region("southamerica-east1")
  .runWith({ memory: "256MB", timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "É necessário estar autenticado para gerar um dossiê sob demanda.",
      );
    }
    const uid = context.auth.uid;
    const politicoId = String(data?.politicoId || data?.id || "").trim();
    if (!politicoId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Informe `politicoId` (string).",
      );
    }

    const userRef = db.collection("usuarios").doc(uid);
    const reportRef = db.collection("transparency_reports").doc(politicoId);
    const requestedAt = FieldValue.serverTimestamp();
    const ttlMap = Object.fromEntries(
      Object.entries(DOSSIE_TTL_BY_CATEGORY_HOURS).map(([k, h]) => [
        k,
        { hours: h },
      ]),
    );
    const { cost: DOSSIE_ON_DEMAND_COST, tipo: purchaseTipo, addons: purchaseAddons } =
      resolveOnDemandPurchase(data);
    const jobId = `${politicoId}_${Date.now()}`;

    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const userData = userSnap.exists ? userSnap.data() : {};
      const saldo = Number(userData?.creditos || 0);
      if (saldo < DOSSIE_ON_DEMAND_COST) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Saldo insuficiente: ${saldo} / ${DOSSIE_ON_DEMAND_COST} créditos. Compre mais em /creditos.`,
        );
      }

      tx.update(userRef, {
        creditos: FieldValue.increment(-DOSSIE_ON_DEMAND_COST),
        ultima_acao: "generateDossieOnDemand",
        ultima_acao_em: requestedAt,
      });

      tx.set(
        reportRef,
        {
          report_id: politicoId,
          tipo_dossie: "parlamentar",
          status: "processing",
          requested_at: requestedAt,
          requested_by: uid,
          job_id: jobId,
          ttl_categoria: ttlMap,
          custo_creditos: DOSSIE_ON_DEMAND_COST,
          metadados: {
            origem: "generateDossieOnDemand",
            versao: "v4-matador",
            tipo: purchaseTipo,
            addons: purchaseAddons,
          },
        },
        { merge: true },
      );

      // Fila de jobs (a coleta real lê daqui na Onda 4)
      const jobRef = db.collection("dossie_jobs").doc(jobId);
      tx.set(jobRef, {
        job_id: jobId,
        politico_id: politicoId,
        status: "queued",
        created_at: requestedAt,
        created_by: uid,
        custo_creditos: DOSSIE_ON_DEMAND_COST,
        camadas: Object.keys(DOSSIE_TTL_BY_CATEGORY_HOURS),
        tipo: purchaseTipo,
        addons: purchaseAddons,
      });

      return { saldoApos: saldo - DOSSIE_ON_DEMAND_COST };
    });

    console.log(
      `generateDossieOnDemand: uid=${uid} politico=${politicoId} job=${jobId} saldo=${result.saldoApos}`,
    );

    return {
      ok: true,
      jobId,
      politicoId,
      tipo: purchaseTipo,
      custoCreditos: DOSSIE_ON_DEMAND_COST,
      status: "processing",
      saldoApos: result.saldoApos,
      ttl: ttlMap,
      mensagem:
        "Dossiê agendado. As camadas são coletadas em paralelo — áreas com fonte ativa preenchem em minutos; demais permanecem em breve até a Onda 4.",
    };
  });

/**
 * Desbloqueio seguro (100 cr) — CEAP detalhado ou emendas completas na página do parlamentar.
 * Débito e flags apenas no backend (Admin SDK); o cliente não grava `usuarios/{uid}` diretamente.
 */
const UNLOCK_POLITICO_FEATURE_COST = 100;
exports.unlockPoliticoData = functions
  .region("southamerica-east1")
  .runWith({ memory: "256MB", timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "É necessário iniciar sessão para desbloquear.",
      );
    }
    const uid = context.auth.uid;
    const politicoId = String(data?.politicoId || data?.id || "").trim();
    const feature = String(data?.feature || "ceap").trim().toLowerCase();
    if (!politicoId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Informe `politicoId` (string).",
      );
    }
    if (feature !== "ceap" && feature !== "emendas") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "`feature` deve ser `ceap` ou `emendas`.",
      );
    }

    const userRef = db.collection("usuarios").doc(uid);
    const unlockRef = userRef.collection("politico_unlocks").doc(politicoId);

    const out = await db.runTransaction(async (tx) => {
      const [userSnap, unlockSnap] = await Promise.all([tx.get(userRef), tx.get(unlockRef)]);
      if (!userSnap.exists) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Perfil de utilizador não encontrado. Complete o onboarding.",
        );
      }
      const userData = userSnap.data() || {};
      const unlimited = userData.creditos_ilimitados === true;
      const saldo = Number(userData.creditos ?? 0);
      const prev = unlockSnap.exists ? unlockSnap.data() || {} : {};
      const flagKey = feature === "ceap" ? "ceap_full" : "emendas_full";
      if (prev[flagKey] === true) {
        return {
          ok: true,
          alreadyUnlocked: true,
          feature,
          politicoId,
          saldoApos: saldo,
          custoCreditos: 0,
        };
      }
      if (!unlimited && saldo < UNLOCK_POLITICO_FEATURE_COST) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Saldo insuficiente: ${saldo} / ${UNLOCK_POLITICO_FEATURE_COST} créditos.`,
        );
      }
      const now = FieldValue.serverTimestamp();
      if (!unlimited) {
        tx.update(userRef, {
          creditos: FieldValue.increment(-UNLOCK_POLITICO_FEATURE_COST),
          updated_at: now,
          ultima_acao: "unlockPoliticoData",
          ultima_acao_em: now,
        });
      }
      const patch =
        feature === "ceap"
          ? {
              politico_id: politicoId,
              ceap_full: true,
              ceap_unlocked_at: now,
              updated_at: now,
            }
          : {
              politico_id: politicoId,
              emendas_full: true,
              emendas_unlocked_at: now,
              updated_at: now,
            };
      tx.set(unlockRef, patch, { merge: true });
      return {
        ok: true,
        alreadyUnlocked: false,
        feature,
        politicoId,
        saldoApos: unlimited ? saldo : saldo - UNLOCK_POLITICO_FEATURE_COST,
        custoCreditos: unlimited ? 0 : UNLOCK_POLITICO_FEATURE_COST,
      };
    });

    console.log(
      `unlockPoliticoData: uid=${uid} politico=${politicoId} feature=${out.feature} custo=${out.custoCreditos}`,
    );
    return out;
  });

// ── gerarDossieOnDemand — auditoria Vertex (Gemini 1.5 Pro) + anexos ao relatório ──
const { mountGerarDossieOnDemand } = require("./src/dossie/gerarDossieOnDemandCallable.js");
exports.gerarDossieOnDemand = mountGerarDossieOnDemand(functions, admin);

// ── Módulo Leads / Paywall ────────────────────────────────────────────────
// Cloud Functions HTTP callable do paywall de contatos + petição automática.
// Documentação: functions/src/leads/README.md
//
// Gen1 `openContactBigData` + `generateInitialPetition`: definidos em `src/leads/*.js` com
// `functions.https.onCall({ region, memory, timeoutSeconds }, handler)` apenas — sem `cpu`.
// Não envolver estes exports em `.runWith({ cpu: ... })` em index.js (Gen1 não usa esse padrão aqui).
const leadsPaywall = require("./src/leads");
// exports.openContactBigData = leadsPaywall.openContactBigData;
// exports.generateInitialPetition = leadsPaywall.generateInitialPetition;

// ── Análises Especializadas: 8 KPI Endpoints ────────────────────────────────────
const { getEmendasKPIs } = require("./src/datalake/getEmendasKPIs.js");
const { getPatrimonioKPIs } = require("./src/datalake/getPatrimonioKPIs.js");
const { getViagensKPIs } = require("./src/datalake/getViagensKPIs.js");
const { getNepotismoKPIs } = require("./src/datalake/getNepotismoKPIs.js");
const { getNepotismoCruzadoKPIs } = require("./src/datalake/getNepotismoCruzadoKPIs.js");
const { getEmpresasPrefeiturasKPIs } = require("./src/datalake/getEmpresasPrefeiturasKPIs.js");
const { getAnomaliasKPIs } = require("./src/datalake/getAnomaliasKPIs.js");
const { getRiscoKPIs } = require("./src/datalake/getRiscoKPIs.js");

// Emendas Parlamentares
exports.getEmendasKPIs = functions
  .region("southamerica-east1")
  .runWith({ memory: "1GB", timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const data = await getEmendasKPIs();
      res.status(200).json(data);
    } catch (err) {
      console.error("getEmendasKPIs error:", err);
      res.status(503).json({ error: "datalake unavailable", detail: String(err.message || err) });
    }
  });

// Patrimônio TSE
exports.getPatrimonioKPIs = functions
  .region("southamerica-east1")
  .runWith({ memory: "512MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const data = await getPatrimonioKPIs();
      res.status(200).json(data);
    } catch (err) {
      console.error("getPatrimonioKPIs error:", err);
      res.status(503).json({ error: "datalake unavailable", detail: String(err.message || err) });
    }
  });

// Viagens e Agenda
exports.getViagensKPIs = functions
  .region("southamerica-east1")
  .runWith({ memory: "512MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const data = await getViagensKPIs();
      res.status(200).json(data);
    } catch (err) {
      console.error("getViagensKPIs error:", err);
      res.status(503).json({ error: "datalake unavailable", detail: String(err.message || err) });
    }
  });

// Nepotismo
exports.getNepotismoKPIs = functions
  .region("southamerica-east1")
  .runWith({ memory: "512MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const data = await getNepotismoKPIs();
      res.status(200).json(data);
    } catch (err) {
      console.error("getNepotismoKPIs error:", err);
      res.status(503).json({ error: "datalake unavailable", detail: String(err.message || err) });
    }
  });

// Nepotismo Cruzado
exports.getNepotismoCruzadoKPIs = functions
  .region("southamerica-east1")
  .runWith({ memory: "1GB", timeoutSeconds: 120 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const data = await getNepotismoCruzadoKPIs();
      res.status(200).json(data);
    } catch (err) {
      console.error("getNepotismoCruzadoKPIs error:", err);
      res.status(503).json({ error: "datalake unavailable", detail: String(err.message || err) });
    }
  });

// Empresas × Prefeituras
exports.getEmpresasPrefeiturasKPIs = functions
  .region("southamerica-east1")
  .runWith({ memory: "512MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const data = await getEmpresasPrefeiturasKPIs();
      res.status(200).json(data);
    } catch (err) {
      console.error("getEmpresasPrefeiturasKPIs error:", err);
      res.status(503).json({ error: "datalake unavailable", detail: String(err.message || err) });
    }
  });

// Anomalias (Lei de Benford)
exports.getAnomaliasKPIs = functions
  .region("southamerica-east1")
  .runWith({ memory: "1GB", timeoutSeconds: 120 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const data = await getAnomaliasKPIs();
      res.status(200).json(data);
    } catch (err) {
      console.error("getAnomaliasKPIs error:", err);
      res.status(503).json({ error: "datalake unavailable", detail: String(err.message || err) });
    }
  });

// Score de Risco
exports.getRiscoKPIs = functions
  .region("southamerica-east1")
  .runWith({ memory: "1GB", timeoutSeconds: 120 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const data = await getRiscoKPIs();
      res.status(200).json(data);
    } catch (err) {
      console.error("getRiscoKPIs error:", err);
      res.status(503).json({ error: "datalake unavailable", detail: String(err.message || err) });
    }
  });

// ── Onda 4: Worker do dossiê on-demand ────────────────────────────────────
// Trigger Firestore onCreate em dossie_jobs/{jobId} → coleta camadas → grava
// em transparency_reports/{politicoId}.camadas.{nome}. Documentação inline.
const processDossieJobModule = require("./src/dossie/processDossieJob");
exports.processDossieJob = processDossieJobModule.processDossieJob;


// ── getPoliticoDespesas — Despesas detalhadas com alertas (Onda 24) ──
exports.getPoliticoDespesas = functions
  .region("southamerica-east1")
  .runWith({ memory: "1GB", timeoutSeconds: 300 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    res.set("Cache-Control", "public, max-age=300");
    res.set("Content-Type", "application/json; charset=utf-8");

    const nome = String(req.query.nome || "").trim();
    const id = String(req.query.id || "").trim();
    const mode = String(req.query.mode || "preview").trim();

    if (!nome && !id) {
      res.status(400).json({ error: "missing_param", hint: "Use ?nome=POMPEO DE MATTOS ou ?id=204554" });
      return;
    }

    try {
      const { queryDespesas, computeStats, formatRow } = require("./src/datalake/getPoliticoDespesas.js");
      const rows = await queryDespesas(id, nome || null);

      if (!rows || rows.length === 0) {
        res.status(404).json({ error: "no_data", detail: "Nenhuma despesa encontrada para este parlamentar na legislatura atual." });
        return;
      }

      const stats = computeStats(rows);
      const parlamentar = String(rows[0].tx_nome_parlamentar || rows[0].nome_parlamentar || nome || id);

      const { queryEmendas } = require("./src/datalake/getDossieAurora.js");
      let emendas = [];
      try {
        emendas = await queryEmendas(parlamentar);
      } catch (emErr) {
        console.warn("getPoliticoDespesas emendas:", emErr?.message || emErr);
      }

      if (mode === "preview") {
        const sorted = [...rows].sort((a, b) => Number(b.vlr_documento || b.valor_documento || 0) - Number(a.vlr_documento || a.valor_documento || 0));
        const preview = sorted.slice(0, 10).map(r => formatRow(r, stats, true));
        const totalAlertas = rows.filter(r => {
          const val = Number(r.vlr_documento || r.valor_documento || 0);
          return (val >= 500 && val % 100 === 0) || val >= 10000;
        }).length;

        res.status(200).json({
          parlamentar,
          mode: "preview",
          resumo: {
            total_despesas: stats.total_despesas,
            total_brl: stats.total_brl,
            total_com_alerta: totalAlertas,
            periodo: stats.periodo,
            topFornecedores: stats.topFornecedores,
            tipoBreakdown: stats.tipoBreakdown,
          },
          despesas: preview,
          emendas,
          paywall: {
            custo: 100,
            msg: "Desbloqueie todas as despesas com links clicáveis e alertas detalhados por 100 créditos.",
            total_ocultas: Math.max(0, rows.length - 10),
          },
        });
        return;
      }

      // Full mode — TODAS as notas com URLs clicáveis
      const full = rows.map(r => formatRow(r, stats, true));
      const alertCount = full.filter(r => r.tem_alerta).length;
      const comUrl = full.filter(r => r.url_documento).length;

      res.status(200).json({
        parlamentar,
        mode: "full",
        resumo: {
          total_despesas: stats.total_despesas,
          total_brl: stats.total_brl,
          total_com_alerta: alertCount,
          total_com_url: comUrl,
          periodo: stats.periodo,
          topFornecedores: stats.topFornecedores,
          tipoBreakdown: stats.tipoBreakdown,
        },
        despesas: full,
        emendas,
      });
    } catch (err) {
      console.error("getPoliticoDespesas error:", err);
      res.status(503).json({ error: "query_failed", detail: String(err.message || err) });
    }
  });

// ── getDossieAurora — Dossiê Aurora 360 completo (v2 — sem dependência de tb_dossie_aurora_360) ──
exports.getDossieAurora = functions
  .region("southamerica-east1")
  .runWith({ memory: "1GB", timeoutSeconds: 300 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    res.set("Cache-Control", "public, max-age=600");
    res.set("Content-Type", "application/json; charset=utf-8");

    const nome = String(req.query.nome || "").trim();
    const id = String(req.query.id || "").trim();
    const mode = String(req.query.mode || "preview").trim();

    if (!nome && !id) {
      res.status(400).json({ error: "missing_param", hint: "Use ?nome=POMPEO DE MATTOS ou ?id=204554" });
      return;
    }

    try {
      const {
        resolveNome, queryCeapStats, queryTopFornecedores, queryTipoDespesas,
        queryGastosMensais, queryEmendas, queryBenford, queryZscoreOutliers,
        queryBaseEleitoral, querySacanagens, queryFornecedorConcentrado,
        queryF15DuplaCobranca, queryF15FretamentoRota, queryF04TrechoInconsistente,
        queryEmendasCeapCruzamento, queryEmendasConcentracao, queryEmendasFuncaoCeap,
      } = require("./src/datalake/getDossieAurora.js");

      // Resolve parlamentar — NÃO depende de tb_dossie_aurora_360
      let parlamentarNome = nome;
      let parlamentarId = id;
      if (id && !nome) {
        const resolved = await resolveNome(id);
        if (!resolved) {
          res.status(404).json({ error: "not_found", detail: "Parlamentar não encontrado com este ID." });
          return;
        }
        parlamentarNome = resolved.nome_parlamentar;
        parlamentarId = resolved.parlamentar_id;
      }

      // Preview: dados rápidos gratuitos
      const ceapStats = await queryCeapStats(parlamentarNome);
      if (!ceapStats && mode === "preview") {
        // Sem dados CEAP — tenta emendas
        const emendas = await queryEmendas(parlamentarNome);
        if (emendas.length === 0) {
          res.status(404).json({ error: "no_data", detail: "Sem dados CEAP ou emendas para este parlamentar." });
          return;
        }
        const totalEmp = emendas.reduce((s, e) => s + Number(e.valorEmpenhado || 0), 0);
        res.status(200).json({
          parlamentar: parlamentarNome,
          parlamentar_id: parlamentarId,
          mode: "preview",
          resumo: { total_ceap_brl: 0, total_notas: 0, total_emendas: emendas.length, total_emendas_brl: totalEmp },
          paywall: { custo: 800, msg: "Dossiê Matador: CEAP + Emendas + Benford + Fornecedores + Z-Score + Base Eleitoral. 800 créditos." },
        });
        return;
      }

      const pid = ceapStats ? ceapStats.parlamentar_id : parlamentarId;
      const benford = await queryBenford(pid);
      const benfordAlerts = benford.filter(b => b.flag_desvio_gt_30pct);

      if (mode === "preview") {
        res.status(200).json({
          parlamentar: parlamentarNome,
          parlamentar_id: pid,
          mode: "preview",
          resumo: {
            total_ceap_brl: ceapStats ? Math.round(ceapStats.total_brl * 100) / 100 : 0,
            total_notas: ceapStats ? ceapStats.total_notas : 0,
            notas_redondas: ceapStats ? ceapStats.notas_redondas : 0,
            notas_altas: ceapStats ? ceapStats.notas_altas : 0,
            fornecedores_distintos: ceapStats ? ceapStats.fornecedores_distintos : 0,
            benford_alertas: benfordAlerts.length,
            periodo: ceapStats ? {
              inicio: ceapStats.primeira_nota?.value || "",
              fim: ceapStats.ultima_nota?.value || "",
            } : null,
          },
          paywall: {
            custo: 800,
            msg: "Dossiê Matador: CEAP + Emendas + Benford + Fornecedores + Z-Score + Base Eleitoral. 800 créditos.",
          },
        });
        return;
      }

      // ── FULL MODE — 16 queries em paralelo (10 originais + 6 forenses) ──
      const [topFornecedores, tipoDespesas, gastosMensais, emendas, zscoreOutliers, baseEleitoral, sacanagens, fornecedorConcentrado, f15Dupla, f15Rota, f04Trecho, emendasCeap, emendasConc, emendasFuncao] = await Promise.all([
        queryTopFornecedores(parlamentarNome),
        queryTipoDespesas(parlamentarNome),
        queryGastosMensais(parlamentarNome),
        queryEmendas(parlamentarNome),
        queryZscoreOutliers(pid),
        queryBaseEleitoral(parlamentarNome),
        querySacanagens(parlamentarNome),
        queryFornecedorConcentrado(parlamentarNome),
        queryF15DuplaCobranca(parlamentarNome),
        queryF15FretamentoRota(parlamentarNome),
        queryF04TrechoInconsistente(parlamentarNome),
        queryEmendasCeapCruzamento(parlamentarNome),
        queryEmendasConcentracao(parlamentarNome),
        queryEmendasFuncaoCeap(parlamentarNome),
      ]);

      const emendasSuspeitas = emendas.filter(e => {
        const val = Number(e.valorEmpenhado || 0);
        return val >= 1000000 || (val >= 100000 && val % 100000 === 0);
      });

      // Score de risco ASMODEUS (v2 — inclui filtros forenses)
      const f15Count = (f15Dupla || []).filter(f => f.severidade === 'CRITICO').length;
      const f04Count = (f04Trecho || []).filter(f => f.severidade === 'ALTO').length;
      const emendasCruzCount = (emendasCeap || []).filter(f => f.severidade === 'CRITICO').length;
      const scoreRisco = Math.min(100, Math.round(
        (benfordAlerts.length * 15) +
        (ceapStats ? ceapStats.notas_redondas : 0) * 0.1 +
        (ceapStats ? ceapStats.notas_altas : 0) * 2 +
        emendasSuspeitas.length * 5 +
        zscoreOutliers.length * 3 +
        fornecedorConcentrado.filter(f => f.notas >= 10).length * 4 +
        f15Count * 12 +
        f04Count * 3 +
        emendasCruzCount * 8
      ));

      res.status(200).json({
        parlamentar: parlamentarNome,
        parlamentar_id: pid,
        mode: "full",
        ceap: {
          total_brl: ceapStats ? Math.round(ceapStats.total_brl * 100) / 100 : 0,
          total_notas: ceapStats ? ceapStats.total_notas : 0,
          notas_redondas: ceapStats ? ceapStats.notas_redondas : 0,
          notas_altas: ceapStats ? ceapStats.notas_altas : 0,
          fornecedores_distintos: ceapStats ? ceapStats.fornecedores_distintos : 0,
          periodo: ceapStats ? { inicio: ceapStats.primeira_nota?.value || "", fim: ceapStats.ultima_nota?.value || "" } : null,
          top_fornecedores: (topFornecedores || []).map(f => ({
            nome: f.nome_fornecedor, total: Math.round(Number(f.total) * 100) / 100, notas: f.notas,
            pct: ceapStats && ceapStats.total_brl > 0 ? Math.round((Number(f.total) / ceapStats.total_brl) * 1000) / 10 : 0,
          })),
          tipo_despesas: (tipoDespesas || []).map(t => ({ tipo: t.tipo_despesa, total: Math.round(Number(t.total) * 100) / 100, notas: t.notas })),
          gastos_mensais: (gastosMensais || []).map(g => ({ mes: g.mes, total: Math.round(Number(g.total) * 100) / 100, notas: g.notas })),
        },
        benford: {
          total_digitos_analisados: benford.length,
          alertas: benfordAlerts.map(b => ({ digito: b.digito, observado_pct: b.pct_observado_pct, teorico_pct: b.pct_teorico_pct, gap_pct: b.gap_relativo_pct })),
          distribuicao: benford.map(b => ({ digito: b.digito, observado: b.pct_observado_pct, teorico: b.pct_teorico_pct })),
        },
        zscore: {
          outliers: zscoreOutliers.map(z => ({ data: z.data_emissao?.value || "", gasto_dia: z.gasto_dia, zscore: Math.round((z.zscore || 0) * 100) / 100 })),
        },
        emendas: {
          total: emendas.length,
          total_empenhado: emendas.reduce((s, e) => s + Number(e.valorEmpenhado || 0), 0),
          total_pago: emendas.reduce((s, e) => s + Number(e.valorPago || 0), 0),
          suspeitas: emendasSuspeitas.length,
          lista: emendas.map(e => ({
            descricao: e.descricao, valor_empenhado: Number(e.valorEmpenhado || 0), valor_pago: Number(e.valorPago || 0),
            funcao: e.funcao, subfuncao: e.subfuncao, municipio: e.municipio, estado: e.estado, ano: e.ano,
            suspeita: Number(e.valorEmpenhado || 0) >= 1000000 || (Number(e.valorEmpenhado || 0) >= 100000 && Number(e.valorEmpenhado || 0) % 100000 === 0),
          })),
        },
        base_eleitoral: (baseEleitoral || []).map(b => ({
          municipio: b.nome_municipio, uf: b.uf, total_emendas: Math.round(Number(b.total_emendas_valor || 0) * 100) / 100,
          n_documentos: b.n_documentos, populacao: b.populacao, idh: b.idh_municipal,
        })),
        sacanagens: {
          notas_suspeitas: (sacanagens || []).map(s => ({
            fornecedor: s.nome_fornecedor, valor: s.valor_documento, tipo: s.tipo_despesa,
            data: s.data_emissao?.value || "", alerta: s.tipo_alerta, numero_documento: s.numero_documento,
          })),
          fornecedores_concentrados: (fornecedorConcentrado || []).map(f => ({
            nome: f.nome_fornecedor, notas: f.notas, total: Math.round(Number(f.total) * 100) / 100,
            primeira: f.primeira?.value || "", ultima: f.ultima?.value || "", meses: f.meses_distintos,
          })),
        },
        filtros_forenses: {
          f15_dupla_cobranca: {
            total: (f15Dupla || []).length,
            criticos: (f15Dupla || []).filter(f => f.severidade === 'CRITICO').length,
            valor_total_suspeito: (f15Dupla || []).reduce((s, f) => s + Number(f.valor_total_suspeito || 0), 0),
            casos: (f15Dupla || []).map(f => ({
              data_fretamento: f.data_fretamento?.value || '',
              valor_fretamento: f.valor_fretamento,
              fornecedor_fretamento: f.fornecedor_fretamento,
              url_fretamento: f.url_fretamento,
              data_passagem: f.data_passagem?.value || '',
              valor_passagem: f.valor_passagem,
              fornecedor_passagem: f.fornecedor_passagem,
              trecho_passagem: f.trecho_passagem,
              dias_diferenca: f.dias_diferenca,
              valor_total: f.valor_total_suspeito,
              severidade: f.severidade,
            })),
          },
          f15_fretamento_rota_comercial: {
            total: (f15Rota || []).length,
            valor_total: (f15Rota || []).reduce((s, f) => s + Number(f.valor || 0), 0),
            casos: (f15Rota || []).map(f => ({
              data: f.data_nota?.value || '',
              valor: f.valor,
              fornecedor: f.fornecedor,
              trecho: f.trecho,
              url: f.url_documento,
              severidade: f.severidade,
            })),
          },
          f04_trecho_inconsistente: {
            total: (f04Trecho || []).length,
            sem_trecho: (f04Trecho || []).filter(f => f.tipo_alerta === 'F04_SEM_TRECHO_DECLARADO').length,
            sem_brasilia: (f04Trecho || []).filter(f => f.tipo_alerta === 'F04_TRECHO_SEM_BRASILIA').length,
            casos: (f04Trecho || []).slice(0, 15).map(f => ({
              data: f.data_nota?.value || '',
              valor: f.valor,
              fornecedor: f.fornecedor,
              trecho: f.trecho,
              tipo_alerta: f.tipo_alerta,
              url: f.url_documento,
              severidade: f.severidade,
            })),
          },
          emendas_x_ceap: {
            total: (emendasCeap || []).length,
            criticos: (emendasCeap || []).filter(f => f.severidade === 'CRITICO').length,
            valor_circuito: (emendasCeap || []).reduce((s, f) => s + Number(f.valor_circuito_total || 0), 0),
            casos: (emendasCeap || []).slice(0, 10).map(f => ({
              municipio: f.municipio_emenda,
              estado: f.estado,
              emenda_valor: f.emenda_total_empenhado,
              ceap_fornecedor: f.ceap_fornecedor,
              ceap_cnpj: f.ceap_cnpj_fornecedor,
              ceap_valor: f.total_ceap,
              ceap_notas: f.ceap_notas,
              valor_circuito: f.valor_circuito_total,
              severidade: f.severidade,
            })),
          },
          emendas_concentracao: {
            total: (emendasConc || []).length,
            casos: (emendasConc || []).map(f => ({
              municipio: f.municipio,
              estado: f.estado,
              valor: f.total_municipio,
              pct: f.pct_concentracao,
              severidade: f.severidade,
            })),
          },
          emendas_funcao_x_ceap: {
            total: (emendasFuncao || []).length,
            casos: (emendasFuncao || []).slice(0, 10).map(f => ({
              emenda_funcao: f.emenda_funcao,
              emenda_municipio: f.emenda_municipio,
              emenda_ano: f.emenda_ano,
              emenda_valor: f.emenda_valor,
              ceap_fornecedor: f.ceap_fornecedor,
              ceap_tipo: f.ceap_tipo,
              ceap_valor: f.total_ceap,
              severidade: f.severidade,
            })),
          },
        },
        alertas_consolidados: {
          benford_desvios: benfordAlerts.length,
          notas_redondas: ceapStats ? ceapStats.notas_redondas : 0,
          notas_acima_10k: ceapStats ? ceapStats.notas_altas : 0,
          emendas_suspeitas: emendasSuspeitas.length,
          zscore_outliers: zscoreOutliers.length,
          fornecedores_concentrados: fornecedorConcentrado.filter(f => f.notas >= 10).length,
          f15_dupla_cobranca: (f15Dupla || []).length,
          f15_fretamento_rota: (f15Rota || []).length,
          f04_trecho_irregular: (f04Trecho || []).length,
          emendas_x_ceap_criticos: (emendasCeap || []).filter(f => f.severidade === 'CRITICO').length,
          emendas_concentracao: (emendasConc || []).length,
          score_risco: scoreRisco,
        },
      });
    } catch (err) {
      console.error("getDossieAurora error:", err);
      res.status(503).json({ error: "query_failed", detail: String(err.message || err) });
    }
  });

// ── getSacanagens — Motor de detecção de irregularidades (Onda 25) ──
const { queryTopSacanagens, querySacanagensDetalhe } = require("./src/datalake/getSacanagens.js");
exports.getSacanagens = functions
  .region("southamerica-east1")
  .runWith({ memory: "1GB", timeoutSeconds: 120 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", KPI_CACHE);
    res.set("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const nome = String(req.query.nome || "").trim();
    const limitRaw = Number(req.query.limit);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
    try {
      if (nome) {
        const data = await querySacanagensDetalhe(nome);
        res.status(200).json(data);
      } else {
        const data = await queryTopSacanagens(limit);
        res.status(200).json(data);
      }
    } catch (err) {
      console.error("getSacanagens error:", err);
      res.status(503).json({ error: "datalake unavailable", detail: String(err.message || err) });
    }
  });

// ══ enrichment — Pipeline PII multi-fonte (motor AURORA, LGPD audit) ══
const { onRequest: onRequestEnrichment } = require("firebase-functions/v2/https");
const enrichmentHttp = require("./enrichment/index.js");
exports.enrichment = onRequestEnrichment(
  {
    region: "us-central1",
    cors: false,
    invoker: "public",
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  enrichmentHttp
);
