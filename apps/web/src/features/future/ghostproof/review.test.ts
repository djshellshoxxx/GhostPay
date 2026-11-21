import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_RECEIPT_JSON_BYTES, signReceipt, type ReceiptInvoiceBinding } from '@ghostpay/invoice-schema';
import { MAX_RECEIPT_CHARS } from '@ghostpay/ux-receipts';
import { reviewReceipt, UNSUPPORTED_RECEIPT_CLAIMS, type ReceiptReviewOptions } from './review';
import { BINDING, digestText, NOW, options, OTHER_SIGNER, SIGNED, SIGNED_TEXT, signedText, successful } from './fixtures.testutil';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('offline receipt assurance', () => {
  it('checks a real digest without claiming a signature, identity, invoice or payment', async () => {
    const review = successful(await reviewReceipt(await digestText(), options()));
    expect(review).toMatchObject({ format: 'digest-receipt-v1', assurance: 'self_consistent_unverified',
      signerTrust: 'not-present', invoiceBinding: 'not-checked', invoiceAuthentication: 'not-checked', chain: 'not-checked', freshness: 'unknown' });
    expect(review.caveats).toContain('digest-not-signature');
    expect(review.caveats).toContain('statement-not-payment-evidence');
    expect(review.fields).toContainEqual({ name: 'amount', value: '1500000' });
    expect(review.fields).toContainEqual({ name: 'asset.decimals', value: '6' });
    expect(review.unsupportedClaims).toEqual(UNSUPPORTED_RECEIPT_CLAIMS);
  });

  it('previews exactly disclosed fields without reconstructing withheld history', async () => {
    const review = successful(await reviewReceipt(await digestText('minimal'), options()));
    expect(review.fields.map(field => field.name)).toEqual(['type', 'v', 'createdAt', 'redacted', 'digest.alg', 'digest.hex']);
    expect(JSON.stringify(review)).not.toContain('Lunch split');
    expect(JSON.stringify(review)).not.toContain(SIGNED.txHash);
    expect(JSON.stringify(review)).not.toContain('1500000');
    expect(Object.isFrozen(review)).toBe(true);
    expect(Object.isFrozen(review.fields)).toBe(true);
    expect(Object.isFrozen(review.fields[0])).toBe(true);
    expect(Object.isFrozen(review.caveats)).toBe(true);
    expect(() => { (review.fields as unknown as string[]).push('unselected'); }).toThrow();
  });

  it('verifies a real signature but leaves the embedded signer untrusted', async () => {
    const review = successful(await reviewReceipt(SIGNED_TEXT, options({ claim: 'signed-statement' })));
    expect(review).toMatchObject({ format: 'signed-receipt-v1', assurance: 'signed_statement', signerTrust: 'embedded-key-only',
      invoiceBinding: 'not-checked', invoiceAuthentication: 'not-checked', chain: 'not-checked', freshness: 'unknown' });
    expect(review.caveats).toContain('embedded-key-not-identity');
    expect(review.fields).toHaveLength(10);
    expect(Object.fromEntries(review.fields.map(field => [field.name, field.value]))).toEqual(
      Object.fromEntries(Object.entries(SIGNED).map(([name, value]) => [name, String(value)])),
    );
  });

  it('binds verified invoice context without turning its key into an independently trusted identity', async () => {
    const review = successful(await reviewReceipt(SIGNED_TEXT, options({ invoiceBinding: BINDING, claim: 'invoice-bound-statement' })));
    expect(review).toMatchObject({ signerTrust: 'invoice-signing-key', invoiceBinding: 'matched', invoiceAuthentication: 'caller-verified',
      assurance: 'signed_statement', chain: 'not-checked', freshness: 'unknown' });
    expect(review.caveats).toContain('invoice-key-not-identity');
    expect(review.caveats).not.toContain('invoice-not-checked');
  });

  it('keeps explicit key trust distinct from invoice authentication', async () => {
    const review = successful(await reviewReceipt(SIGNED_TEXT, options({ invoiceBinding: {
      ...BINDING, invoiceSignatureValid: false, trustedSignerPublicKey: ` ${SIGNED.signerPublicKey.toUpperCase()} `,
    } })));
    expect(review.signerTrust).toBe('explicitly-trusted-key');
    expect(review.invoiceAuthentication).toBe('not-verified');
    expect(review.caveats).toContain('trusted-key-is-caller-supplied');
    expect(review.chain).toBe('not-checked');
  });

  it('rejects a wrong pin even when the invoice signing key matches', async () => {
    expect(await reviewReceipt(SIGNED_TEXT, options({ invoiceBinding: { ...BINDING, trustedSignerPublicKey: OTHER_SIGNER } })))
      .toEqual({ ok: false, code: 'BINDING_MISMATCH' });
    expect(await reviewReceipt(SIGNED_TEXT, options({ invoiceBinding: { ...BINDING, invoiceSignatureValid: false } })))
      .toEqual({ ok: false, code: 'BINDING_MISMATCH' });
  });

  it.each([
    ['invoiceDigest', `0x${'d'.repeat(64)}`], ['chainId', 1], ['asset', `0x${'d'.repeat(40)}`],
    ['amountMinorUnits', '1001'], ['txHash', `0x${'d'.repeat(64)}`], ['stealthAddress', `0x${'d'.repeat(40)}`],
  ])('rejects signed statements against mismatched %s', async (name, value) => {
    expect(await reviewReceipt(SIGNED_TEXT, options({ invoiceBinding: { ...BINDING, [name]: value } })))
      .toEqual({ ok: false, code: 'BINDING_MISMATCH' });
  });

  it('cannot silently apply invoice trust or signature claims to a digest', async () => {
    const text = await digestText();
    expect(await reviewReceipt(text, options({ invoiceBinding: BINDING }))).toEqual({ ok: false, code: 'BINDING_UNAVAILABLE' });
    expect(await reviewReceipt(text, options({ claim: 'signed-statement' }))).toEqual({ ok: false, code: 'UNSUPPORTED_CLAIM' });
    expect(await reviewReceipt(SIGNED_TEXT, options({ claim: 'invoice-bound-statement' }))).toEqual({ ok: false, code: 'BINDING_REQUIRED' });
  });

  it.each(UNSUPPORTED_RECEIPT_CLAIMS)('keeps unsupported claim %s unavailable', async claim => {
    expect(await reviewReceipt(SIGNED_TEXT, options({ claim }))).toEqual({ ok: false, code: 'UNSUPPORTED_CLAIM' });
  });

  it('makes no network request and does not accept an injected chain verifier', async () => {
    const fetch = vi.fn(() => { throw new Error('Network must stay unused'); });
    const lookup = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await reviewReceipt(await digestText(), options())).ok).toBe(true);
    expect((await reviewReceipt(SIGNED_TEXT, options())).ok).toBe(true);
    expect(await reviewReceipt(SIGNED_TEXT, { ...options(), verifier: { lookup } } as ReceiptReviewOptions))
      .toEqual({ ok: false, code: 'INVALID_CONTEXT' });
    expect(fetch).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('bounded untrusted receipt input', () => {
  it.each([null, 1, {}, false])('requires serialized text', async value => {
    expect(await reviewReceipt(value, options())).toEqual({ ok: false, code: 'MALFORMED' });
  });

  it.each(['', '{', '{"version":1,"version":1}', '{"x":{"y":{"z":{"a":{"b":{"c":{"d":{"e":1}}}}}}}}'])(
  'rejects malformed, duplicate and over-deep JSON', async text => {
    expect(await reviewReceipt(text, options())).toEqual({ ok: false, code: 'MALFORMED' });
  });

  it.each(['[]', 'null', '{}', '{"schema":"ghostpay.proof-package/1"}', '{"type":"other-receipt"}'])(
  'rejects unknown receipt or proof formats', async text => {
    expect(await reviewReceipt(text, options())).toEqual({ ok: false, code: 'UNSUPPORTED_FORMAT' });
  });

  it('enforces the signed byte cap and the tighter digest character cap', async () => {
    expect((await reviewReceipt(SIGNED_TEXT.padEnd(MAX_RECEIPT_JSON_BYTES, ' '), options())).ok).toBe(true);
    expect(await reviewReceipt(SIGNED_TEXT.padEnd(MAX_RECEIPT_JSON_BYTES + 1, ' '), options())).toEqual({ ok: false, code: 'TOO_LARGE' });
    expect(await reviewReceipt('é'.repeat(40_000), options())).toEqual({ ok: false, code: 'TOO_LARGE' });
    expect(await reviewReceipt((await digestText()).padEnd(MAX_RECEIPT_CHARS + 1, ' '), options())).toEqual({ ok: false, code: 'TOO_LARGE' });
  });

  it('rejects changed signed data, missing fields and extra fields without echoing their values', async () => {
    for (const text of [signedText({ amountMinorUnits: '1001' }), signedText({ signature: '0'.repeat(128) }),
      signedText({ version: 2 } as unknown as Partial<typeof SIGNED>), JSON.stringify({ ...SIGNED, secret: 'private-test-marker' }),
      JSON.stringify({ ...SIGNED, signature: undefined })]) {
      const result = await reviewReceipt(text, options());
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('private-test-marker');
      expect(JSON.stringify(result)).not.toContain(SIGNED.invoiceDigest);
    }
  });

  it('rejects a modified digest and unknown digest fields', async () => {
    const text = await digestText();
    expect(await reviewReceipt(text.replace('Lunch split', 'Changed memo'), options())).toEqual({ ok: false, code: 'INVALID_RECEIPT' });
    expect(text.startsWith('{')).toBe(true);
    const withUnknownField = '{"audience":"unexpected",' + text.slice(1);
    expect(await reviewReceipt(withUnknownField, options())).toEqual({ ok: false, code: 'INVALID_RECEIPT' });
  });

  it('rejects future-dated receipts while retaining explicit freshness unknown for old receipts', async () => {
    expect(await reviewReceipt(SIGNED_TEXT, options({ nowMs: NOW - 300_001 }))).toEqual({ ok: false, code: 'INVALID_RECEIPT' });
    expect(successful(await reviewReceipt(SIGNED_TEXT, options({ nowMs: NOW + 86_400_000 }))).freshness).toBe('unknown');
    expect(await reviewReceipt(await digestText(), options({ nowMs: 0 }))).toEqual({ ok: false, code: 'INVALID_RECEIPT' });
  });

  it.each([Number.NaN, Infinity, -1, 0.5, 8_640_000_000_000_001])('rejects invalid verification clocks', async nowMs => {
    expect(await reviewReceipt(SIGNED_TEXT, options({ nowMs }))).toEqual({ ok: false, code: 'INVALID_CONTEXT' });
  });

  it.each([
    { invoiceSignatureValid: 'true' }, { chainId: 0 }, { amountMinorUnits: '01' },
    { amountMinorUnits: (1n << 256n).toString() }, { invoiceDigest: 'bad' }, { asset: 'ETH' },
    { invoiceSignerPublicKey: 'bad' }, { trustedSignerPublicKey: 'bad' }, { txHash: 'bad' },
    { stealthAddress: 'bad' }, { audience: 'unexpected' },
  ])('rejects malformed expected invoice context', async change => {
    expect(await reviewReceipt(SIGNED_TEXT, options({ invoiceBinding: { ...BINDING, ...change } as ReceiptInvoiceBinding })))
      .toEqual({ ok: false, code: 'INVALID_CONTEXT' });
  });

  it.each(['\n', '\r', '\r\n', '\u2028', '\u2029'])(
    'requires complete canonical invoice-binding strings with terminator %j', async terminator => {
      const canonicalFields = {
        invoiceDigest: SIGNED.invoiceDigest, asset: SIGNED.stealthAddress,
        amountMinorUnits: SIGNED.amountMinorUnits, invoiceSignerPublicKey: SIGNED.signerPublicKey,
        txHash: SIGNED.txHash, stealthAddress: SIGNED.stealthAddress,
      };
      for (const [name, value] of Object.entries(canonicalFields)) {
        expect(await reviewReceipt(SIGNED_TEXT, options({ invoiceBinding: { ...BINDING, [name]: value + terminator } })))
          .toEqual({ ok: false, code: 'INVALID_CONTEXT' });
      }
    },
  );

  it('rejects absent runtime options, unavailable digest verification and cancelled operations', async () => {
    expect(await reviewReceipt(SIGNED_TEXT, undefined as unknown as ReceiptReviewOptions)).toEqual({ ok: false, code: 'INVALID_CONTEXT' });
    const text = await digestText();
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('private-provider-detail'));
    expect(await reviewReceipt(text, options())).toEqual({ ok: false, code: 'VERIFIER_UNAVAILABLE' });
    const controller = new AbortController();
    controller.abort();
    expect(await reviewReceipt(SIGNED_TEXT, options({ signal: controller.signal }))).toEqual({ ok: false, code: 'CANCELLED' });
  });

  it('does not confuse an authenticated statement with current chain settlement', async () => {
    const receipt = signReceipt({
      invoiceDigest: SIGNED.invoiceDigest, chainId: SIGNED.chainId, txHash: SIGNED.txHash,
      stealthAddress: SIGNED.stealthAddress, asset: SIGNED.asset, amountMinorUnits: '5000', issuedAt: NOW / 1000,
    }, Uint8Array.from([...new Array<number>(31).fill(0), 9]));
    const review = successful(await reviewReceipt(JSON.stringify(receipt), options()));
    expect(review.assurance).toBe('signed_statement');
    expect(review.chain).toBe('not-checked');
    expect(review.caveats).toContain('statement-not-payment-evidence');
  });
});
