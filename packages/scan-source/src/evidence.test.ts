import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { describeScanEvidence, type ScanEvidence } from './evidence.js';
import type { Integrity, PublicLogSource } from './types.js';

type Kind = PublicLogSource['kind'];
const KINDS: readonly Kind[] = ['range', 'indexer', 'pir2', 'light', 'quorum'];
const INTEGRITIES: readonly Integrity[] = ['unverified', 'quorum', 'proof'];
const U = 'unverified' as const;

describe('describeScanEvidence table', () => {
  const table: [Kind, Integrity, ScanEvidence][] = [
    ['range', 'unverified', { blockIdentity: U, recordInclusion: U, intervalCompleteness: U }],
    ['indexer', 'unverified', { blockIdentity: 'cross-checked', recordInclusion: U, intervalCompleteness: U }],
    ['pir2', 'unverified', { blockIdentity: U, recordInclusion: U, intervalCompleteness: U }],
    ['light', 'unverified', { blockIdentity: 'verified', recordInclusion: U, intervalCompleteness: U }],
    ['light', 'proof', { blockIdentity: 'verified', recordInclusion: 'verified', intervalCompleteness: U }],
    ['quorum', 'quorum', { blockIdentity: 'cross-checked', recordInclusion: U, intervalCompleteness: U }],
  ];
  it.each(table)('%s/%s', (kind, integrity, want) => {
    expect(describeScanEvidence({ kind, integrity })).toStrictEqual(want);
  });
  it('light proof with a client that does not verify logs does not claim inclusion', () => {
    expect(describeScanEvidence({ kind: 'light', integrity: 'proof' }, { lightClient: { verifiesLogs: false } })).toStrictEqual({
      blockIdentity: 'verified',
      recordInclusion: U,
      intervalCompleteness: U,
    });
  });
  it('light proof with a client that verifies logs: inclusion verified, completeness still not', () => {
    expect(describeScanEvidence({ kind: 'light', integrity: 'proof' }, { lightClient: { verifiesLogs: true } })).toStrictEqual({
      blockIdentity: 'verified',
      recordInclusion: 'verified',
      intervalCompleteness: U,
    });
  });
  it('verifiesLogs alone does not upgrade a light source whose integrity is unverified', () => {
    expect(describeScanEvidence({ kind: 'light', integrity: 'unverified' }, { lightClient: { verifiesLogs: true } }).recordInclusion).toBe(U);
  });
});

describe('describeScanEvidence invariants', () => {
  const arbKind = fc.constantFrom(...KINDS);
  const arbIntegrity = fc.constantFrom(...INTEGRITIES);
  const arbLc = fc.option(fc.record({ verifiesLogs: fc.boolean() }), { nil: undefined });

  it('intervalCompleteness is never verified for any kind/integrity/light-client combination (exhaustive)', () => {
    for (const kind of KINDS) {
      for (const integrity of INTEGRITIES) {
        for (const lightClient of [undefined, { verifiesLogs: true }, { verifiesLogs: false }]) {
          const e = describeScanEvidence({ kind, integrity }, lightClient ? { lightClient } : {});
          expect(e.intervalCompleteness).toBe(U);
        }
      }
    }
  });
  it('property: proof integrity alone never yields verified completeness', () => {
    fc.assert(
      fc.property(arbKind, arbLc, (kind, lightClient) => {
        const e = describeScanEvidence({ kind, integrity: 'proof' }, lightClient ? { lightClient } : {});
        expect(e.intervalCompleteness).toBe(U);
      }),
    );
  });
  it('property: record inclusion is verified only for a light source with proof integrity', () => {
    fc.assert(
      fc.property(arbKind, arbIntegrity, arbLc, (kind, integrity, lightClient) => {
        const e = describeScanEvidence({ kind, integrity }, lightClient ? { lightClient } : {});
        if (e.recordInclusion === 'verified') {
          expect(kind).toBe('light');
          expect(integrity).toBe('proof');
          expect(lightClient?.verifiesLogs ?? true).toBe(true);
        }
      }),
    );
  });
  it('property: block identity is verified only for light; the claimed integrity label never raises it', () => {
    fc.assert(
      fc.property(arbKind, arbIntegrity, (kind, integrity) => {
        const e = describeScanEvidence({ kind, integrity });
        expect(e.blockIdentity === 'verified').toBe(kind === 'light');
        // the result depends on kind only for this axis: no upgrade by relabelling integrity
        expect(e.blockIdentity).toBe(describeScanEvidence({ kind, integrity: 'unverified' }).blockIdentity);
      }),
    );
  });
  it('property: relabelling integrity to proof never changes any axis except light inclusion (no upgrade)', () => {
    fc.assert(
      fc.property(arbKind, arbIntegrity, (kind, integrity) => {
        const base = describeScanEvidence({ kind, integrity });
        const up = describeScanEvidence({ kind, integrity: 'proof' });
        expect(up.blockIdentity).toBe(base.blockIdentity);
        expect(up.intervalCompleteness).toBe(base.intervalCompleteness);
        if (kind !== 'light') expect(up.recordInclusion).toBe(base.recordInclusion);
      }),
    );
  });
  it('is pure: same input, equal output, input not mutated', () => {
    const src = Object.freeze({ kind: 'light' as const, integrity: 'proof' as const });
    expect(describeScanEvidence(src)).toStrictEqual(describeScanEvidence(src));
  });
});
