/**
 * Escala HSL unificada para risco / índice (0–100).
 */

function clampScore(score) {
  const n = Number(score);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Componentes HSL para uso em THREE.Color(`hsl(${h}, ${s}%, ${l}%)`).
 *
 * @param {number} score
 * @returns {{ h: number, s: number, l: number }}
 */
export function getRiskHslComponents(score) {
  const v = clampScore(score);

  if (v <= 30) {
    const t = v / 30;
    return {
      h: 142 + t * 14,
      s: 68 + t * 10,
      l: 38 + t * 12,
    };
  }

  if (v <= 70) {
    const t = (v - 31) / (70 - 31);
    return {
      h: 32 + t * 15,
      s: 82 + t * 10,
      l: 48 + t * 10,
    };
  }

  const t = (v - 71) / (100 - 71);
  return {
    h: 348 + t * 12,
    s: 82 + t * 15,
    l: 34 - t * 10,
  };
}

/**
 * Cor CSS `hsl(...)` para um score de risco (0 = baixo, 100 = crítico).
 */
export function getRiskColor(score) {
  const { h, s, l } = getRiskHslComponents(score);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * Opacidade sugerida para brilho / halo (sombras, glow CSS, overlays).
 */
export function getRiskGlow(score) {
  const s = clampScore(score);

  if (s <= 30) {
    return 0.14 + (s / 30) * 0.14;
  }
  if (s <= 70) {
    return 0.26 + ((s - 31) / 39) * 0.22;
  }
  return 0.48 + ((s - 71) / 29) * 0.46;
}

/**
 * Cor em hexadecimal para expressões MapLibre / canvas.
 */
export function getRiskHex(score) {
  const { h, s, l } = getRiskHslComponents(score);
  const H = h / 360;
  const S = s / 100;
  const L = l / 100;
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const hue2rgb = (p1, q1, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p1 + (q1 - p1) * 6 * tt;
    if (tt < 1 / 2) return q1;
    if (tt < 2 / 3) return p1 + (q1 - p1) * (2 / 3 - tt) * 6;
    return p1;
  };
  const r = hue2rgb(p, q, H + 1 / 3);
  const g = hue2rgb(p, q, H);
  const b = hue2rgb(p, q, H - 1 / 3);
  const toHex = (x) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
