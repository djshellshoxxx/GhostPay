import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  checkAnnouncement,
  deriveStealthPayment,
  deriveStealthSecret,
  encodeMetaAddress,
  generateKeySet,
  secretScalarFromBytes,
  unsafeRevealSecret,
  type StealthKeySet,
} from '@ghostpay/core-crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evmToTronAddress, tronAddressFromHex, tronAddressFromPublicKey, tronAddressToHex, tronToEvmAddress } from './address.js';
import { TronError } from './errors.js';
import {
  checkTronAnnouncement,
  deriveTronStealthPayment,
  deriveTronStealthSecret,
  tronAddressOfSecret,
  type TronAnnouncement,
} from './stealth.js';
import { seededRng } from './testutil.testutil.js';

function setup(seed: number): { keys: StealthKeySet; meta: string } {
  const keys = generateKeySet(seededRng(seed));
  return { keys, meta: encodeMetaAddress(keys) };
}

function announce(p: ReturnType<typeof deriveTronStealthPayment>): TronAnnouncement {
  return {
    stealthAddress: p.stealthAddress,
    ephemeralPublicKey: `0x${bytesToHex(p.ephemeralPublicKey)}`,
    metadata: `0x${bytesToHex(p.metadataPrefix)}`,
  };
}

describe('Tron stealth', () => {
  it('matches core-crypto for the same randomness', () => {
    const { meta } = setup(1);
    const evm = deriveStealthPayment(meta, seededRng(99));
    const tron = deriveTronStealthPayment(meta, seededRng(99));
    expect(tronToEvmAddress(tron.stealthAddress)).toBe(evm.stealthAddress.toLowerCase());
    expect(tron.ephemeralPublicKey).toEqual(evm.ephemeralPublicKey);
    expect(tron.viewTag).toEqual(evm.viewTag);
    expect(tron.metadataPrefix).toEqual(evm.metadataPrefix);
  });

  it('round trip: derive, scan, spend key controls the Tron address', () => {
    const { keys, meta } = setup(2);
    const p = deriveTronStealthPayment(meta, seededRng(5));
    const a = announce(p);
    const hit = checkTronAnnouncement(a, keys.viewingSecret, keys.spendingPublicKey);
    expect(hit).toEqual({ matches: true, stealthAddress: p.stealthAddress });
    const sk = deriveTronStealthSecret(a, keys);
    expect(tronAddressOfSecret(sk)).toBe(p.stealthAddress);
    // independent: pubkey of derived scalar maps to same address
    const pub = secp256k1.getPublicKey(unsafeRevealSecret(sk), true);
    expect(tronAddressFromPublicKey(pub)).toBe(p.stealthAddress);
    // core-crypto agrees on EVM form
    const evmSk = deriveStealthSecret({ ...a, stealthAddress: tronToEvmAddress(a.stealthAddress) }, keys);
    expect(unsafeRevealSecret(evmSk)).toEqual(unsafeRevealSecret(sk));
  });

  it('accepts hex-form stealth address in announcements', () => {
    const { keys, meta } = setup(3);
    const p = deriveTronStealthPayment(meta, seededRng(6));
    const a = { ...announce(p), stealthAddress: tronAddressToHex(p.stealthAddress) };
    expect(checkTronAnnouncement(a, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(true);
  });

  it('does not match other recipients, wrong address, bad data', () => {
    const { keys, meta } = setup(4);
    const other = setup(5).keys;
    const p = deriveTronStealthPayment(meta, seededRng(7));
    const a = announce(p);
    expect(checkTronAnnouncement(a, other.viewingSecret, other.spendingPublicKey).matches).toBe(false);
    const wrongAddr = { ...a, stealthAddress: evmToTronAddress(`0x${'11'.repeat(20)}`) };
    expect(checkTronAnnouncement(wrongAddr, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
    const bad = { ...a, stealthAddress: 'not-an-address' };
    expect(checkTronAnnouncement(bad, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
    const badTag = { ...a, metadata: `0x${((p.viewTag[0] as number) ^ 1).toString(16).padStart(2, '0')}` };
    expect(checkTronAnnouncement(badTag, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
    expect(checkTronAnnouncement({ ...a, metadata: '0x' }, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(false);
  });

  it('spend derivation fails closed on wrong address / invalid address', () => {
    const { keys, meta } = setup(6);
    const p = deriveTronStealthPayment(meta, seededRng(8));
    const a = announce(p);
    expect(() => deriveTronStealthSecret({ ...a, stealthAddress: tronAddressFromHex(`41${'22'.repeat(20)}`) }, keys)).toThrow();
    expect(() => deriveTronStealthSecret({ ...a, stealthAddress: 'junk' }, keys)).toThrow(TronError);
  });

  it('tronAddressOfSecret of scalar 1 equals address of G', () => {
    const one = secretScalarFromBytes(Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0)));
    expect(tronAddressOfSecret(one)).toBe(tronAddressFromPublicKey(secp256k1.Point.BASE.toBytes(true)));
  });

  it('property: round trip for many seeds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 30 }), fc.integer({ min: 1, max: 2 ** 30 }), (s1, s2) => {
        const { keys, meta } = setup(s1);
        const p = deriveTronStealthPayment(meta, seededRng(s2));
        const a = announce(p);
        const hit = checkTronAnnouncement(a, keys.viewingSecret, keys.spendingPublicKey);
        expect(hit.matches).toBe(true);
        const evmHit = checkAnnouncement(
          { ...a, stealthAddress: tronToEvmAddress(a.stealthAddress) },
          keys.viewingSecret,
          keys.spendingPublicKey,
        );
        expect(evmHit.matches).toBe(true);
        expect(tronAddressOfSecret(deriveTronStealthSecret(a, keys))).toBe(p.stealthAddress);
      }),
      { numRuns: 25 },
    );
  });
});
