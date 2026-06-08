/**
 * Formatadores numéricos pt-BR reutilizáveis.
 *
 * Centraliza as variantes de `fmtBRL`, `fmtBRLcompact`, `fmtBRLM`, `fmt` e
 * `fmtNum` que estavam duplicadas em dezenas de páginas/componentes.
 */

/** Número inteiro formatado pt-BR (ex.: 1.234.567). Retorna "—" se nulo. */
export const fmt = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR") : "—";

/** Alias de `fmt` — mesma lógica, nome alternativo usado em alguns módulos. */
export const fmtNum = (v) =>
  Number.isFinite(Number(v)) ? Number(v).toLocaleString("pt-BR") : "—";

/**
 * Valor em BRL completo via `Intl.NumberFormat` (ex.: R$ 1.234.567).
 * Retorna "—" se o valor não for finito.
 */
export const fmtBRL = (v) =>
  Number.isFinite(Number(v))
    ? Number(v).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      })
    : "—";

/**
 * Valor em BRL compacto — "bi", "mi", "k" (ex.: R$ 1,2 mi).
 * Retorna "—" se o valor for nulo/indefinido.
 */
export const fmtBRLcompact = (v) => {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1)} bi`;
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)} mi`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)} k`;
  return fmtBRL(n);
};

/** Valor em BRL abreviado em milhões (ex.: R$ 12,3M). Retorna "—" se nulo. */
export const fmtBRLM = (v) =>
  v != null ? `R$ ${(Number(v) / 1e6).toFixed(1)}M` : "—";

/** Valor em BRL abreviado em bilhões (ex.: R$ 1,23B). Retorna "—" se nulo. */
export const fmtBRLB = (v) =>
  v != null ? `R$ ${(Number(v) / 1e9).toFixed(2)}B` : "—";
