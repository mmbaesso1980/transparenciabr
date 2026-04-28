import axios from "axios";
import http from "node:http";
import https from "node:https";
import { withRetry, isRetryableError } from "./retry.js";

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

/**
 * @param {string} urlStr
 * @param {{ method?: string, headers?: Record<string,string>, data?: unknown, timeout?: number, httpsAgent?: import('https').Agent, signal?: AbortSignal }} opts
 */
export async function requestHttp(urlStr, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  return withRetry(
    async () => {
      try {
        const res = await axios({
          url: urlStr,
          method,
          headers: opts.headers || {},
          data: opts.data,
          params: opts.params,
          timeout: opts.timeout ?? 30000,
          httpAgent,
          httpsAgent: opts.httpsAgent || httpsAgent,
          validateStatus: () => true,
          responseType: opts.responseType || "json",
          signal: opts.signal,
        });
        const status = res.status;
        if (status >= 200 && status < 300) return res;
        const err = new Error(`HTTP ${status}`);
        err.response = res;
        err.statusCode = status;
        throw err;
      } catch (e) {
        if (e.response) throw e;
        throw e;
      }
    },
    {
      maxAttempts: 6,
      onRetry: () => {},
    },
  ).catch((err) => {
    if (!isRetryableError(err)) throw err;
    throw err;
  });
}
