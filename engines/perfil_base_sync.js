#!/usr/bin/env node
/**
 * Sincroniza o documento transparency_reports/{id} com o perfil base da API Câmara
 * + schema Padrão Ouro (Round 1 — Conselho dos 12).
 *
 * Uso: node perfil_base_sync.js
 *     CEAP_DEPUTADO_ID=220645 node perfil_base_sync.js
 */

import axios from "axios";
import admin from "firebase-admin";

const DEP_ID = (process.env.CEAP_DEPUTADO_ID || "220645").trim();
const USER_AGENT =
  "TransparenciaBR-perfil_base_sync/1.0 (+https://github.com/mmbaesso1980/transparenciabr)";

function projectId() {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT_ID ||
    process.env.GCLOUD_PROJECT_ID ||
    ""
  );
}

/** HTTPS obrigatório para fotos (mixed content no Hosting). */
export function ensureHttpsCamaraUrl(url) {
  if (!url || typeof url !== "string") return "";
  const t = url.trim();
  if (!t) return "";
  if (t.startsWith("https://")) return t;
  if (t.startsWith("http://www.camara.leg.br")) {
    return `https://${t.slice("http://".length)}`;
  }
  if (t.startsWith("http://")) {
    try {
      const u = new URL(t);
      if (u.hostname.endsWith("camara.leg.br")) return `https://${u.host}${u.pathname}${u.search}`;
    } catch {
      /* fallthrough */
    }
  }
  return t;
}

function emptyExecutiveSchema(prev = {}) {
  return {
    politico_id: prev.politico_id ?? DEP_ID,
    nome: prev.nome ?? "",
    siglaPartido: prev.siglaPartido ?? "",
    siglaUf: prev.siglaUf ?? "",
    urlFoto: prev.urlFoto ?? "",
    cargo: prev.cargo ?? "",
    atualizado_em: prev.atualizado_em ?? null,
    nivel_exposicao:
      typeof prev.nivel_exposicao === "number" ? prev.nivel_exposicao : 0,
    contexto_socioeconomico:
      prev.contexto_socioeconomico &&
      typeof prev.contexto_socioeconomico === "object"
        ? prev.contexto_socioeconomico
        : {},
    malha_saude:
      prev.malha_saude && typeof prev.malha_saude === "object"
        ? prev.malha_saude
        : { fonte_cnes: "", hospitais: [] },
    contratos_pncp_resumo:
      prev.contratos_pncp_resumo &&
      typeof prev.contratos_pncp_resumo === "object"
        ? prev.contratos_pncp_resumo
        : {},
    rede_societaria: Array.isArray(prev.rede_societaria)
      ? prev.rede_societaria
      : [],
    tags_semanticas_risco: Array.isArray(prev.tags_semanticas_risco)
      ? prev.tags_semanticas_risco
      : [],
    metricas_k_means:
      prev.metricas_k_means &&
      typeof prev.metricas_k_means === "object"
        ? prev.metricas_k_means
        : { total_distinct_cnpj: 0, fornecedores_ativos: 0 },
    geolocalizacao:
      prev.geolocalizacao && typeof prev.geolocalizacao === "object"
        ? prev.geolocalizacao
        : { municipios_alvo: [], estado_base: [] },
    metadados_anexos:
      prev.metadados_anexos &&
      typeof prev.metadados_anexos === "object"
        ? prev.metadados_anexos
        : {},
    resumo_rubricas:
      prev.resumo_rubricas &&
      typeof prev.resumo_rubricas === "object"
        ? prev.resumo_rubricas
        : {},
    investigacao_prisma_ceap:
      prev.investigacao_prisma_ceap &&
      typeof prev.investigacao_prisma_ceap === "object"
        ? prev.investigacao_prisma_ceap
        : {},
  };
}

async function fetchDeputado(id) {
  const { data } = await axios.get(
    `https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`,
    {
      headers: { "User-Agent": USER_AGENT },
      timeout: 60000,
      validateStatus: (s) => s === 200,
    },
  );
  return data?.dados ?? null;
}

async function main() {
  const pid = projectId();
  if (!admin.apps.length) {
    admin.initializeApp(pid ? { projectId: pid } : {});
  }
  const db = admin.firestore();
  const ref = db.collection("transparency_reports").doc(DEP_ID);
  const snap = await ref.get();
  const prev = snap.exists ? snap.data() : {};

  const api = await fetchDeputado(DEP_ID);
  const st = api?.ultimoStatus ?? {};
  const nome =
    String(st.nomeEleitoral ?? st.nome ?? api?.nomeCivil ?? "").trim() ||
    String(api?.nomeCivil ?? "").trim();
  const siglaPartido = String(st.siglaPartido ?? "").trim();
  const siglaUf = String(st.siglaUf ?? "").trim();
  const urlFoto = ensureHttpsCamaraUrl(st.urlFoto ?? "");
  const cargo = String(st.descricaoStatus ?? st.situacao ?? "Deputado(a) Federal").trim();

  const geradoEm = new Date().toISOString();
  const base = emptyExecutiveSchema(prev);

  const payload = {
    ...base,
    politico_id: String(DEP_ID),
    nome,
    siglaPartido,
    siglaUf,
    urlFoto,
    cargo,
    atualizado_em: geradoEm,
    nivel_exposicao:
      typeof prev.nivel_exposicao === "number" ? prev.nivel_exposicao : 0,
    geolocalizacao: {
      ...(typeof base.geolocalizacao === "object" ? base.geolocalizacao : {}),
      estado_base: siglaUf ? [siglaUf] : [],
    },
    perfil_fonte: "camara_api_v2_deputados",
    perfil_sync_em: admin.firestore.FieldValue.serverTimestamp(),
  };

  await ref.set(payload, { merge: true });
  console.info(`OK transparency_reports/${DEP_ID} perfil base merge (Round 1 schema)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
