// engines/forensic/utils/fuzzy.js
// Utilitários de matching difuso pra cruzamento de nomes brasileiros.
//
// Brasil tem peculiaridades que quebram fuzzy matching ingênuo:
//   - Nomes com 4-5 palavras (Gabriel Henrique Ferreira da Silva Santos)
//   - Variações de casamento (Maria Silva → Maria Silva Pereira)
//   - Acentos inconsistentes (Vânia / Vania, José / Jose)
//   - Preposições "de", "da", "do", "dos", "das" (ignorar no matching)
//   - Abreviações ("J. Silva" → "Jose Silva")
//
// Estratégias implementadas:
//   1. Jaccard de tokens (set de palavras significativas)
//   2. Sobrenome match (último token relevante)
//   3. Iniciais + sobrenome (tolera abreviações)

const STOPWORDS_NOMES_PT_BR = new Set([
  'de', 'da', 'do', 'dos', 'das',
  'e', 'y',
  'jr', 'junior', 'júnior', 'filho', 'neto', 'sobrinho',
  'sr', 'sra', 'senhor', 'senhora',
]);

/**
 * Normaliza um nome para matching: NFD + lowercase + remove preposições + tokens.
 *
 * Exemplos:
 *   "José Maria da Silva Júnior"  → ["jose", "maria", "silva"]
 *   "MARIA APARECIDA DOS SANTOS"  → ["maria", "aparecida", "santos"]
 *   "J. M. Silva"                 → ["j", "m", "silva"]
 */
export function tokenizeName(name) {
  if (!name) return [];
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')      // pontuação → espaço
    .split(/\s+/)
    .filter(t => t.length > 0)
    .filter(t => !STOPWORDS_NOMES_PT_BR.has(t));
}

/**
 * Similaridade de Jaccard entre 2 conjuntos de tokens.
 * J(A,B) = |A ∩ B| / |A ∪ B|
 *
 * Retorna valor entre 0 e 1.
 */
export function jaccardSimilarity(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;

  const unionSize = setA.size + setB.size - intersection;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

/**
 * Similaridade ajustada para nomes brasileiros — combina Jaccard com peso de sobrenome.
 *
 * Ideia: Se o sobrenome (último token significativo) coincide, há base p/ parentesco.
 * Sobrenome match recebe peso 0.4; Jaccard de tokens recebe peso 0.6.
 *
 * Retorna { score, jaccard, surname_match, last_a, last_b, common_tokens }
 */
export function nameSimilarity(nameA, nameB) {
  const tokensA = tokenizeName(nameA);
  const tokensB = tokenizeName(nameB);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return { score: 0, jaccard: 0, surname_match: false, last_a: null, last_b: null, common_tokens: [] };
  }

  const jaccard = jaccardSimilarity(tokensA, tokensB);

  // Considera sobrenome o último token com 3+ caracteres (ignora iniciais "j", "m")
  const lastSubstantive = tokens => {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i].length >= 3) return tokens[i];
    }
    return tokens[tokens.length - 1] || null;
  };

  const lastA = lastSubstantive(tokensA);
  const lastB = lastSubstantive(tokensB);
  const surnameMatch = lastA && lastB && lastA === lastB;

  // Tokens em comum (para evidência humana legível)
  const setB = new Set(tokensB);
  const commonTokens = tokensA.filter(t => setB.has(t));

  // Score híbrido
  const score = surnameMatch
    ? Math.min(1.0, 0.4 + 0.6 * jaccard)
    : jaccard;

  return {
    score: Math.round(score * 1000) / 1000,
    jaccard: Math.round(jaccard * 1000) / 1000,
    surname_match: surnameMatch,
    last_a: lastA,
    last_b: lastB,
    common_tokens: commonTokens,
  };
}

/**
 * Verifica se há indício de parentesco entre 2 nomes.
 * Threshold padrão: 0.8 (conforme Plano Mestre v2.0 — protocolo SANGUE E PODER).
 */
export function isLikelyKin(nameA, nameB, threshold = 0.8) {
  const sim = nameSimilarity(nameA, nameB);
  return {
    is_kin: sim.score >= threshold,
    ...sim,
  };
}

/**
 * Cruzamento N×M: dado um nome de referência e uma lista de candidatos,
 * retorna os matches acima do threshold ordenados por score desc.
 */
export function findMatches(refName, candidates, options = {}) {
  const threshold = options.threshold ?? 0.8;
  const limit = options.limit ?? 50;

  const matches = [];
  for (const cand of candidates) {
    const candName = typeof cand === 'string' ? cand : cand.nome || cand.name;
    if (!candName) continue;
    const sim = nameSimilarity(refName, candName);
    if (sim.score >= threshold) {
      matches.push({ candidate: cand, ...sim });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}
