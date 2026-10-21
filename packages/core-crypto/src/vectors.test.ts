import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hexToBytes } from '@noble/hashes/utils.js';
import {
  buildErc20Metadata,
  buildNativeMetadata,
  checkAnnouncement,
  decodeMetaAddress,
  deriveStealthPayment,
  deriveStealthSecret,
  encodeMetaAddress,
  parseCompressedPoint,
  parseMetadata,
  secretScalarFromBytes,
  unsafeRevealSecret,
} from './index.js';
import { scriptedRng } from './rng.testutil.js';

interface Vector {
  id: string;
  spendingPrivateKey: string;
  viewingPrivateKey: string;
  ephemeralPrivateKey: string;
  spendingPublicKey: string;
  viewingPublicKey: string;
  metaAddress: string;
  ephemeralPublicKey: string;
  viewTag: string;
  stealthAddress: string;
  stealthPrivateKey: string;
  metadata: { netAmount: string; token: string; erc20: string; native: string };
}
interface VectorFile {
  provenance: { sdk: string; sdkVersion: string };
  vectors: Vector[];
}

const file = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../test-vectors/scheme1.json', import.meta.url)), 'utf8'),
) as VectorFile;
const b = (h: string): Uint8Array => hexToBytes(h.slice(2));
const hex = (u: Uint8Array): string => `0x${Buffer.from(u).toString('hex')}`;

describe('fixed scheme-1 vectors (generated with the ScopeLift SDK)', () => {
  it('file is the pinned SDK version and has vectors', () => {
    expect(file.provenance.sdk).toBe('@scopelift/stealth-address-sdk');
    expect(file.provenance.sdkVersion).toBe('1.0.0-beta.5');
    expect(file.vectors.length).toBeGreaterThanOrEqual(6);
  });

  for (const v of file.vectors) {
    it(`${v.id}: byte-for-byte equality`, () => {
      const spendingSecret = secretScalarFromBytes(b(v.spendingPrivateKey));
      const viewingSecret = secretScalarFromBytes(b(v.viewingPrivateKey));

      // meta-address round trip
      const keys = decodeMetaAddress(v.metaAddress);
      expect(hex(keys.spendingPublicKey)).toBe(v.spendingPublicKey);
      expect(hex(keys.viewingPublicKey)).toBe(v.viewingPublicKey);
      expect(encodeMetaAddress(keys)).toBe(v.metaAddress);

      // sender: inject the vector's ephemeral scalar through the RNG
      const payment = deriveStealthPayment(v.metaAddress, scriptedRng([b(v.ephemeralPrivateKey)]));
      expect(payment.stealthAddress).toBe(v.stealthAddress);
      expect(hex(payment.ephemeralPublicKey)).toBe(v.ephemeralPublicKey);
      expect(hex(payment.viewTag)).toBe(v.viewTag);
      expect(parseCompressedPoint(b(v.ephemeralPublicKey))).toEqual(payment.ephemeralPublicKey);

      // metadata layouts
      const amount = BigInt(v.metadata.netAmount);
      expect(hex(buildErc20Metadata(payment.viewTag, v.metadata.token, amount))).toBe(v.metadata.erc20);
      expect(hex(buildNativeMetadata(payment.viewTag, amount))).toBe(v.metadata.native);
      expect(parseMetadata(v.metadata.erc20)).toMatchObject({ kind: 'erc20', netAmount: amount });
      expect(parseMetadata(v.metadata.native)).toMatchObject({ kind: 'native', netAmount: amount });

      // recipient
      const announcement = {
        schemeId: 1n,
        stealthAddress: v.stealthAddress,
        ephemeralPublicKey: v.ephemeralPublicKey,
        metadata: v.metadata.erc20,
      };
      expect(checkAnnouncement(announcement, viewingSecret, keys.spendingPublicKey)).toEqual({
        matches: true,
        stealthAddress: v.stealthAddress,
      });
      const secret = deriveStealthSecret(announcement, { spendingSecret, viewingSecret });
      expect(hex(unsafeRevealSecret(secret))).toBe(v.stealthPrivateKey);
    });
  }
});
