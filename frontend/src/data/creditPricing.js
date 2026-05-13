/** Preços Aurora MATADOR (Inferno) — alinhar a `generateDossieOnDemand` (Functions). */
export const CREDIT_PRICE_DOSSIE_MATADOR = 800;
export const CREDIT_PRICE_CEAP_COMPLETO = 300;
export const CREDIT_PRICE_EMENDAS_COMPLETAS = 300;
export const CREDIT_ADDON_PDF_LAUDO = 150;
export const CREDIT_ADDON_COMPARACOES_AVANCADAS = 200;

export const ON_DEMAND_TIPOS = Object.freeze({
  dossie_matador: CREDIT_PRICE_DOSSIE_MATADOR,
  ceap_completo: CREDIT_PRICE_CEAP_COMPLETO,
  emendas_completas: CREDIT_PRICE_EMENDAS_COMPLETAS,
});

export const ON_DEMAND_ADDONS = Object.freeze({
  pdf_laudo: CREDIT_ADDON_PDF_LAUDO,
  comparacoes_avancadas: CREDIT_ADDON_COMPARACOES_AVANCADAS,
});
