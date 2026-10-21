import { secp256k1 } from '@noble/curves/secp256k1.js';
import { numberToBytesBE } from '@noble/curves/utils.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  SIGNING_DOMAIN,
  SchemaError,
  SigningError,
  canonicalInvoiceBytes,
  invoiceDigest,
  signInvoice,
  signerPublicKeyHex,
  validateInvoice,
  verifyInvoiceSignature,
  type Invoice,
} from './index.js';
import {
  OTHER_META,
  OTHER_SIGNER,
  OTHER_SIGNING_KEY,
  SIGNER,
  SIGNING_KEY,
  sampleInvoice,
  sampleSigned,
} from './fixtures.testutil.js';

const N = secp256k1.Point.Fn.ORDER;

describe('canonical bytes and digest', () => {
  const inv = sampleInvoice();
  it('canonical form is sorted, whitespace-free JSON', () => {
    const text = new TextDecoder().decode(canonicalInvoiceBytes(inv));
    expect(text.startsWith('{"amountPolicy":{"mode":"fiat_quote"},"chainId":8453,"expiresAt":')).toBe(true);
    expect(text).not.toMatch(/\s(?=[:,{}[\]"])|\n/);
    expect(JSON.parse(text)).toEqual(inv);
  });
  it('is independent of property insertion order', () => {
    const reordered = JSON.parse(
      JSON.stringify(Object.fromEntries(Object.entries(inv).reverse())),
    ) as Invoice;
    expect(canonicalInvoiceBytes(reordered)).toEqual(canonicalInvoiceBytes(inv));
  });
  it('digest is keccak256(domain || canonical)', () => {
    expect(SIGNING_DOMAIN).toBe('GhostPay.Invoice.v1\0');
    const expected = keccak_256(
      concatBytes(utf8ToBytes('GhostPay.Invoice.v1\0'), canonicalInvoiceBytes(inv)),
    );
    expect(invoiceDigest(inv)).toEqual(expected);
  });
  it('NFC text is canonicalized as UTF-8 (2-byte é)', () => {
    const text = canonicalInvoiceBytes(inv);
    expect(bytesToHex(text)).toContain('c3a9'); // é
  });
});

describe('signing', () => {
  it('produces a 64-byte low-s signature that verifies independently', () => {
    const s = sampleSigned();
    expect(s.signature).toMatch(/^[0-9a-f]{128}$/);
    const sig = hexToBytes(s.signature);
    expect(sig.length).toBe(64);
    expect(BigInt(`0x${s.signature.slice(64)}`) <= N / 2n).toBe(true);
    // independent verification straight through noble
    expect(
      secp256k1.verify(sig, invoiceDigest(s.invoice), hexToBytes(SIGNER), { prehash: false, lowS: true }),
    ).toBe(true);
    expect(verifyInvoiceSignature(s)).toBe(true);
  });
  it('is deterministic (RFC 6979)', () => {
    expect(sampleSigned().signature).toBe(sampleSigned().signature);
  });
  it('refuses a signing key that does not match invoice.signer', () => {
    expect(() => signInvoice(sampleInvoice(), OTHER_SIGNING_KEY)).toThrow(SigningError);
  });
  it('refuses invalid keys', () => {
    expect(() => signInvoice(sampleInvoice(), new Uint8Array(32))).toThrow(SigningError);
    expect(() => signerPublicKeyHex(new Uint8Array(5))).toThrow(SigningError);
    expect(signerPublicKeyHex(SIGNING_KEY)).toBe(SIGNER);
  });
  it('signature is domain separated (does not verify over the bare canonical bytes)', () => {
    const s = sampleSigned();
    const bare = keccak_256(canonicalInvoiceBytes(s.invoice));
    expect(secp256k1.verify(hexToBytes(s.signature), bare, hexToBytes(SIGNER), { prehash: false })).toBe(
      false,
    );
  });
  it('a different key signs differently and cross-verification fails', () => {
    const other = signInvoice(sampleInvoice({ signer: OTHER_SIGNER }), OTHER_SIGNING_KEY);
    expect(verifyInvoiceSignature(other)).toBe(true);
    expect(verifyInvoiceSignature({ invoice: sampleInvoice(), signature: other.signature })).toBe(false);
  });
});

describe('signature rejection', () => {
  const good = sampleSigned();
  it('rejects high-s (malleated) signatures', () => {
    const r = good.signature.slice(0, 64);
    const s = BigInt(`0x${good.signature.slice(64)}`);
    const high = bytesToHex(numberToBytesBE(N - s, 32));
    expect(verifyInvoiceSignature({ invoice: good.invoice, signature: r + high })).toBe(false);
  });
  it('rejects malformed signatures without throwing', () => {
    for (const sig of [
      '',
      'zz',
      good.signature.toUpperCase(),
      good.signature.slice(2),
      good.signature + '00',
      '0'.repeat(128),
      'f'.repeat(128),
    ]) {
      expect(verifyInvoiceSignature({ invoice: good.invoice, signature: sig })).toBe(false);
    }
  });
  it('flipping any single signature bit invalidates it', () => {
    const bytes = hexToBytes(good.signature);
    for (let bit = 0; bit < 512; bit += 5) {
      const copy = Uint8Array.from(bytes);
      copy[bit >> 3] = (copy[bit >> 3] as number) ^ (1 << (bit & 7));
      expect(verifyInvoiceSignature({ invoice: good.invoice, signature: bytesToHex(copy) })).toBe(false);
    }
  });
  it('invalid invoices throw SchemaError rather than verifying', () => {
    expect(() =>
      verifyInvoiceSignature({ invoice: { ...good.invoice, chainId: 0 }, signature: good.signature }),
    ).toThrow(SchemaError);
  });
});

describe('tamper: every field flip invalidates the signature', () => {
  const good = sampleSigned();
  const clone = (): Record<string, unknown> =>
    structuredClone(good.invoice) as unknown as Record<string, unknown>;

  function leafPaths(v: unknown, prefix = ''): string[] {
    if (Array.isArray(v)) return v.flatMap((x, i) => leafPaths(x, `${prefix}[${i}]`));
    if (typeof v === 'object' && v !== null) {
      return Object.entries(v).flatMap(([k, x]) => leafPaths(x, prefix === '' ? k : `${prefix}.${k}`));
    }
    return [prefix];
  }
  function setPath(o: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let cur: Record<string, unknown> = o;
    for (const p of parts.slice(0, -1)) cur = cur[p] as Record<string, unknown>;
    cur[parts[parts.length - 1] as string] = value;
  }

  /** v and schemeId are pinned to 1 by the schema, so a flip is a schema error, tested below. */
  const PINNED = new Set(['v', 'schemeId']);
  const flips: Record<string, unknown> = {
    chainId: 8454,
    metaAddress: OTHER_META,
    nonce: '0'.repeat(32),
    'fiat.currency': 'EUR',
    'fiat.minorUnits': '12346',
    token: 'native',
    'amountPolicy.mode': { mode: 'fixed_token', tokenAmount: '1' }, // replaces the whole policy object
    'quote.source': 'other-source',
    'quote.timestamp': 1_799_999_999,
    'quote.expiresAt': 1_800_000_601,
    'quote.maxSlippageBps': 51,
    expiresAt: 1_800_003_601,
    'lineItems[0].description': 'Consulting, 3 hours',
    'lineItems[0].quantity': '3',
    'lineItems[0].unitMinorUnits': '5001',
    'lineItems[1].description': 'Cafe',
    'lineItems[1].quantity': '2',
    'lineItems[1].unitMinorUnits': '2001',
    'tax.rateBps': 501,
    'tax.minorUnits': '346',
    feePolicy: 'payer_pays',
    memo: 'Thanks! Ref #43',
    signer: OTHER_SIGNER,
  };

  it('covers every leaf of the sample invoice', () => {
    const leaves = leafPaths(good.invoice).filter((p) => !PINNED.has(p));
    expect(Object.keys(flips).sort()).toEqual(leaves.sort());
  });
  for (const [path, value] of Object.entries(flips)) {
    it(`flip ${path}`, () => {
      const o = clone();
      if (path === 'amountPolicy.mode') o['amountPolicy'] = value;
      else setPath(o, path, value);
      const mutated = validateInvoice(o);
      expect(mutated).not.toEqual(good.invoice);
      expect(verifyInvoiceSignature({ invoice: mutated, signature: good.signature })).toBe(false);
    });
  }
  it('v and schemeId cannot be flipped (schema rejects)', () => {
    for (const k of ['v', 'schemeId']) {
      const o = clone();
      o[k] = 2;
      expect(() => validateInvoice(o)).toThrow(SchemaError);
    }
  });
  it('structural edits: drop/add memo, reorder, drop and add line items', () => {
    const variants: Array<(o: Record<string, unknown>) => void> = [
      (o) => {
        delete o['memo'];
      },
      (o) => {
        o['lineItems'] = (o['lineItems'] as unknown[]).slice().reverse();
      },
      (o) => {
        o['lineItems'] = (o['lineItems'] as unknown[]).slice(1);
      },
      (o) => {
        o['lineItems'] = [
          ...(o['lineItems'] as unknown[]),
          { description: 'x', quantity: '1', unitMinorUnits: '1' },
        ];
      },
      (o) => {
        o['lineItems'] = [];
      },
    ];
    for (const f of variants) {
      const o = clone();
      f(o);
      expect(verifyInvoiceSignature({ invoice: validateInvoice(o), signature: good.signature })).toBe(false);
    }
    const noMemo = sampleSigned({ memo: undefined } as never);
    expect('memo' in noMemo.invoice).toBe(false);
    const withMemo = clone();
    withMemo['memo'] = 'added';
    expect(verifyInvoiceSignature({ invoice: validateInvoice(withMemo), signature: noMemo.signature })).toBe(
      false,
    );
  });
  it('fixed_token amount flip invalidates', () => {
    const s = sampleSigned({ amountPolicy: { mode: 'fixed_token', tokenAmount: '1000' } });
    const o = structuredClone(s.invoice) as unknown as Record<string, unknown>;
    o['amountPolicy'] = { mode: 'fixed_token', tokenAmount: '1001' };
    expect(verifyInvoiceSignature({ invoice: validateInvoice(o), signature: s.signature })).toBe(false);
  });
});
