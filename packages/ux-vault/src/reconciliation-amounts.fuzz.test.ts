import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { summarizeInvoicePayments } from './reconciliation-amounts.js';
import type { RegisteredInvoice, VaultRecord } from './reconciliation-portable.js';

const scope = { sellerKeyId: 'a'.repeat(64), chainId: 84532 };
const invoice: RegisteredInvoice = {
  version: 1, invoiceDigest: `0x${'b'.repeat(64)}`, nonce: 'c'.repeat(32), chainId: scope.chainId,
  asset: 'native', expectedNetMinorUnits: '100', createdAt: 1_000, expiresAt: 2_000, registeredAt: 1_000_000,
};

type Status = VaultRecord['evidenceStatus'];
interface Shape {
  readonly amount: bigint;
  readonly status: Status;
  readonly imported: boolean;
  readonly time: 'legacy' | 'on-time' | 'late';
  readonly accepted: boolean;
}

function record(n: number, shape: Shape): VaultRecord {
  const value = {
    version: 1 as const, ...scope, transactionHash: `0x${(n + 1).toString(16).padStart(64, '0')}`,
    blockNumber: '100', blockHash: `0x${'d'.repeat(64)}`, logIndex: n,
    stealthAddress: `0x${'e'.repeat(40)}`, asset: invoice.asset, amountMinorUnits: shape.amount.toString(),
    viewTagMatched: true, invoiceDigest: invoice.invoiceDigest, recordedAt: 1_500_000,
    evidenceStatus: shape.status,
    evidenceSource: shape.status === 'pending-at-scan' ? 'router-scan-candidate' as const : 'verified-router-scan' as const,
    provenance: shape.imported ? 'imported-history' as const : 'live-scan' as const,
    ...(shape.time === 'legacy' ? {} : { blockTimestamp: shape.time === 'late' ? '2000' : '1999' }),
    ...(shape.accepted && shape.time !== 'legacy' ? { lateAcceptedAt: 1_600_000 } : {}),
  };
  return { ...value, id: `${value.sellerKeyId}:${String(value.chainId)}:${value.transactionHash}:${value.stealthAddress}:${value.blockHash}:${String(value.logIndex)}` };
}

const shape: fc.Arbitrary<Shape> = fc.record({
  amount: fc.bigInt({ min: 1n, max: 300n }),
  status: fc.constantFrom<Status>('verified-at-scan', 'pending-at-scan', 'unverified-at-scan', 'invalidated-after-reorg'),
  imported: fc.boolean(),
  time: fc.constantFrom('legacy' as const, 'on-time' as const, 'late' as const),
  accepted: fc.boolean(),
});

/** The credit rule written out independently: final live evidence, on time or explicitly accepted at the exact amount. */
function credited(s: Shape): boolean {
  if (s.imported || s.status !== 'verified-at-scan') return false;
  if (s.time !== 'late') return true;
  return s.accepted && s.amount === BigInt(invoice.expectedNetMinorUnits);
}

describe('P1-LATE invoice credit under generated evidence histories', () => {
  it('credits only final live evidence that is on time or accepted late at the exact amount', () => {
    fc.assert(fc.property(fc.array(shape, { minLength: 1, maxLength: 12 }), (shapes) => {
      const counted = shapes.filter(credited);
      const total = counted.reduce((sum, s) => sum + s.amount, 0n);
      const summary = summarizeInvoicePayments(invoice, shapes.map((s, n) => record(n, s)), scope);
      expect(summary).toEqual({
        kind: counted.length === 0 ? 'unlinked' : total < 100n ? 'below' : total > 100n ? 'above' : 'equal',
        observedMinorUnits: total.toString(), expectedMinorUnits: '100', observationCount: counted.length,
      });
    }), { numRuns: 400, seed: 20261124 });
  });

  it('never lets pending, unverified, invalidated, imported or unaccepted late evidence change a summary', () => {
    fc.assert(fc.property(
      fc.array(shape.filter(credited), { maxLength: 6 }),
      fc.array(shape.filter((s) => !credited(s)), { minLength: 1, maxLength: 6 }),
      (good, noise) => {
        const base = good.map((s, n) => record(n, s));
        const extra = noise.map((s, n) => record(n + good.length, s));
        expect(summarizeInvoicePayments(invoice, [...extra, ...base], scope))
          .toEqual(summarizeInvoicePayments(invoice, base, scope));
      },
    ), { numRuns: 300, seed: 20261125 });
  });

  it('gives the same summary for every delivery order and repeated delivery', () => {
    fc.assert(fc.property(
      fc.array(shape, { minLength: 1, maxLength: 10 }).chain((shapes) =>
        fc.tuple(fc.constant(shapes), fc.shuffledSubarray(shapes.map((_, n) => n), { minLength: shapes.length }),
          fc.array(fc.nat({ max: shapes.length - 1 }), { maxLength: 5 }))),
      ([shapes, order, repeats]) => {
        const records = shapes.map((s, n) => record(n, s));
        const delivered = [...order.map((n) => records[n]!), ...repeats.map((n) => records[n]!)];
        expect(summarizeInvoicePayments(invoice, delivered, scope))
          .toEqual(summarizeInvoicePayments(invoice, records, scope));
      },
    ), { numRuns: 300, seed: 20261126 });
  });

  it('fails closed when one transaction arrives with a contradictory seller decision or status', () => {
    fc.assert(fc.property(shape.filter((s) => credited(s) && s.time === 'late'), (late) => {
      const accepted = record(0, late);
      const withoutDecision: { lateAcceptedAt?: number } & Omit<VaultRecord, 'lateAcceptedAt'> = { ...accepted };
      delete withoutDecision.lateAcceptedAt;
      expect(summarizeInvoicePayments(invoice, [accepted, withoutDecision as VaultRecord], scope))
        .toEqual({ kind: 'unavailable' });
    }), { numRuns: 50, seed: 20261127 });
  });
});
