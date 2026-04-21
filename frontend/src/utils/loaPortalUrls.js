/**
 * Mapeamento de consulta a orçamento / LOA (exercícios 2015–2026) no ecossistema
 * Portal da Transparência e conjuntos de dados abertos.
 * Ajuste as URLs se o plano mestre do projeto apontar para novos endpoints.
 */
const ANO_MIN = 2015;
const ANO_MAX = 2026;

function yearInRange(ano) {
  const n = Number(ano);
  return Number.isFinite(n) && n >= ANO_MIN && n <= ANO_MAX;
}

/**
 * Página de download de microdados (orçamento) no Portal da Transparência.
 * O parâmetro exato pode variar; trate como ponto de partida operacional.
 */
export function loaDownloadPortalUrl(ano) {
  if (!yearInRange(ano)) return null;
  return `https://portaldatransparencia.gov.br/paginas/download.aspx?ano=${ano}`;
}

/**
 * API pública de emendas (exercício) — histórico de emenda LOA/LOA+.
 */
export function emendasParlamentaresApiUrl(ano) {
  if (!yearInRange(ano)) return null;
  return `https://api.portaldatransparencia.gov.br/api-de-dados/emendas-parlamentares?ano=${ano}`;
}

/**
 * Lista { ano, label, loa, emendas } para UI.
 */
export function listarExerciciosLoa() {
  const out = [];
  for (let a = ANO_MIN; a <= ANO_MAX; a += 1) {
    out.push({
      ano: a,
      label: `Exercício ${a}`,
      loa: loaDownloadPortalUrl(a),
      emendas: emendasParlamentaresApiUrl(a),
    });
  }
  return out;
}

export { ANO_MAX, ANO_MIN };
