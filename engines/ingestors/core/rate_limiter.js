import Bottleneck from "bottleneck";

const hostLimiters = new Map();

/**
 * @param {string} hostname
 * @param {{ rpm: number, concurrent: number }} cfg
 */
export function getLimiterForHost(hostname, cfg) {
  const key = `${hostname}:${cfg.rpm}:${cfg.concurrent}`;
  let b = hostLimiters.get(key);
  if (!b) {
    const minTime = Math.max(1, Math.floor(60000 / Math.max(1, cfg.rpm)));
    b = new Bottleneck({
      minTime,
      maxConcurrent: cfg.concurrent,
    });
    hostLimiters.set(key, b);
  }
  return b;
}
