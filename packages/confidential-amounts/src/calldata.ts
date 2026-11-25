import { encodeFunctionData, type Address, type Hex } from 'viem';
import { MAX_OPERATOR_WINDOW_SECONDS, ROUTER_ABI, TOKEN_ABI, UINT64_MAX } from './abi.js';
import { CtError, requireInput } from './errors.js';
import { assertHandle } from './metadata.js';
import { assertCtChain, BACKEND_CHAINS, parseAddress } from './manifest.js';
import type { CtBackendId, CtPayParams, CtTx } from './types.js';

const UINT48_MAX = (1 << 24) * (1 << 24) - 1;
/** Lowest `nowSec` accepted (2020-09-13): anything earlier is not a current clock in seconds. */
const MIN_PLAUSIBLE_NOW_SEC = 1_600_000_000;
/** `nowSec` must be below 2^32 (year 2106): rejects millisecond clocks such as `Date.now()`. */
const MAX_PLAUSIBLE_NOW_SEC_EXCLUSIVE = 2 ** 32;

/** @internal {@link parseAddress} that also refuses the zero address (a burn target or an empty receiver). */
export function parseNonZeroAddress(value: string, label: string): Address {
  const a = parseAddress(value, label);
  requireInput(BigInt(a) !== 0n, `${label} must not be the zero address`);
  return a;
}

/**
 * @internal Backend-neutral chain guard for the pure encoders: mainnets are refused and the chain must be
 * allowed for at least one built backend. Backends additionally apply {@link assertCtChain} with their own id.
 */
function assertAnyCtChain(chainId: number): void {
  const ids = Object.keys(BACKEND_CHAINS) as CtBackendId[];
  assertCtChain(chainId, ids.find((b) => BACKEND_CHAINS[b].includes(chainId)) ?? 'ct1-zama');
}

/** Validates an encrypted-amount plaintext (1..2^64-1 for payments, 0 allowed for generic encrypt). */
export function assertAmount(amount: bigint, label: string, allowZero: boolean): void {
  requireInput(typeof amount === 'bigint', `${label} must be a bigint`);
  requireInput(amount >= (allowZero ? 0n : 1n) && amount <= UINT64_MAX, `${label} out of range for euint64`);
}

/** Validates the 33-byte compressed ephemeral key (prefix 02/03). */
export function assertEphemeralKey(key: Hex): void {
  requireInput(/^0x0[23][0-9a-fA-F]{64}$/.test(key), 'ephemeralPubKey must be a 33-byte compressed key');
}

/**
 * Enforces CT-PAY-2: the operator window must start in the future and end at most 900 s from now.
 * @param until Operator expiry (unix seconds).
 * @param nowSec Current time (unix seconds), within `[1_600_000_000, 2^32)`.
 * @throws {CtError} `OPERATOR_WINDOW` if outside `(nowSec, nowSec + 900]`; `INVALID_INPUT` on non-integers
 * or a `nowSec` outside the plausible unix-seconds range (e.g. a millisecond clock).
 * @security The router can move any amount of the payer's confidential balance until `until`. The
 * window is only as good as `nowSec`: a millisecond or far-future clock would yield a near-unlimited
 * on-chain approval, so implausible clocks are refused rather than trusted.
 */
export function assertOperatorWindow(until: number, nowSec: number): void {
  requireInput(Number.isSafeInteger(until) && Number.isSafeInteger(nowSec), 'until and nowSec must be integers');
  requireInput(
    nowSec >= MIN_PLAUSIBLE_NOW_SEC && nowSec < MAX_PLAUSIBLE_NOW_SEC_EXCLUSIVE,
    'nowSec must be the current unix time in seconds',
  );
  requireInput(until <= UINT48_MAX, 'until exceeds uint48');
  if (until <= nowSec || until > nowSec + MAX_OPERATOR_WINDOW_SECONDS) {
    throw new CtError('OPERATOR_WINDOW', `operator window must end within ${MAX_OPERATOR_WINDOW_SECONDS} seconds from now`);
  }
}

/** Encodes `setOperator(operator, until)` after the CT-PAY-2 window check. */
export function encodeSetOperator(p: { token: Address; operator: Address; until: number; nowSec: number }): CtTx {
  const token = parseNonZeroAddress(p.token, 'token');
  const operator = parseNonZeroAddress(p.operator, 'operator');
  assertOperatorWindow(p.until, p.nowSec);
  return { to: token, data: encodeFunctionData({ abi: TOKEN_ABI, functionName: 'setOperator', args: [operator, p.until] }), value: 0n };
}

/** Validates {@link CtPayParams} (everything except the chain guard) and returns normalised, non-zero addresses. */
export function validatePayParams(p: CtPayParams): { router: Address; token: Address; stealth: Address; payer: Address } {
  const router = parseNonZeroAddress(p.router, 'router');
  const token = parseNonZeroAddress(p.token, 'token');
  const stealth = parseNonZeroAddress(p.stealth, 'stealth');
  const payer = parseNonZeroAddress(p.payer, 'payer');
  assertAmount(p.gross, 'gross', false);
  requireInput(Number.isInteger(p.viewTag) && p.viewTag >= 0 && p.viewTag <= 255, 'viewTag must be 0..255');
  assertEphemeralKey(p.ephemeralPubKey);
  requireInput(p.deadline > 0n && p.deadline < 1n << 64n, 'deadline must be a unix timestamp');
  requireInput(p.bufferWei >= 0n, 'bufferWei must be non-negative');
  requireInput(stealth !== router && stealth !== token, 'stealth must not be a protocol contract');
  return { router, token, stealth, payer };
}

/**
 * Encodes `payConfidential` for an already-encrypted gross amount. `value == maxBufferWei == bufferWei`.
 * @throws {CtError} `MAINNET_REFUSED` / `CHAIN_NOT_SUPPORTED` if `p.chainId` is not a built backend's testnet;
 * `INVALID_INPUT` on malformed or zero addresses and a malformed or zero handle.
 */
export function encodePayConfidential(p: CtPayParams, enc: { handle: Hex; inputProof: Hex }): CtTx {
  assertAnyCtChain(p.chainId);
  const { router, token, stealth } = validatePayParams(p);
  assertHandle(enc.handle, 'encrypted gross');
  const viewTag: Hex = `0x${p.viewTag.toString(16).padStart(2, '0')}`;
  return {
    to: router,
    data: encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: 'payConfidential',
      args: [token, stealth, enc.handle, enc.inputProof, p.deadline, p.bufferWei, p.ephemeralPubKey, viewTag],
    }),
    value: p.bufferWei,
  };
}

/** Encodes `confidentialTransfer(to, handle)` (the caller must be ACL-allowed on the handle). Zero `to`, token or handle is refused. */
export function encodeConfidentialTransfer(p: { token: Address; to: Address; amountHandle: Hex }): CtTx {
  assertHandle(p.amountHandle, 'amountHandle');
  return {
    to: parseNonZeroAddress(p.token, 'token'),
    data: encodeFunctionData({ abi: TOKEN_ABI, functionName: 'confidentialTransfer', args: [parseNonZeroAddress(p.to, 'to'), p.amountHandle] }),
    value: 0n,
  };
}

/** Encodes `unwrap(from, to, handle)`. @security The unwrapped amount becomes PUBLIC at `finalizeUnwrap`. */
export function encodeUnwrap(p: { token: Address; from: Address; to: Address; amountHandle: Hex }): CtTx {
  assertHandle(p.amountHandle, 'amountHandle');
  return {
    to: parseNonZeroAddress(p.token, 'token'),
    data: encodeFunctionData({
      abi: TOKEN_ABI,
      functionName: 'unwrap',
      args: [parseNonZeroAddress(p.from, 'from'), parseNonZeroAddress(p.to, 'to'), p.amountHandle],
    }),
    value: 0n,
  };
}

/** Encodes `finalizeUnwrap(requestId, cleartext, proof)`. */
export function encodeFinalizeUnwrap(p: { token: Address; requestId: Hex; cleartext: bigint; decryptionProof: Hex }): CtTx {
  assertHandle(p.requestId, 'requestId');
  assertAmount(p.cleartext, 'cleartext', true);
  return {
    to: parseNonZeroAddress(p.token, 'token'),
    data: encodeFunctionData({
      abi: TOKEN_ABI,
      functionName: 'finalizeUnwrap',
      args: [p.requestId, p.cleartext, p.decryptionProof],
    }),
    value: 0n,
  };
}
