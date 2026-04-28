/**
 * @fileoverview Vitest tests for lib/data_contracts.js
 *
 * Tests use vi.mock to stub GCS so no real network calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BreakingChangeError } from '../lib/data_contracts.js';

// ─── Mock @google-cloud/storage ──────────────────────────────────────────────

/** In-memory schema store, set per test */
let mockSchemas = {};

vi.mock('@google-cloud/storage', () => {
  return {
    Storage: vi.fn().mockImplementation(() => ({
      bucket: vi.fn().mockReturnValue({
        file: vi.fn().mockImplementation((path) => ({
          download: vi.fn().mockImplementation(async () => {
            if (mockSchemas[path] === undefined) {
              const err = new Error(`No such object: ${path}`);
              err.code = 404;
              throw err;
            }
            return [Buffer.from(JSON.stringify(mockSchemas[path]), 'utf8')];
          }),
        })),
      }),
    })),
  };
});

// ─── Import AFTER mock is set up ─────────────────────────────────────────────

const { validateContract } = await import('../lib/data_contracts.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Register a JSON Schema in the mock GCS store.
 * @param {string} apiId
 * @param {string} version
 * @param {object} schema
 */
function registerSchema(apiId, version, schema) {
  mockSchemas[`contracts/${apiId}/v${version}.json`] = schema;
}

beforeEach(() => {
  process.env.ARSENAL_BUCKET = 'test-arsenal-bucket';
  mockSchemas = {};
});

afterEach(() => {
  delete process.env.ARSENAL_BUCKET;
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validateContract — valid record', () => {
  it('returns status=ok when record matches schema', async () => {
    registerSchema('api_empenhos', '1.0.0', {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        id: { type: 'string' },
        valor: { type: 'number' },
      },
      required: ['id', 'valor'],
    });

    const result = await validateContract(
      'api_empenhos',
      { id: 'E001', valor: 99.99 },
      { version: '1.0.0' },
    );

    expect(result.status).toBe('ok');
    expect(result.warnings).toHaveLength(0);
  });

  it('returns status=ok for a record with additional fields (additionalProperties allowed)', async () => {
    registerSchema('api_bolsas', '1.0.0', {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        beneficiario: { type: 'string' },
      },
      required: ['beneficiario'],
    });

    const result = await validateContract(
      'api_bolsas',
      { beneficiario: 'Maria', extra_field: 'extra' },
      { version: '1.0.0' },
    );

    expect(result.status).toBe('ok');
  });
});

describe('validateContract — breaking changes', () => {
  it('throws BreakingChangeError when a required field is missing', async () => {
    registerSchema('api_servidores', '1.0.0', {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        cpf_hash: { type: 'string' },
        nome: { type: 'string' },
      },
      required: ['cpf_hash', 'nome'],
    });

    await expect(
      validateContract(
        'api_servidores',
        { cpf_hash: 'abc123' }, // missing 'nome'
        { version: '1.0.0' },
      ),
    ).rejects.toThrow(BreakingChangeError);
  });

  it('throws BreakingChangeError on type violation (string where number expected)', async () => {
    registerSchema('api_pagamentos', '2.0.0', {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        valor: { type: 'number' },
      },
      required: ['valor'],
    });

    await expect(
      validateContract(
        'api_pagamentos',
        { valor: 'not-a-number' },
        { version: '2.0.0' },
      ),
    ).rejects.toThrow(BreakingChangeError);
  });

  it('BreakingChangeError carries apiId and violations', async () => {
    registerSchema('api_contratos', '1.0.0', {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['contrato_id'],
      properties: { contrato_id: { type: 'string' } },
    });

    let caught = null;
    try {
      await validateContract('api_contratos', {}, { version: '1.0.0' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BreakingChangeError);
    expect(caught.apiId).toBe('api_contratos');
    expect(caught.violations.length).toBeGreaterThan(0);
  });
});

describe('validateContract — non-breaking warnings', () => {
  it('returns status=warned for format violations (non-breaking)', async () => {
    registerSchema('api_transferencias', '1.0.0', {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        data: { type: 'string', format: 'date' },
        id: { type: 'string' },
      },
      required: ['id'],
    });

    const result = await validateContract(
      'api_transferencias',
      { id: 'T001', data: 'not-a-date' },
      { version: '1.0.0' },
    );

    // 'format' violations are non-breaking warnings
    expect(result.status).toBe('warned');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('validateContract — missing contract', () => {
  it("returns status='no_contract' when no schema is registered in GCS", async () => {
    // mockSchemas is empty — no schema for this api
    const result = await validateContract(
      'api_nonexistent_xyz',
      { foo: 'bar' },
      { version: '99.0.0' },
    );
    expect(result.status).toBe('no_contract');
    expect(result.warnings).toHaveLength(0);
  });
});

describe('validateContract — input validation', () => {
  it('throws TypeError when apiId is missing', async () => {
    await expect(
      validateContract('', { foo: 'bar' }, { version: '1.0.0' }),
    ).rejects.toThrow(TypeError);
  });

  it('throws TypeError when sampleRecord is not an object', async () => {
    await expect(
      validateContract('api_x', 'not-an-object', { version: '1.0.0' }),
    ).rejects.toThrow(TypeError);
  });
});
