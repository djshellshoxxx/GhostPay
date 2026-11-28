import { describe, expect, it } from 'vitest';
import type { ReconciliationState, VaultRecord } from '../../../lib/reconciliationVault';
import { readMerchantDashboard } from './ledger';
import type { DashboardContext } from './model';
import { buildDashboardReport } from './report';

// Regression (security audit, HIGH): only router-verified live observations may count as verified payments.
// A pending candidate or an unverified claim (anyone can announce anything) must never reach a total.
const seller = 'a'.repeat(64);
const scope = { profileRef: seller, revision: '1', operationId: 'evidence', sessionEpoch: 1 };
const ctx: DashboardContext = {
  ...scope, signal: new AbortController().signal, current: () => scope, nowMs: () => 0, deadlineMs: Number.MAX_SAFE_INTEGER,
};
const record = (i: number, overrides: Partial<VaultRecord>): VaultRecord => ({
  version: 1, id: 'r' + i, chainId: 1, sellerKeyId: seller, transactionHash: '0x' + String(i).repeat(64),
  stealthAddress: '0x' + 'd'.repeat(40), blockHash: '0x' + 'f'.repeat(64), asset: 'native', blockNumber: '7',
  blockTimestamp: '1700000000', logIndex: 0, amountMinorUnits: '1000', recordedAt: 1000,
  evidenceSource: 'verified-router-scan', evidenceStatus: 'verified-at-scan', viewTagMatched: true, provenance: 'live-scan',
  ...overrides,
});

describe('dashboard evidence classification', () => {
  it('excludes pending and unverified scan observations from every verified total', async () => {
    const records = [
      record(1, {}),
      record(2, { evidenceStatus: 'pending-at-scan', evidenceSource: 'router-scan-candidate' }),
      record(3, { evidenceStatus: 'unverified-at-scan' }),
      record(4, { evidenceStatus: 'unverified-at-scan', evidenceSource: 'router-scan-candidate' }),
    ];
    const state: ReconciliationState = { records, invoices: [], readOnly: false, receipts: [] };
    const result = await readMerchantDashboard(state, 1, seller, ctx);
    expect(result.payments.map((p) => p.state)).toEqual(['historical', 'unverified', 'unverified', 'unverified']);
    expect(result.historicalTotals).toEqual([{ assetId: 'native', observedAtomic: '1000' }]);
    const report = buildDashboardReport([], result.payments);
    expect(report.assets).toEqual([expect.objectContaining({ verifiedPayments: 1, verifiedAtomic: '1000' })]);
    expect(report.excludedPayments).toBe(3);
    expect(report.paymentStates.unverified).toBe(3);
  });
});
