/**
 * Agrega JSONL em gs://datalake-tbr-clean/ceap_classified/
 * Suporta layout do burner: ceap_classified/{ano}/{deputadoId}/notas.jsonl
 * e variante legada: ceap_classified/{deputadoId}/{ano}.jsonl
 *
 * ZERO Firestore — apenas Storage.
 */

const readline = require("readline");

const BUCKET_NAME = "datalake-tbr-clean";
const PREFIX = "ceap_classified/";

function parseCeapBlobPath(fileName) {
  const rel = String(fileName || "").replace(new RegExp(`^${PREFIX}`), "");
  const parts = rel.split("/").filter(Boolean);
  if (parts.length >= 3 && parts[parts.length - 1] === "notas.jsonl") {
    const ano = parts[0];
    const deputadoId = parts[1];
    if (/^\d{4}$/.test(ano) && deputadoId) return { deputadoId, ano };
  }
  if (parts.length === 2 && /\.jsonl$/i.test(parts[1])) {
    const deputadoId = parts[0];
    const ano = parts[1].replace(/\.jsonl$/i, "");
    if (deputadoId && /^\d{4}$/.test(ano)) return { deputadoId, ano };
  }
  return null;
}

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function parseJsonlLine(line, stats) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    stats.parse_errors += 1;
    return null;
  }
}

function normalizeCnpj(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length < 8) return "";
  return d.length > 14 ? d.slice(0, 14) : d;
}

function extractDocUrl(row) {
  const u = String(
    row.urlDocumento ??
      row.url_documento ??
      row.link_documento ??
      row.url_nota ??
      row.urlNota ??
      "",
  ).trim();
  return u.length > 4 ? u : "";
}

/** ISO-like date from despesa publicada (fonte oficial). */
function extractPublishedAtRaw(row) {
  const s = String(
    row.data_publicacao ??
      row.dataPublicacao ??
      row.data_emissao ??
      row.dataEmissao ??
      row.data_documento ??
      row.dataDocumento ??
      row.data ??
      row.published_at ??
      row.publishedAt ??
      "",
  ).trim();
  return s;
}

function parseUtcMs(isoLike) {
  if (!isoLike) return NaN;
  const t = Date.parse(isoLike);
  return Number.isFinite(t) ? t : NaN;
}

function extractNoteFields(row) {
  const score = num(row.score_risco ?? row.scoreRisco ?? row.score, NaN);
  const valor = Math.abs(
    num(
      row.valor ??
        row.valor_liquido ??
        row.valorLiquido ??
        row.valor_documento ??
        row.valorDocumento,
      0,
    ),
  );
  const categoria = String(
    row.categoria ?? row.rubrica ?? row.descricao_categoria ?? "SEM_CATEGORIA",
  )
    .trim()
    .slice(0, 160);
  const classifiedAt = String(row.classified_at ?? row.classifiedAt ?? "").trim();
  const cnpjFornecedor = normalizeCnpj(
    row.cnpj_fornecedor ?? row.cnpjFornecedor ?? row.fornecedor_cnpj ?? row.cnpj,
  );
  const docUrl = extractDocUrl(row);
  const publishedRaw = extractPublishedAtRaw(row);
  return {
    score,
    valor,
    categoria,
    classifiedAt,
    cnpjFornecedor,
    docUrl,
    publishedRaw,
  };
}

function riskBand(score) {
  if (!Number.isFinite(score)) return null;
  if (score < 60) return "baixo";
  if (score < 85) return "medio";
  return "alto";
}

/** HHI em escala 0–10000 (shares em %, s_i^2). */
function hhiFromValorMap(valorMap) {
  let total = 0;
  for (const v of valorMap.values()) total += v;
  if (total <= 0) return 0;
  let sumSq = 0;
  for (const v of valorMap.values()) {
    const sharePct = (v / total) * 100;
    sumSq += sharePct * sharePct;
  }
  return Math.round(sumSq * 100) / 100;
}

/** Entropia de Shannon (nats) / ln(2) = bits. */
function shannonBitsFromValorMap(valorMap) {
  let total = 0;
  for (const v of valorMap.values()) total += v;
  if (total <= 0) return 0;
  let hNats = 0;
  for (const v of valorMap.values()) {
    if (v <= 0) continue;
    const p = v / total;
    hNats -= p * Math.log(p);
  }
  const bits = hNats / Math.LN2;
  return Math.round(bits * 1000) / 1000;
}

/** IERP % — valor médio+alto / valor total classificado. */
function ierpPctFromGlobals(g) {
  const denom = g.valor_total_classificado_brl;
  if (!(denom > 0)) return 0;
  const num = g.valor_alto_risco_brl + g.valor_medio_risco_brl;
  return Math.round((num / denom) * 10000) / 100;
}

function rastreabilidadePct(g) {
  const n = g.total_notas_classificadas;
  if (!(n > 0)) return 0;
  return Math.round((g.notas_com_url_documento / n) * 10000) / 100;
}

function latenciaMediaHoras(sum, n) {
  if (!(n > 0)) return null;
  return Math.round((sum / n) * 100) / 100;
}

function valorPorAnoSorted(valorPorAnoMap) {
  return [...valorPorAnoMap.entries()]
    .map(([ano, valor_brl]) => ({
      ano,
      valor_brl: Math.round(valor_brl * 100) / 100,
    }))
    .sort((a, b) => a.ano.localeCompare(b.ano));
}

function profundidadeCobertura(global, depsSize) {
  const n = global.total_notas_classificadas;
  const d = depsSize;
  if (!(d > 0) || !(n > 0)) return 0;
  return Math.round((n / d) * 100) / 100;
}

function scoreMedioDep(agg) {
  if (agg.sumValor > 0) {
    return Math.round((agg.sumValorScore / agg.sumValor) * 10) / 10;
  }
  if (agg.nScores > 0) {
    return Math.round((agg.sumScoreSimple / agg.nScores) * 10) / 10;
  }
  return 0;
}

function indiceRiscoAuroraDep(agg) {
  const sm = scoreMedioDep(agg);
  const hhi = hhiFromValorMap(agg.fornecedores);
  const concPenalty = hhi >= 2500 ? Math.min(25, (hhi - 2500) / 200) : 0;
  const freqBoost = Math.min(15, (agg.qtd_notas_alto_risco || 0) * 0.8);
  const raw = sm * 0.65 + freqBoost - concPenalty;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

/**
 * Lista blobs sob ceap_classified/ e agrega todas as linhas.
 * @returns {Promise<{ meta: object, byDep: Map<string, DepAgg>, global: GlobalAgg }>}
 */
async function scanCeapClassified(storage) {
  const bucket = storage.bucket(BUCKET_NAME);
  const [files] = await bucket.getFiles({ prefix: PREFIX });

  const meta = {
    parse_errors: 0,
    files_read: 0,
    lines_ok: 0,
  };

  const anos = new Set();
  const deps = new Set();

  const global = {
    notas_por_faixa_risco: { baixo: 0, medio: 0, alto: 0 },
    valor_total_classificado_brl: 0,
    valor_alto_risco_brl: 0,
    valor_medio_risco_brl: 0,
    ultima_classificacao_utc: null,
    categorias: new Map(),
    fornecedores: new Map(),
    valor_por_ano: new Map(),
    notas_por_ano: new Map(),
    total_notas_classificadas: 0,
    notas_com_url_documento: 0,
    sum_latencia_horas: 0,
    n_latencia_amostras: 0,
  };

  /** @type {Map<string, object>} */
  const byDep = new Map();

  function bumpUltima(ts) {
    if (!ts) return;
    const cur = global.ultima_classificacao_utc;
    if (!cur || ts > cur) global.ultima_classificacao_utc = ts;
  }

  function ensureDep(id) {
    const sid = String(id);
    if (!byDep.has(sid)) {
      byDep.set(sid, {
        sumValorScore: 0,
        sumValor: 0,
        sumScoreSimple: 0,
        nScores: 0,
        nNotas: 0,
        score_max: 0,
        qtd_notas_alto_risco: 0,
        valor_alto_risco_brl: 0,
        valor_medio_risco_brl: 0,
        ultima_nota_alto_risco_at: null,
        ultima_classificacao_utc: null,
        fornecedores: new Map(),
        categorias: new Map(),
        valor_por_ano: new Map(),
        notas_por_ano: new Map(),
        notas_com_url_documento: 0,
        sum_latencia_horas: 0,
        n_latencia_amostras: 0,
      });
    }
    return byDep.get(sid);
  }

  for (const file of files) {
    const name = file.name;
    if (!name.endsWith(".jsonl")) continue;
    const parsedPath = parseCeapBlobPath(name);
    if (!parsedPath) continue;

    anos.add(parsedPath.ano);
    deps.add(parsedPath.deputadoId);
    meta.files_read += 1;

    await new Promise((resolve, reject) => {
      const stream = file.createReadStream();
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      rl.on("line", (line) => {
        const row = parseJsonlLine(line, meta);
        if (!row) return;
        meta.lines_ok += 1;
        global.total_notas_classificadas += 1;

        const {
          score,
          valor,
          categoria,
          classifiedAt,
          cnpjFornecedor,
          docUrl,
          publishedRaw,
        } = extractNoteFields(row);
        bumpUltima(classifiedAt || null);

        const band = riskBand(score);
        if (band) global.notas_por_faixa_risco[band] += 1;

        global.valor_total_classificado_brl += valor;
        if (Number.isFinite(score) && score >= 60 && score < 85) {
          global.valor_medio_risco_brl += valor;
        }

        const anoKey = String(parsedPath.ano || "").trim();
        if (anoKey) {
          const va = global.valor_por_ano.get(anoKey) || 0;
          global.valor_por_ano.set(anoKey, va + valor);
          const na = global.notas_por_ano.get(anoKey) || 0;
          global.notas_por_ano.set(anoKey, na + 1);
        }

        if (docUrl) global.notas_com_url_documento += 1;

        const pubMs = parseUtcMs(publishedRaw);
        const classMs = parseUtcMs(classifiedAt);
        if (Number.isFinite(pubMs) && Number.isFinite(classMs) && classMs >= pubMs) {
          const dh = (classMs - pubMs) / 3600000;
          if (dh >= 0 && dh < 24 * 365 * 5) {
            global.sum_latencia_horas += dh;
            global.n_latencia_amostras += 1;
          }
        }

        const fornKey = cnpjFornecedor && cnpjFornecedor.length >= 11 ? cnpjFornecedor : "";
        if (fornKey) {
          const fv = global.fornecedores.get(fornKey) || 0;
          global.fornecedores.set(fornKey, fv + valor);
        }

        const catKey = categoria || "SEM_CATEGORIA";
        const prev = global.categorias.get(catKey) || {
          score_total: 0,
          qtd: 0,
          valor_total: 0,
        };
        prev.qtd += 1;
        if (Number.isFinite(score)) prev.score_total += score;
        prev.valor_total += valor;
        global.categorias.set(catKey, prev);

        const depAgg = ensureDep(parsedPath.deputadoId);
        depAgg.nNotas += 1;

        const tsAll = classifiedAt || "";
        if (tsAll) {
          const uc = depAgg.ultima_classificacao_utc;
          if (!uc || tsAll > uc) depAgg.ultima_classificacao_utc = tsAll;
        }

        if (docUrl) depAgg.notas_com_url_documento += 1;

        if (Number.isFinite(pubMs) && Number.isFinite(classMs) && classMs >= pubMs) {
          const dh = (classMs - pubMs) / 3600000;
          if (dh >= 0 && dh < 24 * 365 * 5) {
            depAgg.sum_latencia_horas += dh;
            depAgg.n_latencia_amostras += 1;
          }
        }

        if (anoKey) {
          const dva = depAgg.valor_por_ano.get(anoKey) || 0;
          depAgg.valor_por_ano.set(anoKey, dva + valor);
          const dna = depAgg.notas_por_ano.get(anoKey) || 0;
          depAgg.notas_por_ano.set(anoKey, dna + 1);
        }

        if (fornKey) {
          const df = depAgg.fornecedores.get(fornKey) || 0;
          depAgg.fornecedores.set(fornKey, df + valor);
        }

        const dcat = depAgg.categorias.get(catKey) || { valor_total: 0, qtd: 0 };
        dcat.valor_total += valor;
        dcat.qtd += 1;
        depAgg.categorias.set(catKey, dcat);

        if (Number.isFinite(score)) {
          depAgg.score_max = Math.max(depAgg.score_max, score);
          depAgg.sumScoreSimple += score;
          depAgg.nScores += 1;
        }
        if (valor > 0 && Number.isFinite(score)) {
          depAgg.sumValorScore += score * valor;
          depAgg.sumValor += valor;
        } else if (Number.isFinite(score)) {
          depAgg.sumValorScore += score;
          depAgg.sumValor += 1;
        }

        if (Number.isFinite(score) && score >= 85) {
          global.valor_alto_risco_brl += valor;
          depAgg.qtd_notas_alto_risco += 1;
          depAgg.valor_alto_risco_brl += valor;
          const u = depAgg.ultima_nota_alto_risco_at;
          const ts = classifiedAt || "";
          if (ts && (!u || ts > u)) depAgg.ultima_nota_alto_risco_at = ts;
        }
        if (Number.isFinite(score) && score >= 60 && score < 85) {
          depAgg.valor_medio_risco_brl += valor;
        }
      });

      rl.on("close", resolve);
      stream.on("error", reject);
    });
  }

  return {
    meta,
    byDep,
    global,
    anos,
    deps,
    bucketReachable: true,
  };
}

async function loadRosterMap(storage) {
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file("universe/roster.json");
  const [exists] = await file.exists();
  if (!exists) return new Map();
  const [buf] = await file.download();
  let data;
  try {
    data = JSON.parse(buf.toString("utf-8"));
  } catch (_) {
    return new Map();
  }
  const roster = Array.isArray(data?.roster) ? data.roster : [];
  const m = new Map();
  for (const r of roster) {
    const id = String(r.id ?? "").trim();
    if (!id) continue;
    m.set(id, {
      id,
      nome: String(r.nome || "").trim(),
      partido: String(r.partido || "").trim().toUpperCase(),
      uf: String(r.uf || "").trim().toUpperCase(),
      cargo: String(r.cargo || "deputado").trim().toLowerCase(),
      urlFoto: String(r.urlFoto || "").trim(),
    });
  }
  return m;
}

function topAlvosPreviewFromScan(scan, rosterMap, n = 5) {
  const rows = [];
  for (const [id, agg] of scan.byDep.entries()) {
    const sm = scoreMedioDep(agg);
    const meta = rosterMap?.get?.(id) || {};
    rows.push({
      id,
      nome: String(meta.nome || "").trim() || id,
      partido: String(meta.partido || "—").trim(),
      uf: String(meta.uf || "").trim(),
      qtd_notas_alto_risco: agg.qtd_notas_alto_risco,
      score_medio: sm,
      valor_alto_risco_brl: Math.round(agg.valor_alto_risco_brl * 100) / 100,
    });
  }
  rows.sort((a, b) => {
    if (b.qtd_notas_alto_risco !== a.qtd_notas_alto_risco) {
      return b.qtd_notas_alto_risco - a.qtd_notas_alto_risco;
    }
    return b.score_medio - a.score_medio;
  });
  return rows.slice(0, n);
}

function formatDashboardPayload(scan, rosterTotal = 594, rosterMap = null) {
  const { global, meta, anos, deps } = scan;
  const top = [...global.categorias.entries()]
    .map(([categoria, v]) => ({
      categoria,
      score_total: Math.round(v.score_total * 100) / 100,
      qtd: v.qtd,
      valor_total_brl: Math.round(v.valor_total * 100) / 100,
    }))
    .sort((a, b) => b.score_total - a.score_total)
    .slice(0, 10);

  const cobertura_pct =
    rosterTotal > 0
      ? Math.round((deps.size / rosterTotal) * 1000) / 10
      : 0;

  const catValorMap = new Map();
  for (const [k, v] of global.categorias.entries()) {
    catValorMap.set(k, v.valor_total || 0);
  }

  const indicadores_forense = {
    ierp_pct: ierpPctFromGlobals(global),
    tad_pct: cobertura_pct,
    tad_metodo:
      "Proxy operacional: parlamentares com ≥1 nota classificada no GCS ÷ total do roster (N_declaradas da API em BigQuery — pendência 003).",
    rastreabilidade_pct: rastreabilidadePct(global),
    hhi_fornecedores: hhiFromValorMap(global.fornecedores),
    diversidade_categorias_shannon_bits: shannonBitsFromValorMap(catValorMap),
    latencia_media_horas_ingestao_classif: latenciaMediaHoras(
      global.sum_latencia_horas,
      global.n_latencia_amostras,
    ),
    profundidade_cobertura_notas_por_parlamentar: profundidadeCobertura(
      global,
      deps.size,
    ),
    valor_financeiro_classificado_serie_anual_brl: valorPorAnoSorted(
      global.valor_por_ano,
    ),
    notas_por_ano: [...global.notas_por_ano.entries()]
      .map(([ano, qtd]) => ({ ano, qtd }))
      .sort((a, b) => a.ano.localeCompare(b.ano)),
  };

  return {
    generated_at: new Date().toISOString(),
    parse_errors: meta.parse_errors,
    files_scanned: meta.files_read,
    total_parlamentares_cobertos: deps.size,
    total_anos_cobertos: anos.size,
    total_notas_classificadas: global.total_notas_classificadas,
    cobertura_pct,
    valor_total_classificado_brl:
      Math.round(global.valor_total_classificado_brl * 100) / 100,
    valor_alto_risco_brl: Math.round(global.valor_alto_risco_brl * 100) / 100,
    valor_medio_risco_brl: Math.round(global.valor_medio_risco_brl * 100) / 100,
    notas_por_faixa_risco: { ...global.notas_por_faixa_risco },
    top_categorias_risco: top,
    ultima_classificacao_utc: global.ultima_classificacao_utc,
    indicadores_forense,
    top_alvos_preview: rosterMap
      ? topAlvosPreviewFromScan(scan, rosterMap, 5)
      : topAlvosPreviewFromScan(scan, new Map(), 5),
  };
}

function formatAlvosPayload(scan, rosterMap, limit, minScore, sortKey = "notas_alto_risco") {
  const rows = [];
  for (const [id, agg] of scan.byDep.entries()) {
    const sm = scoreMedioDep(agg);
    if (sm < minScore) continue;
    const rowMeta = rosterMap.get(id) || {
      id,
      nome: "",
      partido: "",
      uf: "",
      cargo: "deputado",
      urlFoto: "",
    };
    const hhi = hhiFromValorMap(agg.fornecedores);
    const catValorMap = new Map();
    for (const [k, v] of agg.categorias.entries()) {
      catValorMap.set(k, v.valor_total || 0);
    }
    const bits = shannonBitsFromValorMap(catValorMap);
    const idx = indiceRiscoAuroraDep(agg);
    rows.push({
      id,
      nome: rowMeta.nome || id,
      partido: rowMeta.partido || "—",
      uf: rowMeta.uf || "",
      cargo: rowMeta.cargo || "deputado",
      urlFoto: rowMeta.urlFoto || "",
      score_medio: sm,
      score_max: Math.round(agg.score_max * 10) / 10,
      indice_risco_aurora: idx,
      qtd_notas_alto_risco: agg.qtd_notas_alto_risco,
      valor_alto_risco_brl: Math.round(agg.valor_alto_risco_brl * 100) / 100,
      ultima_nota_alto_risco_at: agg.ultima_nota_alto_risco_at,
      hhi_fornecedores: hhi,
      diversidade_categorias_shannon_bits: bits,
      rastreabilidade_pct: agg.nNotas > 0
        ? Math.round((agg.notas_com_url_documento / agg.nNotas) * 10000) / 100
        : 0,
    });
  }

  const sk = String(sortKey || "notas_alto_risco").toLowerCase();
  rows.sort((a, b) => {
    if (sk === "score_medio" || sk === "score") {
      if (b.score_medio !== a.score_medio) return b.score_medio - a.score_medio;
      return b.qtd_notas_alto_risco - a.qtd_notas_alto_risco;
    }
    if (sk === "indice_aurora" || sk === "indice_risco_aurora") {
      if (b.indice_risco_aurora !== a.indice_risco_aurora) {
        return b.indice_risco_aurora - a.indice_risco_aurora;
      }
      return b.qtd_notas_alto_risco - a.qtd_notas_alto_risco;
    }
    if (b.qtd_notas_alto_risco !== a.qtd_notas_alto_risco) {
      return b.qtd_notas_alto_risco - a.qtd_notas_alto_risco;
    }
    return b.score_medio - a.score_medio;
  });

  const sliced = rows.slice(0, limit);

  return {
    generated_at: new Date().toISOString(),
    total_alvos: sliced.length,
    ordenacao: sk,
    parse_errors: scan.meta.parse_errors,
    alvos: sliced,
  };
}

/**
 * KPIs CEAP classificado para um parlamentar (mesmo scan GCS — usar cache agressivo).
 * @returns {object|null}
 */
function formatDossieCeapPayload(scan, politicoId) {
  const id = String(politicoId || "").trim();
  if (!id) return null;
  const agg = scan.byDep.get(id);
  if (!agg) return null;

  const catValorMap = new Map();
  for (const [k, v] of agg.categorias.entries()) {
    catValorMap.set(k, v.valor_total || 0);
  }

  const topCats = [...agg.categorias.entries()]
    .map(([categoria, v]) => ({
      categoria,
      valor_brl: Math.round(v.valor_total * 100) / 100,
      qtd: v.qtd,
    }))
    .sort((a, b) => b.valor_brl - a.valor_brl)
    .slice(0, 8);

  return {
    generated_at: new Date().toISOString(),
    politico_id: id,
    indice_risco_aurora: indiceRiscoAuroraDep(agg),
    posicionamento_ideologico_gal: null,
    posicionamento_ideologico_gal_motivo:
      "Indicador GAL requer votações nominais (BigQuery); CEAP-only retorna null.",
    score_medio_ponderado: scoreMedioDep(agg),
    score_max: Math.round(agg.score_max * 10) / 10,
    qtd_notas_alto_risco: agg.qtd_notas_alto_risco,
    valor_alto_risco_brl: Math.round(agg.valor_alto_risco_brl * 100) / 100,
    valor_total_classificado_brl: Math.round(agg.sumValor * 100) / 100,
    hhi_fornecedores: hhiFromValorMap(agg.fornecedores),
    diversidade_categorias_shannon_bits: shannonBitsFromValorMap(catValorMap),
    rastreabilidade_pct:
      agg.nNotas > 0
        ? Math.round((agg.notas_com_url_documento / agg.nNotas) * 10000) / 100
        : 0,
    media_notas_por_ano:
      agg.valor_por_ano.size > 0
        ? Math.round((agg.nNotas / agg.valor_por_ano.size) * 100) / 100
        : agg.nNotas,
    latencia_media_horas_ingestao_classif: latenciaMediaHoras(
      agg.sum_latencia_horas,
      agg.n_latencia_amostras,
    ),
    ultima_classificacao_nota_utc: agg.ultima_classificacao_utc,
    serie_valor_anual_brl: valorPorAnoSorted(agg.valor_por_ano),
    top_categorias_valor: topCats,
    parse_errors: scan.meta.parse_errors,
  };
}

module.exports = {
  BUCKET_NAME,
  PREFIX,
  scanCeapClassified,
  loadRosterMap,
  formatDashboardPayload,
  formatAlvosPayload,
  formatDossieCeapPayload,
};
