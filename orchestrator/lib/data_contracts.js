/**
 * @fileoverview Data Contracts — JSON Schema Draft-2020-12 validation for ingested records.
 *
 * Each API in the catalog may have an associated contract (JSON Schema) stored in GCS:
 *   gs://${ARSENAL_BUCKET}/contracts/${apiId}/v${version}.json
 *
 * On validation, a breaking change (required field removed, type changed) throws
 * BreakingChangeError.  Non-breaking warnings are returned for caller inspection.
 *
 * Environment variables:
 *   ARSENAL_BUCKET – GCS bucket holding contracts and the API catalog
 */

import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { Storage } from '@google-cloud/storage';

// ─── Ajv instance ─────────────────────────────────────────────────────────────

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateFormats: true,
});
addFormats(ajv);

// ─── Logging ──────────────────────────────────────────────────────────────────

/**
 * @param {'DEBUG'|'INFO'|'WARNING'|'ERROR'} severity
 * @param {string} message
 * @param {Record<string,unknown>} [payload]
 */
function log(severity, message, payload = {}) {
  console.log(
    JSON.stringify({ severity, message, timestamp: new Date().toISOString(), ...payload }),
  );
}

// ─── Custom errors ────────────────────────────────────────────────────────────

/**
 * Thrown when a data record violates a *breaking* contract constraint,
 * e.g. a required field is missing or a type has changed.
 */
export class BreakingChangeError extends Error {
  /**
   * @param {string} apiId
   * @param {string} contractVersion
   * @param {import('ajv').ErrorObject[]} violations
   */
  constructor(apiId, contractVersion, violations) {
    const summary = violations.map((v) => `${v.instancePath} ${v.message}`).join('; ');
    super(`Breaking contract change for ${apiId}@v${contractVersion}: ${summary}`);
    this.name = 'BreakingChangeError';
    this.apiId = apiId;
    this.contractVersion = contractVersion;
    this.violations = violations;
  }
}

/**
 * Non-breaking contract warning returned alongside a passing validation.
 * @typedef {{ field:string, message:string, severity:'warning' }} ContractWarning
 */

/**
 * Result returned from validateContract.
 * @typedef {{ status:'ok'|'warned'|'no_contract', warnings: ContractWarning[] }} ValidationResult
 */

// ─── Contract cache ───────────────────────────────────────────────────────────

const storage = new Storage();
/** @type {Map<string, Record<string,unknown>>} */
const contractCache = new Map();

/**
 * Load a contract from GCS with in-memory caching.
 *
 * @param {string} apiId
 * @param {string} version  – semver string, e.g. "1.2.0"
 * @returns {Promise<Record<string,unknown>|null>} – parsed JSON Schema, or null if not found
 */
async function loadContractFromGcs(apiId, version) {
  const bucket = process.env.ARSENAL_BUCKET;
  if (!bucket) throw new Error('ARSENAL_BUCKET not set');

  const cacheKey = `${apiId}@${version}`;
  if (contractCache.has(cacheKey)) return contractCache.get(cacheKey);

  const path = `contracts/${apiId}/v${version}.json`;

  try {
    const [contents] = await storage.bucket(bucket).file(path).download();
    const schema = JSON.parse(contents.toString('utf8'));
    contractCache.set(cacheKey, schema);
    return schema;
  } catch (err) {
    if (err.code === 404 || err.message?.includes('No such object')) {
      log('WARNING', 'Contract not found in GCS', { api_id: apiId, version, path });
      return null;
    }
    throw err;
  }
}

// ─── Breaking change detection ────────────────────────────────────────────────

/**
 * Classify AJV errors into breaking vs non-breaking.
 *
 * Breaking changes:
 *   - `required` keyword failure (required field is absent)
 *   - `type` keyword failure (field type changed)
 *   - `enum` keyword failure (field value no longer in allowed set)
 *
 * @param {import('ajv').ErrorObject[]} errors
 * @returns {{ breaking: import('ajv').ErrorObject[], warnings: ContractWarning[] }}
 */
function classifyErrors(errors) {
  const breaking = [];
  const warnings = [];

  for (const err of errors) {
    const kw = err.keyword;
    if (kw === 'required' || kw === 'type' || kw === 'enum') {
      breaking.push(err);
    } else {
      warnings.push({
        field: err.instancePath || err.params?.missingProperty || '(root)',
        message: `${err.keyword}: ${err.message}`,
        severity: 'warning',
      });
    }
  }

  return { breaking, warnings };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Validate a sample record from an ingestion run against the API's registered contract.
 *
 * @param {string} apiId                – catalog api_id
 * @param {Record<string,unknown>} sampleRecord – one representative record from the batch
 * @param {{ version?:string }} [contractRegistry]
 *        – caller can provide a version override; otherwise the catalog's contract_version
 *          field is used, falling back to "1.0.0"
 * @returns {Promise<ValidationResult>}
 * @throws {BreakingChangeError} on breaking schema violations
 * @throws {Error} on GCS or parse failures
 */
export async function validateContract(
  apiId,
  sampleRecord,
  contractRegistry = {},
) {
  if (!apiId) throw new TypeError('validateContract: apiId is required');
  if (!sampleRecord || typeof sampleRecord !== 'object') {
    throw new TypeError('validateContract: sampleRecord must be an object');
  }

  const version = contractRegistry?.version ?? sampleRecord?._contract_version ?? '1.0.0';

  let schema;
  try {
    schema = await loadContractFromGcs(apiId, version);
  } catch (err) {
    log('ERROR', 'Failed to load contract from GCS', {
      api_id: apiId,
      version,
      error: err.message,
    });
    throw err;
  }

  // No contract on file — pass-through with 'no_contract' status
  if (!schema) {
    log('INFO', 'No contract found — skipping validation', {
      api_id: apiId,
      version,
    });
    return { status: 'no_contract', warnings: [] };
  }

  // Compile and validate
  let validate;
  const schemaId = `${apiId}@${version}`;
  try {
    validate = ajv.getSchema(schemaId) ?? ajv.compile({ ...schema, $id: schemaId });
  } catch (compileErr) {
    log('ERROR', 'Failed to compile JSON Schema', {
      api_id: apiId,
      version,
      error: compileErr.message,
    });
    throw compileErr;
  }

  const valid = validate(sampleRecord);

  if (valid) {
    log('DEBUG', 'Contract validation passed', { api_id: apiId, version });
    return { status: 'ok', warnings: [] };
  }

  const { breaking, warnings } = classifyErrors(validate.errors ?? []);

  if (breaking.length > 0) {
    log('ERROR', 'Breaking contract violation detected', {
      api_id: apiId,
      version,
      violations: breaking.map((e) => ({ path: e.instancePath, msg: e.message })),
    });
    throw new BreakingChangeError(apiId, version, breaking);
  }

  // Non-breaking warnings only
  if (warnings.length > 0) {
    log('WARNING', 'Non-breaking contract warnings', {
      api_id: apiId,
      version,
      warnings: warnings.map((w) => w.message),
    });
    return { status: 'warned', warnings };
  }

  return { status: 'ok', warnings: [] };
}
