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

export default PARTY_COLORS;
