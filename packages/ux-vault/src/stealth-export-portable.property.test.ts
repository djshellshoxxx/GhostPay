import { readFileSync } from 'node:fs';
import { addressOfSecret } from '@ghostpay/chain-adapters';
import { CURVE_ORDER, deriveStealthPayment, encodeMetaAddress, generateKeySet, parseCompressedPoint, secretScalarFromBytes, unsafeRevealSecret, type SecretScalar } from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createStealthExportApi, PortableVaultError, type StealthPublicRecord } from './portable.js';

interface Vectors {
  readonly passphrase: string;
  readonly files: { readonly public: { readonly text: string }; readonly archive: { readonly text: string }; readonly master: { readonly text: string } };
}
const V = JSON.parse(readFileSync(new URL('../../../test-vectors/stealth-export.json', import.meta.url), 'utf8')) as Vectors;
const api = createStealthExportApi();

const hex = (bytes: Uint8Array): string => `0x${bytesToHex(bytes)}`;
const scalarBytes = (k: bigint): Uint8Array => hexToBytes(k.toString(16).padStart(64, '0'));
const reveal = (s: SecretScalar): string => hex(unsafeRevealSecret(s));

const arbScalar = fc.bigInt({ min: 1n, max: CURVE_ORDER - 1n });
const arbBytes = (n: number): fc.Arbitrary<string> => fc.uint8Array({ minLength: n, maxLength: n }).map(hex);
/** Whole seconds in years 0000-9999, the RFC 3339 range the formats accept. */
const arbTime = fc.integer({ min: -62_167_219_200, max: 253_402_300_799 }).map((s) => `${new Date(s * 1000).toISOString().slice(0, 19)}Z`);

const arbRecord: fc.Arbitrary<{ record: StealthPublicRecord; key: string }> = fc.record({
  k: arbScalar, eph: arbScalar, chainId: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), tag: arbBytes(1), blockHash: arbBytes(32),
  blockNumber: fc.bigInt({ min: 0n, max: (1n << 64n) - 1n }), logIndex: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  tx: fc.option(arbBytes(32), { nil: undefined }), exportedAt: arbTime,
}).map(({ k, eph, chainId, tag, blockHash, blockNumber, logIndex, tx, exportedAt }) => {
  const secret = secretScalarFromBytes(scalarBytes(k));
  const record: StealthPublicRecord = {
    format: 'ghostpay-stealth-public-v1', version: 1, schemeId: 1, chainId,
    // The address comes from viem (via chain-adapters), the codec's EIP-55 and decompression are checked against it.
    stealthAddress: addressOfSecret(secret),
    publicKey: { encoding: 'secp256k1-compressed', value: hex(secp256k1.getPublicKey(scalarBytes(k), true)) },
    ephemeralPublicKey: hex(secp256k1.getPublicKey(scalarBytes(eph), true)),
    viewTag: tag,
    announcement: { blockHash, blockNumber: blockNumber.toString(), logIndex, ...(tx === undefined ? {} : { transactionHash: tx }) },
    exportedAt,
  };
  return { record, key: reveal(secret) };
});

/** One random edit: replace, insert or delete a character, drawn from ASCII, whitespace and a few non-ASCII units. */
const arbMutation = fc.record({
  kind: fc.constantFrom('replace', 'insert', 'delete'),
  at: fc.nat(),
  ch: fc.oneof(fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c)), fc.constantFrom('\n', '\t', '\r', '\u0000', '\u00e9', '\u2028', '"', '\\')),
});
function mutate(text: string, m: { kind: string; at: number; ch: string }): string {
  const at = m.at % text.length;
  if (m.kind === 'delete') return text.slice(0, at) + text.slice(at + 1);
  if (m.kind === 'insert') return text.slice(0, at) + m.ch + text.slice(at);
  return text.slice(0, at) + m.ch + text.slice(at + 1);
}

/** Either the mutated text is refused with a public diagnostic, or it decodes to exactly the original content. */
async function refusedOrIdentical<T>(run: () => Promise<T> | T, original: T): Promise<void> {
  let out: T;
  try {
    out = await run();
  } catch (error) {
    expect(error).toBeInstanceOf(PortableVaultError);
    return;
  }
  expect(out).toEqual(original);
}

describe('stealth export properties', () => {
  it('parse(serialize(record)) is the identity, and the text never holds the key', () => {
    fc.assert(fc.property(arbRecord, ({ record, key }) => {
      const text = api.serializePublicRecord(record);
      expect(api.parsePublicRecord(text)).toEqual(record);
      expect(text.length).toBeLessThanOrEqual(api.STEALTH_EXPORT_LIMITS.publicRecordBytes);
      expect(text).not.toContain(key.slice(2));
      expect(api.detectStealthExportFormat(text)).toBe('public');
    }), { numRuns: 300 });
  });

  it('refuses a record whose public key belongs to any other scalar', () => {
    fc.assert(fc.property(arbRecord, arbScalar, ({ record, key }, other) => {
      fc.pre(BigInt(key) !== other);
      const value = hex(secp256k1.getPublicKey(scalarBytes(other), true));
      const xy = secp256k1.Point.fromBytes(hexToBytes(value.slice(2))).toBytes(false).subarray(1);
      expect(`0x${bytesToHex(keccak_256(xy).subarray(12))}`).not.toBe(record.stealthAddress.toLowerCase());
      expect(() => api.serializePublicRecord({ ...record, publicKey: { encoding: 'secp256k1-compressed', value } })).toThrow(PortableVaultError);
    }), { numRuns: 200 });
  });

  it('a random edit of a public record never yields a different key binding', async () => {
    // A public-only record is not authenticated (it carries no secret and no MAC), so other public fields may change;
    // what the parser guarantees is that the one-time public key and the address stay bound to each other.
    const original = api.parsePublicRecord(V.files.public.text);
    await fc.assert(fc.asyncProperty(arbMutation, async (m) => {
      await refusedOrIdentical(() => {
        const parsed = api.parsePublicRecord(mutate(V.files.public.text, m));
        expect(api.parsePublicRecord(api.serializePublicRecord(parsed))).toEqual(parsed);
        return { stealthAddress: parsed.stealthAddress, publicKey: parsed.publicKey };
      }, { stealthAddress: original.stealthAddress, publicKey: original.publicKey });
    }), { numRuns: 3000 });
  });

  it('a random edit of an encrypted archive never yields different content or keys', async () => {
    const decrypted = await api.decryptPaymentKeys(V.files.archive.text, V.passphrase);
    const original = { header: decrypted.header, keys: decrypted.payments.map((p) => reveal(p.secret)) };
    await fc.assert(fc.asyncProperty(arbMutation, async (m) => {
      const text = mutate(V.files.archive.text, m);
      await refusedOrIdentical(async () => {
        const out = await api.decryptPaymentKeys(text, V.passphrase);
        return { header: out.header, keys: out.payments.map((p) => reveal(p.secret)) };
      }, original);
    }), { numRuns: 60 });
  });

  it('a random edit of a master backup never yields different content or keys', async () => {
    const decrypted = await api.decryptMasterBackup(V.files.master.text, V.passphrase);
    const original = { header: decrypted.header, spend: reveal(decrypted.spendingSecret), view: reveal(decrypted.viewingSecret) };
    await fc.assert(fc.asyncProperty(arbMutation, async (m) => {
      const text = mutate(V.files.master.text, m);
      await refusedOrIdentical(async () => {
        const out = await api.decryptMasterBackup(text, V.passphrase);
        return { header: out.header, spend: reveal(out.spendingSecret), view: reveal(out.viewingSecret) };
      }, original);
    }), { numRuns: 40 });
  });

  it('format detection and every parser refuse arbitrary text with a public diagnostic only', () => {
    fc.assert(fc.property(fc.oneof(fc.string(), fc.json(), fc.jsonValue().map((v) => JSON.stringify({ format: 'ghostpay-stealth-keypair-v1', v }))), (text) => {
      expect(() => api.detectStealthExportFormat(text)).not.toThrow();
      expect(() => api.isUnsupportedStealthExportVersion(text)).not.toThrow();
      for (const run of [() => api.parsePublicRecord(text), () => api.inspectPaymentKeys(text), () => api.inspectMasterBackup(text)]) {
        try { run(); } catch (error) { expect(error).toBeInstanceOf(PortableVaultError); }
      }
    }), { numRuns: 500 });
  });

  it('every derived payment of a random seller is exportable, deep scan included, and the key controls the address', () => {
    fc.assert(fc.property(fc.uint8Array({ minLength: 64, maxLength: 64 }), fc.boolean(), (seed, wrongTag) => {
      let i = 0;
      const rng = { getRandomValues: <A extends ArrayBufferView | null>(out: A): A => {
        if (out !== null) { const view = new Uint8Array(out.buffer, out.byteOffset, out.byteLength); for (let j = 0; j < view.length; j++) view[j] = (seed[(i++) % 64] ?? 0) ^ (i >> 6); }
        return out;
      } };
      const keys = generateKeySet(rng);
      const meta = encodeMetaAddress({ spendingPublicKey: keys.spendingPublicKey, viewingPublicKey: keys.viewingPublicKey });
      const payment = deriveStealthPayment(meta);
      const tag = (payment.viewTag[0] ?? 0) ^ (wrongTag ? 0xff : 0);
      const { record, secret } = api.buildVerifiedPayment({
        chainId: 84532,
        announcement: { schemeId: 1n, stealthAddress: payment.stealthAddress, ephemeralPublicKey: hex(payment.ephemeralPublicKey), metadata: `0x${tag.toString(16).padStart(2, '0')}`, blockHash: `0x${'11'.repeat(32)}`, blockNumber: 1n, logIndex: 0 },
        keys,
        exportedAt: new Date(0),
      });
      expect(record.stealthAddress).toBe(payment.stealthAddress);
      expect(addressOfSecret(secret)).toBe(payment.stealthAddress);
      expect(parseCompressedPoint(hexToBytes(record.publicKey.value.slice(2)))).toEqual(secp256k1.getPublicKey(unsafeRevealSecret(secret), true));
      expect(record.viewTag).toBe(`0x${tag.toString(16).padStart(2, '0')}`);
    }), { numRuns: 40 });
  });
});
