/**
 * SELF-GENERATED regression vectors (test-vectors/self-generated-v1.json). No external vector set
 * exists for this scheme. To make them less circular, every field is recomputed by an independent
 * BigInt + node:crypto implementation (reference.testutil.ts, no @noble / @scure code), and every
 * signature is verified with node:crypto (OpenSSL) as well as noble.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes } from '@noble/curves/utils.js';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { encodeAnnouncementMemo } from './announcement.js';
import { decodeMetaAddress, encodeMetaAddress, stealthKeysFromSecrets } from './keys.js';
import {
  leBytes,
  leInt,
  nodeVerifyEd25519,
  REF_L,
  refBase58,
  refDerive,
  refEncode,
  refMul,
  refSha512,
} from './reference.testutil.js';
import { L, scalarFromValue, secretScalarFromBytes, unsafeRevealSecret } from './secret.js';
import { signWithScalar } from './sign.js';
import { checkAnnouncement, deriveStealthSpendScalar, deriveWithEphemeral } from './stealth.js';

interface Vec {
  s: string;
  v: string;
  r: string;
  S: string;
  V: string;
  meta: string;
  R: string;
  viewTag: number;
  h: string;
  P: string;
  address: string;
  x: string;
  memo: string;
  sig: string;
}

const file = JSON.parse(
  readFileSync(fileURLToPath(new URL('../test-vectors/self-generated-v1.json', import.meta.url)), 'utf8'),
) as { status: string; vectors: Vec[] };

const MSG = new TextEncoder().encode('GhostPay Solana self-generated vector');
const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
const label = (i: number, k: string): bigint =>
  leInt(refSha512(new TextEncoder().encode(`ghostpay-solana-selfvec-${i}-${k}`))) % REF_L;

describe('reference implementation sanity', () => {
  it('base point and RFC 8032 TEST 1 public key', () => {
    expect(REF_L).toBe(L);
    expect(hex(refEncode(refMul(1n)))).toBe(bytesToHex(ed25519.Point.BASE.toBytes()));
    expect(hex(refEncode(refMul(REF_L)))).toBe('01' + '00'.repeat(31));
    expect(refBase58(new Uint8Array(32))).toBe('1'.repeat(32));
    const h = refSha512(hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'));
    const a = h.slice(0, 32);
    a[0] = (a[0] as number) & 248;
    a[31] = ((a[31] as number) & 127) | 64;
    expect(hex(refEncode(refMul(leInt(a))))).toBe(
      'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
    );
    expect(leInt(leBytes(123456789n, 32))).toBe(123456789n);
  });
});

describe('self-generated vectors (NOT external)', () => {
  it('file is marked self-generated', () => {
    expect(file.status).toMatch(/^SELF-GENERATED/);
    expect(file.vectors.length).toBe(3);
  });

  it.each(file.vectors.map((v, i) => [i + 1, v] as const))(
    'vector %i: independent recomputation',
    (i, vec) => {
      const s = label(i, 'spend');
      const v = label(i, 'view');
      const r = label(i, 'ephemeral');
      expect([vec.s, vec.v, vec.r]).toEqual([s, v, r].map((n) => hex(leBytes(n, 32))));
      const ref = refDerive(s, v, r);
      expect(hex(ref.K)).toBe(hex(ref.Krecv));
      expect(hex(ref.xB)).toBe(hex(ref.P));
      expect({
        S: hex(ref.S),
        V: hex(ref.V),
        R: hex(ref.R),
        viewTag: ref.viewTag,
        h: hex(leBytes(ref.h, 32)),
        P: hex(ref.P),
        address: ref.address,
        x: hex(leBytes(ref.x, 32)),
        meta: ref.meta,
        memo: ref.memo,
      }).toEqual({
        S: vec.S,
        V: vec.V,
        R: vec.R,
        viewTag: vec.viewTag,
        h: vec.h,
        P: vec.P,
        address: vec.address,
        x: vec.x,
        meta: vec.meta,
        memo: vec.memo,
      });
      expect(nodeVerifyEd25519(hexToBytes(vec.sig), MSG, ref.P)).toBe(true);
      expect(ed25519.verify(hexToBytes(vec.sig), MSG, ref.P, { zip215: false })).toBe(true);
    },
  );

  it.each(file.vectors.map((v, i) => [i + 1, v] as const))(
    'vector %i: package reproduces every field',
    (_i, vec) => {
      const keys = stealthKeysFromSecrets(
        secretScalarFromBytes(hexToBytes(vec.s)),
        secretScalarFromBytes(hexToBytes(vec.v)),
      );
      expect(encodeMetaAddress(keys)).toBe(vec.meta);
      expect(bytesToHex(decodeMetaAddress(vec.meta).spendPublicKey)).toBe(vec.S);
      const pay = deriveWithEphemeral(keys, secretScalarFromBytes(hexToBytes(vec.r)));
      expect(bytesToHex(pay.ephemeralPublicKey)).toBe(vec.R);
      expect(pay.viewTag).toBe(vec.viewTag);
      expect(pay.stealthAddress).toBe(vec.address);
      expect(encodeAnnouncementMemo(pay)).toBe(vec.memo);
      const found = checkAnnouncement(pay, keys.viewSecret, keys.spendPublicKey, vec.address);
      expect(found).not.toBeNull();
      expect(bytesToHex(unsafeRevealSecret(found!.tweak))).toBe(vec.h);
      const x = deriveStealthSpendScalar(keys.spendSecret, found!.tweak, hexToBytes(vec.P));
      expect(bytesToHex(unsafeRevealSecret(x))).toBe(vec.x);
      expect(bytesToHex(signWithScalar(x, MSG))).toBe(vec.sig);
    },
  );
});

describe('differential: package vs reference on random scalars', () => {
  it('addresses, tags and spend keys agree; signatures verify under node:crypto', () => {
    const scalar = fc.bigInt({ min: 1n, max: L - 1n });
    fc.assert(
      fc.property(scalar, scalar, scalar, fc.uint8Array({ maxLength: 80 }), (s, v, r, msg) => {
        fc.pre(s !== v);
        const keys = stealthKeysFromSecrets(scalarFromValue(s), scalarFromValue(v));
        const pay = deriveWithEphemeral(keys, scalarFromValue(r));
        const ref = refDerive(s, v, r);
        expect(pay.stealthAddress).toBe(ref.address);
        expect(pay.viewTag).toBe(ref.viewTag);
        expect(encodeMetaAddress(keys)).toBe(ref.meta);
        const found = checkAnnouncement(pay, keys.viewSecret, keys.spendPublicKey, pay.stealthAddress);
        const x = deriveStealthSpendScalar(keys.spendSecret, found!.tweak);
        expect(bytesToHex(unsafeRevealSecret(x))).toBe(hex(leBytes(ref.x, 32)));
        expect(nodeVerifyEd25519(signWithScalar(x, msg), msg, ref.P)).toBe(true);
      }),
      { numRuns: 25 },
    );
  });
});
