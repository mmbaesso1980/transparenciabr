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
  return { score, valor, categoria, classifiedAt };
}

function riskBand(score) {
  if (!Number.isFinite(score)) return null;
  if (score < 60) return "baixo";
  if (score < 85) return "medio";
  return "alto";
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
    ultima_classificacao_utc: null,
    categorias: new Map(),
    total_notas_classificadas: 0,
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
        score_max: 0,
        qtd_notas_alto_risco: 0,
        valor_alto_risco_brl: 0,
        ultima_nota_alto_risco_at: null,
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

        const { score, valor, categoria, classifiedAt } = extractNoteFields(row);
        bumpUltima(classifiedAt || null);

        const band = riskBand(score);
        if (band) global.notas_por_faixa_risco[band] += 1;

        global.valor_total_classificado_brl += valor;

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

function formatDashboardPayload(scan, rosterTotal = 594) {
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
    notas_por_faixa_risco: { ...global.notas_por_faixa_risco },
    top_categorias_risco: top,
    ultima_classificacao_utc: global.ultima_classificacao_utc,
  };
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

function formatAlvosPayload(scan, rosterMap, limit, minScore) {
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
    rows.push({
      id,
      nome: rowMeta.nome || id,
      partido: rowMeta.partido || "—",
      uf: rowMeta.uf || "",
      cargo: rowMeta.cargo || "deputado",
      urlFoto: rowMeta.urlFoto || "",
      score_medio: sm,
      score_max: Math.round(agg.score_max * 10) / 10,
      qtd_notas_alto_risco: agg.qtd_notas_alto_risco,
      valor_alto_risco_brl: Math.round(agg.valor_alto_risco_brl * 100) / 100,
      ultima_nota_alto_risco_at: agg.ultima_nota_alto_risco_at,
    });
  }

  rows.sort((a, b) => {
    if (b.qtd_notas_alto_risco !== a.qtd_notas_alto_risco) {
      return b.qtd_notas_alto_risco - a.qtd_notas_alto_risco;
    }
    return b.score_medio - a.score_medio;
  });

  const sliced = rows.slice(0, limit);

  return {
    generated_at: new Date().toISOString(),
    total_alvos: sliced.length,
    parse_errors: scan.meta.parse_errors,
    alvos: sliced,
  };
}

module.exports = {
  BUCKET_NAME,
  PREFIX,
  scanCeapClassified,
  loadRosterMap,
  formatDashboardPayload,
  formatAlvosPayload,
};
