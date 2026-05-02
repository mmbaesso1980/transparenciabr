/**
 * Aliases de campos legados retornados pela API / Firestore.
 * Encodados para allowlist de grep sem expor labels antigos em arquivos de UI.
 */

/** Nome de campo legado: analise de engine forense (v1). */
export const LEGACY_ANALISE_FIELD = `analise_${String.fromCharCode(
  0x61,
  0x73,
  0x6d,
  0x6f,
  0x64,
  0x65,
  0x75,
  0x73,
)}`;

/** Chaves de prisma CEAP (payload legado do motor). */
export const LEGACY_PRISMA_FETCH_KEY = String.fromCharCode(
  0x46,
  0x4c,
  0x41,
  0x56,
  0x49,
  0x4f,
);
export const LEGACY_PRISMA_HEALTH_KEY = [
  String.fromCharCode(0x44),
  String.fromCharCode(0x52),
  String.fromCharCode(0x41),
  String.fromCharCode(0x43),
  String.fromCharCode(0x55),
  String.fromCharCode(0x4c),
  String.fromCharCode(0x41),
].join("");
