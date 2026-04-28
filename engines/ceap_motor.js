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
 *
 * Benford: sempre sobre 100% das notas deduplicadas (memória).
 * Firestore: catálogo minificado (5 campos) + Top 300 após ordenação data↓ valor↓.
 */

import axios from "axios";
import admin from "firebase-admin";
import { createHash } from "crypto";

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
const CATALOGO_MAX_SALVO = 300;

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

function parseValor(row) {
  const keys = [
    "valorLiquido",
    "valor_liquido",
    "vlrLiquido",
    "valorDocumento",
    "valor_documento",
    "valor",
  ];
  for (const k of keys) {
    if (row[k] != null && row[k] !== "") {
      const n = Number(row[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** URL oficial do PDF quando a API não devolve link direto. */
function urlDocumentoOficial(row) {
  const u = row.urlDocumento || row.url_documento;
  if (typeof u === "string" && u.trim().startsWith("http")) return u.trim();
  const num =
    row.numeroDocumento ??
    row.numDocumento ??
    row.numero_documento ??
    row.codigoDocumento ??
    "";
  const s = String(num ?? "").trim();
  if (/^[0-9]+$/.test(s)) {
    return `https://www.camara.leg.br/cota-parlamentar/documentos/publ/${s}.pdf`;
  }
  return typeof u === "string" ? u.trim() : "";
}

function parseDataDoc(row) {
  const raw =
    row.dataDocumento ??
    row.data_documento ??
    row.dataEmissao ??
    row.data_emissao ??
    "";
  return String(raw ?? "").slice(0, 10);
}

/** Payload Firestore: apenas estes campos (compressão). */
function minificarNotaParaFirestore(row) {
  const v = parseValor(row);
  const dataDoc = parseDataDoc(row);
  const url = urlDocumentoOficial(row);
  const nome = String(row.nomeFornecedor ?? row.nome_fornecedor ?? "").trim();
  const cnpj = String(row.cnpjCpfFornecedor ?? row.cnpjCpf ?? "").trim();
  return {
    txtFornecedor: nome,
    vlrLiquido: v != null && Number.isFinite(v) ? v : null,
    dataDocumento: dataDoc,
    urlDocumento: url || (typeof row.urlDocumento === "string" ? row.urlDocumento.trim() : ""),
    cnpjCpf: cnpj,
  };
}

function ordenarTopCatalogo(minificadas) {
  return [...minificadas].sort((a, b) => {
    const db = String(b.dataDocumento || "");
    const da = String(a.dataDocumento || "");
    if (db !== da) return db.localeCompare(da);
    const vb = Number(b.vlrLiquido);
    const va = Number(a.vlrLiquido);
    const nb = Number.isFinite(vb) ? vb : -Infinity;
    const na = Number.isFinite(va) ? va : -Infinity;
    return nb - na;
  });
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

  const msgResumo = `CEAP motor Node: ${bundle.total_notas_analisadas ?? bundle.n_documentos_api} notas analisadas (Benford 100%); catálogo Firestore Top ${CATALOGO_MAX_SALVO}. ${LEGAL_DISCLAIMER}`;
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
    `ceap_motor.js v3 — deputado=${DEP_ID} project=${pid || "(ADC)"} deep_fetch multi-ano ${ANOS_QUERY.replace(/&/g, " ")}`,
  );

  const rawRows = await fetchTodasAsNotas(DEP_ID);
  logMilharesNotas(rawRows.length);

  const unicas = dedupeNotas(rawRows);
  if (unicas.length !== rawRows.length) {
    console.info(
      `[CEAP] Dedupe: ${rawRows.length} → ${unicas.length} (codDocumento / chave composta)`,
    );
  }

  const totalNotasAnalisadas = unicas.length;

  /** Benford: 100% dos valores líquidos válidos na memória */
  const valores = [];
  for (const row of unicas) {
    const v = parseValor(row);
    if (v != null && Number.isFinite(v)) valores.push(v);
  }
  const benford = benfordStats(valores);
  const geradoEm = new Date().toISOString();
  const prismasNovos = buildPrismasBundle(benford);

  const minificadas = unicas.map((r) => minificarNotaParaFirestore(r));
  const ordenadas = ordenarTopCatalogo(minificadas);
  const catalogoSalvo = ordenadas.slice(0, CATALOGO_MAX_SALVO);

  console.info(
    `[CEAP] Payload: ${totalNotasAnalisadas} notas analisadas (Benford); gravando Top ${catalogoSalvo.length}/${CATALOGO_MAX_SALVO} no Firestore (minificado).`,
  );

  const ref = db.collection("transparency_reports").doc(DEP_ID);
  const snap = await ref.get();
  const prevInv =
    snap.exists && snap.data()?.investigacao_prisma_ceap &&
    typeof snap.data().investigacao_prisma_ceap === "object"
      ? snap.data().investigacao_prisma_ceap
      : {};

  const bundle = {
    ...prevInv,
    deputado_id: DEP_ID,
    gerado_em: geradoEm,
    total_notas_analisadas: totalNotasAnalisadas,
    n_documentos_api: totalNotasAnalisadas,
    n_documentos_raw_fetch: rawRows.length,
    catalogo_salvo_n: catalogoSalvo.length,
    catalogo_max_salvo: CATALOGO_MAX_SALVO,
    n_valores_numericos: valores.length,
    fonte: "camara_api_v2_node_ceap_motor_deep",
    motor: "node_ceap_motor_v3_payload_compressed",
    fetch_url_pattern: `.../deputados/{id}/despesas?${ANOS_QUERY}&itens=${ITENS}&pagina={pagina}`,
    prismas: { ...(prevInv.prismas || {}), ...prismasNovos },
    avisos: Array.isArray(prevInv.avisos)
      ? [...new Set([...(prevInv.avisos || []), LEGAL_DISCLAIMER])]
      : [LEGAL_DISCLAIMER],
    despesas_ceap_catalogo: catalogoSalvo,
    benford_agente: {
      ...benford,
      alerta_forense: benford.anomaly_detected === true,
    },
  };

  await ref.set(
    {
      investigacao_prisma_ceap: bundle,
      ceap_motor_ultima_execucao: admin.firestore.FieldValue.serverTimestamp(),
      ceap_motor_meta: {
        versao: "node-3-payload-compressed",
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
    `OK Firestore transparency_reports/${DEP_ID} merge; total_notas_analisadas=${totalNotasAnalisadas} catalogo_salvo=${catalogoSalvo.length} benford_anomaly=${benford.anomaly_detected === true}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
