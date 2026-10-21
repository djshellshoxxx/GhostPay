import { encodeFunctionData, type Address, type Hex } from 'viem';
import { MAX_OPERATOR_WINDOW_SECONDS, ROUTER_ABI, TOKEN_ABI, UINT64_MAX } from './abi.js';
import { CtError, requireInput } from './errors.js';
import { assertHandle } from './metadata.js';
import { parseAddress } from './manifest.js';
import type { CtPayParams, CtTx } from './types.js';

const UINT48_MAX = (1 << 24) * (1 << 24) - 1;

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
 * @param nowSec Current time (unix seconds).
 * @throws {CtError} `OPERATOR_WINDOW` if outside `(nowSec, nowSec + 900]`; `INVALID_INPUT` on non-integers.
 * @security The router can move any amount of the payer's confidential balance until `until`.
 */
export function assertOperatorWindow(until: number, nowSec: number): void {
  requireInput(Number.isInteger(until) && Number.isInteger(nowSec), 'until and nowSec must be integers');
  requireInput(until <= UINT48_MAX, 'until exceeds uint48');
  if (until <= nowSec || until > nowSec + MAX_OPERATOR_WINDOW_SECONDS) {
    throw new CtError('OPERATOR_WINDOW', `operator window must end within ${MAX_OPERATOR_WINDOW_SECONDS} seconds from now`);
  }
}

/** Encodes `setOperator(operator, until)` after the CT-PAY-2 window check. */
export function encodeSetOperator(p: { token: Address; operator: Address; until: number; nowSec: number }): CtTx {
  const token = parseAddress(p.token, 'token');
  const operator = parseAddress(p.operator, 'operator');
  assertOperatorWindow(p.until, p.nowSec);
  return { to: token, data: encodeFunctionData({ abi: TOKEN_ABI, functionName: 'setOperator', args: [operator, p.until] }), value: 0n };
}

/** Validates {@link CtPayParams} (everything except the chain guard) and returns normalised addresses. */
export function validatePayParams(p: CtPayParams): { router: Address; token: Address; stealth: Address; payer: Address } {
  const router = parseAddress(p.router, 'router');
  const token = parseAddress(p.token, 'token');
  const stealth = parseAddress(p.stealth, 'stealth');
  const payer = parseAddress(p.payer, 'payer');
  assertAmount(p.gross, 'gross', false);
  requireInput(Number.isInteger(p.viewTag) && p.viewTag >= 0 && p.viewTag <= 255, 'viewTag must be 0..255');
  assertEphemeralKey(p.ephemeralPubKey);
  requireInput(p.deadline > 0n && p.deadline < 1n << 64n, 'deadline must be a unix timestamp');
  requireInput(p.bufferWei >= 0n, 'bufferWei must be non-negative');
  requireInput(stealth !== router && stealth !== token, 'stealth must not be a protocol contract');
  return { router, token, stealth, payer };
}

/** Encodes `payConfidential` for an already-encrypted gross amount. `value == maxBufferWei == bufferWei`. */
export function encodePayConfidential(p: CtPayParams, enc: { handle: Hex; inputProof: Hex }): CtTx {
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

/** Encodes `confidentialTransfer(to, handle)` (the caller must be ACL-allowed on the handle). */
export function encodeConfidentialTransfer(p: { token: Address; to: Address; amountHandle: Hex }): CtTx {
  assertHandle(p.amountHandle, 'amountHandle');
  return {
    to: parseAddress(p.token, 'token'),
    data: encodeFunctionData({ abi: TOKEN_ABI, functionName: 'confidentialTransfer', args: [parseAddress(p.to, 'to'), p.amountHandle] }),
    value: 0n,
  };
}

/** Encodes `unwrap(from, to, handle)`. @security The unwrapped amount becomes PUBLIC at `finalizeUnwrap`. */
export function encodeUnwrap(p: { token: Address; from: Address; to: Address; amountHandle: Hex }): CtTx {
  assertHandle(p.amountHandle, 'amountHandle');
  return {
    to: parseAddress(p.token, 'token'),
    data: encodeFunctionData({
      abi: TOKEN_ABI,
      functionName: 'unwrap',
      args: [parseAddress(p.from, 'from'), parseAddress(p.to, 'to'), p.amountHandle],
    }),
    value: 0n,
  };
}

/** Encodes `finalizeUnwrap(requestId, cleartext, proof)`. */
export function encodeFinalizeUnwrap(p: { token: Address; requestId: Hex; cleartext: bigint; decryptionProof: Hex }): CtTx {
  assertHandle(p.requestId, 'requestId');
  assertAmount(p.cleartext, 'cleartext', true);
  return {
    to: parseAddress(p.token, 'token'),
    data: encodeFunctionData({
      abi: TOKEN_ABI,
      functionName: 'finalizeUnwrap',
      args: [p.requestId, p.cleartext, p.decryptionProof],
    }),
    value: 0n,
  };
}
