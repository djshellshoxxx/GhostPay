import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DestLedger } from '../../ledger.js';
import { A1, A2 } from '../../fixtures.testutil.js';
import { classifyHistoryCoverage, type LocalHistorySnapshot } from './historyCoverage.js';

const selectedChain = 11155111;
const scope = { chainId: `eip155:${selectedChain}`, profileRef: 'fixture-merchant-a', revision: 'snapshot-1' };
const complete: LocalHistorySnapshot = { scope, coverage: 'complete', provenance: 'local', observationCount: 0 };

describe('P08-A04 local history coverage', () => {
  it('distinguishes missing history from a complete empty local snapshot', () => {
    const ledger = new DestLedger();
    ledger.record(84532, A1, A2);
    const selectedRows = ledger.toJSON().filter(row => row.chainId === selectedChain);
    expect(selectedRows).toEqual([]);
    expect(classifyHistoryCoverage(scope)).toBe('unknown');
    expect(classifyHistoryCoverage(scope, null)).toBe('unknown');
    expect(classifyHistoryCoverage(scope, { ...complete, observationCount: selectedRows.length })).toBe('complete-empty');
  });

  it('counts only rows from the requested chain in this profile and revision', () => {
    const ledger = new DestLedger();
    ledger.record(84532, A1, A2);
    ledger.record(selectedChain, A1, A2);
    const selectedRows = ledger.toJSON().filter(row => row.chainId === selectedChain);
    expect(selectedRows).toHaveLength(1);
    expect(classifyHistoryCoverage(scope, { ...complete, observationCount: selectedRows.length })).toBe('complete-nonempty');
  });

  it('treats an unscoped report as unknown', () => {
    expect(classifyHistoryCoverage(scope, { coverage: 'complete', provenance: 'local', observationCount: 0 })).toBe('unknown');
  });

  it.each([0, 1])('treats partial or imported snapshots as unknown with %i observations', observationCount => {
    expect(classifyHistoryCoverage(scope, { ...complete, coverage: 'partial', observationCount })).toBe('unknown');
    expect(classifyHistoryCoverage(scope, { ...complete, provenance: 'imported', observationCount })).toBe('unknown');
  });

  it.each(['chainId', 'profileRef', 'revision'] as const)('requires an exact, usable %s', key => {
    expect(classifyHistoryCoverage(scope, { ...complete, scope: { ...scope, [key]: scope[key] + '-other' } })).toBe('unknown');
    for (const value of ['', ' ', ' padded ']) {
      const invalid = { ...scope, [key]: value };
      expect(classifyHistoryCoverage(invalid, { ...complete, scope: invalid })).toBe('unknown');
    }
  });

  it.each([NaN, Infinity, -1, 0.5, 10001])('returns unknown for an invalid observation count %s', observationCount => {
    expect(classifyHistoryCoverage(scope, { ...complete, observationCount })).toBe('unknown');
  });

  it('classifies bounded counts and rejects stale revisions across generated snapshots', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 10000 }), fc.integer({ min: 1, max: 5000 }), (count, revision) => {
      const current = { ...scope, revision: String(revision) };
      const snapshot = { ...complete, scope: current, observationCount: count };
      expect(classifyHistoryCoverage(current, snapshot)).toBe(count === 0 ? 'complete-empty' : 'complete-nonempty');
      expect(classifyHistoryCoverage({ ...current, revision: String(revision + 1) }, snapshot)).toBe('unknown');
    }), { seed: 20261124, numRuns: 256 });
    expect(classifyHistoryCoverage(scope, { ...complete, observationCount: 10000 })).toBe('complete-nonempty');
  });
});
