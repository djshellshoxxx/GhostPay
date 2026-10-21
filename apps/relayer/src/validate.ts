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

/** Quote tokens: `v2.<8 hex key id>.<expiresAt>.<fee>.<64 hex mac>`; decimals are canonical (no leading zeros). */
export const QUOTE_TOKEN_PATTERN = /^v2\.[0-9a-f]{8}\.(?:0|[1-9][0-9]{0,11})\.(?:0|[1-9][0-9]{0,77})\.[0-9a-f]{64}$/;

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
