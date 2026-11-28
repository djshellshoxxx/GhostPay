import { createReconciliationApi, type ReconciliationRecord } from '@ghostpay/ux-vault/portable';
import { describe, expect, it } from 'vitest';
import type { RegisteredInvoice } from '../../../lib/reconciliationMatch';
import type { ReconciliationState, VaultRecord } from '../../../lib/reconciliationVault';
import { DashboardExportCoordinator } from './export';
import { assetId, invoiceState, readMerchantDashboard } from './ledger';
import { DASHBOARD_LIMITS, DashboardError, type DashboardContext } from './model';
import { releaseIfLedgerUnchanged } from './release';
import { buildDashboardReport, buildPaymentHistoryCsv } from './report';
import { selectDashboardRows } from './select';

// Stress at the encrypted vault's own ceilings (500 invoices, 2,000 records) and past the dashboard's limits.
const seller = 'a'.repeat(64);
const token = '0x' + '1'.repeat(40);
const scope = { profileRef: seller, revision: '1', operationId: 'stress', sessionEpoch: 1 };
const ctx = (): DashboardContext => ({
  ...scope, signal: new AbortController().signal, current: () => scope, nowMs: () => 0, deadlineMs: Number.MAX_SAFE_INTEGER,
});
const hex = (n: number, width: number): string => n.toString(16).padStart(width, '0');
const MAX = (1n << 256n) - 1n;

function invoice(i: number): RegisteredInvoice {
  return {
    version: 1, invoiceDigest: '0x' + hex(i + 1, 64), nonce: hex(i + 1, 32), chainId: 1, asset: i % 3 === 0 ? token : 'native',
    expectedNetMinorUnits: String(1_000_000 + i), createdAt: 1, expiresAt: 2_000_000_000 + i, registeredAt: 1000,
  };
}

function record(i: number, overrides: Partial<VaultRecord> = {}): VaultRecord {
  return {
    version: 1, id: 'r' + i, chainId: 1, sellerKeyId: seller, transactionHash: '0x' + hex(i + 1, 64),
    stealthAddress: '0x' + 'd'.repeat(40), blockHash: '0x' + 'f'.repeat(64), asset: i % 2 === 0 ? 'native' : token,
    blockNumber: String(100 + i), blockTimestamp: String(1_700_000_000 + i), logIndex: 0,
    amountMinorUnits: (i % 97 === 0 ? MAX : BigInt(i) * 1_000_003n).toString(), recordedAt: 1000,
    evidenceSource: 'verified-router-scan', evidenceStatus: 'verified-at-scan', viewTagMatched: true,
    provenance: i % 11 === 0 ? 'imported-history' : 'live-scan',
    ...(i % 5 === 0 ? { invoiceDigest: invoice(i % 500).invoiceDigest } : {}), ...overrides,
  };
}

describe('merchant dashboard stress', () => {
  it('projects, reports and exports a vault-maximum ledger exactly and within budget', async () => {
    const invoices = Array.from({ length: 500 }, (_, i) => invoice(i));
    // 2,000 records including 400 exact repeats and 100 conflicting copies.
    const base = Array.from({ length: 1_500 }, (_, i) => record(i));
    const repeats = base.slice(0, 400).map((r) => ({ ...r }));
    const conflicts = base.slice(400, 500).map((r) => ({ ...r, amountMinorUnits: '1' }));
    const records = [...conflicts, ...base, ...repeats];
    const state: ReconciliationState = { records, invoices, readOnly: true, receipts: [] };

    const started = performance.now();
    const result = await readMerchantDashboard(state, 1, seller, ctx());
    const rows = [];
    for (let offset = 0; offset < result.projection.rows.length; offset += DASHBOARD_LIMITS.page) {
      rows.push(...selectDashboardRows(result.projection, { search: '', offset, limit: DASHBOARD_LIMITS.page }, ctx()).rows);
    }
    const report = buildDashboardReport(rows.map((row) => ({ row, state: invoiceState(row, [], 0) })), result.payments, result.projection.rows);
    const csv = buildPaymentHistoryCsv(result.payments, 1);
    const exporter = new DashboardExportCoordinator();
    const preview = exporter.preview(result.projection, {
      format: 'csv', columns: ['chainId', 'assetId', 'expectedAtomic'], invoiceRefs: rows.map((row) => row.invoiceRef),
    }, ctx());
    const file = exporter.approve(preview, ctx());
    const elapsed = performance.now() - started;

    // Independent expectation: live, non-conflicting, distinct logs only. Exact repeats (0..399) count once;
    // conflicting copies (400..499) never count.
    const expected = new Map<string, bigint>();
    for (let i = 0; i < 1_500; i++) {
      if (i >= 400 && i < 500) continue;
      const r = record(i);
      if (r.provenance !== 'live-scan') continue;
      expected.set(assetId(r.asset), (expected.get(assetId(r.asset)) ?? 0n) + BigInt(r.amountMinorUnits));
    }
    expect(new Map(result.historicalTotals.map((t) => [t.assetId, BigInt(t.observedAtomic)]))).toEqual(expected);
    expect(result.payments).toHaveLength(1_500);
    expect(result.payments.filter((p) => p.state === 'ambiguous')).toHaveLength(100);
    expect(rows).toHaveLength(500);
    expect(report.assets.reduce((n, a) => n + a.verifiedPayments, 0) + report.excludedPayments).toBe(1_500);
    expect(csv.content.split('\r\n')).toHaveLength(1_502);
    expect(file.content.split('\r\n')).toHaveLength(502);
    // Generous ceiling for shared CI runners; a quadratic regression at this size takes far longer.
    expect(elapsed).toBeLessThan(5_000);
  });

  it('fails closed with a typed limit error instead of truncating past the dashboard limits', async () => {
    const invoices = Array.from({ length: DASHBOARD_LIMITS.invoices + 1 }, (_, i) => invoice(i));
    const state: ReconciliationState = { records: [], invoices, readOnly: false, receipts: [] };
    await expect(readMerchantDashboard(state, 1, seller, ctx())).rejects.toBeInstanceOf(DashboardError);
  });

  it('decrypts, projects and releases from a real encrypted vault under load', async () => {
    const ciphertexts = new Map<string, string>();
    const { ReconciliationVault } = createReconciliationApi();
    const vaultScope = { chainId: 1, sellerKeyId: seller };
    const store = {
      read: (key: string) => Promise.resolve(ciphertexts.get(key) ?? null),
      compareAndSwap: (key: string, previous: string | null, next: string, guard: () => void) => {
        guard();
        if ((ciphertexts.get(key) ?? null) !== previous) return Promise.resolve(false);
        ciphertexts.set(key, next);
        return Promise.resolve(true);
      },
    };
    const key = new Uint8Array(32).fill(9);
    const open = async () => {
      const vault = new ReconciliationVault(store, vaultScope, () => undefined);
      await vault.unlock(key.slice());
      return vault;
    };
    const writer = await open();
    for (let i = 0; i < 200; i++) await writer.registerInvoice(invoice(i));
    for (let i = 0; i < 300; i++) {
      const source = record(i, { blockTimestamp: '1700000000' });
      const saved: ReconciliationRecord = {
        version: 1, sellerKeyId: seller, chainId: 1, transactionHash: source.transactionHash, blockNumber: source.blockNumber,
        blockHash: source.blockHash, blockTimestamp: '1700000000', logIndex: source.logIndex, stealthAddress: source.stealthAddress,
        asset: source.asset, amountMinorUnits: source.amountMinorUnits, viewTagMatched: true, recordedAt: source.recordedAt,
        evidenceStatus: 'verified-at-scan', evidenceSource: 'verified-router-scan',
        id: [seller, 1, source.transactionHash, source.stealthAddress, source.blockHash, source.logIndex].join(':'),
      };
      await writer.save(saved);
    }
    writer.lock();

    const reader = await open();
    const started = performance.now();
    const state = await reader.readState();
    const result = await readMerchantDashboard(state, 1, seller, ctx());
    const elapsed = performance.now() - started;
    reader.lock();
    expect(result.projection.rows).toHaveLength(200);
    expect(result.payments).toHaveLength(300);
    expect(elapsed).toBeLessThan(5_000);

    const fingerprint = (s: ReconciliationState): string => JSON.stringify([s.invoices.length, s.records.length]);
    let released = 0;
    await expect(releaseIfLedgerUnchanged(open, fingerprint(state), fingerprint, () => { released++; })).resolves.toBe(true);
    expect(released).toBe(1);
  }, 120_000);
});
