import { signerPublicKeyHex } from '@ghostpay/invoice-schema';
import type { Io } from './io.js';
import { toHex } from './hex.js';

export const NOW = 1_800_000_000;
export const KEY_HEX = `${'00'.repeat(31)}07`;
export const KEY_BYTES = Uint8Array.from(Buffer.from(KEY_HEX, 'hex'));
export const SIGNER = signerPublicKeyHex(KEY_BYTES);
export const G = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
export const G2 = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
export const SECRET_HEX = 'ab'.repeat(32);

export const SPEC = {
  chainId: 8453,
  metaAddress: `st:eth:0x${G}${G2}`,
  fiat: { currency: 'USD', minorUnits: '12345' },
  token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  amountPolicy: { mode: 'fiat_quote' },
  quote: { source: 'chainlink:usdc-usd', timestamp: NOW, expiresAt: NOW + 600, maxSlippageBps: 50 },
  expiresAt: NOW + 3600,
  lineItems: [{ description: 'Consulting, 2 hours', quantity: '2', unitMinorUnits: '5000' }],
  tax: { rateBps: 500, minorUnits: '345' },
  feePolicy: 'payer_pays',
} as const;

export interface TestIo extends Io {
  readonly out: string[];
  readonly err: string[];
  readonly files: Map<string, string>;
  now: number;
  stdinText: string;
  env: Record<string, string | undefined>;
  failReads: boolean;
  failWrites: boolean;
  nodeVersion: string;
  constantRandom: boolean;
  stdinReads: number;
}

/** Deterministic counter RNG so nonces are reproducible. */
export function counterRandom(): Pick<Crypto, 'getRandomValues'> {
  let c = 1;
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array === null) return array;
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < view.length; i++) view[i] = (c++ * 37 + i * 11) & 0xff;
      return array;
    },
  };
}

export function makeIo(files: Record<string, string> = {}): TestIo {
  const rng = counterRandom();
  const io: TestIo = {
    out: [],
    err: [],
    files: new Map(Object.entries(files)),
    now: NOW,
    stdinText: '',
    env: {},
    failReads: false,
    failWrites: false,
    nodeVersion: '22.3.0',
    constantRandom: false,
    stdinReads: 0,
    stdout: (t) => void io.out.push(t),
    stderr: (t) => void io.err.push(t),
    readFile: (p) => {
      const v = io.files.get(p);
      return io.failReads || v === undefined ? Promise.reject(new Error('nope')) : Promise.resolve(v);
    },
    writeFile: (p, d, o) => {
      if (io.failWrites || (!o.overwrite && io.files.has(p))) return Promise.reject(new Error('exists'));
      io.files.set(p, d);
      return Promise.resolve();
    },
    readStdin: () => {
      io.stdinReads++;
      return io.failReads ? Promise.reject(new Error('stdin')) : Promise.resolve(io.stdinText);
    },
    nowSeconds: () => io.now,
    random: {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        if (array === null) return array;
        if (io.constantRandom) {
          new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(7);
          return array;
        }
        return rng.getRandomValues(array);
      },
    },
  };
  return io;
}

export const allOutput = (io: TestIo): string => io.out.join('') + io.err.join('');
export const stdoutJson = (io: TestIo): Record<string, unknown> => JSON.parse(io.out.join('')) as Record<string, unknown>;
export { toHex };
