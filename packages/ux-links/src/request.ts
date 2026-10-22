import { fail } from './errors.js';
import { parseAmount, validateAsset, MAX_DECIMALS } from './amount.js';
import { validateText } from './text.js';
import { validateMetaAddress } from './target.js';
import { buildPaymentUri, parsePaymentUri, MAX_MEMO } from './uri.js';
import { exactRecord, isPosInt, isUint } from './validate.js';

/** Longest allowed request lifetime: 365 days. */
export const MAX_LIFETIME_SECONDS = 365 * 24 * 3600;

/** A locally stored payment request (receiver side). */
export interface PaymentRequest {
  readonly version: 1;
  /** 32 lowercase hex chars (128-bit random, local identifier only). */
  readonly id: string;
  readonly target: string;
  /** Canonical decimal amount, at most `decimals` fractional digits, > 0. */
  readonly amount: string;
  readonly asset: string;
  readonly decimals: number;
  readonly chainId?: number;
  readonly memo?: string;
  /** Unix seconds. */
  readonly createdAt: number;
  /** Unix seconds; expired when `now >= expiresAt`. */
  readonly expiresAt: number;
}

/** Input to {@link createPaymentRequest}. */
export interface NewRequestInput {
  readonly target: string;
  readonly amount: string;
  readonly asset: string;
  readonly decimals: number;
  readonly chainId?: number;
  readonly memo?: string;
  /** Lifetime in seconds, 1..{@link MAX_LIFETIME_SECONDS}. */
  readonly ttlSeconds: number;
}

/** Injected randomness (defaults to WebCrypto). */
export type RandomBytes = (n: number) => Uint8Array;

const defaultRandom: RandomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

const KEYS = [
  'version',
  'id',
  'target',
  'amount',
  'asset',
  'decimals',
  'chainId',
  'memo',
  'createdAt',
  'expiresAt',
];
const REQUIRED = ['version', 'id', 'target', 'amount', 'asset', 'decimals', 'createdAt', 'expiresAt'];

/**
 * Validates untrusted data as a {@link PaymentRequest} (strict, exact keys).
 *
 * @throws {LinkError} `REQUEST` (or a field-specific code) on any violation.
 * @security Untrusted input (imports, storage). Unknown keys are rejected.
 */
export function validatePaymentRequest(v: unknown): PaymentRequest {
  const r = exactRecord(v, KEYS, REQUIRED, 'REQUEST', 'request');
  if (r['version'] !== 1) return fail('REQUEST', 'version');
  const id = r['id'];
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) return fail('REQUEST', 'id');
  const decimals = r['decimals'];
  if (
    typeof decimals !== 'number' ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > MAX_DECIMALS
  ) {
    return fail('REQUEST', 'decimals');
  }
  const target = validateMetaAddress(r['target']);
  if (target !== r['target']) return fail('REQUEST', 'target'); // must already be canonical
  const amount = r['amount'] as string;
  parseAmount(amount, decimals);
  const asset = validateAsset(r['asset']);
  const createdAt = r['createdAt'];
  const expiresAt = r['expiresAt'];
  if (!isPosInt(createdAt)) return fail('REQUEST', 'createdAt');
  if (!isPosInt(expiresAt) || expiresAt <= createdAt || expiresAt - createdAt > MAX_LIFETIME_SECONDS) {
    return fail('REQUEST', 'expiresAt');
  }
  const out: { -readonly [K in keyof PaymentRequest]: PaymentRequest[K] } = {
    version: 1,
    id,
    target,
    amount,
    asset,
    decimals,
    createdAt,
    expiresAt,
  };
  if (r['chainId'] !== undefined) {
    if (!isPosInt(r['chainId'])) return fail('REQUEST', 'chainId');
    out.chainId = r['chainId'];
  }
  if (r['memo'] !== undefined) out.memo = validateText(r['memo'], MAX_MEMO, 'TEXT', 'memo');
  return out;
}

/**
 * Creates a validated payment request.
 *
 * @param input Request fields.
 * @param nowSeconds Injected clock (unix seconds, positive safe integer).
 * @param rng Injected randomness for the local id (default WebCrypto).
 * @throws {LinkError}
 * @security The id is a local label, not a secret and not a payment identifier on-chain.
 * @testVector request-create
 */
export function createPaymentRequest(
  input: NewRequestInput,
  nowSeconds: number,
  rng: RandomBytes = defaultRandom,
): PaymentRequest {
  if (!isPosInt(nowSeconds)) return fail('REQUEST', 'now');
  if (!isPosInt(input.ttlSeconds) || input.ttlSeconds > MAX_LIFETIME_SECONDS)
    return fail('REQUEST', 'ttlSeconds');
  const bytes = rng(16);
  if (!(bytes instanceof Uint8Array) || bytes.length !== 16) return fail('REQUEST', 'id');
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const draft: Record<string, unknown> = {
    version: 1,
    id,
    target: input.target,
    amount: input.amount,
    asset: input.asset,
    decimals: input.decimals,
    createdAt: nowSeconds,
    expiresAt: nowSeconds + input.ttlSeconds,
  };
  if (input.chainId !== undefined) draft['chainId'] = input.chainId;
  if (input.memo !== undefined) draft['memo'] = input.memo;
  return validatePaymentRequest(draft);
}

/** Lifecycle status of a request. */
export type RequestStatus = 'pending' | 'paid' | 'paid_late' | 'expired' | 'cancelled';

/** Locally observed events for a request. */
export interface RequestEvents {
  /** Unix seconds when a matching payment was observed. */
  readonly paidAt?: number;
  /** Unix seconds when the receiver cancelled. */
  readonly cancelledAt?: number;
}

/**
 * Computes request status from a caller-supplied clock and local events.
 *
 * @remarks Precedence: a payment observed before expiry is `paid`; at or after
 * expiry `paid_late` (the receiver decides whether to honour it); otherwise a
 * cancellation yields `cancelled`; otherwise `expired` when `now >= expiresAt`,
 * else `pending`. Events dated in the future relative to `now` are ignored.
 * @throws {LinkError} If `now` or an event is not a non-negative safe integer.
 * @security Advisory, client-side only; expiry is not enforced on-chain.
 */
export function requestStatus(
  req: PaymentRequest,
  events: RequestEvents,
  nowSeconds: number,
): { status: RequestStatus; secondsRemaining: number } {
  if (!isUint(nowSeconds)) return fail('REQUEST', 'now');
  const { paidAt, cancelledAt } = events;
  if (paidAt !== undefined && !isUint(paidAt)) return fail('REQUEST', 'paidAt');
  if (cancelledAt !== undefined && !isUint(cancelledAt)) return fail('REQUEST', 'cancelledAt');
  const secondsRemaining = Math.max(0, req.expiresAt - nowSeconds);
  let status: RequestStatus;
  if (paidAt !== undefined && paidAt <= nowSeconds) status = paidAt < req.expiresAt ? 'paid' : 'paid_late';
  else if (cancelledAt !== undefined && cancelledAt <= nowSeconds) status = 'cancelled';
  else status = nowSeconds >= req.expiresAt ? 'expired' : 'pending';
  return { status, secondsRemaining };
}

/** Builds the shareable `ghostpay:` URI for a request (no secret). */
export function requestToUri(req: PaymentRequest, secret?: string): string {
  const v = validatePaymentRequest(req);
  return buildPaymentUri({
    target: v.target,
    amount: v.amount,
    asset: v.asset,
    expiresAt: v.expiresAt,
    ...(v.chainId !== undefined ? { chainId: v.chainId } : {}),
    ...(v.memo !== undefined ? { memo: v.memo } : {}),
    ...(secret !== undefined ? { secret } : {}),
  });
}

/** A payment request as seen by the payer, parsed from a link. */
export interface IncomingRequest {
  readonly target: string;
  readonly amount: string;
  readonly asset: string;
  readonly expiresAt: number;
  readonly chainId?: number;
  readonly memo?: string;
  readonly secret?: string;
  readonly expired: boolean;
  readonly secondsRemaining: number;
}

/**
 * Parses a link into a payer-side request, requiring amount, asset and expiry.
 *
 * @param uri Untrusted link.
 * @param nowSeconds Injected clock.
 * @param opts `maxLifetime` bounds how far in the future `exp` may be (default 365 days).
 * @throws {LinkError}
 * @security Untrusted input. A link with a far-future expiry is rejected so
 * "never expires" requests cannot be forged.
 */
export function requestFromUri(
  uri: unknown,
  nowSeconds: number,
  opts: { maxLifetime?: number } = {},
): IncomingRequest {
  if (!isPosInt(nowSeconds)) return fail('REQUEST', 'now');
  const p = parsePaymentUri(uri);
  if (p.amount === undefined || p.asset === undefined || p.expiresAt === undefined) return fail('REQUEST');
  if (p.expiresAt - nowSeconds > (opts.maxLifetime ?? MAX_LIFETIME_SECONDS)) return fail('REQUEST', 'exp');
  return {
    target: p.target,
    amount: p.amount,
    asset: p.asset,
    expiresAt: p.expiresAt,
    ...(p.chainId !== undefined ? { chainId: p.chainId } : {}),
    ...(p.memo !== undefined ? { memo: p.memo } : {}),
    ...(p.secret !== undefined ? { secret: p.secret } : {}),
    expired: nowSeconds >= p.expiresAt,
    secondsRemaining: Math.max(0, p.expiresAt - nowSeconds),
  };
}
