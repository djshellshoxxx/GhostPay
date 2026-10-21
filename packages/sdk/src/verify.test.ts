import { parseFragment, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { describe, expect, it } from 'vitest';
import { buildInvoice, encodeInvoiceLink, signInvoiceWith } from './builder.js';
import { SdkInvoiceError } from './errors.js';
import { NOW, SIGNER, SIGNING_KEY, input, testRng } from './fixtures.testutil.js';
import { TEST_MEMO_PREFIX, verifyFragment, verifyInvoice, type WarningCode } from './verify.js';

async function parsedFor(over = {}, pinned: string[] = [], encrypt = false): Promise<ParsedInvoice> {
  const signed = signInvoiceWith(buildInvoice(input(over), testRng()), SIGNING_KEY);
  const frag = await encodeInvoiceLink(signed, { encrypt, rng: testRng() });
  return parseFragment(frag, { pinnedSigners: pinned });
}
const codes = (v: { warnings: readonly { code: WarningCode }[] }): WarningCode[] => v.warnings.map((w) => w.code);

describe('verifyInvoice verdict matrix', () => {
  it('valid, unpinned, live chain: ok with unpinned-signer warning, never "verified seller"', async () => {
    const v = verifyInvoice(await parsedFor(), { nowSeconds: NOW + 10 });
    expect(v.ok).toBe(true);
    expect(v.signature).toBe('valid');
    expect(v.trust).toBe('valid-signature');
    expect(v.mayShowVerifiedSeller).toBe(false);
    expect(v.secondsRemaining).toBe(3590);
    expect(v.test).toBe(false);
    expect(codes(v)).toEqual(['unpinned-signer', 'unencrypted-private-part']);
    expect(v.blockers).toEqual([]);
  });
  it('pinned signer is trusted-seller, no unpinned warning; encrypted drops the private-part note', async () => {
    const v = verifyInvoice(await parsedFor({}, [SIGNER], true), { nowSeconds: NOW });
    expect(v.trust).toBe('trusted-seller');
    expect(v.mayShowVerifiedSeller).toBe(true);
    expect(codes(v)).toEqual([]);
  });
  it('pin set that does not contain the signer stays untrusted', async () => {
    const v = verifyInvoice(await parsedFor({}, [`02${'11'.repeat(32)}`]), { nowSeconds: NOW });
    expect(v.trust).toBe('valid-signature');
  });
  it('invalid signature blocks and can never be trusted even if pinned flag is forged', async () => {
    const good = await parsedFor();
    const forged: ParsedInvoice = { ...good, verification: { signatureValid: false, signerPinned: true }, trust: 'trusted-seller' };
    const v = verifyInvoice(forged, { nowSeconds: NOW });
    expect(v.ok).toBe(false);
    expect(v.signature).toBe('invalid');
    expect(v.trust).toBe('invalid-signature');
    expect(v.mayShowVerifiedSeller).toBe(false);
    expect(v.blockers).toEqual(['invalid-signature']);
  });
  it('expiry is exclusive at the boundary', async () => {
    const p = await parsedFor();
    expect(verifyInvoice(p, { nowSeconds: NOW + 3599 }).expired).toBe(false);
    const at = verifyInvoice(p, { nowSeconds: NOW + 3600 });
    expect(at.expired).toBe(true);
    expect(at.ok).toBe(false);
    expect(at.blockers).toEqual(['invoice-expired']);
    expect(codes(at)).not.toContain('expires-soon');
    expect(at.secondsRemaining).toBe(0);
  });
  it('quote expiry and expires-soon are warnings, not blockers', async () => {
    const p = await parsedFor();
    const q = verifyInvoice(p, { nowSeconds: NOW + 600 });
    expect(q.ok).toBe(true);
    expect(q.quoteExpired).toBe(true);
    expect(codes(q)).toContain('quote-expired');
    const soon = verifyInvoice(p, { nowSeconds: NOW + 3301 });
    expect(codes(soon)).toContain('expires-soon');
    expect(soon.ok).toBe(true);
    expect(codes(verifyInvoice(p, { nowSeconds: NOW + 3300 }))).not.toContain('expires-soon');
  });
  it('chain mismatch blocks', async () => {
    const p = await parsedFor();
    expect(verifyInvoice(p, { nowSeconds: NOW, expectedChainId: 8453 }).ok).toBe(true);
    const v = verifyInvoice(p, { nowSeconds: NOW, expectedChainId: 1 });
    expect(v.blockers).toEqual(['chain-mismatch']);
  });
  it('test invoices: blocked in live mode, allowed in test mode, live blocked in test mode', async () => {
    const t = await parsedFor({ chainId: 31337, memo: `${TEST_MEMO_PREFIX}x` });
    const live = verifyInvoice(t, { nowSeconds: NOW });
    expect(live.test).toBe(true);
    expect(live.blockers).toEqual(['test-invoice-in-live-mode']);
    const test = verifyInvoice(t, { nowSeconds: NOW, mode: 'test' });
    expect(test.ok).toBe(true);
    expect(verifyInvoice(t, { nowSeconds: NOW, mode: 'any' }).ok).toBe(true);
    const l = await parsedFor();
    expect(verifyInvoice(l, { nowSeconds: NOW, mode: 'test' }).blockers).toEqual(['live-invoice-in-test-mode']);
  });
  it('reserved chain id without marker (or marker on live chain) is flagged, not trusted as test', async () => {
    const stripped = verifyInvoice(await parsedFor({ chainId: 31399, memo: 'plain' }), { nowSeconds: NOW, mode: 'test' });
    expect(stripped.test).toBe(false);
    expect(codes(stripped)).toContain('test-chain-without-marker');
    const fake = verifyInvoice(await parsedFor({ memo: `${TEST_MEMO_PREFIX}x` }), { nowSeconds: NOW });
    expect(fake.test).toBe(false);
    expect(fake.ok).toBe(true);
    expect(verifyInvoice(await parsedFor({ chainId: 31400 }), { nowSeconds: NOW }).ok).toBe(true);
    expect(verifyInvoice(await parsedFor({ chainId: 31336 }), { nowSeconds: NOW }).ok).toBe(true);
  });
  it('bad clock input throws a typed SDK error', async () => {
    const p = await parsedFor();
    for (const bad of [-1, 1.5, NaN, Infinity]) expect(() => verifyInvoice(p, { nowSeconds: bad })).toThrow(SdkInvoiceError);
  });
  it('invoice without memo or line items works', async () => {
    const v = verifyInvoice(await parsedFor({ lineItems: [] }), { nowSeconds: NOW });
    expect(codes(v)).toEqual(['unpinned-signer']);
  });
});

describe('verifyFragment', () => {
  it('roundtrip with pinned signer', async () => {
    const signed = signInvoiceWith(buildInvoice(input(), testRng()), SIGNING_KEY);
    const frag = await encodeInvoiceLink(signed);
    const r = await verifyFragment(frag, { nowSeconds: NOW, pinnedSigners: [SIGNER] });
    expect(r.parsed).toBe(true);
    if (r.parsed) {
      expect(r.verdict.trust).toBe('trusted-seller');
      expect(r.invoice.fiat.minorUnits).toBe('12345');
    }
    const nopin = await verifyFragment(frag, { nowSeconds: NOW });
    expect(nopin.parsed && nopin.verdict.trust).toBe('valid-signature');
  });
  it('garbage and tampered fragments return parsed:false with a code and no verdict', async () => {
    const signed = signInvoiceWith(buildInvoice(input(), testRng()), SIGNING_KEY);
    const frag = await encodeInvoiceLink(signed);
    const mid = Math.floor(frag.length / 2);
    const tampered = frag.slice(0, mid) + (frag[mid] === 'A' ? 'B' : 'A') + frag.slice(mid + 1);
    for (const bad of ['', 'nonsense', '#gpi=v1.@@@', tampered, `#gpi=v1.${'A'.repeat(30_000)}`]) {
      const r = await verifyFragment(bad, { nowSeconds: NOW });
      expect(r.parsed).toBe(false);
      expect(r.verdict).toBeUndefined();
      if (!r.parsed) expect(r.invoiceCode).toMatch(/^[A-Z0-9_]+$/);
    }
  });
  it('unexpected failures map to UNKNOWN', async () => {
    const signed = signInvoiceWith(buildInvoice(input(), testRng()), SIGNING_KEY);
    const frag = await encodeInvoiceLink(signed);
    const evil = { includes: () => { throw new Error('boom'); }, length: 1 } as unknown as readonly string[];
    const r = await verifyFragment(frag, { nowSeconds: NOW, pinnedSigners: evil });
    expect(r).toEqual({ parsed: false, invoiceCode: 'UNKNOWN', verdict: undefined });
  });
});
