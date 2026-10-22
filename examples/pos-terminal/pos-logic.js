// Pure POS session logic, a deliberate MIRROR of posReduce in @ghostpay/merchant-hooks (packages/merchant-hooks/src/pos.ts)
// so this static page needs no bundler. parity.test.mjs checks both give identical results; keep them in sync.
export const MIN_TTL = 30;
export const MAX_TTL = 900;
export const MAX_QR_BYTES = 2953;
export const INITIAL = Object.freeze({ status: 'idle', paidMinor: 0n });

/** "12.50" -> 1250n (string math, max 2 decimals). Returns undefined if invalid. */
export function parseMinor(s) {
  const m = /^(0|[1-9][0-9]{0,15})(?:\.([0-9]{1,2}))?$/.exec(s.trim());
  if (!m) return undefined;
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0');
}

export function formatMinor(v) {
  const s = v.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** Same rules as merchant-hooks assertPaymentLink + buildQrPayload; returns an error string or undefined. */
export function checkLink(link) {
  let u;
  try { u = new URL(link); } catch { return 'not a URL'; }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (!(u.protocol === 'https:' || (local && u.protocol === 'http:'))) return 'link must be https';
  if (u.username || u.password || u.search || link.includes('?')) return 'link must not have credentials or a query';
  if (!u.hash.startsWith('#gpi=v1.') || !/^[A-Za-z0-9_-]+$/.test(u.hash.slice('#gpi=v1.'.length))) return 'not a GhostPay payment link';
  if (new TextEncoder().encode(u.origin + u.pathname + u.hash).length > MAX_QR_BYTES) return 'link too long for a QR code';
  return undefined;
}

export function reduce(state, event, now) {
  const no = { state, accepted: false };
  if (event.type === 'start') {
    if (state.status !== 'idle') return no;
    if (!Number.isInteger(event.ttlSeconds) || event.ttlSeconds < MIN_TTL || event.ttlSeconds > MAX_TTL) throw new Error('bad-ttl');
    if (event.dueMinor <= 0n) throw new Error('bad-amount');
    return { accepted: true, state: { status: 'awaiting', sessionId: event.sessionId, invoiceId: event.invoiceId, currency: event.currency, dueMinor: event.dueMinor, paidMinor: 0n, expiresAt: now + event.ttlSeconds } };
  }
  if (state.status !== 'awaiting') return no;
  if (event.type === 'cancel') return { accepted: true, state: { ...state, status: 'cancelled' } };
  if (state.expiresAt !== undefined && now >= state.expiresAt) return { accepted: event.type === 'tick', state: { ...state, status: 'expired' } };
  if (event.type === 'tick') return no;
  if (event.invoiceId !== state.invoiceId || event.currency !== state.currency || event.amountMinor <= 0n) return no;
  const paidMinor = state.paidMinor + event.amountMinor;
  const status = state.dueMinor !== undefined && paidMinor >= state.dueMinor ? 'paid' : 'awaiting';
  return { accepted: true, state: { ...state, paidMinor, status } };
}
