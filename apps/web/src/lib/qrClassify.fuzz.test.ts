import { encodeMetaAddress, generateKeySet, parseCompressedPoint } from '@ghostpay/core-crypto';
import { encodeMultipart } from '@ghostpay/qr-exchange';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { encryptKeystore } from './keystore';
import { QR_FAMILIES, classifyQrText, type QrClassification } from './qrClassify';

// Fixed seed: failures are reproducible in CI.
const RUNS = { seed: 0x51523031, numRuns: 2000 } as const;
/** Every string a result can contain; an input that is a substring of this vocabulary is trivially "echoed". */
const VOCAB = JSON.stringify([
  ...QR_FAMILIES,
  'empty', 'too-large', 'unsupported-scheme', 'malformed', 'ambiguous', 'unsupported-version', 'unknown-format',
  'family', 'reason', 'format', 'validated', 'version', 'true', 'false',
]);

const PREFIXES = [
  '', 'GPQ1/', 'GPQ2/', '#gpi=v1.', '#gpi=v9.', 'https://app.test/#gpi=v1.', 'http://localhost/#gpi=v1.', 'ethereum:', 'ethereum:pay-',
  'bitcoin:', 'solana:', 'tron:', 'eth:', 'base:', 'st:eth:0x', 'javascript:', 'data:', 'intent:',
  '{"format":"ghostpay-settings","v":', '{"format":"ghostpay-seller-public","v":1,', '{"format":"ghostpay-public-meta","v":1,"metaAddress":"',
  '{"kind":"ghostpay-local-receipt","version":', '{"v":1,"kdf":"scrypt","cipher":"AES-256-GCM","ciphertext":"', '{"signature":"', '[', '{',
];

function assertSafe(text: string, result: QrClassification): void {
  expect(QR_FAMILIES).toContain(result.family);
  if ((result.family === 'unknown' || result.family === 'encrypted-keystore') && text.length > 0 && !VOCAB.includes(text)) {
    const values = Object.values(result).filter((value): value is string => typeof value === 'string').join('\u0001');
    expect(values.includes(text)).toBe(false);
    // Short inputs such as "{" or "a" occur in any JSON; a longer one would only appear if it were echoed.
    if (text.length >= 16) expect(JSON.stringify(result).includes(text)).toBe(false);
  }
  // No result ever carries a string field other than fixed vocabulary and the multipart session id.
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && key !== 'session') expect(VOCAB).toContain(value);
  }
}

const anyText = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 300 }),
  fc.string({ unit: 'grapheme', maxLength: 200 }),
  fc.string({ unit: fc.constantFrom('{', '}', '"', ':', ',', '[', ']', '#', '/', '=', '.', '1', 'v', 'a', ' ', '\n', '\u0000'), maxLength: 120 }),
);

let keystore = '';
let chunk = '';
beforeAll(async () => {
  const pub = (seed: number): Uint8Array => secp256k1.getPublicKey(new Uint8Array(32).fill(seed));
  keystore = await encryptKeystore(
    { spendingKey: new Uint8Array(32).fill(1), viewingKey: new Uint8Array(32).fill(2), signingKey: new Uint8Array(32).fill(3) },
    { metaAddress: encodeMetaAddress({ spendingPublicKey: parseCompressedPoint(pub(1)), viewingPublicKey: parseCompressedPoint(pub(2)) }), signer: bytesToHex(pub(3)) },
    'violet comet maple lantern',
    { N: 1 << 14 },
  );
  chunk = encodeMultipart(utf8ToBytes('fuzz'.repeat(50)))[0]!;
});

describe('classifyQrText properties', () => {
  it('never throws on arbitrary strings, and unknown results never contain the input', () => {
    fc.assert(fc.property(anyText, (text) => { assertSafe(text, classifyQrText(text)); }), RUNS);
  });

  it('never throws on arbitrary text behind every recognised prefix', () => {
    fc.assert(fc.property(fc.constantFrom(...PREFIXES), anyText, (prefix, rest) => {
      const text = prefix + rest;
      assertSafe(text, classifyQrText(text));
    }), RUNS);
  });

  it('never throws on arbitrary JSON values, including ones carrying known discriminators', () => {
    const discriminators = fc.record({
      format: fc.constantFrom('ghostpay-settings', 'ghostpay-seller-public', 'ghostpay-public-meta', 'other'),
      kind: fc.constantFrom('ghostpay-local-receipt', 'x'),
      v: fc.oneof(fc.nat(), fc.string()),
      version: fc.nat(3),
      signature: fc.string(), invoiceDigest: fc.string(), txHash: fc.string(),
      ciphertext: fc.string(), kdf: fc.string(), cipher: fc.string(),
    }, { requiredKeys: [] });
    fc.assert(fc.property(fc.oneof(fc.jsonValue(), discriminators), (value) => {
      const text = JSON.stringify(value) ?? '';
      assertSafe(text, classifyQrText(text));
    }), RUNS);
  });

  it('single-character mutations of a real keystore never leak ciphertext and never decrypt', () => {
    const file = JSON.parse(keystore) as { ciphertext: string; iv: string; kdfParams: { salt: string } };
    fc.assert(fc.property(fc.nat(keystore.length - 1), fc.string({ unit: 'binary', minLength: 0, maxLength: 2 }), (at, insert) => {
      const text = keystore.slice(0, at) + insert + keystore.slice(at + 1);
      const result = classifyQrText(text);
      assertSafe(text, result);
      const out = JSON.stringify(result);
      for (const secret of [file.ciphertext, file.iv, file.kdfParams.salt]) expect(out.includes(secret)).toBe(false);
      expect(['encrypted-keystore', 'unknown']).toContain(result.family);
    }), { ...RUNS, numRuns: 500 });
  });

  it('mutated multipart chunks are either a valid chunk or unknown, never another family', () => {
    fc.assert(fc.property(fc.nat(chunk.length - 1), fc.string({ unit: 'binary', maxLength: 2 }), (at, insert) => {
      const text = chunk.slice(0, at) + insert + chunk.slice(at + 1);
      const result = classifyQrText(text);
      assertSafe(text, result);
      expect(['multipart-fragment', 'unknown']).toContain(result.family);
    }), RUNS);
  });

  it('is deterministic', () => {
    const meta = encodeMetaAddress(generateKeySet());
    fc.assert(fc.property(fc.oneof(anyText, fc.constant(meta), fc.constant(keystore)), (text) => {
      expect(classifyQrText(text)).toEqual(classifyQrText(text));
    }), { ...RUNS, numRuns: 300 });
  });
});
