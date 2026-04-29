/**
 * Algoritmo determinístico de cor por político.
 *
 * Cada político recebe uma "orbe" única gerada a partir do CPF (ou ID Câmara)
 * + modulada pelo score forense ASMODEUS. A mesma pessoa SEMPRE recebe a mesma cor.
 *
 * Princípios:
 *  - Hue base derivado do hash do CPF/ID — distribui 5.500+ políticos uniformemente
 *  - Saturação cresce com o score (limpo = pastel; crítico = vibrante)
 *  - Brilho diminui com o score (limpo = claro; crítico = profundo, urgente)
 *  - Hue secundário (gradiente da orbe) deriva do hue base + offset estável
 *
 * Uso:
 *   const { primary, secondary, glow, hueBase } = getPoliticianColor("12345678901", 82);
 */

import { getRiskHslComponents } from "./colorUtils.js";

/** Hash determinístico FNV-1a 32-bit — leve, sem dependências, distribuição boa. */
function fnv1a(input) {
  const str = String(input ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** HSL → HEX. */
function hslToHex(h, s, l) {
  const H = ((h % 360) + 360) % 360 / 360;
  const S = Math.max(0, Math.min(1, s / 100));
  const L = Math.max(0, Math.min(1, l / 100));
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const h2rgb = (p1, q1, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p1 + (q1 - p1) * 6 * tt;
    if (tt < 1 / 2) return q1;
    if (tt < 2 / 3) return p1 + (q1 - p1) * (2 / 3 - tt) * 6;
    return p1;
  };
  const r = h2rgb(p, q, H + 1 / 3);
  const g = h2rgb(p, q, H);
  const b = h2rgb(p, q, H - 1 / 3);
  const toHex = (x) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clampScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Gera as componentes HSL de um político.
 *
 * @param {string|number} identity  CPF, ID Câmara ou ID estável do político
 * @param {number} score  Score ASMODEUS (0..100). Default 0 = limpo.
 * @returns {{
 *   primary: string, secondary: string, accent: string,
 *   primaryHsl: {h:number,s:number,l:number},
 *   glow: number, hueBase: number, intensity: number
 * }}
 */
export function getPoliticianColor(identity, score = 0) {
  const hash = fnv1a(identity || "anon");
  const hueBase = hash % 360;
  const v = clampScore(score);

  // Saturação e brilho modulados pelo score
  // - score 0  → pastel (s=55, l=68)  — calmo, claro
  // - score 50 → vibrante (s=78, l=58) — atenção
  // - score 100→ urgente (s=92, l=44) — crítico, profundo
  const t = v / 100;
  const saturation = 55 + t * 37;
  const lightness = 68 - t * 24;

  // Cor secundária — golden-ratio offset estável (137.5°) garante harmonia
  const hueSecondary = (hueBase + 137.5) % 360;
  // Cor de acento — offset de 47°, levemente análogo
  const hueAccent = (hueBase + 47) % 360;

  const primary = hslToHex(hueBase, saturation, lightness);
  const secondary = hslToHex(hueSecondary, saturation - 8, lightness + 4);
  const accent = hslToHex(hueAccent, saturation + 4, lightness - 6);

  return {
    primary,
    secondary,
    accent,
    primaryHsl: { h: hueBase, s: saturation, l: lightness },
    glow: 0.18 + t * 0.55, // intensidade do halo no universo 3D
    hueBase,
    intensity: t, // 0..1 para uso em shaders / opacidades
  };
}

/**
 * Conveniência: retorna apenas a cor principal (compatível com `getRiskColor`).
 * Útil quando o componente já espera string CSS.
 */
export function getPoliticianHex(identity, score = 0) {
  return getPoliticianColor(identity, score).primary;
}

/**
 * Gera um par (primary, secondary) ideal para gradient orbe radial.
 * Use no SVG: `radialGradient` com primary no centro e secondary na borda.
 */
export function getPoliticianOrbStops(identity, score = 0) {
  const c = getPoliticianColor(identity, score);
  return {
    inner: c.primary,
    outer: c.secondary,
    accent: c.accent,
  };
}
