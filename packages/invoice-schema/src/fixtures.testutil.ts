import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  createInvoice,
  signInvoice,
  type Invoice,
  type NewInvoice,
  type RandomSource,
  type SignedInvoice,
} from './index.js';

/** Deterministic test-only RNG (sha256 counter mode). */
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

const key = (n: number): Uint8Array => {
  const k = new Uint8Array(32);
  k[31] = n;
  return k;
};
const pub = (n: number): string => bytesToHex(secp256k1.getPublicKey(key(n), true));

export const SIGNING_KEY = key(7);
export const OTHER_SIGNING_KEY = key(8);
export const SIGNER = pub(7);
export const OTHER_SIGNER = pub(8);
export const META = `st:eth:0x${pub(3)}${pub(4)}`;
export const OTHER_META = `st:eth:0x${pub(5)}${pub(6)}`;
export const NOW = 1_800_000_000;

export function newInvoiceInput(overrides: Partial<NewInvoice> = {}): NewInvoice {
  return {
    chainId: 8453,
    metaAddress: META,
    fiat: { currency: 'USD', minorUnits: '12345' },
    token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    amountPolicy: { mode: 'fiat_quote' },
    quote: { source: 'chainlink:usdc-usd', timestamp: NOW, expiresAt: NOW + 600, maxSlippageBps: 50 },
    expiresAt: NOW + 3600,
    lineItems: [
      { description: 'Consulting, 2 hours', quantity: '2', unitMinorUnits: '5000' },
      { description: 'Café — état des lieux', quantity: '1', unitMinorUnits: '2000' },
    ],
    tax: { rateBps: 500, minorUnits: '345' },
    feePolicy: 'seller_pays',
    memo: 'Thanks! Ref #42',
    signer: SIGNER,
    ...overrides,
  };
}

export function sampleInvoice(overrides: Partial<NewInvoice> = {}, seed = 'sample'): Invoice {
  return createInvoice(newInvoiceInput(overrides), seededRng(seed));
}

export function sampleSigned(overrides: Partial<NewInvoice> = {}, seed = 'sample'): SignedInvoice {
  return signInvoice(sampleInvoice(overrides, seed), SIGNING_KEY);
}
