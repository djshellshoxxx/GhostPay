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

export const INITIAL_POS_STATE: PosState = { status: 'idle', paidMinor: 0n };

/**
 * Pure POS session reducer.
 *
 * @param state Current state.
 * @param event Event.
 * @param now Injected unix seconds.
 * @returns New state; `accepted:false` when the event is ignored (terminal state, wrong invoice, illegal order).
 * @throws {HooksError} `bad-ttl`, `bad-amount`, or `bad-time-policy` for malformed runtime inputs.
 * @security Terminal states absorb everything, so a late or replayed payment event cannot resurrect a closed sale. Sessions are shorexport function posReduce(state: PosState, event: PosEvent, now: number): PosResult {
  const no = { state, accepted: false } as const;
  if (event.type === 'start') {
    if (state.status !== 'idle') return no;
    if (!Number.isInteger(event.ttlSeconds) || event.ttlSeconds < MIN_SESSION_TTL || event.ttlSeconds > MAX_SESSION_TTL)
      throw new HooksError('bad-ttl');
    if (typeof event.dueMinor !== 'bigint' || event.dueMinor <= 0n) throw new HooksError('bad-amount');
    // A non-finite clock would create an immortal session; addition must remain a safe integer.
    if (typeof now !== 'number' || !Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - event.ttlSeconds)
      throw new HooksError('bad-time-policy');
    return {
      accepted: true,
      state: {
        status: 'awaiting',
        sessionId: event.sessionId,
        invoiceId: event.invoiceId,
        currency: event.currency,
        dueMinor: event.dueMinor,
        paidMinor: 0n,
        expiresAt: now + event.ttlSeconds,
      },
    };
  }
  if (state.status !== 'awaiting') return no;
  // Do not accept payments, ticks or cancellation against a malformed or unbounded expiry.
  if (typeof now !== 'number' || !Number.isSafeInteger(now) || now < 0 ||
      typeof state.expiresAt !== 'number' || !Number.isSafeInteger(state.expiresAt) || state.expiresAt < 0)
    throw new HooksError('bad-time-policy');
  if (event.type === 'cancel') return { accepted: true, state: { ...state, status: 'cancelled' } };
  if (now >= state.expiresAt) return { accepted: event.type === 'tick', state: { ...state, status: 'expired' } };
  if (event.type !== 'payment') return no;
  if (event.invoiceId !== state.invoiceId || event.currency !== state.currency) return no;
  if (typeof event.amountMinor !== 'bigint') throw new HooksError('bad-amount');
  if (event.amountMinor <= 0n) return no;
  const paidMinor = state.paidMinor + event.amountMinor;
  const status: PosStatus = state.dueMinor !== undefined && paidMinor >= state.dueMinor ? 'paid' : 'awaiting';
  return { accepted: true, state: { ...state, paidMinor, status } };
}
