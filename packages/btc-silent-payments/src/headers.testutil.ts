import { parseHeader, reverseHex, targetFromBits } from './header.js';
import { CHAIN_PARAMS, HeaderChain } from './headerchain.js';

export const REGTEST_GENESIS =
  '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4adae5494dffff7f2002000000';
export const REGTEST_GENESIS_HASH = '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206';
export const NOW = (): number => 2_000_000_000;

export const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const u32 = (n: number): string => hexOf(Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff));

/** Grinds the nonce until the header meets `bits` (cheap at regtest-like targets). `merkle` is display-order hex. */
export function mine(prev: string, time: number, bits: number, opts: { version?: number; tag?: number; merkle?: string } = {}): string {
  const merkle =
    opts.merkle === undefined
      ? hexOf(Uint8Array.from({ length: 32 }, (_, i) => (i + (opts.tag ?? 0) * 7 + time) & 0xff))
      : reverseHex(opts.merkle);
  const target = targetFromBits(bits);
  for (let nonce = 0; ; nonce++) {
    const hex = `${u32(opts.version ?? 0x20000000)}${reverseHex(prev)}${merkle}${u32(time)}${u32(bits)}${u32(nonce)}`;
    if (BigInt(`0x${parseHeader(hex).hash}`) <= target) return hex;
  }
}

/** Mines `n` headers on top of `prevHex` with the given spacing and bits. */
export function extend(prevHex: string, n: number, spacing: number, bits: number, tag = 0): string[] {
  const out: string[] = [];
  let prev = parseHeader(prevHex);
  for (let i = 0; i < n; i++) {
    const hex = mine(prev.hash, prev.time + spacing, bits, { tag });
    out.push(hex);
    prev = parseHeader(hex);
  }
  return out;
}

export const regtestChain = (): HeaderChain =>
  HeaderChain.create({ params: CHAIN_PARAMS.regtest, checkpoint: { height: 0, hash: REGTEST_GENESIS_HASH, headerHex: REGTEST_GENESIS }, now: NOW });
