import {
  encodeMetaAddress,
  secretScalarFromBytes,
  parseCompressedPoint,
  type StealthKeySet,
} from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';

function scalar(n: number): Uint8Array {
  const b = new Uint8Array(32);
  b[31] = n & 0xff;
  b[30] = (n >> 8) & 0xff;
  b[0] = 0x11; // fixed fake test key material
  return b;
}

/** Fake fixed test keys (never used anywhere real). */
export function testKeys(): StealthKeySet {
  const spend = scalar(1);
  const view = scalar(2);
  return {
    spendingSecret: secretScalarFromBytes(spend),
    viewingSecret: secretScalarFromBytes(view),
    spendingPublicKey: parseCompressedPoint(secp256k1.getPublicKey(spend, true)),
    viewingPublicKey: parseCompressedPoint(secp256k1.getPublicKey(view, true)),
  };
}

export const META = encodeMetaAddress(testKeys());
export const IKM_BYTES = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

/** withSeed double: hands out a fresh copy each call. */
export function withSeedOf(bytes: Uint8Array = IKM_BYTES) {
  return <T>(f: (ikm: Uint8Array) => T): T => f(Uint8Array.from(bytes));
}

export const A1 = '0x1111111111111111111111111111111111111111';
export const A2 = '0x2222222222222222222222222222222222222222';
export const A3 = '0x3333333333333333333333333333333333333333';
export const TOKEN = '0x4444444444444444444444444444444444444444';
export const TX = `0x${'ab'.repeat(32)}`;
export const pad = (a: string): string => `0x${'0'.repeat(24)}${a.slice(2)}`;
export function word(n: bigint): string {
  return `0x${n.toString(16).padStart(64, '0')}`;
}
export const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export function log(o: {
  from: string;
  to: string;
  value: bigint;
  tx?: string;
  block?: string;
}): Record<string, unknown> {
  return {
    address: TOKEN,
    topics: [TOPIC, pad(o.from), pad(o.to)],
    data: word(o.value),
    blockNumber: o.block ?? '0x64',
    transactionHash: o.tx ?? TX,
    logIndex: '0x0',
  };
}
