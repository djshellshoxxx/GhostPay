import { describe, expect, it } from 'vitest';
import type { VaultRecord } from '../../../lib/reconciliationVault';
import type { InvoiceState, LedgerObservation, ObservationState } from './ledger';
import type { DashboardRow } from './projection';
import { buildDashboardReport, buildPaymentHistoryCsv, dashboardAssetIds, PAYMENT_HISTORY_COLUMNS } from './report';

const usdc = '0x' + '1'.repeat(40);
const base: VaultRecord = {
  version: 1, id: 'r1', chainId: 11155111, sellerKeyId: 'a'.repeat(64), transactionHash: '0x' + 'd'.repeat(64),
  stealthAddress: '0x' + 'e'.repeat(40), blockHash: '0x' + 'f'.repeat(64), asset: 'native', blockNumber: '7',
  blockTimestamp: '86400', logIndex: 0, amountMinorUnits: '1', recordedAt: 86_401_000,
  evidenceSource: 'verified-router-scan', evidenceStatus: 'verified-at-scan', viewTagMatched: true, provenance: 'live-scan',
};
const observation = (state: ObservationState, record: Partial<VaultRecord>, invoiceRefs: readonly string[] = [], from: VaultRecord = base): LedgerObservation =>
  ({ state, record: { ...from, ...record }, invoiceRefs });
const row = (invoiceRef: string, assetId: string, expectedAtomic: string): DashboardRow => ({
  invoiceRef, alias: '', chainId: 'eip155:11155111', assetId, expectedAtomic, expiresAt: 1000, state: 'unverified',
  finalAtomic: '0', pendingAtomic: '0', lateFinalAtomic: '0', evidenceRefs: [],
  assessmentCounts: { unverified: 0, unknown: 0, pending: 0, final: 0, reorged: 0, reverted: 0 },
});
const invoice = (ref: string, assetId: string, amount: string, state: InvoiceState) => ({ row: row(ref, assetId, amount), state });

describe('merchant report totals over verified-at-scan payment records', () => {
  const huge = (2n ** 256n - 1n).toString();
  const invoices = [
    invoice('inv-a', 'native', huge, 'late'),
    invoice('inv-b', 'native', '5', 'open'),
    invoice('inv-c', 'erc20:' + usdc, '1000000', 'expired'),
  ];
  const payments = [
    observation('historical', { id: 'p1', amountMinorUnits: huge, logIndex: 1 }, ['inv-a']),
    observation('historical', { id: 'p2', amountMinorUnits: '2', logIndex: 2 }),
    observation('historical', { id: 'p3', amountMinorUnits: '9', logIndex: 3 }, ['inv-c']),
    observation('imported', { id: 'p4', amountMinorUnits: '1000', logIndex: 4, provenance: 'imported-history' }),
    observation('reorged', { id: 'p5', amountMinorUnits: '2000', logIndex: 5, evidenceStatus: 'invalidated-after-reorg' }),
    observation('ambiguous', { id: 'p6', amountMinorUnits: '4000', logIndex: 6, asset: usdc }),
    observation('historical', { id: 'p7', amountMinorUnits: '3', logIndex: 7, asset: usdc }, ['inv-c']),
  ];
  const report = buildDashboardReport(invoices, payments);

  it('sums only verified-at-scan observations, exactly, per asset', () => {
    expect(report.assets).toEqual([
      {
        assetId: 'erc20:' + usdc, invoiceCount: 1, expectedAtomic: '1000000',
        verifiedPayments: 1, verifiedAtomic: '3', linkedVerifiedAtomic: '3',
      },
      {
        assetId: 'native', invoiceCount: 2, expectedAtomic: (2n ** 256n + 4n).toString(),
        verifiedPayments: 3, verifiedAtomic: (2n ** 256n - 1n + 2n + 9n).toString(),
        // p3 is linked to an ERC-20 invoice, so it is not attributed to a native invoice.
        linkedVerifiedAtomic: huge,
      },
    ]);
  });

  it('counts excluded observations and every invoice and payment status', () => {
    expect(report.excludedPayments).toBe(3);
    expect(report.invoiceStates).toEqual({ open: 1, expired: 1, late: 1, ambiguous: 0, reorged: 0 });
    expect(report.paymentStates).toEqual({ historical: 4, unverified: 0, imported: 1, reorged: 1, ambiguous: 1 });
  });

  it('reports an empty selection as zero counts with no asset groups', () => {
    expect(buildDashboardReport([], [])).toEqual({
      assets: [], excludedPayments: 0,
      invoiceStates: { open: 0, expired: 0, late: 0, ambiguous: 0, reorged: 0 },
      paymentStates: { historical: 0, unverified: 0, imported: 0, reorged: 0, ambiguous: 0 },
    });
  });

  it('rejects malformed amounts instead of producing a wrong total', () => {
    expect(() => buildDashboardReport([], [observation('historical', { amountMinorUnits: '1e3' })])).toThrow();
    expect(() => buildDashboardReport([invoice('x', 'native', '-1', 'open')], [])).toThrow();
  });

  it('offers asset filters from invoices and trusted payment assets only', () => {
    expect(dashboardAssetIds(invoices.map(({ row: r }) => r), payments)).toEqual(['erc20:' + usdc, 'native']);
    expect(dashboardAssetIds([], [observation('ambiguous', { asset: '0x' + '2'.repeat(40) })])).toEqual([]);
  });
});

describe('payment history CSV', () => {
  it('writes one escaped row per observation with exact atomic amounts and UTC times', () => {
    const { blockTimestamp, ...untimed } = base;
    expect(blockTimestamp).toBe('86400');
    const csv = buildPaymentHistoryCsv([
      observation('historical', { amountMinorUnits: (2n ** 256n).toString() }, ['inv-a', 'inv-b']),
      observation('imported', { asset: usdc, logIndex: 3, provenance: 'imported-history' }, [], untimed),
      observation('ambiguous', { amountMinorUnits: '55', logIndex: 4 }),
    ], 11155111);
    const lines = csv.content.split('\r\n');
    expect(lines[0]).toBe(PAYMENT_HISTORY_COLUMNS.join(','));
    expect(lines[1]).toBe(`eip155:11155111,native,historical,1970-01-02T00:00:00.000Z,7,${(2n ** 256n).toString()},${base.transactionHash},0,inv-a; inv-b`);
    expect(lines[2]).toBe(`eip155:11155111,erc20:${usdc},imported,,7,1,${base.transactionHash},3,`);
    // Conflicting copies withhold amount, asset and time, as the dashboard does.
    expect(lines[3]).toBe(`eip155:11155111,,ambiguous,,,,${base.transactionHash},4,`);
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe('');
    expect(csv.mimeType).toBe('text/csv;charset=utf-8');
    expect(csv.content).not.toContain(base.stealthAddress);
  });

  it('neutralizes spreadsheet formulas and quotes separators in invoice references', () => {
    const csv = buildPaymentHistoryCsv([observation('historical', {}, ['=HYPERLINK("x")', 'a,b'])], 1);
    expect(csv.content.split('\r\n')[1]).toMatch(/,"'=HYPERLINK\(""x""\); a,b"$/);
  });

  it('produces a header-only file for an empty selection', () => {
    expect(buildPaymentHistoryCsv([], 1).content).toBe(PAYMENT_HISTORY_COLUMNS.join(',') + '\r\n');
  });
});

describe('CSV formula guard (security audit, info)', () => {
  it('neutralizes formulas hidden behind bidirectional, soft-hyphen and isolate controls', () => {
    for (const lead of ['‮', '‪', '⁦', '⁩', '؜', '­', '‏']) {
      const csv = buildPaymentHistoryCsv([observation('historical', {}, [lead + '=1+1'])], 1);
      expect(csv.content.split('\r\n')[1]!.endsWith(",'" + lead + '=1+1')).toBe(true);
    }
  });
});
