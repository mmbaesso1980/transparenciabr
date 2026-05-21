/**
 * Contexto forense unificado para Vertex (on-demand): CEAP já vem no bundle Firestore;
 * aqui acrescentamos emendas e cruzamentos no BigQuery + atividade legislativa (API Câmara),
 * pois não há tabela única de proposições no BQ neste repositório.
 */

const {
  resolveNome,
  queryEmendas,
  queryEmendasCeapCruzamento,
} = require("../datalake/getDossieAurora.js");

function pickParlamentarNome(bundle) {
  const pol = bundle.politicos || {};
  const rep = bundle.transparency_reports || {};
  return String(
    pol.nome_parlamentar ||
      pol.nome ||
      pol.nome_civil ||
      rep.nome ||
      rep.nome_completo ||
      rep.apelido_publico ||
      "",
  ).trim();
}

async function resolveNomeCompleto(politicoId, bundle) {
  let nome = pickParlamentarNome(bundle);
  if (nome) return nome;
  const id = String(politicoId || "").trim();
  if (!id) return "";
  try {
    const row = await resolveNome(id);
    return row?.nome_parlamentar ? String(row.nome_parlamentar).trim() : "";
  } catch {
    return "";
  }
}

/**
 * Proposições recentes (dados abertos Câmara). Complementa lacuna de tabela BQ dedicada.
 * @param {string} politicoId
 * @returns {Promise<Record<string, unknown>>}
 */
async function fetchProposicoesCamara(politicoId) {
  const id = String(politicoId || "").trim();
  if (!/^\d+$/.test(id)) {
    return { fonte: "api_camara", proposicoes: [], nota: "id_nao_numerico_api_camara" };
  }
  const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${id}/proposicoes?itens=40&ordem=DESC&ordenarPor=id`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return { fonte: "api_camara", proposicoes: [], erro: `http_${res.status}` };
    }
    const j = await res.json();
    const dados = Array.isArray(j.dados) ? j.dados : [];
    const proposicoes = dados.map((p) => ({
      id: p.id,
      siglaTipo: p.siglaTipo,
      numero: p.numero,
      ano: p.ano,
      ementa: String(p.ementa || "").slice(0, 500),
    }));
    return { fonte: "api_camara", proposicoes };
  } catch (e) {
    return {
      fonte: "api_camara",
      proposicoes: [],
      erro: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * @param {string} politicoId
 * @param {Record<string, unknown>} bundle
 * @returns {Promise<Record<string, unknown>>}
 */
async function buildParlamentarDatalakeContext(politicoId, bundle) {
  const nome = await resolveNomeCompleto(politicoId, bundle);

  const emendasP = nome
    ? queryEmendas(nome)
    : Promise.resolve([]);
  const cruzP = nome
    ? queryEmendasCeapCruzamento(nome)
    : Promise.resolve([]);
  const propP = fetchProposicoesCamara(politicoId);

  const [emRes, cxRes, prRes] = await Promise.allSettled([emendasP, cruzP, propP]);

  const emendas = emRes.status === "fulfilled" ? emRes.value : [];
  const cruzamento_emendas_ceap =
    cxRes.status === "fulfilled" ? cxRes.value : [];
  const atividade_legislativa =
    prRes.status === "fulfilled"
      ? prRes.value
      : { fonte: "api_camara", proposicoes: [], erro: String(prRes.reason || "") };

  return {
    parlamentar_nome_resolvido: nome || null,
    politico_id: String(politicoId),
    emendas_bq: Array.isArray(emendas) ? emendas : [],
    cruzamento_emendas_ceap_fornecedor: Array.isArray(cruzamento_emendas_ceap)
      ? cruzamento_emendas_ceap
      : [],
    atividade_legislativa,
  };
}

module.exports = { buildParlamentarDatalakeContext, pickParlamentarNome };
