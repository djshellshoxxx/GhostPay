import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { bech32, bech32m, createBase58check, base58 } from '@scure/base';
import { fail } from './errors.js';

const b58c = createBase58check(sha256);
const HEX40 = /^0x[0-9a-fA-F]{40}$/;
const ascii = new TextEncoder();

/** EIP-55 checksum encoding of 40 hex chars (lowercase input). */
function eip55(lower: string): string {
  const h = bytesToHex(keccak_256(ascii.encode(lower)));
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(h[i]!, 16) >= 8 ? lower[i]!.toUpperCase() : lower[i]!;
  return out;
}

/** Result of EVM address validation. */
export interface EvmAddress {
  /** EIP-55 checksummed form. */
  readonly address: string;
  /** True when the input carried a (valid) mixed-case checksum; false for all-lowercase input. */
  readonly checksummed: boolean;
}

/**
 * Validates an EVM address. All-lowercase is accepted (flagged `checksummed:false`); mixed case must satisfy EIP-55;
 * all-uppercase hex is rejected as ambiguous.
 */
export function parseEvmAddress(a: string): EvmAddress {
  if (typeof a !== 'string' || !HEX40.test(a)) return fail('INVALID_ADDRESS');
  const body = a.slice(2);
  const lower = body.toLowerCase();
  const sum = eip55(lower);
  if (body === lower) return { address: sum, checksummed: false };
  if (body === body.toUpperCase()) return fail('INVALID_ADDRESS');
  if (sum !== a) return fail('BAD_CHECKSUM');
  return { address: sum, checksummed: true };
}

/** Validates a base58 32-byte Solana public key (address, mint, reference). Returns it unchanged (case-sensitive). */
export function parseSolanaAddress(a: string): string {
  if (typeof a !== 'string' || a.length < 32 || a.length > 44 || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(a)) {
    return fail('INVALID_ADDRESS');
  }
  let raw: Uint8Array;
  try {
    raw = base58.decode(a);
  } catch {
    return fail('INVALID_ADDRESS');
  }
  if (raw.length !== 32 || base58.encode(raw) !== a) return fail('INVALID_ADDRESS');
  return a;
}

/** Validates a base58check TRON address (`T...`, version 0x41, 21 bytes). */
export function parseTronAddress(a: string): string {
  if (typeof a !== 'string' || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return fail('INVALID_ADDRESS');
  let raw: Uint8Array;
  try {
    raw = b58c.decode(a);
  } catch {
    return fail('INVALID_ADDRESS');
  }
  if (raw.length !== 21 || raw[0] !== 0x41) return fail('INVALID_ADDRESS');
  return a;
}

/** Bitcoin network classes. `test` covers testnet3/4 and signet, which share prefixes. */
export type BtcNetwork = 'main' | 'test' | 'regtest';

/** A validated on-chain Bitcoin address. */
export interface BtcAddress {
  readonly address: string;
  readonly network: BtcNetwork;
  readonly type: 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr' | 'witness-unknown';
}

/**
 * Validates a Bitcoin address: base58check P2PKH/P2SH, bech32 witness v0 (20/32 bytes), bech32m witness v1 (32 bytes,
 * taproot) and v2..v16 (2..40 bytes, BIP-350). Mixed-case bech32 is rejected. Bech32 and bech32m are not interchangeable.
 */
export function parseBtcAddress(a: string): BtcAddress {
  if (typeof a !== 'string' || a.length < 14 || a.length > 90 || !/^[\x21-\x7e]+$/.test(a)) {
    return fail('INVALID_ADDRESS');
  }
  const lower = a.toLowerCase();
  if (/^(bc|tb|bcrt)1/.test(lower)) {
    if (a !== lower && a !== a.toUpperCase()) return fail('INVALID_ADDRESS');
    const hrp = lower.slice(0, lower.indexOf('1'));
    const network: BtcNetwork = hrp === 'bc' ? 'main' : hrp === 'tb' ? 'test' : 'regtest';
    let dec: { prefix: string; words: number[] } | undefined;
    let isM = false;
    try {
      dec = bech32.decode(lower as `${string}1${string}`, 90);
    } catch {
      try {
        dec = bech32m.decode(lower as `${string}1${string}`, 90);
        isM = true;
      } catch {
        return fail('INVALID_ADDRESS');
      }
    }
    const version = dec.words[0];
    if (version === undefined || version > 16) return fail('INVALID_ADDRESS');
    if ((version === 0) === isM) return fail('INVALID_ADDRESS');
    let prog: Uint8Array;
    try {
      prog = bech32.fromWords(dec.words.slice(1));
    } catch {
      return fail('INVALID_ADDRESS');
    }
    if (version === 0) {
      if (prog.length === 20) return { address: lower, network, type: 'p2wpkh' };
      if (prog.length === 32) return { address: lower, network, type: 'p2wsh' };
      return fail('INVALID_ADDRESS');
    }
    if (prog.length < 2 || prog.length > 40) return fail('INVALID_ADDRESS');
    if (version === 1) {
      if (prog.length !== 32) return fail('INVALID_ADDRESS');
      return { address: lower, network, type: 'p2tr' };
    }
    return { address: lower, network, type: 'witness-unknown' };
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(a)) return fail('INVALID_ADDRESS');
  let raw: Uint8Array;
  try {
    raw = b58c.decode(a);
  } catch {
    return fail('INVALID_ADDRESS');
  }
  if (raw.length !== 21) return fail('INVALID_ADDRESS');
  switch (raw[0]) {
    case 0x00:
      return { address: a, network: 'main', type: 'p2pkh' };
    case 0x05:
      return { address: a, network: 'main', type: 'p2sh' };
    case 0x6f:
      return { address: a, network: 'test', type: 'p2pkh' };
    case 0xc4:
      return { address: a, network: 'test', type: 'p2sh' };
    default:
      return fail('INVALID_ADDRESS');
  }
}

/** A validated BIP-352 silent payment address (version 0 only). */
export interface SilentPaymentAddr {
  readonly address: string;
  /** `sp` is mainnet, `tsp` is testnet/signet/regtest. */
  readonly network: 'main' | 'test';
}

/** Validates a BIP-352 address: bech32m, hrp `sp`/`tsp`, witness version 0, 66-byte payload. Other versions are rejected. */
export function parseSilentPaymentAddress(a: string): SilentPaymentAddr {
  if (typeof a !== 'string' || a.length > 130 || a !== a.toLowerCase()) return fail('INVALID_ADDRESS');
  let dec: { prefix: string; words: number[] };
  try {
    dec = bech32m.decode(a as `${string}1${string}`, 130);
  } catch {
    return fail('INVALID_ADDRESS');
  }
  if (dec.prefix !== 'sp' && dec.prefix !== 'tsp') return fail('INVALID_ADDRESS');
  if (dec.words[0] !== 0) return fail('INVALID_ADDRESS');
  let payload: Uint8Array;
  try {
    payload = bech32m.fromWords(dec.words.slice(1));
  } catch {
    return fail('INVALID_ADDRESS');
  }
  if (payload.length !== 66) return fail('INVALID_ADDRESS');
  return { address: a, network: dec.prefix === 'sp' ? 'main' : 'test' };
}
