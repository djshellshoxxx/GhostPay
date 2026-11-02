// Pure POS session logic, a deliberate MIRROR of posReduce in @ghostpay/merchant-hooks (packages/merchant-hooks/src/pos.ts)
// so this static page needs no bundler. parity.test.mjs checks both give identical results; keep them in sync.
export const MIN_TTL = 30;
export const MAX_TTL = 900;
export const MAX_QR_BYTES = 2953;
export const INITIAL = Object.freeze({ status: 'idle', paidMinor: 0n });

/**
 * Codes the GhostPay app reads invoice minor units with 0 decimals (apps/web/src/lib/format.ts fiatDecimals; the shop
 * plugins and merchant-checkout/money.mjs use the same table). Every other code has 2, KWD included.
 */
export const ZERO_DECIMAL_CURRENCIES = Object.freeze(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF']);

export function fiatDecimals(currency) {
  return ZERO_DECIMAL_CURRENCIES.includes(currency) ? 0 : 2;
}

/**
 * "12.50" USD -> 1250n, "1500" JPY -> 1500n (string math). Returns undefined if invalid or when the amount needs more
 * decimals than the currency has ("1500.5" JPY, "12.345" KWD): never rounds.
 */
export function parseMinor(s, currency) {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return undefined;
  const m = /^(0|[1-9][0-9]{0,15})(?:\.([0-9]{1,8}))?$/.exec(s.trim());
  if (!m) return undefined;
  const d = fiatDecimals(currency);
  const frac = (m[2] ?? '').replace(/0+$/, '');
  if (frac.length > d) return undefined;
  return BigInt(m[1]) * 10n ** BigInt(d) + BigInt(frac.padEnd(d, '0') || '0');
}

export function formatMinor(v, currency) {
  const d = fiatDecimals(currency);
  if (d === 0) return v.toString();
  const s = v.toString().padStart(d + 1, '0');
  return `${s.slice(0, -d)}.${s.slice(-d)}`;
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
