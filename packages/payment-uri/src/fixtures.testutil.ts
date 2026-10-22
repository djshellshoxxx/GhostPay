import { sha256 } from '@noble/hashes/sha2.js';
import { base58, bech32m, createBase58check } from '@scure/base';

const b58c = createBase58check(sha256);

export const EVM = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
export const EVM2 = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
export const EVM3 = '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB';
export const EVM4 = '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb';
export const BTC_P2PKH = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
export const BTC_P2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
export const BTC_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
export const BTC_TAPROOT = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0';
export const BTC_TESTNET = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

export function solKey(seed: number): string {
  return base58.encode(Uint8Array.from({ length: 32 }, (_, i) => (seed * 31 + i * 7 + 1) & 0xff));
}
export function tronAddr(seed: number): string {
  const raw = new Uint8Array(21);
  raw[0] = 0x41;
  for (let i = 1; i < 21; i++) raw[i] = (seed * 17 + i * 5) & 0xff;
  return b58c.encode(raw);
}
export function spAddr(hrp: 'sp' | 'tsp', seed = 3, version = 0): string {
  const payload = Uint8Array.from({ length: 66 }, (_, i) => (seed + i * 3) & 0xff);
  return bech32m.encode(hrp, [version, ...bech32m.toWords(payload)], 130);
}
export const SOL = solKey(1);
export const SOL2 = solKey(2);
export const SOL_MINT = solKey(3);
export const SOL_REF = solKey(4);
export const SOL_REF2 = solKey(5);
export const TRX = tronAddr(1);
export const TRX2 = tronAddr(2);
