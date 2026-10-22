import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify } from 'node:crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';
import type { RandomSource } from './ed25519.js';

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

/** RNG that always returns zeros (stuck RNG). */
export const zeroRng: RandomSource = {
  getRandomValues<T extends ArrayBufferView | null>(array: T): T {
    return array;
  },
};

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** OpenSSL (node:crypto) Ed25519 verification: independent of @noble. */
export function opensslVerify(sig: Uint8Array, msg: Uint8Array, pub: Uint8Array): boolean {
  const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, pub]), format: 'der', type: 'spki' });
  return nodeVerify(null, msg, key, sig);
}

/** A seed-based (normal wallet) test keypair signed through OpenSSL. Test-only throwaway keys. */
export function testWallet(label: string): { address: string; sign(msg: Uint8Array): Uint8Array } {
  const seed = sha256(utf8ToBytes('ghostpay-solana-test-wallet:' + label));
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  const pubDer = createPublicKey(priv).export({ format: 'der', type: 'spki' });
  const pub = new Uint8Array(pubDer.subarray(pubDer.length - 32));
  return {
    address: base58.encode(pub),
    sign: (msg) => new Uint8Array(nodeSign(null, msg, priv)),
  };
}

/** Parsed test-vectors/solana-stealth.json. */
export interface VectorFile {
  domainPrefix: string;
  programs: Record<string, string>;
  cases: Record<string, string | number>[];
  invalidPoints: Record<string, string[]>;
  transactions: Record<string, string | number | null>[];
}

export function loadVectors(): VectorFile {
  const p = fileURLToPath(new URL('../../../test-vectors/solana-stealth.json', import.meta.url));
  return JSON.parse(readFileSync(p, 'utf8')) as VectorFile;
}

export function hexToBytes(h: string): Uint8Array {
  return Uint8Array.from(Buffer.from(h, 'hex'));
}

export function toHex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex');
}
