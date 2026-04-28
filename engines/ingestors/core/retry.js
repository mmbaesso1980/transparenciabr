/**
 * Full jitter exponential backoff (AWS pattern).
 */

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED", "ENOTFOUND"]);

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function parseRetryAfter(header) {
  if (!header) return null;
  const n = Number(header);
  if (!Number.isNaN(n)) return n * 1000;
  const d = Date.parse(header);
  if (!Number.isNaN(d)) return Math.max(0, d - Date.now());
  return null;
}

export function isRetryableError(err) {
  const code = err?.code || err?.cause?.code;
  if (code && RETRYABLE_CODES.has(String(code))) return true;
  const status = err?.response?.status ?? err?.statusCode;
  if (status && RETRYABLE_STATUS.has(Number(status))) return true;
  return false;
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number, baseMs?: number, maxMs?: number, onRetry?: (n: number, err: Error) => void }} opts
 */
export async function withRetry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 6;
  const baseMs = opts.baseMs ?? 1000;
  const maxMs = opts.maxMs ?? 60000;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts - 1 || !isRetryableError(err)) break;
      const retryAfter = parseRetryAfter(err?.response?.headers?.["retry-after"]);
      const cap = Math.min(baseMs * 2 ** attempt, maxMs);
      const delay = retryAfter != null ? retryAfter : randomBetween(0, cap);
      opts.onRetry?.(attempt + 1, err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
