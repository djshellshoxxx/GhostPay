import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { HooksError } from './errors.js';

export const MIN_SECRET_BYTES = 32;
export const DEFAULT_TOLERANCE_SECONDS = 300;

const SIG_RE = /^[0-9a-f]{64}$/;
const NONCE_RE = /^[0-9a-f]{16,64}$/;
const TS_RE = /^[0-9]{1,12}$/;

export type VerifyFailure = 'malformed' | 'stale' | 'bad-signature' | 'replay';
export type VerifyResult =
  | { readonly ok: true; readonly timestamp: number; readonly nonce: string }
  | { readonly ok: false; readonly reason: VerifyFailure };

/** Replay store: `has` then `add` with expiry. Implementations must fail closed. */
export interface NonceStore {
  has(nonce: string, now: number): boolean;
  /** @returns false when the store refuses (full). */
  add(nonce: string, expiresAt: number, now: number): boolean;
}

/** Bounded in-memory nonce store. Fails closed when full of unexpired nonces. */
export class MemoryNonceStore implements NonceStore {
  private readonly map = new Map<string, number>();
  public constructor(private readonly maxEntries = 10_000) {}

  private prune(now: number): void {
    for (const [k, exp] of this.map) if (exp <= now) this.map.delete(k);
  }

  public has(nonce: string, now: number): boolean {
    const exp = this.map.get(nonce);
    return exp !== undefined && exp > now;
  }

  public add(nonce: string, expiresAt: number, now: number): boolean {
    if (this.map.size >= this.maxEntries) this.prune(now);
    if (this.map.size >= this.maxEntries) return false;
    this.map.set(nonce, expiresAt);
    return true;
  }
}

function macOf(secret: Uint8Array, t: number, n: string, body: string): string {
  return bytesToHex(hmac(sha256, secret, utf8ToBytes(`${t}.${n}.${body}`)));
}

/** Constant-time equality for equal-length ASCII strings. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function checkSecret(secret: Uint8Array): void {
  if (secret.length < MIN_SECRET_BYTES) throw new HooksError('weak-secret');
}

/**
 * Sign a webhook body.
 *
 * @param secret Shared secret, >= 32 random bytes.
 * @param body Exact request body string that will be sent.
 * @param ctx Injected clock (unix seconds) and nonce (16-64 lowercase hex chars; use fresh CSPRNG output).
 * @returns Value for the `GhostPay-Signature` header.
 * @throws {HooksError} `weak-secret` or `bad-nonce`.
 * @security Signature covers timestamp and nonce so a captured request cannot be replayed outside the window.
 */
export function signWebhook(secret: Uint8Array, body: string, ctx: { now: number; nonce: string }): string {
  checkSecret(secret);
  if (!NONCE_RE.test(ctx.nonce) || !Number.isSafeInteger(ctx.now) || ctx.now < 0) throw new HooksError('bad-nonce');
  return `t=${ctx.now},n=${ctx.nonce},v1=${macOf(secret, ctx.now, ctx.nonce, body)}`;
}

function parseHeader(h: string): { t: number; n: string; v1: string } | undefined {
  const parts = h.split(',');
  if (parts.length !== 3) return undefined;
  const [pt, pn, pv] = parts;
  if (pt?.startsWith('t=') !== true || pn?.startsWith('n=') !== true || pv?.startsWith('v1=') !== true) return undefined;
  const t = pt.slice(2);
  const n = pn.slice(2);
  const v1 = pv.slice(3);
  if (!TS_RE.test(t) || !NONCE_RE.test(n) || !SIG_RE.test(v1)) return undefined;
  return { t: Number(t), n, v1 };
}

/**
 * Verify a webhook request.
 *
 * @param secret Shared secret (>= 32 bytes).
 * @param body Raw body exactly as received (verify BEFORE parsing JSON).
 * @param header Signature header value.
 * @param ctx Injected clock, replay store and tolerance.
 * @returns Result with coarse failure reason.
 * @security Order: format, freshness, constant-time MAC, then replay. The nonce is stored only after a valid MAC so forged requests cannot fill the store. If the store is full the request is rejected as `replay` (fail closed).
 */
export function verifyWebhook(
  secret: Uint8Array,
  body: string,
  header: string,
  ctx: { now: number; nonces: NonceStore; toleranceSeconds?: number },
): VerifyResult {
  checkSecret(secret);
  const p = parseHeader(header);
  if (p === undefined) return { ok: false, reason: 'malformed' };
  const tol = ctx.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(ctx.now - p.t) > tol) return { ok: false, reason: 'stale' };
  if (!constantTimeEqual(macOf(secret, p.t, p.n, body), p.v1)) return { ok: false, reason: 'bad-signature' };
  if (ctx.nonces.has(p.n, ctx.now) || !ctx.nonces.add(p.n, p.t + tol + 1, ctx.now)) return { ok: false, reason: 'replay' };
  return { ok: true, timestamp: p.t, nonce: p.n };
}

export interface RetryPolicy {
  readonly baseSeconds?: number;
  readonly factor?: number;
  readonly maxSeconds?: number;
  readonly maxAttempts?: number;
}

/**
 * Delay before retry number `attempt` (1 = first retry after the first failure).
 *
 * @param attempt Integer >= 1.
 * @param jitterPermille Injected 0..1000; delay is scaled to 50%..100%.
 * @param policy Defaults 30s base, x2, 3600s cap, 8 attempts.
 * @returns Whole seconds, or `null` when attempts are exhausted.
 */
export function retryDelaySeconds(attempt: number, jitterPermille = 1000, policy: RetryPolicy = {}): number | null {
  const base = policy.baseSeconds ?? 30;
  const factor = policy.factor ?? 2;
  const max = policy.maxSeconds ?? 3600;
  const attempts = policy.maxAttempts ?? 8;
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isInteger(jitterPermille) || jitterPermille < 0 || jitterPermille > 1000)
    throw new HooksError('bad-retry');
  if (attempt > attempts) return null;
  const raw = Math.min(base * Math.pow(factor, attempt - 1), max);
  return Math.floor((raw * (500 + jitterPermille / 2)) / 1000);
}

export type WebhookEventType = 'invoice.paid' | 'invoice.partial' | 'invoice.over' | 'invoice.expired';

export interface WebhookEvent {
  readonly id: string;
  readonly type: WebhookEventType;
  readonly createdAt: number;
  readonly data: {
    readonly invoiceId: string;
    readonly currency: string;
    readonly amountMinor: string;
    readonly paymentId?: string;
  };
}

const TYPES: readonly string[] = ['invoice.paid', 'invoice.partial', 'invoice.over', 'invoice.expired'];
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

function strictObj(v: unknown, keys: readonly string[], required: readonly string[]): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new HooksError('bad-event');
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new HooksError('bad-event');
  for (const k of required) if (typeof o[k] === 'undefined') throw new HooksError('bad-event');
  return o;
}

/**
 * Validate an untrusted webhook event (after signature verification).
 *
 * @throws {HooksError} `bad-event` for unknown keys, bad types or formats.
 * @security Strict allow-list; never trust fields for routing without validating.
 */
export function parseWebhookEvent(json: string): WebhookEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new HooksError('bad-event');
  }
  const e = strictObj(raw, ['id', 'type', 'createdAt', 'data'], ['id', 'type', 'createdAt', 'data']);
  const d = strictObj(e.data, ['invoiceId', 'currency', 'amountMinor', 'paymentId'], ['invoiceId', 'currency', 'amountMinor']);
  const ok =
    typeof e.id === 'string' && ID_RE.test(e.id) &&
    typeof e.type === 'string' && TYPES.includes(e.type) &&
    typeof e.createdAt === 'number' && Number.isSafeInteger(e.createdAt) && e.createdAt >= 0 &&
    typeof d.invoiceId === 'string' && ID_RE.test(d.invoiceId) &&
    typeof d.currency === 'string' && /^[A-Z]{3}$/.test(d.currency) &&
    typeof d.amountMinor === 'string' && /^(?:0|[1-9][0-9]{0,29})$/.test(d.amountMinor) &&
    (d.paymentId === undefined || (typeof d.paymentId === 'string' && ID_RE.test(d.paymentId)));
  if (!ok) throw new HooksError('bad-event');
  return {
    id: e.id as string,
    type: e.type as WebhookEventType,
    createdAt: e.createdAt as number,
    data: {
      invoiceId: d.invoiceId as string,
      currency: d.currency as string,
      amountMinor: d.amountMinor as string,
      ...(d.paymentId === undefined ? {} : { paymentId: d.paymentId as string }),
    },
  };
}

/** Serialize an event with fixed key order (stable body for signing). */
export function serializeWebhookEvent(e: WebhookEvent): string {
  return JSON.stringify({
    id: e.id,
    type: e.type,
    createdAt: e.createdAt,
    data: {
      invoiceId: e.data.invoiceId,
      currency: e.data.currency,
      amountMinor: e.data.amountMinor,
      ...(e.data.paymentId === undefined ? {} : { paymentId: e.data.paymentId }),
    },
  });
}

/** Bounded at-most-once guard keyed by event id. Evicts oldest when full (documented limit). */
export class IdempotencyGuard {
  private readonly seen = new Set<string>();
  public constructor(private readonly maxEntries = 100_000) {}

  /** @returns true the first time `eventId` is claimed, false afterwards. */
  public claim(eventId: string): boolean {
    if (this.seen.has(eventId)) return false;
    if (this.seen.size >= this.maxEntries) {
      const oldest = this.seen.values().next();
      if (oldest.done !== true) this.seen.delete(oldest.value);
    }
    this.seen.add(eventId);
    return true;
  }

  /** Release a claim after a failed handler so a redelivery can retry. */
  public release(eventId: string): void {
    this.seen.delete(eventId);
  }
}
