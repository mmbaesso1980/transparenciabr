/**
 * @fileoverview Vitest tests for the bin-packing partition algorithm.
 *
 * Tests cover: empty list, balanced output, std-dev constraint, single API,
 * large catalog (117 entries), priority filtering, and determinism.
 */

import { describe, it, expect } from 'vitest';
import {
  filterByPriority,
  partitionIntoBins,
  relativeStdDev,
} from '../functions/orchestrator_trigger/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fake catalog entry */
function makeApi(id, priority = 'imediata', cost_weight = 1.0) {
  return { id, priority, cost_weight };
}

/** Generate N apis with deterministic ids and weights */
function makeCatalog(n, weightFn = (i) => 1.0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `api_${String(i + 1).padStart(3, '0')}`,
    priority: 'imediata',
    cost_weight: weightFn(i),
  }));
}

const NUM_BINS = 12;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('partitionIntoBins', () => {
  it('returns NUM_BINS empty bins when given an empty list', () => {
    const bins = partitionIntoBins([], NUM_BINS);
    expect(bins).toHaveLength(NUM_BINS);
    bins.forEach((bin) => {
      expect(bin.apis).toHaveLength(0);
      expect(bin.total_cost).toBe(0);
    });
  });

  it('assigns a single API to exactly one bin, others remain empty', () => {
    const apis = [makeApi('only', 'imediata', 5.0)];
    const bins = partitionIntoBins(apis, NUM_BINS);
    const nonEmpty = bins.filter((b) => b.apis.length > 0);
    expect(nonEmpty).toHaveLength(1);
    expect(nonEmpty[0].apis[0].id).toBe('only');
    expect(nonEmpty[0].total_cost).toBe(5.0);
  });

  it('every api appears exactly once across all bins', () => {
    const apis = makeCatalog(60);
    const bins = partitionIntoBins(apis, NUM_BINS);
    const allIds = bins.flatMap((b) => b.apis.map((a) => a.id));
    expect(allIds).toHaveLength(60);
    expect(new Set(allIds).size).toBe(60);
  });

  it('total_cost of each bin matches the sum of its api cost_weights', () => {
    const apis = makeCatalog(48, (i) => (i % 5) + 1);
    const bins = partitionIntoBins(apis, NUM_BINS);
    for (const bin of bins) {
      const summed = bin.apis.reduce((s, a) => s + a.cost_weight, 0);
      expect(bin.total_cost).toBeCloseTo(summed, 8);
    }
  });

  it('relative std dev is < 15% for 12 equally-weighted APIs', () => {
    const apis = makeCatalog(12);
    const bins = partitionIntoBins(apis, NUM_BINS);
    const costs = bins.map((b) => b.total_cost);
    const cv = relativeStdDev(costs);
    expect(cv).toBeLessThan(0.15);
  });

  it('relative std dev is < 15% for a realistic mixed-weight catalog (48 apis)', () => {
    // Weights: 1, 2, 3, 4, 5, cycling
    const apis = makeCatalog(48, (i) => ((i % 5) + 1));
    const bins = partitionIntoBins(apis, NUM_BINS);
    const costs = bins.map((b) => b.total_cost);
    const cv = relativeStdDev(costs);
    // Log for debugging if ever flapping
    if (cv >= 0.15) {
      console.warn('CV exceeded threshold:', cv, costs);
    }
    expect(cv).toBeLessThan(0.15);
  });

  it('handles a large catalog of 117 entries within 15% std dev', () => {
    // Deterministic weights: prime-ish pattern
    const apis = makeCatalog(117, (i) => {
      const w = [1, 1.5, 2, 3, 5, 8, 2.5, 4, 1, 1, 2, 3];
      return w[i % w.length];
    });
    const bins = partitionIntoBins(apis, NUM_BINS);
    const costs = bins.map((b) => b.total_cost);
    const cv = relativeStdDev(costs);
    expect(cv).toBeLessThan(0.15);

    // Also verify total count is correct
    const total = bins.reduce((s, b) => s + b.apis.length, 0);
    expect(total).toBe(117);
  });

  it('is stable — same input produces same output', () => {
    const apis = makeCatalog(36, (i) => (i % 4) + 1);
    const bins1 = partitionIntoBins([...apis], NUM_BINS);
    const bins2 = partitionIntoBins([...apis], NUM_BINS);
    // Compare total_cost per bin
    for (let i = 0; i < NUM_BINS; i++) {
      expect(bins1[i].total_cost).toBeCloseTo(bins2[i].total_cost, 8);
      expect(bins1[i].apis.length).toBe(bins2[i].apis.length);
    }
  });

  it('handles cost_weight of 0 without division by zero', () => {
    const apis = [
      makeApi('zero1', 'imediata', 0),
      makeApi('zero2', 'imediata', 0),
    ];
    const bins = partitionIntoBins(apis, NUM_BINS);
    const total = bins.reduce((s, b) => s + b.apis.length, 0);
    expect(total).toBe(2);
  });
});

describe('filterByPriority', () => {
  const catalog = [
    makeApi('a1', 'imediata', 1.0),
    makeApi('a2', 'sprint_2', 2.0),
    makeApi('a3', 'deferred', 3.0),
    makeApi('a4', 'futuro', 4.0),
    makeApi('a5', 'imediata', 1.5),
  ];

  it('priority=imediata selects only imediata entries', () => {
    const result = filterByPriority(catalog, 'imediata');
    expect(result.map((a) => a.id)).toEqual(['a1', 'a5']);
  });

  it('priority=sprint_2 selects only sprint_2 entries', () => {
    const result = filterByPriority(catalog, 'sprint_2');
    expect(result.map((a) => a.id)).toEqual(['a2']);
  });

  it('priority=all includes imediata and sprint_2 but excludes deferred and futuro', () => {
    const result = filterByPriority(catalog, 'all');
    const ids = result.map((a) => a.id);
    expect(ids).toContain('a1');
    expect(ids).toContain('a2');
    expect(ids).toContain('a5');
    expect(ids).not.toContain('a3');
    expect(ids).not.toContain('a4');
  });

  it('defaults cost_weight to 1.0 when missing from catalog entry', () => {
    const noCostCatalog = [
      { id: 'nocost', priority: 'imediata' }, // no cost_weight
    ];
    const result = filterByPriority(noCostCatalog, 'imediata');
    expect(result[0].cost_weight).toBe(1.0);
  });
});

describe('relativeStdDev', () => {
  it('returns 0 for an empty array', () => {
    expect(relativeStdDev([])).toBe(0);
  });

  it('returns 0 when all values are identical', () => {
    expect(relativeStdDev([5, 5, 5, 5])).toBe(0);
  });

  it('returns 0 when mean is 0 (all zeros)', () => {
    expect(relativeStdDev([0, 0, 0])).toBe(0);
  });

  it('correctly computes CV for known distribution', () => {
    // [1, 2, 3] → mean=2, σ²=2/3, σ=0.8165, CV=0.4082
    const cv = relativeStdDev([1, 2, 3]);
    expect(cv).toBeCloseTo(0.4082, 3);
  });
});
