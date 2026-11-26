import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { RegisteredInvoice } from '../../../lib/reconciliationMatch';
import type { ReconciliationState, VaultRecord } from '../../../lib/reconciliationVault';
import { assetId, invoiceState, readMerchantDashboard, utcRange, type LedgerObservation } from './ledger';
import type { DashboardContext } from './model';
import { buildDashboardReport, buildPaymentHistoryCsv, PAYMENT_HISTORY_COLUMNS } from './report';

// Independent oracles for the ledger adapter and the report: the dashboard must show exactly what verified records add up to.
const seller = 'a'.repeat(64);
const token = '0x' + '1'.repeat(40);
const refs = ['0x' + 'b'.repeat(64), '0x' + 'c'.repeat(64), '0x' + 'e'.repeat(64)] as const;
const controller = new AbortController();
const scope = { profileRef: seller, revision: '1', operationId: 'fuzz', sessionEpoch: 1 };
const ctx: DashboardContext = {
  ...scope, signal: controller.signal, current: () => scope, nowMs: () => 0, deadlineMs: Number.MAX_SAFE_INTEGER,
};
const MAX = (1n << 256n) - 1n;
// Escapes kept in a string: literal U+2028/U+2029 would end the line inside a regex literal.
const LIVE_FORMULA = new RegExp('^[\\s\\u00a0\\u2000-\\u200f\\u2028\\u2029\\u2060\\ufeff]*[=+\\-@]', 'u');

const recordArb = fc.record({
  tx: fc.integer({ min: 0, max: 12 }),
  logIndex: fc.integer({ min: 0, max: 2 }),
  asset: fc.constantFrom('native', token),
  amount: fc.oneof(fc.bigInt({ min: 0n, max: MAX }), fc.constantFrom(0n, 1n, MAX)),
  status: fc.constantFrom('verified-at-scan' as const, 'invalidated-after-reorg' as const),
  provenance: fc.constantFrom('live-scan' as const, 'imported-history' as const),
  invoice: fc.option(fc.constantFrom(...refs), { nil: undefined }),
  time: fc.option(fc.integer({ min: 1, max: 4_000_000_000 }), { nil: undefined }),
  variant: fc.constantFrom('a', 'b'),
  foreign: fc.boolean(),
}).map((r): VaultRecord => {
  const base: VaultRecord = {
    version: 1, id: 'r' + r.tx + ':' + r.logIndex + r.variant, chainId: r.foreign ? 2 : 1,
    sellerKeyId: seller, transactionHash: '0x' + r.tx.toString(16).padStart(64, '0'),
    stealthAddress: '0x' + 'd'.repeat(40), blockHash: '0x' + 'f'.repeat(64), asset: r.asset, blockNumber: '7',
    logIndex: r.logIndex, amountMinorUnits: r.amount.toString(), recordedAt: 1000,
    evidenceSource: 'verified-router-scan', evidenceStatus: r.status, viewTagMatched: true, provenance: r.provenance,
  };
  const timed = r.time === undefined ? base : { ...base, blockTimestamp: String(r.time) };
  return r.invoice === undefined ? timed : { ...timed, invoiceDigest: r.invoice };
});

const invoices: RegisteredInvoice[] = refs.map((invoiceDigest, index) => ({
  version: 1, invoiceDigest, nonce: String(index).repeat(32), chainId: 1, asset: index === 1 ? token : 'native',
  expectedNetMinorUnits: String(10 ** index), createdAt: 1, expiresAt: 2_000_000_000, registeredAt: 1000,
}));

/** What the overview must show: per-asset sums of non-conflicting, live, non-reorged copies, one per log. */
function oracle(records: readonly VaultRecord[]): { totals: Map<string, bigint>; identities: number } {
  const groups = new Map<string, VaultRecord[]>();
  for (const record of records) {
    if (record.chainId !== 1 || record.sellerKeyId !== seller) continue;
    const key = record.transactionHash + ':' + record.logIndex;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const kind = (r: VaultRecord): string => r.evidenceStatus === 'invalidated-after-reorg' ? 'reorged'
    : r.provenance === 'imported-history' ? 'imported' : 'historical';
  const same = (a: VaultRecord, b: VaultRecord): boolean => a.id === b.id && a.amountMinorUnits === b.amountMinorUnits &&
    a.asset === b.asset && a.blockNumber === b.blockNumber && a.blockTimestamp === b.blockTimestamp &&
    a.invoiceDigest === b.invoiceDigest && kind(a) === kind(b);
  const totals = new Map<string, bigint>();
  for (const copies of groups.values()) {
    const [first] = copies;
    if (first === undefined || !copies.every((copy) => same(copy, first)) || kind(first) !== 'historical') continue;
    totals.set(assetId(first.asset), (totals.get(assetId(first.asset)) ?? 0n) + BigInt(first.amountMinorUnits));
  }
  return { totals, identities: groups.size };
}

const load = (records: readonly VaultRecord[]) => {
  const state: ReconciliationState = { records, invoices, readOnly: false, receipts: [] };
  return readMerchantDashboard(state, 1, seller, ctx);
};
const asMap = (rows: readonly { assetId: string; observedAtomic: string }[]) =>
  new Map(rows.map((row) => [row.assetId, BigInt(row.observedAtomic)]));

/** Minimal RFC 4180 reader, enough to prove every exported row has the declared shape. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += char;
  }
  expect(quoted).toBe(false);
  expect(row.length === 0 && cell === '').toBe(true);
  return rows;
}

describe('merchant dashboard fuzzing against independent oracles', () => {
  it('overview totals equal the verified-record oracle, once per log, for any duplicates, conflicts and order', async () => {
    await fc.assert(fc.asyncProperty(fc.array(recordArb, { maxLength: 40 }), fc.integer(), async (records, seed) => {
      const expected = oracle(records);
      const result = await load(records);
      expect(asMap(result.historicalTotals)).toEqual(expected.totals);
      expect(result.payments).toHaveLength(expected.identities);
      // Order of the encrypted records must never change what is displayed.
      const shuffled = fc.sample(fc.shuffledSubarray(records, { minLength: records.length }), { seed, numRuns: 1 })[0]!;
      const again = await load(shuffled);
      expect(again.historicalTotals).toEqual(result.historicalTotals);
      expect(again.payments.map((p) => p.state).sort()).toEqual(result.payments.map((p) => p.state).sort());
    }), { numRuns: 300, seed: 20261126 });
  });

  it('the unfiltered report agrees with the overview and never counts excluded observations', async () => {
    await fc.assert(fc.asyncProperty(fc.array(recordArb, { maxLength: 40 }), async (records) => {
      const result = await load(records);
      const rows = result.projection.rows.map((row) => ({ row, state: invoiceState(row, [], 0) }));
      const report = buildDashboardReport(rows, result.payments, result.projection.rows);
      const verified = new Map(report.assets.filter((a) => a.verifiedPayments > 0).map((a) => [a.assetId, BigInt(a.verifiedAtomic)]));
      expect(verified).toEqual(asMap(result.historicalTotals));
      expect(report.excludedPayments + report.assets.reduce((n, a) => n + a.verifiedPayments, 0)).toBe(result.payments.length);
      for (const group of report.assets) expect(BigInt(group.linkedVerifiedAtomic) <= BigInt(group.verifiedAtomic)).toBe(true);
      const counted = Object.values(report.paymentStates).reduce((a, b) => a + b, 0);
      expect(counted).toBe(result.payments.length);
    }), { numRuns: 300, seed: 7 });
  });

  it('linked totals only attribute a payment to a registered invoice of the same asset', async () => {
    await fc.assert(fc.asyncProperty(fc.array(recordArb, { maxLength: 30 }), async (records) => {
      const result = await load(records);
      const report = buildDashboardReport([], result.payments, result.projection.rows);
      const assetOf = new Map(result.projection.rows.map((row) => [row.invoiceRef, row.assetId]));
      const linked = new Map<string, bigint>();
      for (const { record, state, invoiceRefs } of result.payments) {
        const id = assetId(record.asset);
        if (state === 'historical' && invoiceRefs.some((ref) => assetOf.get(ref) === id))
          linked.set(id, (linked.get(id) ?? 0n) + BigInt(record.amountMinorUnits));
      }
      for (const group of report.assets) expect(BigInt(group.linkedVerifiedAtomic)).toBe(linked.get(group.assetId) ?? 0n);
    }), { numRuns: 200, seed: 11 });
  });

  it('the payment CSV has one well-formed row per observation and never starts a cell with a live formula', async () => {
    const hostileRef = fc.string({ maxLength: 12 }).map((s) => [...s].filter((c) => c.charCodeAt(0) >= 0x20).join(''));
    await fc.assert(fc.asyncProperty(fc.array(recordArb, { maxLength: 25 }), fc.array(hostileRef, { maxLength: 3 }), async (records, extraRefs) => {
      const { payments } = await load(records);
      const withRefs: LedgerObservation[] = payments.map((p, i) => (i === 0 ? { ...p, invoiceRefs: [...p.invoiceRefs, ...extraRefs] } : p));
      const rows = parseCsv(buildPaymentHistoryCsv(withRefs, 1).content);
      expect(rows[0]).toEqual([...PAYMENT_HISTORY_COLUMNS]);
      expect(rows).toHaveLength(withRefs.length + 1);
      rows.slice(1).forEach((cells, i) => {
        expect(cells).toHaveLength(PAYMENT_HISTORY_COLUMNS.length);
        const { record, state } = withRefs[i]!;
        expect(cells[2]).toBe(state);
        expect(cells[5]).toBe(state === 'ambiguous' ? '' : record.amountMinorUnits);
        for (const cell of cells) expect(LIVE_FORMULA.test(cell)).toBe(false);
      });
    }), { numRuns: 200, seed: 13 });
  });

  it('UTC date ranges include exactly the selected calendar days', () => {
    const day = fc.integer({ min: 0, max: 200_000 }).map((n) => new Date(n * 86_400_000).toISOString().slice(0, 10));
    fc.assert(fc.property(day, day, fc.integer({ min: -86_400 * 3, max: 86_400 * 3 }), (from, through, offset) => {
      const range = utcRange(from, through);
      const start = Date.parse(from + 'T00:00:00Z') / 1000;
      const end = Date.parse(through + 'T00:00:00Z') / 1000 + 86_400;
      if (start >= end) {
        expect(range).toBeUndefined();
        return;
      }
      expect(range).toEqual([start, end]);
      const probe = start + offset;
      expect(probe >= range![0] && probe < range![1]).toBe(probe >= start && probe < end);
    }), { numRuns: 2000, seed: 17 });
    for (const bad of ['2026-02-30', '2026-13-01', '0000-01-01', '2026-1-01', '2026-01-01\n', ' 2026-01-01']) {
      expect(utcRange(bad, '')).toBeUndefined();
    }
  });
});
