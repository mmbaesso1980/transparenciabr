#!/usr/bin/env node
/**
 * Motor CEAP (Node.js) — Deep fetch multi-ano (API Câmara) + Benford + Firestore.
 *
 * Pré-requisitos:
 *   npm install   (na pasta engines/)
 *   GOOGLE_APPLICATION_CREDENTIALS ou ADC
 *   GOOGLE_CLOUD_PROJECT ou GCP_PROJECT_ID (opcional)
 *
 * Uso:
 *   node ceap_motor.js
 *   CEAP_DEPUTADO_ID=220645 node ceap_motor.js
 *
 * Fetch: todos os anos em simultâneo (query string fixa), paginação até `dados` vazio.
 * Grava em transparency_reports/{deputadoId} com merge de `investigacao_prisma_ceap`
 * (preserva prismas/benford anteriores; atualiza catálogo e metadados do motor).
 */

import axios from "axios";
import admin from "firebase-admin";
import { createHash } from "crypto";

import {
  buildMetricasCnpj,
  buildResumoRubricas,
  computeTagsSemanticasRisco,
  minificarNotaParaFirestore,
  ordenarTopCatalogo,
  parseDataDoc,
  parseValor,
  urlDocumentoOficial,
} from "./ceap_aggregates.js";

const ANOS_QUERY = "ano=2023&ano=2024&ano=2025&ano=2026";
const ITENS = 100;

function deepFetchUrl(deputadoId, pagina) {
  return `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputadoId}/despesas?${ANOS_QUERY}&itens=${ITENS}&pagina=${pagina}`;
}

const USER_AGENT =
  "TransparenciaBR-ceap_motor/2.0 (+https://github.com/mmbaesso1980/transparenciabr)";
const LEGAL_DISCLAIMER =
  "Indícios quantitativos derivados de dados públicos — não configuram ilícito nem substituem apuração oficial.";

const DEP_ID = (process.env.CEAP_DEPUTADO_ID || "220645").trim();

const BENFORD_EXPECTED = Array.from({ length: 9 }, (_, i) =>
  Math.log10(1 + 1 / (i + 1)),
);

function projectId() {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT_ID ||
    process.env.GCLOUD_PROJECT_ID ||
    ""
  );
}

function firstSignificantDigit(value) {
  let v = Math.abs(Number(value));
  if (!Number.isFinite(v) || v <= 0) return null;
  while (v < 1) v *= 10;
  while (v >= 10) v /= 10;
  return Math.floor(v);
}

function benfordStats(values) {
  const counts = Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [i + 1, 0]),
  );
  let total = 0;
  for (const val of values) {
    const d = firstSignificantDigit(val);
    if (d == null) continue;
    counts[d] += 1;
    total += 1;
  }
  if (total < 90) {
    return {
      amostra_suficiente: false,
      n_validos: total,
      anomaly_detected: false,
      motivo: "Menos de 90 valores válidos para análise Benford estável.",
    };
  }
  const observed = [];
  for (let d = 1; d <= 9; d++) observed.push(counts[d] / total);
  let mad = 0;
  for (let i = 0; i < 9; i++) {
    mad += Math.abs(observed[i] - BENFORD_EXPECTED[i]);
  }
  mad /= 9;
  let chi = 0;
  for (let d = 1; d <= 9; d++) {
    const exp = total * BENFORD_EXPECTED[d - 1];
    chi += ((counts[d] - exp) ** 2) / Math.max(exp, 1e-12);
  }
  const anomaly_detected = mad > 0.08;
  return {
    amostra_suficiente: true,
    n_validos: total,
    mad: Math.round(mad * 1e5) / 1e5,
    chi2_pearson_aprox: Math.round(chi * 1e4) / 1e4,
    digitos_observados: Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [String(i + 1), counts[i + 1]]),
    ),
    anomaly_detected,
    interpretacao_administrativa: anomaly_detected
      ? "Desvio estatístico ao padrão de Benford (MAD elevado); recomenda-se revisão amostral dos valores."
      : "Distribuição do primeiro dígito compatível com referência Benford sob esta amostra.",
  };
}

function isDescricaoGenerica(row) {
  const tipo = String(
    row.tipoDespesa ?? row.descricao ?? row.tipo_despesa ?? "",
  ).trim();
  if (!tipo) return true;
  if (tipo.length <= 24) return true;
  const generic =
    /^(consultoria|servi[cç]os?\s|passagens?|material|loca[cç][aã]o|combust[ií]vel)/i;
  return generic.test(tipo);
}

function normalizeDespesa(row, idx) {
  const valor = parseValor(row);
  const dataDoc = parseDataDoc(row);
  const tipoDespesa = String(row.tipoDespesa ?? row.descricao ?? "").trim();
  const nomeFornecedor = String(
    row.nomeFornecedor ?? row.nome_fornecedor ?? "",
  ).trim();
  const numeroDocumento = String(
    row.numeroDocumento ?? row.numDocumento ?? row.numero_documento ?? "",
  ).trim();
  const url = urlDocumentoOficial(row);
  return {
    ordem_api: idx,
    valor_liquido: valor,
    vlrLiquido: valor,
    data_documento: dataDoc,
    dataDocumento: row.dataDocumento ?? dataDoc,
    dataEmissao: dataDoc,
    tipo_despesa: tipoDespesa,
    tipoDespesa: row.tipoDespesa ?? tipoDespesa,
    nome_fornecedor: nomeFornecedor,
    nomeFornecedor: row.nomeFornecedor ?? nomeFornecedor,
    numero_documento: numeroDocumento,
    numDocumento: row.numDocumento ?? numeroDocumento,
    url_documento_oficial: url,
    urlDocumento: url || row.urlDocumento || "",
    descricao_generica: isDescricaoGenerica(row),
    /** preserva identificadores da API para dedupe / auditoria */
    codDocumento: row.codDocumento ?? row.cod_documento,
    ano: row.ano,
    mes: row.mes,
  };
}

/**
 * Deep fetch: URL com todos os anos; pagina 1..n até res.data.dados vir vazio.
 */
async function fetchTodasAsNotas(deputadoId) {
  const todasAsNotas = [];
  let pagina = 1;
  for (;;) {
    const url = deepFetchUrl(deputadoId, pagina);
    const { data } = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 120000,
      validateStatus: (s) => s === 200,
    });
    const dados = Array.isArray(data?.dados) ? data.dados : [];
    if (dados.length === 0) break;
    todasAsNotas.push(...dados);
    pagina += 1;
    await new Promise((r) => setTimeout(r, 250));
  }
  return todasAsNotas;
}

/** Remove duplicados por codDocumento (preferência) ou chave composta. */
function dedupeNotas(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const cod = row.codDocumento != null ? String(row.codDocumento) : "";
    const key =
      cod ||
      [
        row.numDocumento,
        row.dataDocumento,
        row.valorLiquido,
        row.nomeFornecedor,
      ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function buildPrismasBundle(benford) {
  return {
    BENFORD: { status: "calculado", resultado: benford },
    ORACULO: {
      status: "aguardando",
      nota: "[AGUARDANDO VARREDURA PROFUNDA]",
    },
    SANGUE_PODER: {
      status: "aguardando",
      nota: "[AGUARDANDO VARREDURA PROFUNDA]",
    },
    FLAVIO: {
      status: "aguardando",
      nota: "[AGUARDANDO VARREDURA PROFUNDA]",
    },
    DRACULA: {
      status: "aguardando",
      nota: "[AGUARDANDO VARREDURA PROFUNDA]",
    },
    ESPECTRO: {
      status: "aguardando",
      nota: "[AGUARDANDO VARREDURA PROFUNDA]",
    },
    ARIMA: {
      status: "aguardando",
      nota: "[AGUARDANDO VARREDURA PROFUNDA]",
    },
    KMEANS: {
      status: "aguardando",
      nota: "[AGUARDANDO VARREDURA PROFUNDA]",
    },
    DOC_AI: {
      status: "aguardando",
      nota: "[AGUARDANDO VARREDURA PROFUNDA]",
    },
    SANKEY: {
      status: "aguardando",
      nota: "[AGUARDANDO VARREDURA PROFUNDA]",
    },
    IRONMAN: {
      status: "aguardando",
      nota: "[AGUARDANDO VARREDURA PROFUNDA]",
    },
    VISUAL: {
      status: "aguardando",
      nota: "[AGUARDANDO VARREDURA PROFUNDA]",
    },
  };
}

async function gravarAlertasResumo(db, deputadoId, bundle, benford) {
  const col = db.collection("alertas_bodes");
  const batch = db.batch();
  const ts = admin.firestore.Timestamp.now();
  const hash = (s) => createHash("sha256").update(s).digest("hex");

  const msgResumo = `CEAP motor Node: ${bundle.n_documentos_api} documentos API; ${bundle.n_valores_numericos} valores numéricos. ${LEGAL_DISCLAIMER}`;
  batch.set(
    col.doc(hash(`${deputadoId}|PRISMA_RESUMO_NODE|${bundle.gerado_em}`)),
    {
      politico_id: deputadoId,
      parlamentar_id: deputadoId,
      tipo_risco: "PRISMA_CEAP_RESUMO_NODE",
      mensagem: msgResumo,
      severidade: "INFORMATIVO",
      fonte: "engines/ceap_motor.js",
      criado_em: ts,
      prisma_bundle_ref: bundle.gerado_em,
    },
    { merge: true },
  );

  const msgB =
    benford.amostra_suficiente === false
      ? `Benford: amostra insuficiente (${benford.n_validos ?? 0} valores). ${LEGAL_DISCLAIMER}`
      : `Benford (1.º dígito): MAD=${benford.mad}; ${benford.interpretacao_administrativa} ${LEGAL_DISCLAIMER}`;
  batch.set(
    col.doc(hash(`${deputadoId}|PRISMA_BENFORD_NODE|${bundle.gerado_em}`)),
    {
      politico_id: deputadoId,
      parlamentar_id: deputadoId,
      tipo_risco: "PRISMA_BENFORD",
      mensagem: msgB,
      severidade: benford.anomaly_detected ? "ANALITICO" : "INFORMATIVO",
      fonte: "engines/ceap_motor.js",
      criado_em: ts,
      metricas_benford: benford,
    },
    { merge: true },
  );

  await batch.commit();
}

function logMilharesNotas(n) {
  const mil = n / 1000;
  const label =
    mil >= 1
      ? `~${mil.toFixed(2)} mil notas (${n} documentos brutos da API)`
      : `${n} notas (abaixo de 1 mil)`;
  console.info(`[CEAP] Download concluído: ${label}`);
}

async function main() {
  const pid = projectId();
  if (!admin.apps.length) {
    admin.initializeApp(pid ? { projectId: pid } : {});
  }
  const db = admin.firestore();

  console.info(
    `ceap_motor.js v4 — deputado=${DEP_ID} project=${pid || "(ADC)"} deep_fetch multi-ano ${ANOS_QUERY.replace(/&/g, " ")}`,
  );

  const rawRows = await fetchTodasAsNotas(DEP_ID);
  logMilharesNotas(rawRows.length);

  const unicas = dedupeNotas(rawRows);
  if (unicas.length !== rawRows.length) {
    console.info(
      `[CEAP] Dedupe: ${rawRows.length} → ${unicas.length} (codDocumento / chave composta)`,
    );
  }

  const normalized = unicas.map((r, i) => normalizeDespesa(r, i));

  const valores = [];
  for (const n of normalized) {
    if (n.valor_liquido != null && Number.isFinite(n.valor_liquido)) {
      valores.push(n.valor_liquido);
    }
  }
  const benford = benfordStats(valores);
  const geradoEm = new Date().toISOString();
  const prismasNovos = buildPrismasBundle(benford);

  const resumoRubricas = buildResumoRubricas(unicas);
  const metricasKm = buildMetricasCnpj(unicas);
  const tagsSemanticas = computeTagsSemanticasRisco({
    benford,
    rowsApi: unicas,
  });

  const minificadas = unicas.map((r) => minificarNotaParaFirestore(r));
  const ordenadas = ordenarTopCatalogo(minificadas);
  const CATALOGO_MAX = 300;
  const catalogoSalvo = ordenadas.slice(0, CATALOGO_MAX);
  const totalNotasAnalisadas = unicas.length;

  const ref = db.collection("transparency_reports").doc(DEP_ID);
  const snap = await ref.get();
  const prevData = snap.exists ? snap.data() : {};
  const prevInv =
    prevData?.investigacao_prisma_ceap &&
    typeof prevData.investigacao_prisma_ceap === "object"
      ? prevData.investigacao_prisma_ceap
      : {};
  const prevKm =
    prevData?.metricas_k_means && typeof prevData.metricas_k_means === "object"
      ? prevData.metricas_k_means
      : {};

  const bundle = {
    ...prevInv,
    deputado_id: DEP_ID,
    gerado_em: geradoEm,
    total_notas_analisadas: totalNotasAnalisadas,
    n_documentos_api: totalNotasAnalisadas,
    n_documentos_raw_fetch: rawRows.length,
    catalogo_salvo_n: catalogoSalvo.length,
    catalogo_max_salvo: CATALOGO_MAX,
    n_valores_numericos: valores.length,
    fonte: "camara_api_v2_node_ceap_motor_deep",
    motor: "node_ceap_motor_v4_schema_padrao_ouro",
    fetch_url_pattern: `.../deputados/{id}/despesas?${ANOS_QUERY}&itens=${ITENS}&pagina={pagina}`,
    prismas: { ...(prevInv.prismas || {}), ...prismasNovos },
    avisos: Array.isArray(prevInv.avisos)
      ? [...new Set([...(prevInv.avisos || []), LEGAL_DISCLAIMER])]
      : [LEGAL_DISCLAIMER],
    despesas_ceap_catalogo: catalogoSalvo,
    valores_liquidos_amostra_benford: valores,
    resumo_rubricas_ceap: resumoRubricas,
    benford_agente: {
      ...benford,
      alerta_forense: benford.anomaly_detected === true,
    },
  };

  await ref.set(
    {
      atualizado_em: geradoEm,
      tags_semanticas_risco: tagsSemanticas,
      metricas_k_means: {
        ...prevKm,
        ...metricasKm,
        atualizado_em: geradoEm,
        fonte: "ceap_motor",
      },
      total_distinct_cnpj: metricasKm.total_distinct_cnpj,
      fornecedores_ativos: metricasKm.fornecedores_ativos,
      resumo_rubricas: {
        linhas: resumoRubricas.slice(0, 120),
        total_rubricas_distintas: resumoRubricas.length,
        atualizado_em: geradoEm,
        fonte: "ceap_api",
      },
      investigacao_prisma_ceap: bundle,
      ceap_motor_ultima_execucao: admin.firestore.FieldValue.serverTimestamp(),
      ceap_motor_meta: {
        versao: "node-4-schema-padrao-ouro",
        n_documentos: totalNotasAnalisadas,
        n_documentos_raw: rawRows.length,
        catalogo_top_n: catalogoSalvo.length,
        anos: [2023, 2024, 2025, 2026],
      },
    },
    { merge: true },
  );

  await gravarAlertasResumo(db, DEP_ID, bundle, benford);

  console.info(
    `OK Firestore transparency_reports/${DEP_ID} merge; catalogo=${catalogoSalvo.length} benford_anomaly=${benford.anomaly_detected === true}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
