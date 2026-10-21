import * as btc from '@scure/btc-signer';
import { fail } from './errors.js';

/** Networks this package will touch. `mainnet` is deliberately absent (BPJ-GEN-1). */
export type BtcNetwork = 'testnet' | 'signet' | 'regtest';

const ALLOWED: readonly string[] = ['testnet', 'signet', 'regtest'];

/**
 * Chain guard: asserts a runtime value is an allowed testnet-class network.
 *
 * @security BPJ-GEN-1. Called at every public entry point; there is no
 * override flag.
 * @throws {PayjoinError} `network_not_allowed` for `mainnet` or anything unknown.
 */
export function assertNetwork(n: unknown): asserts n is BtcNetwork {
  if (typeof n !== 'string' || !ALLOWED.includes(n)) fail('network_not_allowed');
}

/** @internal btc-signer network parameters (testnet and signet share `tb`). */
export function netParams(n: BtcNetwork): typeof btc.TEST_NETWORK {
  assertNetwork(n);
  return n === 'regtest' ? { ...btc.TEST_NETWORK, bech32: 'bcrt' } : btc.TEST_NETWORK;
}

/**
 * Decodes an address to its scriptPubKey on `network`, refusing anything that
 * looks like a mainnet address first.
 *
 * @throws {PayjoinError} `network_not_allowed` (mainnet-looking) or `uri_invalid`.
 */
export function addressToScript(address: string, network: BtcNetwork): Uint8Array {
  assertNetwork(network);
  if (typeof address !== 'string' || address.length === 0 || address.length > 200) fail('uri_invalid');
  const lower = address.toLowerCase();
  // BPJ-SP-1: a BIP-352 address can never be a PayJoin payee or change output.
  if (/^(sp1|tsp1|sprt1)/.test(lower)) fail('uri_conflict', 'silent payment address in a payjoin');
  if (lower.startsWith('bc1') || address.startsWith('1') || address.startsWith('3')) {
    fail('network_not_allowed');
  }
  try {
    return btc.OutScript.encode(btc.Address(netParams(network)).decode(address));
  } catch {
    return fail('uri_invalid');
  }
}
