import { ED25519_TORSION_SUBGROUP, ed25519 } from '@noble/curves/ed25519.js';
import { hexToBytes, numberToBytesLE } from '@noble/curves/utils.js';
import { describe, expect, it } from 'vitest';
import { decodeAnnouncement } from './announcement.js';
import { reduceDigest, reduceDigestNonZero } from './hash.js';
import { decodeMetaAddress, encodeMetaAddress, generateStealthKeys, stealthKeysFromSecrets } from './keys.js';
import { decodeAddress, Point } from './point.js';
import { seededRng } from './rng.testutil.js';
import { L, scalarFromValue, scalarValue } from './secret.js';
import { signWithScalar } from './sign.js';
import {
  addTweak,
  checkAnnouncement,
  deriveStealthPayment,
  deriveStealthSpendScalar,
  deriveWithEphemeral,
  sharedSecretPoint,
} from './stealth.js';

const rng = seededRng('stealth.test');

describe('stealth round trip', () => {
  it('sender derives, receiver detects, spend key signs for P', () => {
    const keys = generateStealthKeys(rng);
    const meta = encodeMetaAddress({ ...keys, cluster: 'devnet' });
    const pay = deriveStealthPayment(meta, rng);
    expect(decodeAddress(pay.stealthAddress)).toEqual(pay.stealthPublicKey);

    const ann = decodeAnnouncement(pay.announcement);
    expect(ann.viewTag).toBe(pay.viewTag);
    const found = checkAnnouncement(ann, keys.viewSecret, keys.spendPublicKey, pay.stealthAddress);
    expect(found).not.toBeNull();
    expect(found?.stealthAddress).toBe(pay.stealthAddress);

    const x = deriveStealthSpendScalar(keys.spendSecret, found!.tweak, pay.stealthPublicKey);
    expect(Point.BASE.multiply(scalarValue(x)).toBytes()).toEqual(pay.stealthPublicKey);
    const msg = new TextEncoder().encode('solana tx message');
    const sig = signWithScalar(x, msg, pay.stealthPublicKey);
    expect(ed25519.verify(sig, msg, pay.stealthPublicKey)).toBe(true);
    expect(ed25519.verify(sig, msg, pay.stealthPublicKey, { zip215: false })).toBe(true);
  });

  it('two payments to the same meta-address are unlinkable addresses', () => {
    const keys = generateStealthKeys(rng);
    const a = deriveStealthPayment(keys, rng);
    const b = deriveStealthPayment(keys, rng);
    expect(a.stealthAddress).not.toBe(b.stealthAddress);
    expect(a.ephemeralPublicKey).not.toEqual(b.ephemeralPublicKey);
  });

  it('works without an expected address (caller must then check the account)', () => {
    const keys = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    expect(checkAnnouncement(pay, keys.viewSecret, keys.spendPublicKey)?.stealthAddress).toBe(
      pay.stealthAddress,
    );
  });
});

describe('non-detection', () => {
  it('a different view key does not detect', () => {
    const keys = generateStealthKeys(rng);
    const other = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    expect(checkAnnouncement(pay, other.viewSecret, keys.spendPublicKey, pay.stealthAddress)).toBeNull();
  });

  it('a flipped view tag returns null', () => {
    const keys = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    const ann = { ephemeralPublicKey: pay.ephemeralPublicKey, viewTag: pay.viewTag ^ 1 };
    expect(checkAnnouncement(ann, keys.viewSecret, keys.spendPublicKey)).toBeNull();
  });

  it('a different destination returns null even when the view tag matches', () => {
    const keys = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    const other = deriveStealthPayment(keys, rng);
    expect(checkAnnouncement(pay, keys.viewSecret, keys.spendPublicKey, other.stealthAddress)).toBeNull();
  });

  it('a wrong spend public key derives a different P', () => {
    const keys = generateStealthKeys(rng);
    const other = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    expect(checkAnnouncement(pay, keys.viewSecret, other.spendPublicKey, pay.stealthAddress)).toBeNull();
  });

  it('hostile announcement fields return null, never throw', () => {
    const keys = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    for (const viewTag of [-1, 256, 1.5, Number.NaN]) {
      expect(
        checkAnnouncement(
          { ephemeralPublicKey: pay.ephemeralPublicKey, viewTag },
          keys.viewSecret,
          keys.spendPublicKey,
        ),
      ).toBeNull();
    }
    const Rp = Point.fromBytes(pay.ephemeralPublicKey);
    const hostile: Uint8Array[] = [
      ...ED25519_TORSION_SUBGROUP.map((h) => hexToBytes(h)),
      ...ED25519_TORSION_SUBGROUP.slice(1).map((h) => Rp.add(Point.fromBytes(hexToBytes(h), true)).toBytes()),
      numberToBytesLE(2n ** 255n - 19n + 1n, 32),
      numberToBytesLE(2n, 32),
      new Uint8Array(31),
    ];
    for (const R of hostile) {
      for (let viewTag = 0; viewTag < 256; viewTag += 51) {
        expect(
          checkAnnouncement({ ephemeralPublicKey: R, viewTag }, keys.viewSecret, keys.spendPublicKey),
        ).toBeNull();
      }
    }
  });

  it("throws only for the caller's own malformed inputs", () => {
    const keys = generateStealthKeys(rng);
    const pay = deriveStealthPayment(keys, rng);
    expect(() => checkAnnouncement(pay, keys.viewSecret, keys.spendPublicKey, 'not-base58-0OIl')).toThrow(
      expect.objectContaining({ code: 'INVALID_ADDRESS' }),
    );
    expect(() => checkAnnouncement(pay, keys.viewSecret, Point.ZERO.toBytes())).toThrow(
      expect.objectContaining({ code: 'INVALID_POINT' }),
    );
  });
});

describe('degenerate cases', () => {
  it('sharedSecretPoint is the plain ADR-0017 product Z = k*Q (no cofactor) and rejects the identity', () => {
    const Q = Point.BASE.multiply(5n);
    expect(sharedSecretPoint(Q, 11n).equals(Point.BASE.multiply(55n))).toBe(true);
    // Unreachable for validated inputs; torsion points never get here (decodePrimeOrderPoint rejects them).
    for (const h of ED25519_TORSION_SUBGROUP) {
      expect(() => sharedSecretPoint(Point.fromBytes(hexToBytes(h), true), 8n)).toThrow(
        expect.objectContaining({ code: 'IDENTITY_POINT' }),
      );
    }
  });

  it('addTweak rejects the identity (h = -s)', () => {
    const s = 77n;
    expect(() => addTweak(Point.BASE.multiply(s), L - s)).toThrow(
      expect.objectContaining({ code: 'IDENTITY_POINT' }),
    );
  });

  it('deriveStealthSpendScalar rejects x = 0 and a mismatching P', () => {
    const s = scalarFromValue(5n);
    expect(() => deriveStealthSpendScalar(s, scalarFromValue(L - 5n))).toThrow(
      expect.objectContaining({ code: 'ZERO_STEALTH_KEY' }),
    );
    expect(() => deriveStealthSpendScalar(s, scalarFromValue(1n), Point.BASE.multiply(7n).toBytes())).toThrow(
      expect.objectContaining({ code: 'KEY_MISMATCH' }),
    );
    expect(scalarValue(deriveStealthSpendScalar(s, scalarFromValue(L - 1n)))).toBe(4n);
  });

  it('reduceDigestNonZero rejects a digest equal to L (and 0), reduceDigest allows it', () => {
    const d = new Uint8Array(64);
    d.set(numberToBytesLE(L, 32));
    expect(() => reduceDigestNonZero(d)).toThrow(expect.objectContaining({ code: 'ZERO_HASH' }));
    expect(() => reduceDigestNonZero(new Uint8Array(64))).toThrow(
      expect.objectContaining({ code: 'ZERO_HASH' }),
    );
    expect(reduceDigest(d)).toBe(0n);
  });

  it('sender rejects S == V', () => {
    const keys = generateStealthKeys(rng);
    const bad = { spendPublicKey: keys.spendPublicKey, viewPublicKey: keys.spendPublicKey };
    expect(() => deriveWithEphemeral(bad, scalarFromValue(9n))).toThrow(
      expect.objectContaining({ code: 'KEY_REUSE' }),
    );
  });

  it('stealthKeysFromSecrets rejects s == v', () => {
    expect(() => stealthKeysFromSecrets(scalarFromValue(3n), scalarFromValue(3n))).toThrow(
      expect.objectContaining({ code: 'KEY_REUSE' }),
    );
  });
});

describe('deriveStealthPayment is testnet-only for text meta-addresses', () => {
  it('refuses a mainnet st:sol: meta-address with CHAIN_DISABLED', () => {
    const keys = generateStealthKeys(rng);
    const mainnet = encodeMetaAddress({ ...keys, cluster: 'mainnet' });
    expect(() => deriveStealthPayment(mainnet, rng)).toThrow(expect.objectContaining({ code: 'CHAIN_DISABLED' }));
  });
  it('refuses a decoded mainnet SolanaMetaAddress object before drawing any randomness', () => {
    const keys = generateStealthKeys(rng);
    const decoded = decodeMetaAddress(encodeMetaAddress({ ...keys, cluster: 'mainnet' }));
    expect(decoded.cluster).toBe('mainnet');
    let draws = 0;
    const countingRng: typeof rng = {
      getRandomValues: ((array: ArrayBufferView) => {
        draws += 1;
        return rng.getRandomValues(array);
      }) as typeof rng.getRandomValues,
    };
    expect(() => deriveStealthPayment(decoded, countingRng)).toThrow(expect.objectContaining({ code: 'CHAIN_DISABLED' }));
    expect(draws).toBe(0);
  });
  it('CHAIN_DISABLED message names every enabled cluster', () => {
    const keys = generateStealthKeys(rng);
    try {
      deriveStealthPayment(encodeMetaAddress({ ...keys, cluster: 'mainnet' }), rng);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toBe('Solana cluster is not enabled (devnet, testnet and localnet only)');
    }
  });
  it('still derives for devnet, testnet and localnet', () => {
    const keys = generateStealthKeys(rng);
    for (const cluster of ['devnet', 'testnet', 'localnet'] as const) {
      const pay = deriveStealthPayment(encodeMetaAddress({ ...keys, cluster }), rng);
      expect(decodeAddress(pay.stealthAddress)).toEqual(pay.stealthPublicKey);
    }
  });
});
