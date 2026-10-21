// Mocks keccak256 so the shared-secret hash can be forced to 0, to n, and to values >= n,
// which are unreachable by random sampling (probability ~2^-128).
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicKeyToAddress } from 'viem/utils';

const forced = vi.hoisted(() => ({ queue: [] as Uint8Array[] }));
vi.mock('@noble/hashes/sha3.js', async (orig) => {
  const real = await orig<typeof import('@noble/hashes/sha3.js')>();
  const keccak_256 = ((msg: Uint8Array) =>
    forced.queue.shift() ?? real.keccak_256(msg)) as typeof real.keccak_256;
  return { ...real, keccak_256 };
});

const {
  GhostPayCryptoError,
  checkAnnouncement,
  deriveStealthPayment,
  deriveStealthSecret,
  encodeMetaAddress,
  generateKeySet,
  unsafeRevealSecret,
} = await import('./index.js');
const { seededRng } = await import('./rng.testutil.js');

const N = secp256k1.Point.Fn.ORDER;
const keys = generateKeySet(seededRng('hash-edge'));
const meta = encodeMetaAddress(keys);
const spend = bytesToNumberBE(unsafeRevealSecret(keys.spendingSecret));
const hex = (b: Uint8Array): `0x${string}` => `0x${bytesToHex(b)}`;
const addrOfPriv = (k: bigint): string =>
  publicKeyToAddress(hex(secp256k1.getPublicKey(numberToBytesBE(k, 32), false)));
const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return e instanceof GhostPayCryptoError ? e.code : 'other';
  }
  return 'none';
};

beforeEach(() => {
  forced.queue.length = 0;
});

function digestWith(value: bigint, tag?: number): Uint8Array {
  const d = numberToBytesBE(value, 32);
  if (tag !== undefined) d[0] = tag;
  return d;
}

describe('hash edge cases (ADR-0001)', () => {
  it('hash >= n is reduced mod n; view tag uses the unreduced first byte', () => {
    // 2^256-1 >= n; h = (2^256-1) mod n
    const raw = (1n << 256n) - 1n;
    const h = raw % N;
    forced.queue.push(digestWith(raw));
    const pay = deriveStealthPayment(meta, seededRng('edge-1'));
    expect(pay.viewTag[0]).toBe(0xff);
    expect(pay.stealthAddress).toBe(addrOfPriv((spend + h) % N));
  });

  it('hash exactly n reduces to zero and is rejected', () => {
    forced.queue.push(digestWith(N));
    expect(codeOf(() => deriveStealthPayment(meta, seededRng('edge-2')))).toBe('ZERO_HASH');
  });

  it('hash zero is rejected', () => {
    forced.queue.push(digestWith(0n));
    expect(codeOf(() => deriveStealthPayment(meta, seededRng('edge-3')))).toBe('ZERO_HASH');
  });

  it('check treats a zero hash as no match; derive-secret throws', () => {
    const pay = deriveStealthPayment(meta, seededRng('edge-4'));
    const ann = {
      stealthAddress: pay.stealthAddress,
      ephemeralPublicKey: hex(pay.ephemeralPublicKey),
      metadata: hex(pay.metadataPrefix),
    };
    forced.queue.push(digestWith(0n));
    expect(checkAnnouncement(ann, keys.viewingSecret, keys.spendingPublicKey)).toEqual({ matches: false });
    forced.queue.push(digestWith(0n));
    expect(codeOf(() => deriveStealthSecret(ann, keys))).toBe('ZERO_HASH');
  });

  it('reduced hash >= n works end-to-end for recipient (address and secret)', () => {
    const raw = N + 12345n; // reduces to 12345
    const tag = 0x42;
    const d = () => {
      const x = numberToBytesBE(raw, 32);
      x[0] = tag; // keep high bits irrelevant: recompute reduction from the final bytes
      return x;
    };
    const h = bytesToNumberBE(d()) % N;
    forced.queue.push(d());
    const pay = deriveStealthPayment(meta, seededRng('edge-5'));
    expect(pay.viewTag[0]).toBe(tag);
    expect(pay.stealthAddress).toBe(addrOfPriv((spend + h) % N));
    const ann = {
      stealthAddress: pay.stealthAddress,
      ephemeralPublicKey: hex(pay.ephemeralPublicKey),
      metadata: hex(pay.metadataPrefix),
    };
    forced.queue.push(d());
    expect(checkAnnouncement(ann, keys.viewingSecret, keys.spendingPublicKey).matches).toBe(true);
    forced.queue.push(d());
    const secret = deriveStealthSecret(ann, keys);
    expect(bytesToNumberBE(unsafeRevealSecret(secret))).toBe((spend + h) % N);
  });

  it('P_spend + h*G at infinity is rejected (h = n - p_spend)', () => {
    const h = N - spend;
    forced.queue.push(digestWith(h));
    expect(codeOf(() => deriveStealthPayment(meta, seededRng('edge-6')))).toBe('INFINITY_POINT');
    const ann = {
      stealthAddress: '0x0000000000000000000000000000000000000001',
      ephemeralPublicKey: hex(secp256k1.getPublicKey(numberToBytesBE(9n, 32), true)),
      metadata: '0x' + (digestWith(h)[0] as number).toString(16).padStart(2, '0'),
    };
    forced.queue.push(digestWith(h));
    expect(checkAnnouncement(ann, keys.viewingSecret, keys.spendingPublicKey)).toEqual({ matches: false });
  });

  it('stealth secret of zero is rejected (p_spend + h = n)', () => {
    const h = N - spend;
    const ann = {
      stealthAddress: '0x0000000000000000000000000000000000000001',
      ephemeralPublicKey: hex(secp256k1.getPublicKey(numberToBytesBE(9n, 32), true)),
      metadata: '0x' + (digestWith(h)[0] as number).toString(16).padStart(2, '0'),
    };
    forced.queue.push(digestWith(h));
    expect(codeOf(() => deriveStealthSecret(ann, keys))).toBe('ZERO_STEALTH_KEY');
  });
});
