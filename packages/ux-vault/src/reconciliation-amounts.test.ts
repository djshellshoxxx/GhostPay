import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createInvoicePaymentSummarizer, summarizeInvoicePayments } from './reconciliation-amounts.js';
import { createReconciliationApi, type RegisteredInvoice, type VaultRecord } from './reconciliation-portable.js';

const scope = { sellerKeyId: 'a'.repeat(64), chainId: 84532 };
const invoice: RegisteredInvoice = {
  version: 1, invoiceDigest: `0x${'b'.repeat(64)}`, nonce: 'c'.repeat(32), chainId: scope.chainId,
  asset: 'native', expectedNetMinorUnits: '100', createdAt: 1_000, expiresAt: 2_000, registeredAt: 1_000_000,
};
function record(n: number, amount = '100', changes: Partial<VaultRecord> = {}): VaultRecord {
  const value = {
    version: 1 as const, ...scope, transactionHash: `0x${n.toString(16).padStart(64, '0')}`,
    blockNumber: '100', blockHash: `0x${'d'.repeat(64)}`, logIndex: n,
    stealthAddress: `0x${'e'.repeat(40)}`, asset: invoice.asset, amountMinorUnits: amount,
    viewTagMatched: true, invoiceDigest: invoice.invoiceDigest, recordedAt: 1_500_000,
    evidenceStatus: 'verified-at-scan' as const, evidenceSource: 'verified-router-scan' as const,
    provenance: 'live-scan' as const, ...changes,
  };
  return { ...value, id: `${value.sellerKeyId}:${String(value.chainId)}:${value.transactionHash}:${value.stealthAddress}:${value.blockHash}:${String(value.logIndex)}` };
}

describe('explicit local invoice-link amount comparison', () => {
  it('keeps no linked evidence distinct from an underpayment claim', () => {
    const unlinked = record(1);
    delete (unlinked as { invoiceDigest?: string }).invoiceDigest;
    expect(summarizeInvoicePayments(invoice, [unlinked], scope)).toEqual({
      kind: 'unlinked', observedMinorUnits: '0', expectedMinorUnits: '100', observationCount: 0,
    });
    expect(unlinked.invoiceDigest).toBeUndefined();
  });

  it('refuses conflicting asset or invoice claims across different otherwise valid record identities', () => {
    const other = { ...invoice, invoiceDigest: `0x${'f'.repeat(64)}` };
    for (const changes of [{ asset: `0x${'f'.repeat(40)}` }, { invoiceDigest: other.invoiceDigest }]) {
      const records = [record(1), record(1, '100', { ...changes, stealthAddress: `0x${'1'.repeat(40)}` })];
      expect(summarizeInvoicePayments(invoice, records, scope)).toEqual({ kind: 'unavailable' });
      expect(summarizeInvoicePayments(other, records, scope)).toEqual({ kind: 'unavailable' });
    }
    const unlinked = record(1);
    delete (unlinked as { invoiceDigest?: string }).invoiceDigest;
    expect(summarizeInvoicePayments(invoice, [record(1), unlinked], scope)).toEqual({ kind: 'unavailable' });
  });

  it('reuses an immutable scope snapshot across invoices and excludes conflicting history', () => {
    const other = { ...invoice, invoiceDigest: `0x${'f'.repeat(64)}` };
    const records = [record(1), record(2, '99', { invoiceDigest: other.invoiceDigest }),
      record(1, '7', { provenance: 'imported-history' }), record(1, '8', { evidenceStatus: 'invalidated-after-reorg' })];
    const summarize = createInvoicePaymentSummarizer(records, scope);
    records.splice(0);
    expect(summarize(invoice)).toMatchObject({ kind: 'equal', observedMinorUnits: '100', observationCount: 1 });
    expect(summarize(other)).toMatchObject({ kind: 'below', observedMinorUnits: '99', observationCount: 1 });
  });

  it.each([['99', 'below'], ['100', 'equal'], ['101', 'above']] as const)(
    'compares %s with the expected net amount without changing the link', (amount, kind) => {
      const records = [record(1, amount)];
      const before = structuredClone(records);
      expect(summarizeInvoicePayments(invoice, records, scope)).toEqual({
        kind, observedMinorUnits: amount, expectedMinorUnits: '100', observationCount: 1,
      });
      expect(records).toEqual(before);
    },
  );

  it('reports distinct multiple partial or full observations without declaring duplicate settlement', () => {
    expect(summarizeInvoicePayments(invoice, [record(1, '60'), record(2, '40')], scope)).toEqual({
      kind: 'equal', observedMinorUnits: '100', expectedMinorUnits: '100', observationCount: 2,
    });
    expect(summarizeInvoicePayments(invoice, [record(1), record(2)], scope)).toEqual({
      kind: 'above', observedMinorUnits: '200', expectedMinorUnits: '100', observationCount: 2,
    });
  });

  it('enforces seller, chain, asset and explicit invoice identity', () => {
    const records = [
      record(1, '100', { sellerKeyId: 'f'.repeat(64) }), record(2, '100', { chainId: 1 }),
      record(3, '100', { asset: `0x${'f'.repeat(40)}` }),
      record(4, '100', { invoiceDigest: `0x${'f'.repeat(64)}` }),
    ];
    expect(summarizeInvoicePayments(invoice, records, scope)).toMatchObject({ kind: 'unlinked', observationCount: 0 });
    const token = `0x${'1'.repeat(40)}`;
    expect(summarizeInvoicePayments({ ...invoice, asset: token }, [record(5, '100', { asset: token })], scope))
      .toMatchObject({ kind: 'equal', observationCount: 1 });
  });

  it('excludes imported, invalidated, missing-provenance, pending and claimed evidence', () => {
    const records = [
      record(1, '100', { provenance: 'imported-history' }),
      record(2, '100', { evidenceStatus: 'invalidated-after-reorg' }),
      { ...record(3), provenance: undefined },
      { ...record(4), evidenceStatus: 'pending' }, { ...record(5), evidenceStatus: 'claimed' },
    ] as unknown as VaultRecord[];
    expect(summarizeInvoicePayments(invoice, records, scope)).toMatchObject({ kind: 'unlinked', observedMinorUnits: '0' });
  });

  it('counts repeated observations of the same event once, independently of save time', () => {
    const original = record(1);
    expect(summarizeInvoicePayments(invoice, [original, { ...original, recordedAt: 1_600_000 }], scope))
      .toMatchObject({ kind: 'equal', observationCount: 1, observedMinorUnits: '100' });
  });

  it.each([
    { amountMinorUnits: '99' }, { blockHash: `0x${'f'.repeat(64)}` }, { blockNumber: '101' },
    { stealthAddress: `0x${'f'.repeat(40)}` },
    { asset: `0x${'f'.repeat(40)}` }, { invoiceDigest: `0x${'f'.repeat(64)}` },
  ])('refuses contradictory copies of one transaction log: %s', (changes) => {
    expect(summarizeInvoicePayments(invoice, [record(1), record(1, '100', changes)], scope))
      .toEqual({ kind: 'unavailable' });
  });

  it('fails closed on invalid relevant records, invoice, scope and excessive input', () => {
    const malformed = [record(1, '01'), record(1, '0'), record(1, '-1'), record(1, '1e3'),
      { ...record(1), id: 'forged' }, { ...record(1), evidenceSource: 'seller-receipt' }, null];
    for (const value of malformed) {
      expect(summarizeInvoicePayments(invoice, [value] as unknown as VaultRecord[], scope)).toEqual({ kind: 'unavailable' });
    }
    expect(summarizeInvoicePayments({ ...invoice, expectedNetMinorUnits: 'NaN' }, [], scope)).toEqual({ kind: 'unavailable' });
    expect(summarizeInvoicePayments(invoice, [], { ...scope, sellerKeyId: 'invalid' })).toEqual({ kind: 'unavailable' });
    expect(summarizeInvoicePayments(invoice, [], { ...scope, chainId: 1 })).toEqual({ kind: 'unavailable' });
    const { MAX_RECONCILIATION_RECORDS } = createReconciliationApi();
    expect(summarizeInvoicePayments(invoice, Array.from({ length: MAX_RECONCILIATION_RECORDS + 1 }, () => record(1)), scope))
      .toEqual({ kind: 'unavailable' });
  });

  it('uses exact bigint arithmetic above Number and uint256 aggregate ranges', () => {
    const maximum = (2n ** 256n - 1n).toString();
    expect(summarizeInvoicePayments({ ...invoice, expectedNetMinorUnits: maximum }, [record(1, maximum), record(2, maximum)], scope))
      .toEqual({ kind: 'above', observedMinorUnits: ((2n ** 256n - 1n) * 2n).toString(), expectedMinorUnits: maximum, observationCount: 2 });
  });

  it('preserves exact totals and duplicate invariance across 300 generated cases', () => {
    fc.assert(fc.property(
      fc.bigInt({ min: 1n, max: 2n ** 256n - 1n }),
      fc.array(fc.bigInt({ min: 1n, max: 2n ** 256n - 1n }), { minLength: 1, maxLength: 20 }),
      (expected, amounts) => {
        const records = amounts.map((amount, n) => record(n, amount.toString()));
        const total = amounts.reduce((sum, amount) => sum + amount, 0n);
        expect(summarizeInvoicePayments({ ...invoice, expectedNetMinorUnits: expected.toString() }, [...records, ...records].reverse(), scope))
          .toEqual({ kind: total < expected ? 'below' : total > expected ? 'above' : 'equal',
            observedMinorUnits: total.toString(), expectedMinorUnits: expected.toString(), observationCount: amounts.length });
      },
    ), { numRuns: 300, seed: 20261116 });
  });
});
