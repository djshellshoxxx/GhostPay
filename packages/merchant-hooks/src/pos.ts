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
 * @throws {HooksError} `bad-ttl` or `bad-amount` on invalid `start` input.
 * @security Terminal states absorb everything, so a late or replayed payment event cannot resurrect a closed sale. Sessions are short-lived (30..900s).
 */
export function posReduce(state: PosState, event: PosEvent, now: number): PosResult {
  const no = { state, accepted: false } as const;
  if (event.type === 'start') {
    if (state.status !== 'idle') return no;
    if (!Number.isInteger(event.ttlSeconds) || event.ttlSeconds < MIN_SESSION_TTL || event.ttlSeconds > MAX_SESSION_TTL)
      throw new HooksError('bad-ttl');
    if (event.dueMinor <= 0n) throw new HooksError('bad-amount');
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
  if (event.type === 'cancel') return { accepted: true, state: { ...state, status: 'cancelled' } };
  if (state.expiresAt !== undefined && now >= state.expiresAt) return { accepted: event.type === 'tick', state: { ...state, status: 'expired' } };
  if (event.type === 'tick') return no;
  if (event.invoiceId !== state.invoiceId || event.currency !== state.currency || event.amountMinor <= 0n) return no;
  const paidMinor = state.paidMinor + event.amountMinor;
  const status: PosStatus = state.dueMinor !== undefined && paidMinor >= state.dueMinor ? 'paid' : 'awaiting';
  return { accepted: true, state: { ...state, paidMinor, status } };
}
