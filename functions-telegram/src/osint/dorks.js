/**
 * Placeholder: Custom Search Engine ainda não configurado (segredos GOOGLE_CSE_*).
 */
export async function googleDorks({ nome, cpf }) {
  const queries = [
    `"${nome}" "${cpf}" celular`,
    `"${nome}" telefone site:facebook.com`,
    `"${nome}" "whatsapp" site:linkedin.com`,
  ];
  return { celular: null, queries_planejadas: queries };
}
