/**
 * Heurística de espectro político (plano -10..+10) por sigla de partido.
 * X: economia (negativo = esquerda, positivo = direita).
 * Y: costumes (negativo = progressista, positivo = conservador).
 *
 * Saída normalizada para [-1, 1] para a Bússola (com jitter estável).
 */

/** Base em escala -10..10 (conforme mapa operacional do produto). */
const PARTIDO_COORDS = {
  PSOL: { x: -8, y: -9 },
  PT: { x: -6, y: -5 },
  PCdoB: { x: -7, y: -6 },
  "PC DO B": { x: -7, y: -6 },
  PCO: { x: -9, y: -7 },
  REDE: { x: -5, y: -7 },
  PV: { x: -4, y: -4 },
  PDT: { x: -4, y: -3 },
  PSB: { x: -3, y: -5 },
  CIDADANIA: { x: -2, y: -4 },
  SOLIDARIEDADE: { x: -1, y: 2 },
  AVANTE: { x: 1, y: 3 },
  PL: { x: 8, y: 8 },
  UNIÃO: { x: 6, y: 6 },
  PP: { x: 5, y: 5 },
  REPUBLICANOS: { x: 5, y: 7 },
  PSC: { x: 4, y: 8 },
  NOVO: { x: 8, y: -8 },
  MDB: { x: 1, y: 2 },
  PSD: { x: 3, y: 3 },
  PSDB: { x: 4, y: 2 },
  PODEMOS: { x: 0, y: -2 },
  PODE: { x: 0, y: -2 },
};

const FALLBACK = { x: 0, y: 0 };

function normalizePartyKey(raw) {
  if (raw == null || raw === "") return "";
  return String(raw)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function pickSiglaPartido(politico) {
  if (!politico || typeof politico !== "object") return "";
  const v =
    politico.sigla_partido ??
    politico.partido_sigla ??
    politico.siglaPartido ??
    politico.partido ??
    politico.sigla ??
    "";
  return typeof v === "string" ? v.trim().slice(0, 24) : "";
}

/** Converte coordenada -10..10 para -1..1. */
export function scaleToUnit(v10) {
  const n = Number(v10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n / 10));
}

export function clampUnit(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

/**
 * Jitter estável ±0.5 na escala -10..10 → ±0.05 em [-1,1], derivado do ID/slug.
 */
function stableJitter01(seedStr) {
  const s = String(seedStr || "default");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  const u = (h >>> 0) / 4294967295;
  return (u - 0.5) * 0.1;
}

/**
 * Coordenadas base (-10..10) para a sigla; fallback (0,0).
 */
export function coordsPartidoBase10(sigla) {
  const key = normalizePartyKey(sigla);
  if (!key) return { ...FALLBACK };
  if (PARTIDO_COORDS[key]) return { ...PARTIDO_COORDS[key] };
  const compact = key.replace(/\s/g, "");
  for (const [k, v] of Object.entries(PARTIDO_COORDS)) {
    if (normalizePartyKey(k).replace(/\s/g, "") === compact) return { ...v };
  }
  return { ...FALLBACK };
}

/**
 * Estimativa algorítmica para o dossiê: mapa partido + jitter estável.
 * @returns {{ economia: number, costumes: number, siglaUsada: string, fonte: "heuristica_partido" }}
 */
export function estimateSpectroFromPolitico(politico) {
  if (politico != null && typeof politico !== "object") {
    return {
      economia: 0,
      costumes: 0,
      siglaUsada: "",
      fonte: "heuristica_partido",
    };
  }
  const sigla = pickSiglaPartido(politico);
  const base = coordsPartidoBase10(sigla);
  const seed =
    String(politico?.id ?? politico?.CodigoParlamentar ?? "") || sigla || "x";
  const jx = stableJitter01(`${seed}|x`);
  const jy = stableJitter01(`${seed}|y`);

  return {
    economia: clampUnit(scaleToUnit(base.x) + jx),
    costumes: clampUnit(scaleToUnit(base.y) + jy),
    siglaUsada: sigla,
    fonte: "heuristica_partido",
  };
}
