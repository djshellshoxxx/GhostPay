import type { Address, Hex } from 'viem';
import { parseAddress, parseHex, parseInt53, parseObject, parseUint } from './codec.js';
import { invalid } from './errors.js';

/** Largest accepted chain id (EIP-2294 bound; keeps it a safe integer). */
export const MAX_CHAIN_ID = 2 ** 53 - 1;

/** Validated `POST /v1/quote` body. */
export interface QuoteRequest {
  readonly chainId: number;
  readonly token: Address;
  readonly owner: Address;
  readonly destination: Address;
  readonly amount: bigint;
}

/** Validated sweep order (mirrors the contract struct). */
export interface SweepFields {
  readonly token: Address;
  readonly owner: Address;
  readonly destination: Address;
  readonly feeTo: Address;
  readonly amount: bigint;
  readonly fee: bigint;
  readonly deadline: bigint;
  readonly nonce: bigint;
}

/** Validated ERC-2612 permit part. */
export interface PermitFields {
  readonly value: bigint;
  readonly deadline: bigint;
  readonly v: 27 | 28;
  readonly r: Hex;
  readonly s: Hex;
}

/** Validated `POST /v1/sweep` body. */
export interface SweepRequest {
  readonly chainId: number;
  readonly sweep: SweepFields;
  readonly sweepSig: Hex;
  readonly permit: PermitFields | undefined;
  readonly quoteToken: string;
}

/** Quote tokens: `v1.<expiresAt>.<fee>.<64 hex mac>`. */
export const QUOTE_TOKEN_PATTERN = /^v1\.[0-9]{1,12}\.(?:0|[1-9][0-9]{0,77})\.[0-9a-f]{64}$/;

/**
 * Strictly validates a quote request.
 *
 * @param body Parsed JSON.
 * @returns Typed request.
 * @throws {RelayerError} 400 `invalid_*`.
 */
export function parseQuoteRequest(body: unknown): QuoteRequest {
  const o = parseObject(body, 'request', ['chainId', 'token', 'owner', 'destination', 'amount']);
  return {
    chainId: parseInt53(o['chainId'], 'chainId', 1, MAX_CHAIN_ID),
    token: parseAddress(o['token'], 'token'),
    owner: parseAddress(o['owner'], 'owner'),
    destination: parseAddress(o['destination'], 'destination'),
    amount: parseUint(o['amount'], 'amount', 1n),
  };
}

/**
 * Strictly validates a sweep request.
 *
 * @param body Parsed JSON.
 * @returns Typed request.
 * @throws {RelayerError} 400 `invalid_*`.
 */
export function parseSweepRequest(body: unknown): SweepRequest {
  const o = parseObject(body, 'request', ['chainId', 'sweep', 'sweepSig', 'quoteToken'], ['permit']);
  const s = parseObject(o['sweep'], 'sweep', ['token', 'owner', 'destination', 'feeTo', 'amount', 'fee', 'deadline', 'nonce']);
  const quoteToken = o['quoteToken'];
  if (typeof quoteToken !== 'string' || !QUOTE_TOKEN_PATTERN.test(quoteToken)) throw invalid('quoteToken');
  let permit: PermitFields | undefined;
  if (o['permit'] !== undefined) {
    const p = parseObject(o['permit'], 'permit', ['value', 'deadline', 'v', 'r', 's']);
    permit = {
      value: parseUint(p['value'], 'permit'),
      deadline: parseUint(p['deadline'], 'permit'),
      v: parseInt53(p['v'], 'permit', 27, 28) as 27 | 28,
      r: parseHex(p['r'], 'permit', 32),
      s: parseHex(p['s'], 'permit', 32),
    };
  }
  return {
    chainId: parseInt53(o['chainId'], 'chainId', 1, MAX_CHAIN_ID),
    sweep: {
      token: parseAddress(s['token'], 'token'),
      owner: parseAddress(s['owner'], 'owner'),
      destination: parseAddress(s['destination'], 'destination'),
      feeTo: parseAddress(s['feeTo'], 'feeTo'),
      amount: parseUint(s['amount'], 'amount', 1n),
      fee: parseUint(s['fee'], 'fee'),
      deadline: parseUint(s['deadline'], 'deadline', 1n),
      nonce: parseUint(s['nonce'], 'nonce'),
    },
    sweepSig: parseHex(o['sweepSig'], 'sweepSig', 65),
    permit,
    quoteToken,
  };
}

/** Half of the secp256k1 group order: the largest `s` OpenZeppelin `ECDSA.recover` accepts. */
const HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

/**
 * Whether a 65-byte `r || s || v` signature is canonical the way the contract requires it
 * (OpenZeppelin `ECDSA.recover`): `s` in the lower half of the curve order and `v` exactly 27 or 28.
 * viem's recovery also accepts the malleable high-s twin and `v` of 0/1, which would only fail later in
 * the simulation.
 *
 * @param sig 0x-prefixed 65-byte hex (already validated for length).
 * @returns True when the contract would not reject it for form.
 */
export function isCanonicalSignature(sig: Hex): boolean {
  const s = BigInt(`0x${sig.slice(66, 130)}`);
  const v = Number.parseInt(sig.slice(130, 132), 16);
  return s <= HALF_ORDER && (v === 27 || v === 28);
}
