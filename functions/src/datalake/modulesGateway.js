/**
 * modulesGateway.js — Gateway para módulos especializados
 * 
 * Cada módulo retorna KPIs agregados a partir do roster + ranking + BigQuery.
 * Usado por getDashboardKPIs com ?module=<nome>
 * 
 * Módulos: emendas, patrimonio, viagens, gabinete, nepotismo, 
 *          nepotismo-cruzado, empresas-prefeituras, anomalias, risco
 */

const { BigQuery } = require("@google-cloud/bigquery");
const { Storage } = require("@google-cloud/storage");

const PROJECT_ID = "transparenciabr";
const DATASET = "fiscalizapa";
const BUCKET_CLEAN = "datalake-tbr-clean";
const BUCKET_PUBLIC = "tbr-public-dashboard";

let bqClient = null;
function getBQ() {
  if (!bqClient) bqClient = new BigQuery({ projectId: PROJECT_ID });
  return bqClient;
}

let storageClient = null;
function getStorage() {
  if (!storageClient) storageClient = new Storage();
  return storageClient;
}

// Helper: tenta query BigQuery, retorna [] se tabela não existe
async function safeQuery(sql) {
  try {
    const [rows] = await getBQ().query({ query: sql, location: "US" });
    return rows || [];
  } catch (err) {
    const isNotFound = err.code === 404 || /not found/i.test(err.message);
    const level = isNotFound ? 'warn' : 'error';
    console[level](`BigQuery query failed [${err.code || 'UNKNOWN'}]: ${err.message}`);
    return [];
  }
}

// Helper: tenta carregar JSON do GCS
async function loadGcsJson(bucket, path) {
  try {
    const file = getStorage().bucket(bucket).file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buf] = await file.download();
    return JSON.parse(buf.toString("utf-8"));
  } catch (err) {
    const isParseError = err instanceof SyntaxError;
    console.error(`GCS load failed (${bucket}/${path}): ${err.message}${isParseError ? ' [corrupted JSON]' : ''}`);
    return null;
  }
}

// ─────────────────────────────────────────────
// MÓDULO: EMENDAS
// ─────────────────────────────────────────────
async function getEmendasKPIs() {
  const rows = await safeQuery(`
    SELECT 
      autor_emenda AS autor,
      tipo_emenda,
      SUM(valor_empenhado) AS total_empenhado,
      SUM(valor_pago) AS total_pago,
      COUNT(*) AS qtd_emendas,
      uf_beneficiario AS uf
    FROM \`${PROJECT_ID}.${DATASET}.emendas_parlamentares\`
    GROUP BY autor_emenda, tipo_emenda, uf_beneficiario
    ORDER BY total_empenhado DESC
    LIMIT 200
  `);

  if (rows.length === 0) {
    // Fallback: dados do GCS
    const gcsData = await loadGcsJson(BUCKET_PUBLIC, "emendas_kpis.json");
    if (gcsData) return gcsData;

    return {
      status: "sem_dados",
      mensagem: "Tabela emendas_parlamentares não encontrada no BigQuery. Pipeline de ingestão pendente.",
      total_empenhado: 0,
      total_pago: 0,
      qtd_emendas: 0,
      por_tipo: [],
      top_autores: [],
      por_uf: [],
      timestamp: new Date().toISOString(),
    };
  }

  const byTipo = {};
  const byAutor = {};
  const byUf = {};
  let totalEmpenhado = 0, totalPago = 0, qtdTotal = 0;

  for (const r of rows) {
    const tipo = r.tipo_emenda || "Outros";
    const autor = r.autor || "Desconhecido";
    const uf = r.uf || "—";
    const emp = Number(r.total_empenhado || 0);
    const pago = Number(r.total_pago || 0);
    const qtd = Number(r.qtd_emendas || 0);

    totalEmpenhado += emp;
    totalPago += pago;
    qtdTotal += qtd;

    byTipo[tipo] = (byTipo[tipo] || 0) + emp;
    byAutor[autor] = (byAutor[autor] || 0) + emp;
    byUf[uf] = (byUf[uf] || 0) + emp;
  }

  return {
    status: "ok",
    total_empenhado: totalEmpenhado,
    total_pago: totalPago,
    qtd_emendas: qtdTotal,
    por_tipo: Object.entries(byTipo).map(([k, v]) => ({ tipo: k, valor: v })).sort((a, b) => b.valor - a.valor),
    top_autores: Object.entries(byAutor).map(([k, v]) => ({ autor: k, valor: v })).sort((a, b) => b.valor - a.valor).slice(0, 20),
    por_uf: Object.entries(byUf).map(([k, v]) => ({ uf: k, valor: v })).sort((a, b) => b.valor - a.valor),
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// MÓDULO: PATRIMÔNIO TSE
// ─────────────────────────────────────────────
async function getPatrimonioKPIs() {
  const rows = await safeQuery(`
    SELECT 
      nome_candidato AS nome,
      sigla_partido AS partido,
      sigla_uf AS uf,
      ano_eleicao AS ano,
      SUM(CAST(valor_bem AS FLOAT64)) AS patrimonio_total,
      COUNT(*) AS qtd_bens
    FROM \`${PROJECT_ID}.${DATASET}.tse_patrimonio\`
    GROUP BY nome_candidato, sigla_partido, sigla_uf, ano_eleicao
    ORDER BY patrimonio_total DESC
    LIMIT 200
  `);

  if (rows.length === 0) {
    const gcsData = await loadGcsJson(BUCKET_PUBLIC, "patrimonio_kpis.json");
    if (gcsData) return gcsData;
    return {
      status: "sem_dados",
      mensagem: "Tabela tse_patrimonio não encontrada no BigQuery. Pipeline de ingestão pendente.",
      total_patrimonio: 0,
      qtd_parlamentares: 0,
      top_patrimonios: [],
      evolucao_por_ano: [],
      timestamp: new Date().toISOString(),
    };
  }

  let totalPatrimonio = 0;
  const parlamentares = new Set();
  const byAno = {};

  for (const r of rows) {
    const val = Number(r.patrimonio_total || 0);
    totalPatrimonio += val;
    parlamentares.add(r.nome);
    const ano = r.ano || "—";
    byAno[ano] = (byAno[ano] || 0) + val;
  }

  return {
    status: "ok",
    total_patrimonio: totalPatrimonio,
    qtd_parlamentares: parlamentares.size,
    top_patrimonios: rows.slice(0, 20).map(r => ({
      nome: r.nome, partido: r.partido, uf: r.uf, ano: r.ano,
      patrimonio: Number(r.patrimonio_total || 0), bens: Number(r.qtd_bens || 0),
    })),
    evolucao_por_ano: Object.entries(byAno).map(([k, v]) => ({ ano: k, total: v })).sort((a, b) => a.ano - b.ano),
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// MÓDULO: VIAGENS / AGENDA
// ─────────────────────────────────────────────
async function getViagensKPIs() {
  const rows = await safeQuery(`
    SELECT 
      nome_parlamentar AS nome,
      tipo_evento,
      localidade,
      COUNT(*) AS qtd_eventos
    FROM \`${PROJECT_ID}.${DATASET}.agenda_parlamentar\`
    GROUP BY nome_parlamentar, tipo_evento, localidade
    ORDER BY qtd_eventos DESC
    LIMIT 200
  `);

  if (rows.length === 0) {
    const gcsData = await loadGcsJson(BUCKET_PUBLIC, "viagens_kpis.json");
    if (gcsData) return gcsData;
    return {
      status: "sem_dados",
      mensagem: "Tabela agenda_parlamentar não encontrada no BigQuery. Pipeline de ingestão pendente.",
      total_eventos: 0,
      por_tipo: [],
      top_viajantes: [],
      timestamp: new Date().toISOString(),
    };
  }

  let totalEventos = 0;
  const byTipo = {};
  const byParlamentar = {};

  for (const r of rows) {
    const qtd = Number(r.qtd_eventos || 0);
    totalEventos += qtd;
    byTipo[r.tipo_evento || "Outros"] = (byTipo[r.tipo_evento || "Outros"] || 0) + qtd;
    byParlamentar[r.nome || "—"] = (byParlamentar[r.nome || "—"] || 0) + qtd;
  }

  return {
    status: "ok",
    total_eventos: totalEventos,
    por_tipo: Object.entries(byTipo).map(([k, v]) => ({ tipo: k, qtd: v })).sort((a, b) => b.qtd - a.qtd),
    top_viajantes: Object.entries(byParlamentar).map(([k, v]) => ({ nome: k, qtd: v })).sort((a, b) => b.qtd - a.qtd).slice(0, 20),
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// MÓDULO: GABINETE (Folha de Pagamento)
// ─────────────────────────────────────────────
async function getGabineteKPIs() {
  const rows = await safeQuery(`
    SELECT 
      nome_parlamentar AS parlamentar,
      nome_servidor AS servidor,
      cargo,
      remuneracao_bruta,
      vinculo
    FROM \`${PROJECT_ID}.${DATASET}.folha_gabinete\`
    ORDER BY remuneracao_bruta DESC
    LIMIT 500
  `);

  if (rows.length === 0) {
    const gcsData = await loadGcsJson(BUCKET_PUBLIC, "gabinete_kpis.json");
    if (gcsData) return gcsData;
    return {
      status: "sem_dados",
      mensagem: "Tabela folha_gabinete não encontrada no BigQuery. Pipeline de ingestão pendente.",
      total_servidores: 0,
      total_remuneracao: 0,
      top_salarios: [],
      por_cargo: [],
      timestamp: new Date().toISOString(),
    };
  }

  let totalRem = 0;
  const byCargo = {};

  for (const r of rows) {
    const rem = Number(r.remuneracao_bruta || 0);
    totalRem += rem;
    byCargo[r.cargo || "Outros"] = (byCargo[r.cargo || "Outros"] || 0) + 1;
  }

  return {
    status: "ok",
    total_servidores: rows.length,
    total_remuneracao: totalRem,
    top_salarios: rows.slice(0, 20).map(r => ({
      parlamentar: r.parlamentar, servidor: r.servidor, cargo: r.cargo,
      remuneracao: Number(r.remuneracao_bruta || 0), vinculo: r.vinculo,
    })),
    por_cargo: Object.entries(byCargo).map(([k, v]) => ({ cargo: k, qtd: v })).sort((a, b) => b.qtd - a.qtd),
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// MÓDULO: NEPOTISMO
// ─────────────────────────────────────────────
async function getNepotismoKPIs() {
  const rows = await safeQuery(`
    SELECT 
      nome_parlamentar AS parlamentar,
      nome_servidor AS servidor,
      grau_parentesco,
      cargo,
      remuneracao_bruta
    FROM \`${PROJECT_ID}.${DATASET}.nepotismo_detectado\`
    ORDER BY remuneracao_bruta DESC
    LIMIT 200
  `);

  if (rows.length === 0) {
    const gcsData = await loadGcsJson(BUCKET_PUBLIC, "nepotismo_kpis.json");
    if (gcsData) return gcsData;
    return {
      status: "sem_dados",
      mensagem: "Tabela nepotismo_detectado não encontrada no BigQuery. Pipeline de ingestão pendente.",
      total_casos: 0,
      total_remuneracao: 0,
      por_grau: [],
      top_casos: [],
      timestamp: new Date().toISOString(),
    };
  }

  let totalRem = 0;
  const byGrau = {};

  for (const r of rows) {
    const rem = Number(r.remuneracao_bruta || 0);
    totalRem += rem;
    byGrau[r.grau_parentesco || "Outros"] = (byGrau[r.grau_parentesco || "Outros"] || 0) + 1;
  }

  return {
    status: "ok",
    total_casos: rows.length,
    total_remuneracao: totalRem,
    por_grau: Object.entries(byGrau).map(([k, v]) => ({ grau: k, qtd: v })).sort((a, b) => b.qtd - a.qtd),
    top_casos: rows.slice(0, 20).map(r => ({
      parlamentar: r.parlamentar, servidor: r.servidor,
      grau: r.grau_parentesco, cargo: r.cargo,
      remuneracao: Number(r.remuneracao_bruta || 0),
    })),
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// MÓDULO: NEPOTISMO CRUZADO
// ─────────────────────────────────────────────
async function getNepotismoCruzadoKPIs() {
  const rows = await safeQuery(`
    SELECT 
      parlamentar_a, parlamentar_b,
      servidor_a, servidor_b,
      tipo_cruzamento,
      evidencia
    FROM \`${PROJECT_ID}.${DATASET}.nepotismo_cruzado\`
    LIMIT 200
  `);

  if (rows.length === 0) {
    const gcsData = await loadGcsJson(BUCKET_PUBLIC, "nepotismo_cruzado_kpis.json");
    if (gcsData) return gcsData;
    return {
      status: "sem_dados",
      mensagem: "Tabela nepotismo_cruzado não encontrada no BigQuery. Pipeline de ingestão pendente.",
      total_cruzamentos: 0,
      por_tipo: [],
      casos: [],
      timestamp: new Date().toISOString(),
    };
  }

  const byTipo = {};
  for (const r of rows) {
    byTipo[r.tipo_cruzamento || "Outros"] = (byTipo[r.tipo_cruzamento || "Outros"] || 0) + 1;
  }

  return {
    status: "ok",
    total_cruzamentos: rows.length,
    por_tipo: Object.entries(byTipo).map(([k, v]) => ({ tipo: k, qtd: v })).sort((a, b) => b.qtd - a.qtd),
    casos: rows.slice(0, 20).map(r => ({
      parlamentar_a: r.parlamentar_a, parlamentar_b: r.parlamentar_b,
      servidor_a: r.servidor_a, servidor_b: r.servidor_b,
      tipo: r.tipo_cruzamento, evidencia: r.evidencia,
    })),
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// MÓDULO: EMPRESAS × PREFEITURAS
// ─────────────────────────────────────────────
async function getEmpresasPrefeiturasKPIs() {
  const rows = await safeQuery(`
    SELECT 
      cnpj_empresa, razao_social,
      municipio, uf,
      SUM(valor_contrato) AS total_contratos,
      COUNT(*) AS qtd_contratos,
      tipo_licitacao
    FROM \`${PROJECT_ID}.${DATASET}.licitacoes_municipais\`
    GROUP BY cnpj_empresa, razao_social, municipio, uf, tipo_licitacao
    ORDER BY total_contratos DESC
    LIMIT 200
  `);

  if (rows.length === 0) {
    const gcsData = await loadGcsJson(BUCKET_PUBLIC, "empresas_prefeituras_kpis.json");
    if (gcsData) return gcsData;
    return {
      status: "sem_dados",
      mensagem: "Tabela licitacoes_municipais não encontrada no BigQuery. Pipeline de ingestão pendente.",
      total_contratos: 0,
      total_valor: 0,
      top_empresas: [],
      por_municipio: [],
      timestamp: new Date().toISOString(),
    };
  }

  let totalValor = 0, totalContratos = 0;
  const byMunicipio = {};

  for (const r of rows) {
    const val = Number(r.total_contratos || 0);
    const qtd = Number(r.qtd_contratos || 0);
    totalValor += val;
    totalContratos += qtd;
    const mun = `${r.municipio || "—"}/${r.uf || "—"}`;
    byMunicipio[mun] = (byMunicipio[mun] || 0) + val;
  }

  return {
    status: "ok",
    total_valor: totalValor,
    total_contratos: totalContratos,
    top_empresas: rows.slice(0, 20).map(r => ({
      cnpj: r.cnpj_empresa, razao_social: r.razao_social,
      municipio: r.municipio, uf: r.uf,
      valor: Number(r.total_contratos || 0), qtd: Number(r.qtd_contratos || 0),
    })),
    por_municipio: Object.entries(byMunicipio).map(([k, v]) => ({ municipio: k, valor: v })).sort((a, b) => b.valor - a.valor).slice(0, 20),
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// MÓDULO: ANOMALIAS (Lei de Benford)
// ─────────────────────────────────────────────
async function getAnomaliasKPIs() {
  const rows = await safeQuery(`
    SELECT 
      nome_parlamentar AS nome,
      score_benford,
      desvio_padrao,
      qtd_notas,
      classificacao
    FROM \`${PROJECT_ID}.${DATASET}.ml_benford_score\`
    ORDER BY score_benford DESC
    LIMIT 200
  `);

  if (rows.length === 0) {
    const gcsData = await loadGcsJson(BUCKET_PUBLIC, "anomalias_kpis.json");
    if (gcsData) return gcsData;
    return {
      status: "sem_dados",
      mensagem: "Tabela ml_benford_score não encontrada no BigQuery. Pipeline de ingestão pendente.",
      total_analisados: 0,
      total_anomalos: 0,
      por_classificacao: [],
      top_anomalos: [],
      timestamp: new Date().toISOString(),
    };
  }

  const byClass = {};
  let anomalos = 0;

  for (const r of rows) {
    const cls = r.classificacao || "Normal";
    byClass[cls] = (byClass[cls] || 0) + 1;
    if (cls !== "Normal") anomalos++;
  }

  return {
    status: "ok",
    total_analisados: rows.length,
    total_anomalos: anomalos,
    por_classificacao: Object.entries(byClass).map(([k, v]) => ({ classificacao: k, qtd: v })).sort((a, b) => b.qtd - a.qtd),
    top_anomalos: rows.filter(r => (r.classificacao || "Normal") !== "Normal").slice(0, 20).map(r => ({
      nome: r.nome, score: Number(r.score_benford || 0),
      desvio: Number(r.desvio_padrao || 0), notas: Number(r.qtd_notas || 0),
      classificacao: r.classificacao,
    })),
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// MÓDULO: RISCO QUANTITATIVO
// ─────────────────────────────────────────────
async function getRiscoKPIs() {
  const rows = await safeQuery(`
    SELECT 
      nome_parlamentar AS nome,
      partido, uf,
      score_risco,
      componentes_risco,
      classificacao_risco
    FROM \`${PROJECT_ID}.${DATASET}.score_risco_parlamentar\`
    ORDER BY score_risco DESC
    LIMIT 200
  `);

  if (rows.length === 0) {
    const gcsData = await loadGcsJson(BUCKET_PUBLIC, "risco_kpis.json");
    if (gcsData) return gcsData;
    return {
      status: "sem_dados",
      mensagem: "Tabela score_risco_parlamentar não encontrada no BigQuery. Pipeline de ingestão pendente.",
      total_analisados: 0,
      media_risco: 0,
      por_classificacao: [],
      top_risco: [],
      timestamp: new Date().toISOString(),
    };
  }

  const byClass = {};
  let somaRisco = 0;

  for (const r of rows) {
    const cls = r.classificacao_risco || "Baixo";
    byClass[cls] = (byClass[cls] || 0) + 1;
    somaRisco += Number(r.score_risco || 0);
  }

  return {
    status: "ok",
    total_analisados: rows.length,
    media_risco: rows.length > 0 ? somaRisco / rows.length : 0,
    por_classificacao: Object.entries(byClass).map(([k, v]) => ({ classificacao: k, qtd: v })).sort((a, b) => b.qtd - a.qtd),
    top_risco: rows.slice(0, 20).map(r => ({
      nome: r.nome, partido: r.partido, uf: r.uf,
      score: Number(r.score_risco || 0),
      classificacao: r.classificacao_risco,
    })),
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────
const MODULES = {
  emendas: getEmendasKPIs,
  patrimonio: getPatrimonioKPIs,
  viagens: getViagensKPIs,
  gabinete: getGabineteKPIs,
  nepotismo: getNepotismoKPIs,
  "nepotismo-cruzado": getNepotismoCruzadoKPIs,
  "empresas-prefeituras": getEmpresasPrefeiturasKPIs,
  anomalias: getAnomaliasKPIs,
  risco: getRiscoKPIs,
};

async function routeModule(moduleName) {
  const fn = MODULES[moduleName];
  if (!fn) {
    return {
      error: `Módulo '${moduleName}' não encontrado`,
      modulos_disponiveis: Object.keys(MODULES),
    };
  }
  return fn();
}

module.exports = { routeModule, MODULES };
