import { HooksError } from './errors.js';
import { assertPaymentLink, type LinkOptions } from './link.js';

/** QR version 40, error correction L, byte mode capacity. */
export const MAX_QR_BYTES = 2953;
export const MIN_SESSION_TTL = 30;
export const MAX_SESSION_TTL = 900;

/**
 * Build the string to encode into a QR code for a payment link.
 *
 * @param link Payment link (validated).
 * @returns Payload and byte length. Rendering is the app's job (apps/web pins qrcode-generator); use error correction L or M for long links.
 * @throws {HooksError} `bad-link` or `qr-too-large`.
 * @security The payload is a bearer secret; display only to the paying customer and clear the screen on session end.
 */
export function buildQrPayload(link: string, options: LinkOptions = {}): { payload: string; bytes: number } {
  const { base, fragment } = assertPaymentLink(link, options);
  const payload = base + fragment;
  const bytes = new TextEncoder().encode(payload).length;
  if (bytes > MAX_QR_BYTES) throw new HooksError('qr-too-large');
  return { payload, bytes };
}

export type PosStatus = 'idle' | 'awaiting' | 'paid' | 'expired' | 'cancelled';

export interface PosState {
  readonly status: PosStatus;
  readonly sessionId?: string;
  readonly invoiceId?: string;
  readonly currency?: string;
  readonly dueMinor?: bigint;
  readonly paidMinor: bigint;
  readonly expiresAt?: number;
}

/**
 * Input of {@link posReduce}. These are POS-internal events, not webhook bodies: a `payment` carries
 * the amount of ONE payment and successive payments are added up. A webhook's `data.amountMinor` is
 * the cumulative total received for the invoice (`docs/remote/usability/specs/webhooks.md` R8), so
 * an integrator feeding webhooks into the POS must pass the delta (`amountMinor - state.paidMinor`,
 * skipped when not positive), not the webhook value itself. Neither is payment proof: confirm with
 * the canonical on-chain verifier.
 */
export type PosEvent =
  | { readonly type: 'start'; readonly sessionId: string; readonly invoiceId: string; readonly currency: string; readonly dueMinor: bigint; readonly ttlSeconds: number }
  | { readonly type: 'payment'; readonly invoiceId: string; readonly currency: string; readonly amountMinor: bigint }
  | { readonly type: 'tick' }
  | { readonly type: 'cancel' };

export interface PosResult {
  readonly state: PosState;
  readonly accepted: boolean;
}

export const INITIAL_POS_STATE: PosState = Object.freeze({ status: 'idle', paidMinor: 0n });

function isUnixSecond(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function assertIdentity(sessionId: unknown, invoiceId: unknown, currency: unknown): void {
  if (![sessionId, invoiceId, currency].every(value => typeof value === 'string' && value.trim().length > 0))
    throw new HooksError('bad-session');
}

/**
 * Pure POS session reducer.
 *
 * @param state Current state.
 * @param event Event.
 * @param now Injected unix seconds.
 * @returns New state; `accepted:false` when the event is ignored (terminal state, wrong invoice, illegal order).
 * @throws {HooksError} `bad-session`, `bad-ttl`, `bad-amount`, or `bad-time-policy` for malformed runtime inputs.
 * @security Terminal states absorb everything, so a late or replayed payment event cannot resurrect a closed sale. Sessions are short-lived (30..900s).
 */
export function posReduce(state: PosState, event: PosEvent, now: number): PosResult {
  const no = { state, accepted: false } as const;
  if (event.type === 'start') {
    if (state.status !== 'idle') return no;
    const { sessionId, invoiceId, currency, dueMinor, ttlSeconds } = event;
    assertIdentity(sessionId, invoiceId, currency);
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < MIN_SESSION_TTL || ttlSeconds > MAX_SESSION_TTL)
      throw new HooksError('bad-ttl');
    if (typeof dueMinor !== 'bigint' || dueMinor <= 0n) throw new HooksError('bad-amount');
    if (!isUnixSecond(now) || now > Number.MAX_SAFE_INTEGER - ttlSeconds) throw new HooksError('bad-time-policy');
    return {
      accepted: true,
      state: { status: 'awaiting', sessionId, invoiceId, currency, dueMinor, paidMinor: 0n, expiresAt: now + ttlSeconds },
    };
  }
  if (state.status !== 'awaiting') return no;
  assertIdentity(state.sessionId, state.invoiceId, state.currency);
  const { dueMinor, paidMinor, expiresAt } = state;
  if (typeof dueMinor !== 'bigint' || dueMinor <= 0n ||
      typeof paidMinor !== 'bigint' || paidMinor < 0n || paidMinor >= dueMinor)
    throw new HooksError('bad-amount');

  if (event.type === 'cancel') {
    const cancelled = { ...state, status: 'cancelled' as const };
    // A broken clock must not block cancellation or leave an invalid deadline on the closed sale.
    if (!isUnixSecond(expiresAt)) delete cancelled.expiresAt;
    return { accepted: true, state: cancelled };
  }
  if (!isUnixSecond(now) || !isUnixSecond(expiresAt)) throw new HooksError('bad-time-policy');
  if (now >= expiresAt) return { accepted: event.type === 'tick', state: { ...state, status: 'expired' } };
  if (event.type !== 'payment' || event.invoiceId !== state.invoiceId || event.currency !== state.currency) return no;
  const { amountMinor } = event;
  if (typeof amountMinor !== 'bigint') throw new HooksError('bad-amount');
  if (amountMinor <= 0n) return no;
  const total = paidMinor + amountMinor;
  return { accepted: true, state: { ...state, paidMinor: total, status: total >= dueMinor ? 'paid' : 'awaiting' } };
}
