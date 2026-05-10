/** Normaliza sigla rotulada no roster (Câmara/Senado). */
export function normalizePartidoLabel(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compare compacto para URL × chave do roster (ex.: UNIAO × UNIÃO BRASIL). */
export function partidoLabelCompact(label) {
  return normalizePartidoLabel(label).replace(/\s+/g, "");
}

/**
 * @param {string} urlSigla
 * @param {string[]} rosterPartyKeys
 */
export function resolvePartyKeyFromUrl(urlSigla, rosterPartyKeys) {
  const raw = decodeURIComponent(String(urlSigla || "").trim());
  const want = partidoLabelCompact(raw);
  if (!want || !Array.isArray(rosterPartyKeys)) return null;

  const SYNONYMS = {
    UNIAO: ["UNIAOBRASIL", "UNIAO BRASIL"],
    UNIAOBRASIL: ["UNIAO"],
    PCDOB: ["PCDOB", "PC DO B"],
    PC_DO_B: ["PCDOB"],
    REP: ["REPUBLICANOS"],
  };
  const extras = SYNONYMS[want] || [];

  for (const key of rosterPartyKeys) {
    const k = partidoLabelCompact(key);
    if (k === want) return key;
    if (extras.some((x) => partidoLabelCompact(x) === k)) return key;
  }
  return null;
}

function rankingMapFromList(rankingList) {
  const m = new Map();
  for (const r of rankingList || []) {
    if (r?.id != null) m.set(String(r.id), r);
  }
  return m;
}

function alvosMapFromList(alvosList) {
  const m = new Map();
  for (const a of alvosList || []) {
    if (a?.id != null) m.set(String(a.id), a);
  }
  return m;
}

/**
 * Agrega roster por partido + enriquece com ranking CEAP e alvos datalake.
 */
export function aggregatePartiesFromRoster(roster, rankingList, alvosList) {
  const rankingMap = rankingMapFromList(rankingList);
  const alvosMap = alvosMapFromList(alvosList);

  /** @type Map<string, { key: string, members: object[] }> */
  const groups = new Map();

  for (const p of roster || []) {
    const key = normalizePartidoLabel(p.partido);
    if (!key || key === "—") continue;
    if (!groups.has(key)) groups.set(key, { key, members: [] });
    groups.get(key).members.push(p);
  }

  const stats = [];
  for (const { key, members } of groups.values()) {
    const ids = [...new Set(members.map((m) => String(m.id)))];
    let cotaTotal = 0;
    let rankingHits = 0;
    let auroraSum = 0;
    let auroraN = 0;
    let sinalSum = 0;

    for (const id of ids) {
      const rk = rankingMap.get(id);
      if (rk && Number(rk.cota) > 0) {
        cotaTotal += Number(rk.cota);
        rankingHits++;
      }
      const al = alvosMap.get(id);
      if (al != null && Number.isFinite(Number(al.indice_risco_aurora))) {
        auroraSum += Number(al.indice_risco_aurora);
        auroraN++;
      }
      if (al != null && Number.isFinite(Number(al.qtd_notas_alto_risco))) {
        sinalSum += Number(al.qtd_notas_alto_risco);
      }
    }

    const scoreMedio =
      auroraN > 0 ? Math.round((auroraSum / auroraN) * 10) / 10 : null;

    stats.push({
      siglaKey: key,
      parlamentares: ids.length,
      cotaTotal,
      cotaCoverage: rankingHits,
      scoreMedio,
      sinalizacoes: sinalSum,
      members,
      ids,
    });
  }

  stats.sort((a, b) => b.parlamentares - a.parlamentares);
  return { partyStats: stats, rankingMap, alvosMap };
}

/** Chaves de partido únicas no roster (sem depender de getAlvos). */
export function partyKeysFromRoster(roster) {
  const s = new Set();
  for (const p of roster || []) {
    const k = normalizePartidoLabel(p.partido);
    if (k && k !== "—") s.add(k);
  }
  return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function ufCountsForMembers(members) {
  const m = new Map();
  for (const p of members || []) {
    const uf = String(p.uf || "").toUpperCase();
    if (uf.length !== 2) continue;
    m.set(uf, (m.get(uf) || 0) + 1);
  }
  return m;
}

const UF_ORDER = [
  "SP",
  "RJ",
  "MG",
  "BA",
  "RS",
  "PR",
  "PE",
  "CE",
  "GO",
  "SC",
  "MA",
  "PA",
  "ES",
  "PI",
  "AL",
  "RN",
  "MT",
  "MS",
  "DF",
  "SE",
  "AM",
  "RO",
  "TO",
  "AC",
  "AP",
  "RR",
  "PB",
];

export function ufGridPayload(members, partyColor) {
  const counts = ufCountsForMembers(members);
  const max = Math.max(1, ...counts.values());
  return UF_ORDER.map((uf) => {
    const n = counts.get(uf) || 0;
    const intensidade = n / max;
    return { uf, n, intensidade, partyColor };
  });
}

export function topMembersByCota(members, rankingMap, alvosMap, limit = 10) {
  const seen = new Set();
  const rows = [];
  for (const m of members || []) {
    const id = String(m.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const rk = rankingMap.get(id);
    const al = alvosMap.get(id);
    rows.push({
      id,
      nome: String(m.nome || id).trim(),
      uf: String(m.uf || "").toUpperCase(),
      cota: rk ? Number(rk.cota) || 0 : 0,
      aurora: al != null && Number.isFinite(Number(al.indice_risco_aurora))
        ? Number(al.indice_risco_aurora)
        : null,
      notasAlto:
        al != null && Number.isFinite(Number(al.qtd_notas_alto_risco))
          ? Number(al.qtd_notas_alto_risco)
          : 0,
      urlFoto: typeof m.urlFoto === "string" ? m.urlFoto : "",
    });
  }
  rows.sort((a, b) => b.cota - a.cota || a.nome.localeCompare(b.nome, "pt-BR"));
  return rows.slice(0, limit);
}

/** Parlamentares da sigla presentes no ranking público de alvos (datalake). */
export function partyAlvosHighlights(members, alvosMap, limit = 12) {
  const ids = new Set((members || []).map((m) => String(m.id)));
  const rows = [];
  for (const id of ids) {
    const al = alvosMap.get(id);
    if (!al) continue;
    const mem = (members || []).find((m) => String(m.id) === id);
    rows.push({
      id,
      nome: mem ? String(mem.nome || id) : id,
      uf: mem ? String(mem.uf || "") : "",
      aurora: Number(al.indice_risco_aurora),
      notasAlto: Number(al.qtd_notas_alto_risco) || 0,
    });
  }
  rows.sort((a, b) => b.notasAlto - a.notasAlto || b.aurora - a.aurora);
  return rows.slice(0, limit);
}
