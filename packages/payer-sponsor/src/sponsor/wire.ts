import { isHex, type Address, type Hex } from 'viem';
import { PayerSponsorError } from '../errors.js';
import { parseAddress } from '../routerTargets.js';
import type { RouterTarget } from '../routerTargets.js';
import { NO_PERMIT, type RelayPayIntent, type RelayPermit } from '../relay/intent.js';
import type { DelegatePayIntent } from '../eip7702/intent.js';
import type { PackedUserOperation } from '../erc4337/userop.js';
import type {
  Eip7702SubmitRequest,
  QuoteRequest,
  RelaySubmitRequest,
  SignedAuthorizationWire,
  SponsoredMode,
  SponsorUserOpRequest,
  SubmitUserOpRequest,
} from './types.js';

const bad = (why: string): never => {
  throw new PayerSponsorError('BAD_REQUEST', `invalid request: ${why}`);
};

type Obj = Readonly<Record<string, unknown>>;

/**
 * Asserts a JSON object.
 *
 * @param v Parsed JSON value.
 * @param what Field description for the error.
 * @returns The object.
 */
export function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return bad(`${what} must be an object`);
  return v as Obj;
}

function str(o: Obj, k: string): string {
  const v = o[k];
  return typeof v === 'string' ? v : bad(`${k} must be a string`);
}

function int(o: Obj, k: string): number {
  const v = o[k];
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : bad(`${k} must be a non-negative integer`);
}

function big(o: Obj, k: string): bigint {
  const v = o[k];
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(v)) return bad(`${k} must be a decimal string`);
  const n = BigInt(v);
  return n < 2n ** 256n ? n : bad(`${k} out of range`);
}

function hex(o: Obj, k: string, bytes?: number): Hex {
  const v = o[k];
  if (typeof v !== 'string' || !isHex(v, { strict: true }) || v.length % 2 !== 0) return bad(`${k} must be hex`);
  if (bytes !== undefined && v.length !== 2 + bytes * 2) return bad(`${k} must be ${bytes} bytes`);
  if (v.length > 2 + 2 * 16_384) return bad(`${k} too long`);
  return v;
}

function addr(o: Obj, k: string): Address {
  return parseAddress(o[k]);
}

const MODES = new Set<string>(['permit-relay', 'eip7702-sponsored', 'erc4337-paymaster']);

/**
 * Parses a sponsored mode.
 *
 * @param v Candidate.
 * @returns The mode.
 */
export function sponsoredMode(v: unknown): SponsoredMode {
  return typeof v === 'string' && MODES.has(v) ? (v as SponsoredMode) : bad('mode must be a sponsored mode');
}

/**
 * Parses `POST /v1/quote`.
 *
 * @param body Parsed JSON.
 * @returns The request.
 */
export function parseQuoteRequest(body: unknown): QuoteRequest {
  const o = obj(body, 'body');
  return { mode: sponsoredMode(o['mode']), chainId: int(o, 'chainId'), token: addr(o, 'token'), gross: big(o, 'gross') };
}

function router(v: unknown): RouterTarget {
  const o = obj(v, 'router');
  const address = addr(o, 'address');
  if (o['kind'] === 'ghostpay') return { kind: 'ghostpay', address };
  if (o['kind'] === 'policy') {
    const p = obj(o['policy'], 'policy');
    return { kind: 'policy', address, policy: { owner: addr(p, 'owner'), policyHash: hex(p, 'policyHash', 32) } };
  }
  return bad('router.kind must be ghostpay or policy');
}

function relayIntent(v: unknown): RelayPayIntent {
  const o = obj(v, 'intent');
  return {
    payer: addr(o, 'payer'),
    router: addr(o, 'router'),
    token: addr(o, 'token'),
    stealth: addr(o, 'stealth'),
    gross: big(o, 'gross'),
    sponsorFee: big(o, 'sponsorFee'),
    sponsorFeeTo: addr(o, 'sponsorFeeTo'),
    deadline: big(o, 'deadline'),
    nonce: big(o, 'nonce'),
    payloadHash: hex(o, 'payloadHash', 32),
  };
}

function delegateIntent(v: unknown): DelegatePayIntent {
  const o = obj(v, 'intent');
  return {
    router: addr(o, 'router'),
    token: addr(o, 'token'),
    stealth: addr(o, 'stealth'),
    gross: big(o, 'gross'),
    sponsorFee: big(o, 'sponsorFee'),
    sponsorFeeTo: addr(o, 'sponsorFeeTo'),
    deadline: big(o, 'deadline'),
    nonce: big(o, 'nonce'),
    payloadHash: hex(o, 'payloadHash', 32),
  };
}

function permit(v: unknown): RelayPermit {
  if (v === undefined) return NO_PERMIT;
  const o = obj(v, 'permit');
  const vv = int(o, 'v');
  if (vv > 255) return bad('permit.v out of range');
  return { value: big(o, 'value'), deadline: big(o, 'deadline'), v: vv, r: hex(o, 'r', 32), s: hex(o, 's', 32) };
}

/**
 * Parses a PH-2 submit body.
 *
 * @param body Parsed JSON.
 * @returns The request.
 */
export function parseRelaySubmit(body: unknown): RelaySubmitRequest {
  const o = obj(body, 'body');
  return {
    quoteId: str(o, 'quoteId'),
    chainId: int(o, 'chainId'),
    router: router(o['router']),
    intent: relayIntent(o['intent']),
    routerCalldata: hex(o, 'routerCalldata'),
    sig: hex(o, 'sig', 65),
    permit: permit(o['permit']),
  };
}

function authorization(v: unknown): SignedAuthorizationWire {
  const o = obj(v, 'authorization');
  const yParity = int(o, 'yParity');
  if (yParity > 1) return bad('yParity must be 0 or 1');
  return { chainId: int(o, 'chainId'), address: addr(o, 'address'), nonce: int(o, 'nonce'), r: hex(o, 'r', 32), s: hex(o, 's', 32), yParity };
}

/**
 * Parses a PH-3 submit body.
 *
 * @param body Parsed JSON.
 * @returns The request.
 */
export function parseEip7702Submit(body: unknown): Eip7702SubmitRequest {
  const o = obj(body, 'body');
  return {
    quoteId: str(o, 'quoteId'),
    chainId: int(o, 'chainId'),
    payer: addr(o, 'payer'),
    router: router(o['router']),
    intent: delegateIntent(o['intent']),
    routerCalldata: hex(o, 'routerCalldata'),
    sig: hex(o, 'sig', 65),
    authorization: authorization(o['authorization']),
  };
}

function userOp(v: unknown): PackedUserOperation {
  const o = obj(v, 'userOp');
  return {
    sender: addr(o, 'sender'),
    nonce: big(o, 'nonce'),
    initCode: hex(o, 'initCode'),
    callData: hex(o, 'callData'),
    accountGasLimits: hex(o, 'accountGasLimits', 32),
    preVerificationGas: big(o, 'preVerificationGas'),
    gasFees: hex(o, 'gasFees', 32),
    paymasterAndData: hex(o, 'paymasterAndData'),
    signature: hex(o, 'signature'),
  };
}

/**
 * Parses a PH-4 sponsor / submit body.
 *
 * @param body Parsed JSON.
 * @returns The request (usable as `SponsorUserOpRequest` and `SubmitUserOpRequest`).
 */
export function parseUserOpRequest(body: unknown): SponsorUserOpRequest & SubmitUserOpRequest {
  const o = obj(body, 'body');
  return {
    quoteId: str(o, 'quoteId'),
    chainId: int(o, 'chainId'),
    router: router(o['router']),
    routerCalldata: hex(o, 'routerCalldata'),
    owner: addr(o, 'owner'),
    saltNonce: big(o, 'saltNonce'),
    sponsorFee: big(o, 'sponsorFee'),
    userOp: userOp(o['userOp']),
  };
}

/**
 * JSON replacer that writes bigints as decimal strings.
 *
 * @param _k Key (unused).
 * @param v Value.
 * @returns JSON-safe value.
 */
export function bigintReplacer(_k: string, v: unknown): unknown {
  return typeof v === 'bigint' ? v.toString() : v;
}
