import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { RandomSource } from '@ghostpay/invoice-schema';
import type { InvoiceTemplate } from './subscription.js';

export function seededRng(seed: string): RandomSource {
  let counter = 0;
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      let off = 0;
      while (off < view.length) {
        const block = sha256(utf8ToBytes(`${seed}:${counter++}`));
        const n = Math.min(block.length, view.length - off);
        view.set(block.subarray(0, n), off);
        off += n;
      }
      return array;
    },
  };
}

const pub = (n: number): string => {
  const k = new Uint8Array(32);
  k[31] = n;
  return bytesToHex(secp256k1.getPublicKey(k, true));
};
export const metaOf = (a: number, b: number): string => `st:eth:0x${pub(a)}${pub(b)}`;
export const META = metaOf(3, 4);
export const OTHER_META = metaOf(5, 6);
export const REFUND_META = metaOf(9, 10);

export const TEMPLATE: InvoiceTemplate = {
  chainId: 8453,
  metaAddress: META,
  token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  amountPolicy: { mode: 'fiat_quote' },
  feePolicy: 'payer_pays',
  signer: pub(7),
  quoteSource: 'chainlink:usdc-usd',
  quoteTtlSeconds: 600,
  maxSlippageBps: 50,
};

/** 2026-01-31T00:00:00Z */
export const JAN31 = Date.UTC(2026, 0, 31) / 1000;
export const D = 86_400;
