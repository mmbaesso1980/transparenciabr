// Cores oficiais (ou amplamente reconhecidas) dos partidos brasileiros.
// Cada entrada pode ter `primary` e, opcionalmente, `secondary` para partidos bicolores.
// Fontes: bandeiras/identidade visual oficial dos partidos + uso na imprensa (TSE, G1, Folha).

const PARTY_COLORS = {
  // Esquerda
  PT: { primary: "#dc2626" }, // vermelho
  PSOL: { primary: "#dc2626", secondary: "#fbbf24" }, // vermelho + amarelo
  PCDOB: { primary: "#dc2626", secondary: "#fbbf24" }, // vermelho + amarelo
  "PC DO B": { primary: "#dc2626", secondary: "#fbbf24" },
  PCO: { primary: "#dc2626" },
  UP: { primary: "#dc2626", secondary: "#000000" }, // Unidade Popular — vermelho/preto

  // Centro-esquerda
  PSB: { primary: "#facc15", secondary: "#dc2626" }, // amarelo + vermelho (estrela)
  PDT: { primary: "#dc2626", secondary: "#ffffff" },
  REDE: { primary: "#16a34a", secondary: "#fbbf24" }, // verde + amarelo
  PV: { primary: "#16a34a" }, // verde

  // Centro
  MDB: { primary: "#1e40af" }, // azul royal
  PSDB: { primary: "#0ea5e9", secondary: "#fbbf24" }, // azul + amarelo (tucano)
  CIDADANIA: { primary: "#dc2626", secondary: "#0ea5e9" },
  SOLIDARIEDADE: { primary: "#f97316" }, // laranja
  SOLIDARIED: { primary: "#f97316" },
  SD: { primary: "#f97316" },
  AVANTE: { primary: "#fbbf24", secondary: "#16a34a" }, // amarelo + verde

  // Centro-direita / direita
  UNIAO: { primary: "#1e3a8a", secondary: "#fbbf24" }, // União Brasil — azul + amarelo
  "UNIÃO": { primary: "#1e3a8a", secondary: "#fbbf24" },
  "UNIAO BRASIL": { primary: "#1e3a8a", secondary: "#fbbf24" },
  "UNIÃO BRASIL": { primary: "#1e3a8a", secondary: "#fbbf24" },
  PP: { primary: "#1e40af", secondary: "#fbbf24" }, // Progressistas — azul + amarelo
  PROGRESSISTAS: { primary: "#1e40af", secondary: "#fbbf24" },
  REPUBLICANOS: { primary: "#1e40af", secondary: "#ffffff" }, // azul + branco
  REP: { primary: "#1e40af", secondary: "#ffffff" },
  PL: { primary: "#16a34a", secondary: "#fbbf24" }, // Liberal — verde + amarelo
  PSC: { primary: "#1e40af" },
  PODEMOS: { primary: "#f97316", secondary: "#1e40af" }, // laranja + azul
  POD: { primary: "#f97316", secondary: "#1e40af" },
  PRD: { primary: "#1e40af", secondary: "#ffffff" },
  PMB: { primary: "#16a34a", secondary: "#fbbf24" },

  // Direita / extrema-direita
  NOVO: { primary: "#f97316" }, // laranja
  PATRIOTA: { primary: "#16a34a", secondary: "#fbbf24" },
  AGIR: { primary: "#1e40af" },
  DC: { primary: "#0ea5e9" },
  PRTB: { primary: "#16a34a", secondary: "#fbbf24" },
  PMN: { primary: "#fbbf24", secondary: "#16a34a" },
  PSL: { primary: "#1e40af", secondary: "#fbbf24" },

  // Outros / sem identificação
  OUTROS: { primary: "#6b7280" }, // cinza neutro
  "S/PARTIDO": { primary: "#6b7280" },
  SEM_PARTIDO: { primary: "#6b7280" },
};

/** Normaliza sigla para chave do mapa (uppercase, trim, remove acentos). */
function normalizeSigla(sigla) {
  if (!sigla) return "OUTROS";
  return String(sigla)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Retorna `{ primary, secondary }` para uma sigla. `secondary` pode ser undefined.
 * @param {string} sigla
 * @returns {{ primary: string, secondary?: string }}
 */
export function getPartyColors(sigla) {
  const key = normalizeSigla(sigla);
  if (PARTY_COLORS[key]) return PARTY_COLORS[key];
  // Fallback: cinza neutro para qualquer sigla não mapeada.
  return { primary: "#6b7280" };
}

/** Retorna apenas a cor primária (string hex). */
export function getPartyPrimary(sigla) {
  return getPartyColors(sigla).primary;
}

/** Retorna apenas a cor secundária (string hex ou null). */
export function getPartySecondary(sigla) {
  return getPartyColors(sigla).secondary || null;
}

/* ------------------------------------------------------------------ */
/* Halo / nebulosa cósmica do partido — dessaturado.                  */
/* ------------------------------------------------------------------ */

function hexToRgb(hex) {
  const m = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: 107, g: 114, b: 128 };
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function rgbToHsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case R: h = ((G - B) / d + (G < B ? 6 : 0)); break;
      case G: h = ((B - R) / d + 2); break;
      default: h = ((R - G) / d + 4);
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  const H = ((h % 360) + 360) % 360 / 360;
  const S = Math.max(0, Math.min(1, s / 100));
  const L = Math.max(0, Math.min(1, l / 100));
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const conv = (t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const r = conv(H + 1 / 3);
  const g = conv(H);
  const b = conv(H - 1 / 3);
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Retorna a cor de halo/nebulosa do partido — versão dessaturada (saturação ~40%
 * da original) e levemente clareada para ficar como nuvem cósmica difusa.
 * A cor partidária original (saturada) continua sendo usada apenas em hover/highlight.
 * @param {string} sigla
 * @returns {string} hex
 */
export function partyHaloColor(sigla) {
  const { primary } = getPartyColors(sigla);
  const hsl = rgbToHsl(hexToRgb(primary));
  const desS = hsl.s * 0.42;          // dessatura ~58%
  const desL = Math.min(78, hsl.l + 12); // clareia
  return hslToHex(hsl.h, desS, desL);
}

export default PARTY_COLORS;
