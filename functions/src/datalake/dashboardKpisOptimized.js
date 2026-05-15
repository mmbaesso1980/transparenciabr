/**
 * getDashboardKPIs — Onda 23 (clean ranking from BQ, name_mapping for fuzzy)
 * Ranking JSON is now clean UTF-8 from BigQuery (no more mojibake).
 * Unmatched roster members are mostly senators (no CEAP data).
 */
const { Storage } = require("@google-cloud/storage");

function normName(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

// Manual mapping for fuzzy cases (roster name -> ranking name, both normalized)
const NAME_MAP = {
  "aj albuquerque": "albuquerque",
  "gabriel nunes": "gabriel mota",
  "ze trovao": "ze trovao",
  "capitao alberto neto": "capitao alberto neto",
  "dr jaziel": "dr jaziel",
  "professor alcides": "professor alcides",
  "delegado paulo bilynskyj": "delegado paulo bilynskyj",
  "ze neto": "ze neto",
  "ze vitor": "ze vitor",
  "paulao": "paulao",
};

const BUCKET_NAME = "datalake-tbr-clean";
const PUBLIC_RANKING_URL = "https://storage.googleapis.com/tbr-public-dashboard/painel/ranking.json";

async function loadRosterJson() {
  try {
    const storage = new Storage();
    const file = storage.bucket(BUCKET_NAME).file("universe/roster.json");
    const [exists] = await file.exists();
    if (!exists) return { roster: [], total: 0 };
    const [buf] = await file.download();
    return JSON.parse(buf.toString("utf-8"));
  } catch (err) {
    console.error("Erro roster:", err.message);
    return { roster: [], total: 0 };
  }
}

async function loadPublicRanking() {
  try {
    const res = await fetch(PUBLIC_RANKING_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json) ? json : Array.isArray(json?.parlamentares) ? json.parlamentares : [];
  } catch (err) {
    console.error("Erro ranking:", err.message);
    return [];
  }
}

function aggregateDashboardKPIs(roster = [], ranking = []) {
  // Index ranking by normalized name
  const rankMap = new Map();
  for (const r of ranking) {
    const n = normName(r.deputado || r.nome || "");
    if (n) rankMap.set(n, r);
  }

  const partidos = new Map();
  let totalCota = 0, totalNotas = 0, maxCota = 0, matched = 0;
  const scores = [], cotas = [];
  const rosterEnriched = [];

  for (const p of roster) {
    const rawName = p.nome || p.nome_civil || p.nome_parlamentar || "";
    let n = normName(rawName);
    let r = rankMap.get(n) || rankMap.get(NAME_MAP[n] || "");

    // Fallback: try nome_parlamentar if nome didn't match
    if (!r && p.nome_parlamentar) {
      const np = normName(p.nome_parlamentar);
      r = rankMap.get(np) || rankMap.get(NAME_MAP[np] || "");
    }

    const isSenador = !r; // If no CEAP data, likely a senator
    if (r) matched++;

    const cota = Number(r?.total_brl || 0);
    const pct = Number(r?.pct_aproveitamento || 0);
    const notas = Number(r?.qtd_notas || 0);

    totalCota += cota;
    totalNotas += notas;
    maxCota = Math.max(maxCota, cota);
    if (cota > 0) cotas.push(cota);
    if (pct > 0) scores.push(pct);

    const sigla = String(p.partido || "—").toUpperCase();
    const cur = partidos.get(sigla) || { sigla, count: 0, cota: 0, notas: 0 };
    cur.count++;
    cur.cota += cota;
    cur.notas += notas;
    partidos.set(sigla, cur);

    rosterEnriched.push({
      id: p.id,
      nome: rawName,
      partido: sigla,
      uf: String(p.uf || "—").toUpperCase(),
      cota,
      pct,
      notas,
      is_senador: isSenador,
    });
  }

  const medianCota = cotas.length > 0 ? cotas.sort((a, b) => a - b)[Math.floor(cotas.length / 2)] : 0;
  const medianScore = scores.length > 0 ? scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] : 0;
  const avgCota = cotas.length > 0 ? totalCota / cotas.length : 0;

  console.log(`Dashboard: ${matched}/${roster.length} matched (${roster.length - matched} senadores sem CEAP)`);

  // ── Pontuação Brasil: Índice Composto de Transparência ──
  // Calculado sobre DEPUTADOS (que têm CEAP), não senadores
  const totalDeputados = matched; // deputados com dados
  const totalSenadores = roster.length - matched;

  // 1. Cobertura (% deputados com dados / total deputados estimado ~513)
  const estDeputados = 513;
  const dimCobertura = Math.min(20, Math.round((matched / estDeputados) * 20));

  // 2. Volume fiscal (notas classificadas)
  const dimVolume = Math.min(20, Math.round((Math.min(totalNotas, 600000) / 600000) * 20));

  // 3. Distribuição (Gini)
  const cotasSorted = [...cotas].sort((a, b) => a - b);
  let giniNum = 0;
  for (let i = 0; i < cotasSorted.length; i++) {
    giniNum += (2 * (i + 1) - cotasSorted.length - 1) * cotasSorted[i];
  }
  const gini = cotasSorted.length > 0 && totalCota > 0
    ? giniNum / (cotasSorted.length * totalCota) : 0;
  const dimDistribuicao = Math.min(20, Math.round((1 - Math.abs(gini)) * 20));

  // 4. Aproveitamento médio da cota
  const dimAproveitamento = Math.min(20, Math.round((medianScore / 100) * 20));

  // 5. Diversidade partidária
  const partidosComDados = [...partidos.values()].filter(p => p.cota > 0).length;
  const dimPartidos = Math.min(20, Math.round((Math.min(partidosComDados, 20) / 20) * 20));

  const pontuacaoBrasil = dimCobertura + dimVolume + dimDistribuicao + dimAproveitamento + dimPartidos;

  // Top 5 maiores gastadores (from ranking directly)
  const top5 = ranking
    .filter(r => Number(r.total_brl || 0) > 0)
    .sort((a, b) => Number(b.total_brl || 0) - Number(a.total_brl || 0))
    .slice(0, 5)
    .map(r => ({
      id: r.id,
      nome: r.deputado || "—",
      partido: `${String(r.partido || "—").toUpperCase()}/${String(r.uf || "—").toUpperCase()}`,
      cota: Number(r.total_brl || 0),
      pct: Number(r.pct_aproveitamento || 0),
      is_suplente: Boolean(r.is_suplente),
    }));

  // Top 5 mais frugais
  const top5Frugais = ranking
    .filter(r => Number(r.pct_aproveitamento || 0) > 0 && Number(r.meses_ativos || 0) >= 12)
    .sort((a, b) => Number(a.pct_aproveitamento || 0) - Number(b.pct_aproveitamento || 0))
    .slice(0, 5)
    .map(r => ({
      id: r.id,
      nome: r.deputado || "—",
      partido: `${String(r.partido || "—").toUpperCase()}/${String(r.uf || "—").toUpperCase()}`,
      pct: Number(r.pct_aproveitamento || 0),
      cota: Number(r.total_brl || 0),
      meses_ativos: Number(r.meses_ativos || 0),
    }));

  // UF grid
  const ufMap = new Map();
  for (const p of rosterEnriched) {
    if (p.uf === "—") continue;
    const cur = ufMap.get(p.uf) || { uf: p.uf, count: 0, cota: 0, deputados: 0, senadores: 0 };
    cur.count++;
    cur.cota += p.cota;
    if (p.is_senador) cur.senadores++; else cur.deputados++;
    ufMap.set(p.uf, cur);
  }
  const maxCount = Math.max(1, ...Array.from(ufMap.values()).map(x => x.count));
  const ufGrid = [...ufMap.values()]
    .sort((a, b) => b.count - a.count)
    .map(u => ({
      uf: u.uf,
      total: u.count,
      deputados: u.deputados,
      senadores: u.senadores,
      cota_total: u.cota,
      intensidade: Math.round((u.count / maxCount) * 100),
    }));

  return {
    total_parlamentares: roster.length,
    total_deputados: matched,
    total_senadores: roster.length - matched,
    total_notas_classificadas: totalNotas,
    total_cota_ceap: totalCota,
    cota_media: avgCota,
    cota_mediana: medianCota,
    cota_maxima: maxCota,
    score_aurora_medio: medianScore,
    pontuacao_brasil: Math.max(0, Math.min(100, pontuacaoBrasil)),
    parlamentares_matched: matched,
    dimensoes_pontuacao: {
      cobertura: dimCobertura,
      volume_fiscal: dimVolume,
      distribuicao: dimDistribuicao,
      aproveitamento: dimAproveitamento,
      diversidade_partidaria: dimPartidos,
    },
    indicadores_forense: {
      rastreabilidade_pct: Math.round((matched / estDeputados) * 100),
      gini_gastos: Math.round(Math.abs(gini) * 100) / 100,
    },
    maiores_cotas: top5,
    mais_frugais: top5Frugais,
    mapa_uf: ufGrid,
    partidos_top: [...partidos.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    timestamp: new Date().toISOString(),
  };
}

module.exports = { loadRosterJson, loadPublicRanking, aggregateDashboardKPIs };
