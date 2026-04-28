/**
 * @fileoverview Vitest tests for lib/lgpd_shield.js
 *
 * Tests cover: hashCpf correctness, determinism, salt sensitivity,
 * redactRecord (flat, nested, arrays), loadSalt env fallback, edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  hashCpf,
  redactRecord,
  loadSalt,
  _clearSaltCache,
} from '../lib/lgpd_shield.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SALT_A = 'salt-alpha-test';
const SALT_B = 'salt-beta-test';
const RAW_CPF = '123.456.789-09';
const NORM_CPF = '12345678909';

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// ─── hashCpf ─────────────────────────────────────────────────────────────────

describe('hashCpf', () => {
  it('returns a 64-character hex string', () => {
    const result = hashCpf(RAW_CPF, SALT_A);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same CPF + salt always produces same hash', () => {
    expect(hashCpf(RAW_CPF, SALT_A)).toBe(hashCpf(RAW_CPF, SALT_A));
  });

  it('normalises formatted CPF to same hash as raw digits', () => {
    const formatted = hashCpf('123.456.789-09', SALT_A);
    const raw = hashCpf('12345678909', SALT_A);
    expect(formatted).toBe(raw);
  });

  it('produces different hash with different salt', () => {
    expect(hashCpf(RAW_CPF, SALT_A)).not.toBe(hashCpf(RAW_CPF, SALT_B));
  });

  it('produces different hash for different CPFs (same salt)', () => {
    expect(hashCpf('111.111.111-11', SALT_A)).not.toBe(hashCpf('222.222.222-22', SALT_A));
  });

  it('matches manual SHA-256 computation: sha256(salt:normalised)', () => {
    const expected = sha256(`${SALT_A}:${NORM_CPF}`);
    expect(hashCpf(RAW_CPF, SALT_A)).toBe(expected);
  });

  it('throws TypeError when cpf is not a string', () => {
    expect(() => hashCpf(12345678909, SALT_A)).toThrow(TypeError);
  });

  it('throws TypeError when salt is empty string', () => {
    expect(() => hashCpf(RAW_CPF, '')).toThrow(TypeError);
  });
});

// ─── redactRecord ────────────────────────────────────────────────────────────

describe('redactRecord', () => {
  it('hashes a top-level cpf field', () => {
    const record = { cpf: RAW_CPF, name: 'João' };
    const result = redactRecord(record, SALT_A);
    expect(result.cpf).toBe(hashCpf(RAW_CPF, SALT_A));
    expect(result.name).toBe('João');
  });

  it('hashes nu_cpf and num_cpf fields', () => {
    const record = { nu_cpf: RAW_CPF, num_cpf: '111.111.111-11' };
    const result = redactRecord(record, SALT_A);
    expect(result.nu_cpf).toBe(hashCpf(RAW_CPF, SALT_A));
    expect(result.num_cpf).toBe(hashCpf('111.111.111-11', SALT_A));
  });

  it('hashes cnpj_responsavel field', () => {
    const record = { cnpj_responsavel: '99999999999' };
    const result = redactRecord(record, SALT_A);
    expect(result.cnpj_responsavel).toBe(hashCpf('99999999999', SALT_A));
  });

  it('does not mutate the original record', () => {
    const record = { cpf: RAW_CPF, amount: 100 };
    const original = { ...record };
    redactRecord(record, SALT_A);
    expect(record).toEqual(original);
  });

  it('recursively redacts nested objects', () => {
    const record = {
      person: {
        cpf: RAW_CPF,
        address: { city: 'Brasília' },
      },
    };
    const result = redactRecord(record, SALT_A);
    expect(result.person.cpf).toBe(hashCpf(RAW_CPF, SALT_A));
    expect(result.person.address.city).toBe('Brasília');
  });

  it('recursively redacts CPFs inside arrays of objects', () => {
    const records = [
      { cpf: '111.111.111-11', value: 1 },
      { cpf: '222.222.222-22', value: 2 },
    ];
    const result = redactRecord(records, SALT_A);
    expect(result[0].cpf).toBe(hashCpf('111.111.111-11', SALT_A));
    expect(result[1].cpf).toBe(hashCpf('222.222.222-22', SALT_A));
    expect(result[0].value).toBe(1);
  });

  it('leaves non-PII string fields unchanged', () => {
    const record = { name: 'Maria', cpf: RAW_CPF };
    const result = redactRecord(record, SALT_A);
    expect(result.name).toBe('Maria');
  });

  it('leaves null and undefined values unchanged', () => {
    expect(redactRecord(null, SALT_A)).toBeNull();
    expect(redactRecord(undefined, SALT_A)).toBeUndefined();
  });

  it('produces different hashes with different salts (anti-collusion)', () => {
    const record = { cpf: RAW_CPF };
    const r1 = redactRecord(record, SALT_A);
    const r2 = redactRecord(record, SALT_B);
    expect(r1.cpf).not.toBe(r2.cpf);
  });

  it('skips hashing an empty cpf string (preserves empty value)', () => {
    const record = { cpf: '' };
    const result = redactRecord(record, SALT_A);
    // Empty strings are not hashed (guard: value.length > 0)
    expect(result.cpf).toBe('');
  });
});

// ─── loadSalt ────────────────────────────────────────────────────────────────

describe('loadSalt', () => {
  beforeEach(() => {
    _clearSaltCache();
  });

  afterEach(() => {
    delete process.env.LGPD_SALT;
    delete process.env.LGPD_SALT_SECRET_NAME;
    _clearSaltCache();
  });

  it('returns salt from LGPD_SALT env var', async () => {
    process.env.LGPD_SALT = 'test-salt-from-env';
    const salt = await loadSalt();
    expect(salt).toBe('test-salt-from-env');
  });

  it('returns cached value on second call (no re-read)', async () => {
    process.env.LGPD_SALT = 'cached-salt';
    const s1 = await loadSalt();
    process.env.LGPD_SALT = 'different-value'; // change env after first call
    const s2 = await loadSalt();
    expect(s1).toBe(s2); // should still be cached
  });

  it('throws when neither LGPD_SALT nor LGPD_SALT_SECRET_NAME is set', async () => {
    // Both cleared by afterEach; ensure nothing set in env
    delete process.env.LGPD_SALT;
    delete process.env.LGPD_SALT_SECRET_NAME;
    await expect(loadSalt()).rejects.toThrow(/LGPD salt not available/);
  });
});
