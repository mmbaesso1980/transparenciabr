/**
 * @fileoverview LGPD Shield — LGPD-compliant PII hashing utilities.
 *
 * All CPF and related personal identifiers must be SHA-256 hashed with a
 * project-specific salt before any write to GCS or BigQuery.
 *
 * This module is pure JS — zero IO except the optional Secret Manager call
 * inside loadSalt().  It is intentionally free of GCS or BigQuery imports
 * so it can be used synchronously in both the orchestrator and engine layers.
 *
 * Usage:
 *   import { hashCpf, redactRecord, loadSalt } from '../lib/lgpd_shield.js';
 *   const salt = await loadSalt();
 *   const safeRecord = redactRecord(record, salt);
 */

import crypto from 'crypto';

// ─── Fields that must always be hashed ───────────────────────────────────────

/**
 * Default set of field names that contain CPF / personal identifiers.
 * Names are matched case-insensitively.
 */
const DEFAULT_FIELDS_TO_HASH = new Set([
  'cpf',
  'cnpj_responsavel',
  'num_cpf',
  'nu_cpf',
  'cpf_cnpj',
  'nr_cpf',
  'cpf_servidor',
]);

// ─── Core hashing ─────────────────────────────────────────────────────────────

/**
 * Hash a CPF (or any string) with SHA-256 + a HMAC-style salt prefix.
 *
 * The salt is prepended with a separator to prevent length-extension issues.
 *
 * @param {string} cpf   – raw CPF string (digits or formatted "NNN.NNN.NNN-DD")
 * @param {string} salt  – secret salt loaded from Secret Manager
 * @returns {string}     – hex-encoded SHA-256 digest (64 chars)
 *
 * @example
 * hashCpf('123.456.789-09', 'mysecret')
 * // => '3f4b2...' (64 hex chars)
 */
export function hashCpf(cpf, salt) {
  if (typeof cpf !== 'string') {
    throw new TypeError(`hashCpf: expected string, got ${typeof cpf}`);
  }
  if (typeof salt !== 'string' || salt.length === 0) {
    throw new TypeError('hashCpf: salt must be a non-empty string');
  }

  // Normalise: remove formatting characters so 123.456.789-09 === 12345678909
  const normalised = cpf.replace(/\D/g, '');

  const hash = crypto
    .createHash('sha256')
    .update(`${salt}:${normalised}`)
    .digest('hex');

  return hash;
}

// ─── Deep-walk record redaction ───────────────────────────────────────────────

/**
 * Recursively walk an object/array, replacing values of fields whose names
 * appear in `fieldsToHash` with their SHA-256 hash.
 *
 * The original object is NOT mutated — a new deep-clone is returned.
 *
 * @param {unknown} record         – any JSON-serialisable value
 * @param {string} salt            – LGPD salt
 * @param {Set<string>} [fieldsToHash] – set of field names to hash (case-insensitive)
 * @returns {unknown}              – redacted deep copy
 */
export function redactRecord(
  record,
  salt,
  fieldsToHash = DEFAULT_FIELDS_TO_HASH,
) {
  if (record === null || record === undefined) return record;

  if (Array.isArray(record)) {
    return record.map((item) => redactRecord(item, salt, fieldsToHash));
  }

  if (typeof record === 'object') {
    /** @type {Record<string,unknown>} */
    const out = {};
    for (const [key, value] of Object.entries(record)) {
      const lowerKey = key.toLowerCase();
      if (fieldsToHash.has(lowerKey) && typeof value === 'string' && value.length > 0) {
        out[key] = hashCpf(value, salt);
      } else {
        out[key] = redactRecord(value, salt, fieldsToHash);
      }
    }
    return out;
  }

  // Primitives (string, number, boolean) — return as-is unless handled above
  return record;
}

// ─── Salt loader ──────────────────────────────────────────────────────────────

/** @type {string|null} Cached salt value */
let _cachedSalt = null;

/**
 * Load the LGPD salt.
 *
 * Resolution order:
 *   1. Cached value (subsequent calls)
 *   2. Secret Manager (env LGPD_SALT_SECRET_NAME must be set in production)
 *   3. env LGPD_SALT (fallback for tests / local dev)
 *
 * @returns {Promise<string>}
 * @throws {Error} if no salt source is available
 */
export async function loadSalt() {
  if (_cachedSalt) return _cachedSalt;

  // Test / dev shortcut
  if (process.env.LGPD_SALT) {
    _cachedSalt = process.env.LGPD_SALT;
    return _cachedSalt;
  }

  const secretName = process.env.LGPD_SALT_SECRET_NAME;
  if (!secretName) {
    throw new Error(
      'LGPD salt not available: set LGPD_SALT_SECRET_NAME (production) or LGPD_SALT (dev/test)',
    );
  }

  // Lazy import to keep module lightweight when using the env-var shortcut
  const { SecretManagerServiceClient } = await import(
    '@google-cloud/secret-manager'
  );

  const client = new SecretManagerServiceClient();
  const [accessResponse] = await client.accessSecretVersion({
    name: secretName.includes('/versions/')
      ? secretName
      : `${secretName}/versions/latest`,
  });

  const salt = accessResponse.payload?.data?.toString('utf8');
  if (!salt) {
    throw new Error(`Secret ${secretName} returned empty payload`);
  }

  _cachedSalt = salt;
  return _cachedSalt;
}

/**
 * Clear the cached salt.  Intended for tests only.
 * @internal
 */
export function _clearSaltCache() {
  _cachedSalt = null;
}
