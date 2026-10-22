import fc from 'fast-check';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { getAddress, publicKeyToAddress } from 'viem/utils';
import {
  buildErc20Metadata,
  buildNativeMetadata,
  checkAnnouncement,
  decodeMetaAddress,
  deriveStealthPayment,
  deriveStealthSecret,
  encodeMetaAddress,
  generateKeySet,
  parseMetadata,
  unsafeRevealSecret,
} from './index.js';
import { seededRng } from './rng.testutil.js';

const seed = fc.string({ minLength: 1, maxLength: 24 });
const hex = (b: Uint8Array): `0x${string}` => `0x${bytesToHex(b)}`;

describe('properties', () => {
  it('sender-derived address == recipient-derived address, and the derived secret maps to it', () => {
    fc.assert(
      fc.property(seed, seed, (s1, s2) => {
        const keys = generateKeySet(seededRng(`k:${s1}`));
        const meta = encodeMetaAddress(keys);
        const pay = deriveStealthPayment(meta, seededRng(`e:${s2}`));
        const ann = {
          schemeId: 1n,
          stealthAddress: pay.stealthAddress,
          ephemeralPublicKey: hex(pay.ephemeralPublicKey),
          metadata: hex(pay.metadataPrefix),
        };
        const res = checkAnnouncement(ann, keys.viewingSecret, keys.spendingPublicKey);
        expect(res).toEqual({ matches: true, stealthAddress: pay.stealthAddress });
        const secret = deriveStealthSecret(ann, keys);
        const addr = publicKeyToAddress(hex(secp256k1.getPublicKey(unsafeRevealSecret(secret), false)));
        expect(addr).toBe(pay.stealthAddress);
      }),
      { numRuns: 150 },
    );
  });

  it('meta-address encode/decode round trips', () => {
    fc.assert(
      fc.property(seed, (s) => {
        const keys = generateKeySet(seededRng(s));
        const meta = encodeMetaAddress(keys);
        expect(meta).toMatch(/^st:eth:0x[0-9a-f]{132}$/);
        const dec = decodeMetaAddress(meta.toUpperCase().replace('ST:ETH:0X', 'st:eth:0x'));
        expect(encodeMetaAddress(dec)).toBe(meta);
      }),
      { numRuns: 100 },
    );
  });

  it('a wrong view tag never matches and derive-secret refuses it', () => {
    fc.assert(
      fc.property(seed, fc.integer({ min: 1, max: 255 }), (s, delta) => {
        const keys = generateKeySet(seededRng(`a:${s}`));
        const pay = deriveStealthPayment(encodeMetaAddress(keys), seededRng(`b:${s}`));
        const badTag = ((pay.viewTag[0] as number) + delta) & 0xff;
        const ann = {
          stealthAddress: pay.stealthAddress,
          ephemeralPublicKey: hex(pay.ephemeralPublicKey),
          metadata: hex(Uint8Array.of(badTag)),
        };
        expect(checkAnnouncement(ann, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
        expect(() => deriveStealthSecret(ann, keys)).toThrow();
      }),
      { numRuns: 60 },
    );
  });

  it('metadata build/parse round trips for arbitrary tags and amounts', () => {
    const amount = fc.bigInt({ min: 1n, max: (1n << 256n) - 1n });
    const token = fc
      .uint8Array({ minLength: 20, maxLength: 20 })
      .filter((u) => u.some((x) => x !== 0))
      .map((u) => getAddress(hex(u)));
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), token, amount, (tag, tok, amt) => {
        const e = buildErc20Metadata(tag, tok, amt);
        expect(e.length).toBe(57);
        expect(parseMetadata(e)).toEqual({ viewTag: tag, kind: 'erc20', token: tok, netAmount: amt });
        expect(parseMetadata(hex(e))).toEqual(parseMetadata(e));
        const n = buildNativeMetadata(Uint8Array.of(tag), amt);
        expect(parseMetadata(n)).toMatchObject({ viewTag: tag, kind: 'native', netAmount: amt });
      }),
      { numRuns: 100 },
    );
  });
});
