import { bytesToHex } from '@noble/hashes/utils.js';
import { grossForNet, routerNet } from '@ghostpay/chain-adapters';
import { invoiceDigest } from '@ghostpay/invoice-schema';
import { describe, expect, it } from 'vitest';
import type { ReconciliationRecord } from './reconciliationLedger';
import {
  MATCH_CLOCK_SKEW_MS,
  MATCH_LATE_GRACE_MS,
  proposeInvoiceMatch,
  registrationFromInvoice,
  validateRegisteredInvoice,
  type RegisteredInvoice,
} from './reconciliationMatch';
import { NOW, USDC, testInvoice } from './reconciliationMatch.testutil';

const sellerKeyId = 'a'.repeat(64);
function rec(n: number, overrides: Partial<ReconciliationRecord> = {}): ReconciliationRecord {
  const tx = `0x${n.toString(16).padStart(64, '0')}`;
  const base = {
    version: 1 as const,
    sellerKeyId,
    chainId: 84532,
    transactionHash: tx,
    blockHash: `0x${'c'.repeat(64)}`,
    blockNumber: '100',
    stealthAddress: `0x${'d'.repeat(40)}`,
    logIndex: 0,
    asset: 'native',
    amountMinorUnits: routerNet(1_000_000n).toString(),
    viewTagMatched: true,
    recordedAt: (NOW + 60) * 1000,
    evidenceStatus: 'verified-at-scan' as const,
    evidenceSource: 'verified-router-scan' as const,
    ...overrides,
  };
  return { ...base, id: `${sellerKeyId}:${base.chainId}:${tx}:${base.stealthAddress}:${base.blockHash}:${base.logIndex}` };
}

describe('invoice registration', () => {
  it('keeps only matching fields and computes the exact router net for both fee policies', () => {
    const invoice = testInvoice();
    const reg = registrationFromInvoice(invoice, 5);
    expect(reg).toEqual({
      version: 1,
      invoiceDigest: `0x${bytesToHex(invoiceDigest(invoice))}`,
      nonce: invoice.nonce,
      chainId: 84532,
      asset: 'native',
      expectedNetMinorUnits: routerNet(1_000_000n).toString(),
      createdAt: NOW,
      expiresAt: NOW + 3600,
      registeredAt: 5,
    });
    expect(JSON.stringify(reg)).not.toMatch(/consulting|memo|st:eth/);
    const payer = registrationFromInvoice(testInvoice({ feePolicy: 'payer_pays', token: USDC }), 5);
    expect(payer.expectedNetMinorUnits).toBe(routerNet(grossForNet(1_000_000n)).toString());
    expect(payer.asset).toBe(USDC);
  });

  it('refuses fiat-quoted invoices whose paid amount is not known in advance', () => {
    expect(() => registrationFromInvoice(testInvoice({ amountPolicy: { mode: 'fiat_quote' }, fiat: { currency: 'USD', minorUnits: '100' } }))).toThrow(/fixed token amount/);
  });

  it('validates stored registrations strictly', () => {
    const good = registrationFromInvoice(testInvoice(), 5);
    expect(validateRegisteredInvoice(good)).toBe(good);
    const bad: unknown[] = [
      null,
      [],
      Object.create(null) as unknown,
      { ...good, extra: 1 },
      { ...good, version: 2 },
      { ...good, invoiceDigest: '0xAB' },
      { ...good, nonce: 'zz' },
      { ...good, chainId: 0 },
      { ...good, asset: 'USDC' },
      { ...good, expectedNetMinorUnits: '0' },
      { ...good, expectedNetMinorUnits: (1n << 256n).toString() },
      { ...good, createdAt: 0 },
      { ...good, expiresAt: good.createdAt },
      { ...good, registeredAt: 0 },
    ];
    for (const value of bad) expect(() => validateRegisteredInvoice(value)).toThrow();
  });
});

describe('local invoice matching', () => {
  const invoice = registrationFromInvoice(testInvoice(), 1);
  const other = registrationFromInvoice(testInvoice(), 1);

  it('proposes a unique pairing as exact', () => {
    expect(proposeInvoiceMatch(rec(1), [invoice], [rec(1)])).toEqual({ kind: 'exact', invoice });
  });

  it('returns none for mismatched chain, asset, amount, early observation or no invoices', () => {
    expect(proposeInvoiceMatch(rec(1), [], []).kind).toBe('none');
    expect(proposeInvoiceMatch(rec(1, { chainId: 1 }), [invoice], []).kind).toBe('none');
    expect(proposeInvoiceMatch(rec(1, { asset: USDC }), [invoice], []).kind).toBe('none');
    expect(proposeInvoiceMatch(rec(1, { amountMinorUnits: '1000000' }), [invoice], []).kind).toBe('none');
    expect(proposeInvoiceMatch(rec(1, { recordedAt: NOW * 1000 - MATCH_CLOCK_SKEW_MS - 1 }), [invoice], []).kind).toBe('none');
    expect(proposeInvoiceMatch(rec(1, { recordedAt: NOW * 1000 - MATCH_CLOCK_SKEW_MS }), [invoice], []).kind).toBe('exact');
  });

  it('never proposes for invalidated, annotated or imported observations', () => {
    expect(proposeInvoiceMatch(rec(1, { evidenceStatus: 'invalidated-after-reorg' }), [invoice], []).kind).toBe('none');
    expect(proposeInvoiceMatch(rec(1, { invoiceDigest: other.invoiceDigest }), [invoice], []).kind).toBe('none');
    expect(proposeInvoiceMatch({ ...rec(1), provenance: 'imported-history' }, [invoice], []).kind).toBe('none');
    expect(proposeInvoiceMatch({ ...rec(1), provenance: 'live-scan' }, [invoice], []).kind).toBe('exact');
  });

  it('marks two candidate invoices as ambiguous', () => {
    expect(proposeInvoiceMatch(rec(1), [invoice, other], [])).toEqual({ kind: 'ambiguous', candidates: [invoice, other], reason: 'multiple-invoices' });
  });

  it('marks two candidate payments for one invoice as ambiguous', () => {
    expect(proposeInvoiceMatch(rec(1), [invoice], [rec(1), rec(2)])).toMatchObject({ kind: 'ambiguous', reason: 'multiple-payments' });
    // Invalidated, annotated or imported competitors do not create ambiguity.
    const ctx = [rec(2, { evidenceStatus: 'invalidated-after-reorg' }), { ...rec(3), provenance: 'imported-history' as const }];
    expect(proposeInvoiceMatch(rec(1), [invoice], ctx).kind).toBe('exact');
  });

  it('does not offer an invoice already linked to a current verified observation', () => {
    expect(proposeInvoiceMatch(rec(1), [invoice], [rec(2, { invoiceDigest: invoice.invoiceDigest })]).kind).toBe('none');
    // After a reorg invalidates the linked observation, the invoice is open again.
    const invalidated = rec(2, { invoiceDigest: invoice.invoiceDigest, evidenceStatus: 'invalidated-after-reorg' });
    expect(proposeInvoiceMatch(rec(1), [invoice], [invalidated]).kind).toBe('exact');
  });

  it('downgrades observations recorded long after expiry to ambiguous', () => {
    const late = rec(1, { recordedAt: (NOW + 3600) * 1000 + MATCH_LATE_GRACE_MS + 1 });
    expect(proposeInvoiceMatch(late, [invoice], [])).toMatchObject({ kind: 'ambiguous', reason: 'late-observation' });
    const edge = rec(1, { recordedAt: (NOW + 3600) * 1000 + MATCH_LATE_GRACE_MS });
    expect(proposeInvoiceMatch(edge, [invoice], []).kind).toBe('exact');
  });

  it('deduplicates the context by observation identity', () => {
    const updated = rec(1, { recordedAt: (NOW + 120) * 1000 });
    expect(proposeInvoiceMatch(updated, [invoice], [rec(1)]).kind).toBe('exact');
  });

  it('ignores invoices typed as registrations from other chains', () => {
    const foreign: RegisteredInvoice = { ...invoice, chainId: 1 };
    expect(proposeInvoiceMatch(rec(1), [foreign], []).kind).toBe('none');
  });
});
