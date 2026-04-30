// engines/utils/logger.js
// Logger estruturado simples (JSONL) — fácil de grep e processar depois

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
const CURRENT_LEVEL = LEVELS[(process.env.LOG_LEVEL || 'INFO').toUpperCase()] || LEVELS.INFO;

function log(level, msg, extra = {}) {
  if (LEVELS[level] < CURRENT_LEVEL) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...extra,
  };
  // Use stdout for INFO/DEBUG, stderr for WARN/ERROR
  const stream = LEVELS[level] >= LEVELS.WARN ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug: (msg, extra) => log('DEBUG', msg, extra),
  info: (msg, extra) => log('INFO', msg, extra),
  warn: (msg, extra) => log('WARN', msg, extra),
  error: (msg, extra) => log('ERROR', msg, extra),
};
