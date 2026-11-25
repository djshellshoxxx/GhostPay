import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { RegisteredInvoice } from '../../../lib/reconciliationMatch';
import type { ReconciliationState, VaultRecord } from '../../../lib/reconciliationVault';
import { summarizeDashboardProjection } from './analytics';
import { DashboardExportCoordinator } from './export';
import { invoiceState, readMerchantDashboard, utcRange } from './ledger';
import type { DashboardContext } from './model';

const seller = 'a'.repeat(64);
const ref = '0x' + 'b'.repeat(64);
const amount = '900719925474099312345';
const invoice: RegisteredInvoice = {
  version: 1, invoiceDigest: ref, nonce: 'c'.repeat(32), chainId: 1, asset: 'native',
  expectedNetMinorUnits: amount, createdAt: 1000, expiresAt: 2000, registeredAt: 1_000_000,
};
const payment: VaultRecord = {
  version: 1, id: 'record', chainId: 1, sellerKeyId: seller, invoiceDigest: ref,
  transactionHash: '0x' + 'd'.repeat(64), stealthAddress: '0x' + 'e'.repeat(40), blockHash: '0x' + 'f'.repeat(64),
  asset: 'native', blockNumber: '1', blockTimestamp: '2000', logIndex: 0, amountMinorUnits: amount,
  recordedAt: 2_010_000, evidenceSource: 'verified-router-scan', evidenceStatus: 'verified-at-scan', viewTagMatched: true,
  provenance: 'live-scan',
};

const controller = new AbortController();
const scope = { profileRef: seller, revision: '1', operationId: 'test', sessionEpoch: 1 };
const ctx: DashboardContext = { ...scope, signal: controller.signal, current: () => scope, nowMs: () => 2000, deadlineMs: 3000 };

async function load(records: readonly VaultRecord[], invoices = [invoice]): ReturnType<typeof readMerchantDashboard> {
  const state: ReconciliationState = { records, invoices, readOnly: false, receipts: [] };
  return readMerchantDashboard(state, 1, seller, ctx);
}

describe('dashboard over the encrypted ledger', () => {
  it('deduplicates historical observations, displays a possible late payment at expiry, and exports only invoice amounts', async () => {
    const result = await load([payment, { ...payment }, { ...payment, sellerKeyId: 'a different scope' }]);
    expect(result.payments).toHaveLength(1);
    const row = result.projection.rows[0]!;
    expect(invoiceState(row, result.payments, 2000)).toBe('late');
    expect(summarizeDashboardProjection(result.projection, 2000, ctx).groups).toMatchObject([
      { expectedAtomic: amount, finalAtomic: '0', lateFinalAtomic: '0', settledOnTimeInvoices: 0 },
    ]);
    const exporter = new DashboardExportCoordinator();
    const preview = exporter.preview(result.projection, {
      format: 'json', columns: ['chainId', 'assetId', 'expectedAtomic'], invoiceRefs: [ref],
    }, ctx);
    const file = exporter.approve(preview, ctx);
    expect(JSON.parse(file.content)).toMatchObject({ rows: [{ chainId: 'eip155:1', assetId: 'native', expectedAtomic: amount }] });
    for (const privateValue of [ref, payment.transactionHash, payment.stealthAddress]) expect(file.content).not.toContain(privateValue);
    expect(() => exporter.approve(preview, ctx)).toThrow();
  });

  it('retains reorg, conflict, imported and missing-time distinctions without recognizing payment', async () => {
    const { blockTimestamp, ...legacy } = payment;
    expect(blockTimestamp).toBe('2000');
    const cases = [
      { records: [{ ...payment, evidenceStatus: 'invalidated-after-reorg' as const }], state: 'reorged' },
      { records: [{ ...payment, provenance: 'imported-history' as const }], state: 'ambiguous' },
      { records: [legacy], state: 'ambiguous' },
      { records: [payment, { ...payment, id: 'alternate', amountMinorUnits: '3' }], state: 'ambiguous' },
      { records: [], state: 'expired' },
    ];
    for (const { records, state } of cases) {
      const { projection, payments } = await load(records);
      const row = projection.rows[0]!;
      expect(invoiceState(row, payments, 2000)).toBe(state);
      expect(row.finalAtomic).toBe('0');
      expect(row.pendingAtomic).toBe('0');
    }
  });

  it('rebuilds exact historical totals per asset from unique in-scope observations on each read', async () => {
    const token = '0x' + '1'.repeat(40);
    const maximum = ((1n << 256n) - 1n).toString();
    const first = { ...payment, amountMinorUnits: maximum };
    const extra = { ...payment, logIndex: 1, amountMinorUnits: '2' };
    const conflict = { ...payment, logIndex: 2 };
    const erc20 = { ...payment, logIndex: 3, asset: token, amountMinorUnits: '19' };
    const rows = [
      first, { ...first }, extra, erc20, conflict, { ...conflict, blockNumber: '2' },
      { ...payment, logIndex: 4, provenance: 'imported-history' as const },
      { ...payment, logIndex: 5, evidenceStatus: 'invalidated-after-reorg' as const },
      { ...payment, logIndex: 6, chainId: 10 }, { ...payment, logIndex: 7, sellerKeyId: 'f'.repeat(64) },
    ];
    const expected = [
      { assetId: 'erc20:' + token, observedAtomic: '19' },
      { assetId: 'native', observedAtomic: ((1n << 256n) + 1n).toString() },
    ];
    for (const records of [rows, [...rows].reverse()]) {
      const result = await load(records);
      expect(result.historicalTotals).toEqual(expected);
      expect(result.payments.find(({ record }) => record.logIndex === 2)?.state).toBe('ambiguous');
      expect(result.projection.totals[0]).toMatchObject({ expectedAtomic: amount, finalAtomic: '0', pendingAtomic: '0' });
    }
    const invalidated = rows.map((row) => row.logIndex === 0 ? { ...row, evidenceStatus: 'invalidated-after-reorg' as const } : row);
    expect((await load(invalidated)).historicalTotals).toEqual([expected[0], { assetId: 'native', observedAtomic: '2' }]);
    expect((await load([])).historicalTotals).toEqual([]);
  });

  it('preserves exact sums when a refresh repeats or reorders scan records', async () => {
    const maximum = (1n << 256n) - 1n;
    await fc.assert(fc.asyncProperty(fc.array(fc.bigInt({ min: 1n, max: maximum }), { minLength: 1, maxLength: 24 }), async (amounts) => {
      const records = amounts.map((value, logIndex) => ({ ...payment, logIndex, amountMinorUnits: value.toString() }));
      const total = amounts.reduce((sum, value) => sum + value, 0n).toString();
      for (const snapshot of [records, [...records, ...records].reverse()]) {
        const result = await load(snapshot);
        expect(result.historicalTotals).toEqual([{ assetId: 'native', observedAtomic: total }]);
        expect(result.payments).toHaveLength(records.length);
      }
    }), { seed: 564, numRuns: 48 });
  });

  it('validates chronological UTC date ranges and includes the full end date', () => {
    expect(utcRange('2024-02-29', '2024-02-29')).toEqual([1_709_164_800, 1_709_251_200]);
    expect(utcRange('10000-01-01', '10000-01-01')).toEqual([253_402_300_800, 253_402_387_200]);
    expect(utcRange('', '1969-12-31')).toEqual([-Infinity, 0]);
    expect(utcRange('1969-12-31', '1969-12-31')).toEqual([-86_400, 0]);
    expect(utcRange('2026-02-29', '')).toBeUndefined();
    expect(utcRange('2026-08-02', '2026-08-01')).toBeUndefined();
  });

  it('accepts the encrypted vault expiry range and keeps other invoices readable', async () => {
    const farFuture = { ...invoice, invoiceDigest: '0x' + '1'.repeat(64), expiresAt: 253_402_300_800 };
    const { projection } = await load([], [invoice, farFuture]);
    expect(projection.rows).toHaveLength(2);
    expect(summarizeDashboardProjection(projection, 2000, ctx).groups).toMatchObject([
      { invoiceCount: 2, expiredUnsettledInvoices: 1 },
    ]);
  });
});
