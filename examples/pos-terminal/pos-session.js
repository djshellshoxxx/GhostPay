// DOM-free session layer of the POS terminal example: sale creation, exact amount entry, the customer display model,
// feed-sourced payment completion, cancellation/reset and reload persistence, all on top of the mirrored reducer in
// pos-logic.js. Every function is pure (clock, ids and storage are injected by pos.js); session.test.mjs drives the
// full lifecycle with a deterministic clock, a storage double and a mock wallet/merchant server.
import { INITIAL, MAX_TTL, checkLink, fiatDecimals, formatMinor, parseMinor, reduce } from './pos-logic.js';

/** sessionStorage key. Only an awaiting sale is stored, never the payment link. */
export const STORAGE_KEY = 'ghostpay-pos/v1/sale';
export const SALE_TTL_SECONDS = 300;
/** Event ids remembered per sale for replay detection. Cumulative totals make older replays harmless anyway. */
export const MAX_SEEN_EVENTS = 64;
/** Upper bound on one feed message and on the stored record (bytes of UTF-16 code units, checked before parsing). */
export const MAX_FEED_BYTES = 4096;
const MAX_RECORD_CHARS = 8192;
/** Same identifier rule as merchant-hooks webhook ids, so a feed invoiceId can match the terminal's reference. */
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const SESSION_ID_RE = /^[0-9a-f]{16}$/;
const UINT_RE = /^(?:0|[1-9][0-9]{0,39})$/;
const WEBHOOK_AMOUNT_RE = /^(?:0|[1-9][0-9]{0,29})$/;
const EVENT_TYPES = ['invoice.paid', 'invoice.partial', 'invoice.over', 'invoice.expired'];

/**
 * Session = reducer state plus terminal bookkeeping:
 * - verifiedMinor: highest cumulative total counted from the payment feed for this sale;
 * - manualMinor: sum of demo amounts entered by hand (never verified);
 * - seen: recent feed event ids; restored: reloaded without its link; link: payment link, memory only.
 * Invariant while awaiting: sale.paidMinor === verifiedMinor + manualMinor.
 */
export const IDLE_SESSION = Object.freeze({
  sale: INITIAL, verifiedMinor: 0n, manualMinor: 0n, seen: Object.freeze([]), restored: false,
});

function isClosed(status) {
  return status === 'paid' || status === 'expired' || status === 'cancelled';
}

/** A closed sale keeps its totals for the receipt line but drops the bearer link. */
function withSale(session, sale) {
  const next = { ...session, sale };
  if (isClosed(sale.status)) delete next.link;
  return Object.freeze(next);
}

/** Run the reducer; malformed clocks become a result instead of an exception. */
function step(sale, event, now) {
  try {
    return reduce(sale, event, now);
  } catch (error) {
    if (error instanceof Error && error.message === 'bad-time-policy') return undefined;
    throw error;
  }
}

/**
 * Open a sale. Input fields are raw strings from the terminal.
 * @returns `{ session, error? }`; on error the input session is returned unchanged.
 */
export function startSale(session, input, now, newSessionId) {
  const fail = (error, detail) => ({ session, error, ...(detail === undefined ? {} : { detail }) });
  if (session.sale.status !== 'idle') return fail('busy');
  const currency = String(input.currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return fail('bad-currency');
  const dueMinor = parseMinor(String(input.amount ?? ''), currency);
  if (dueMinor === undefined || dueMinor <= 0n) return fail('bad-amount');
  const link = String(input.link ?? '').trim();
  const linkError = checkLink(link);
  if (linkError !== undefined) return fail('bad-link', linkError);
  const reference = String(input.invoiceId ?? '').trim();
  if (reference !== '' && !ID_RE.test(reference)) return fail('bad-invoice');
  const ttlSeconds = input.ttlSeconds ?? SALE_TTL_SECONDS;
  const sessionId = newSessionId();
  // Without a reference the sale gets its own id, so a delayed report for an earlier sale can never match it.
  const invoiceId = reference || `pos-${sessionId}`;
  let result;
  try {
    result = reduce(session.sale, { type: 'start', sessionId, invoiceId, currency, dueMinor, ttlSeconds }, now);
  } catch (error) {
    if (error instanceof Error && error.message === 'bad-ttl') return fail('bad-ttl');
    if (error instanceof Error && error.message === 'bad-time-policy') return fail('bad-clock');
    throw error;
  }
  return { session: Object.freeze({ ...IDLE_SESSION, sale: result.state, link }) };
}

/** Advance the countdown. `clockOk:false` leaves the session untouched so the caller can retry. */
export function tickSession(session, now) {
  if (session.sale.status !== 'awaiting') return { session, clockOk: true };
  const result = step(session.sale, { type: 'tick' }, now);
  if (result === undefined) return { session, clockOk: false };
  return { session: result.state === session.sale ? session : withSale(session, result.state), clockOk: true };
}

/** Cancel the active sale. Needs no clock; keeps the recorded partial total. */
export function cancelSale(session, now) {
  if (session.sale.status !== 'awaiting') return session;
  return withSale(session, reduce(session.sale, { type: 'cancel' }, now).state);
}

/** Start over after a closed sale. Nothing (totals, reports, link) carries into the next sale. */
export function newSale() {
  return IDLE_SESSION;
}

/**
 * DEMO ONLY: add an amount typed by staff. It counts toward the reducer total but is tracked as unverified.
 * @returns `{ session, error? }` with `not-active`, `bad-received` or `bad-clock`.
 */
export function recordManualPayment(session, amountText, now) {
  const { sale } = session;
  if (sale.status !== 'awaiting') return { session, error: 'not-active' };
  const amountMinor = parseMinor(String(amountText ?? ''), sale.currency);
  if (amountMinor === undefined || amountMinor <= 0n) return { session, error: 'bad-received' };
  const result = step(sale, { type: 'payment', invoiceId: sale.invoiceId, currency: sale.currency, amountMinor }, now);
  if (result === undefined) return { session, error: 'bad-clock' };
  const next = withSale(session, result.state);
  return { session: result.accepted ? Object.freeze({ ...next, manualMinor: session.manualMinor + amountMinor }) : next };
}

function strictKeys(value, allowed, required) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const keys = Object.keys(value);
  if (!keys.every(k => allowed.includes(k)) || !required.every(k => value[k] !== undefined)) return undefined;
  return value;
}

/**
 * Strict mirror of merchant-hooks `parseWebhookEvent` for a static page without a bundler (session.test.mjs checks
 * both accept exactly the same bodies). Returns the event or undefined.
 */
export function parseFeedEvent(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return undefined; }
  const e = strictKeys(parsed, ['id', 'type', 'createdAt', 'data'], ['id', 'type', 'createdAt', 'data']);
  const d = e && strictKeys(e.data, ['invoiceId', 'currency', 'amountMinor', 'paymentId'], ['invoiceId', 'currency', 'amountMinor']);
  if (!d) return undefined;
  const ok = typeof e.id === 'string' && ID_RE.test(e.id) &&
    typeof e.type === 'string' && EVENT_TYPES.includes(e.type) &&
    typeof e.createdAt === 'number' && Number.isSafeInteger(e.createdAt) && e.createdAt >= 0 &&
    typeof d.invoiceId === 'string' && ID_RE.test(d.invoiceId) &&
    typeof d.currency === 'string' && /^[A-Z]{3}$/.test(d.currency) &&
    typeof d.amountMinor === 'string' && WEBHOOK_AMOUNT_RE.test(d.amountMinor) &&
    (d.paymentId === undefined || (typeof d.paymentId === 'string' && ID_RE.test(d.paymentId)));
  if (!ok) return undefined;
  return {
    id: e.id, type: e.type, createdAt: e.createdAt,
    data: {
      invoiceId: d.invoiceId, currency: d.currency, amountMinor: d.amountMinor,
      ...(d.paymentId === undefined ? {} : { paymentId: d.paymentId }),
    },
  };
}

function remember(seen, id) {
  return Object.freeze([...seen, id].slice(-MAX_SEEN_EVENTS));
}

/**
 * Apply one message from the payment feed: the raw body of a webhook event that the merchant's server has already
 * verified with merchant-hooks `verifyWebhook`. Webhook `amountMinor` is the cumulative total for the invoice
 * (webhooks.md R8); only the increase over the highest total already counted becomes a reducer payment, so replays,
 * retries and out-of-order deliveries cannot add twice.
 *
 * @returns `{ session, outcome, deltaMinor? }`. Outcomes: counted, duplicate, stale, wrong-sale, ignored-type,
 *   not-active (sale closed or idle: send it to your records for review), late (deadline reached: sale expired,
 *   not counted), malformed, bad-clock (not consumed; a redelivery can still count).
 */
export function applyFeedMessage(session, raw, now) {
  const out = (outcome, next = session) => ({ session: next, outcome });
  if (typeof raw !== 'string' || raw.length > MAX_FEED_BYTES) return out('malformed');
  const event = parseFeedEvent(raw);
  if (event === undefined) return out('malformed');
  const { sale } = session;
  if (sale.status !== 'awaiting') return out('not-active');
  if (event.data.invoiceId !== sale.invoiceId || event.data.currency !== sale.currency) return out('wrong-sale');
  if (session.seen.includes(event.id)) return out('duplicate');
  const seen = Object.freeze({ ...session, seen: remember(session.seen, event.id) });
  if (event.type === 'invoice.expired') return out('ignored-type', seen);
  const cumulative = BigInt(event.data.amountMinor);
  const deltaMinor = cumulative - session.verifiedMinor;
  if (deltaMinor <= 0n) return out('stale', seen);
  const result = step(sale, { type: 'payment', invoiceId: sale.invoiceId, currency: sale.currency, amountMinor: deltaMinor }, now);
  if (result === undefined) return out('bad-clock');
  if (!result.accepted) return out('late', withSale(session, result.state));
  return { session: Object.freeze({ ...withSale(seen, result.state), verifiedMinor: cumulative }), outcome: 'counted', deltaMinor };
}

/** Present the payment link again for a sale restored after a reload. */
export function presentLink(session, link) {
  if (session.sale.status !== 'awaiting') return { session, error: 'not-active' };
  const value = String(link ?? '').trim();
  const detail = checkLink(value);
  if (detail !== undefined) return { session, error: 'bad-link', detail };
  return { session: Object.freeze({ ...session, link: value, restored: false }) };
}

/**
 * Record for sessionStorage: only an awaiting sale, amounts as decimal strings, never the link.
 * @returns JSON text, or undefined when nothing should be stored.
 */
export function serializeSession(session) {
  const { sale } = session;
  if (sale.status !== 'awaiting') return undefined;
  return JSON.stringify({
    v: 1, sessionId: sale.sessionId, invoiceId: sale.invoiceId, currency: sale.currency,
    dueMinor: sale.dueMinor.toString(), paidMinor: sale.paidMinor.toString(), expiresAt: sale.expiresAt,
    verifiedMinor: session.verifiedMinor.toString(), manualMinor: session.manualMinor.toString(), seen: [...session.seen],
  });
}

const RECORD_KEYS = ['v', 'sessionId', 'invoiceId', 'currency', 'dueMinor', 'paidMinor', 'expiresAt', 'verifiedMinor', 'manualMinor', 'seen'];

function readRecord(text) {
  if (typeof text !== 'string' || text.length > MAX_RECORD_CHARS) return undefined;
  let r;
  try { r = JSON.parse(text); } catch { return undefined; }
  if (!strictKeys(r, RECORD_KEYS, RECORD_KEYS) || r.v !== 1) return undefined;
  const amounts = [r.dueMinor, r.paidMinor, r.verifiedMinor, r.manualMinor];
  if (typeof r.sessionId !== 'string' || !SESSION_ID_RE.test(r.sessionId) ||
      typeof r.invoiceId !== 'string' || !ID_RE.test(r.invoiceId) ||
      typeof r.currency !== 'string' || !/^[A-Z]{3}$/.test(r.currency) ||
      !amounts.every(a => typeof a === 'string' && UINT_RE.test(a)) ||
      typeof r.expiresAt !== 'number' || !Number.isSafeInteger(r.expiresAt) || r.expiresAt < 0 ||
      !Array.isArray(r.seen) || r.seen.length > MAX_SEEN_EVENTS || new Set(r.seen).size !== r.seen.length ||
      !r.seen.every(id => typeof id === 'string' && ID_RE.test(id))) return undefined;
  const [dueMinor, paidMinor, verifiedMinor, manualMinor] = amounts.map(BigInt);
  if (dueMinor <= 0n || paidMinor >= dueMinor || paidMinor !== verifiedMinor + manualMinor) return undefined;
  return {
    sale: { status: 'awaiting', sessionId: r.sessionId, invoiceId: r.invoiceId, currency: r.currency, dueMinor, paidMinor, expiresAt: r.expiresAt },
    verifiedMinor, manualMinor, seen: Object.freeze([...r.seen]),
  };
}

/**
 * Rebuild the session after a reload.
 * @returns `{ session, notice }`; notice is none, restored (awaiting, link needed for the QR), expired-while-away,
 *   clock-changed (deadline further ahead than any TTL allows: closed for review) or discarded (unreadable record).
 */
export function restoreSession(text, now) {
  if (text === null || text === undefined) return { session: IDLE_SESSION, notice: 'none' };
  const record = readRecord(text);
  if (record === undefined) return { session: IDLE_SESSION, notice: 'discarded' };
  const session = Object.freeze({ ...IDLE_SESSION, ...record, restored: true });
  const clockUsable = Number.isSafeInteger(now) && now >= 0;
  if (clockUsable && record.sale.expiresAt - now > MAX_TTL) return { session: cancelSale(session, now), notice: 'clock-changed' };
  const ticked = tickSession(session, now).session;
  return { session: ticked, notice: ticked.sale.status === 'expired' ? 'expired-while-away' : 'restored' };
}

/** Next amount-field value for a keypad key ('0'..'9', '.', 'back', 'clear'). Only representable amounts grow. */
export function keypadInput(current, key, currency) {
  const value = String(current ?? '');
  if (key === 'clear') return '';
  if (key === 'back') return value.slice(0, -1);
  const decimals = /^[A-Z]{3}$/.test(currency) ? fiatDecimals(currency) : 2;
  const m = /^(\d*)(?:\.(\d*))?$/.exec(value);
  if (!m) return value;
  const [, whole, fraction] = m;
  if (key === '.') {
    if (decimals === 0 || fraction !== undefined) return value;
    return `${whole || '0'}.`;
  }
  if (!/^[0-9]$/.test(key)) return value;
  if (fraction !== undefined) return fraction.length >= decimals ? value : value + key;
  if (whole === '0') return key;
  return whole.length >= 16 ? value : value + key;
}

/** "paid / due CUR", the operator's running line. */
export function amountsText(session) {
  const { sale } = session;
  if (sale.dueMinor === undefined) return '';
  return `${formatMinor(sale.paidMinor, sale.currency)} / ${formatMinor(sale.dueMinor, sale.currency)} ${sale.currency}`;
}

/** m:ss for the customer countdown; '' for an unusable value. */
export function formatCountdown(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const TITLES = { idle: 'Welcome', awaiting: 'Scan to pay', paid: 'Payment recorded. Thank you', expired: 'Payment request expired', cancelled: 'Sale cancelled' };

/** What the customer-facing screen shows. The QR appears only for an awaiting sale whose link is in memory. */
export function customerView(session, now) {
  const { sale } = session;
  const awaiting = sale.status === 'awaiting';
  const cur = sale.currency;
  const clockUsable = Number.isSafeInteger(now) && now >= 0;
  return {
    status: sale.status,
    // A restored sale has no link until the operator presents it again; do not ask the customer to scan yet.
    title: awaiting && typeof session.link !== 'string' ? 'One moment, please' : TITLES[sale.status],
    dueText: sale.dueMinor === undefined ? '' : `${formatMinor(sale.dueMinor, cur)} ${cur}`,
    remainingText: awaiting ? `Remaining ${formatMinor(sale.dueMinor - sale.paidMinor, cur)} ${cur}` : '',
    countdownText: awaiting && clockUsable ? formatCountdown(sale.expiresAt - now) : '',
    showQr: awaiting && typeof session.link === 'string',
  };
}

/** Operator line describing where the recorded total came from. Wording: a feed report is not on-chain proof. */
export function verificationText(session) {
  if (session.manualMinor > 0n)
    return 'Includes amounts entered by hand. They are not verified: confirm the payment before releasing goods.';
  if (session.verifiedMinor > 0n)
    return "Amounts reported by your server's payment feed. A report is not on-chain proof: apply your confirmation policy before releasing goods.";
  return '';
}

const MESSAGES = {
  'bad-currency': () => 'Currency must be 3 letters.',
  'bad-amount': (cur) => `Enter an amount like ${formatMinor(1250n, cur)} ${cur}.`,
  'bad-invoice': () => 'Invoice reference: up to 128 letters, digits, dots, colons, underscores or hyphens.',
  'bad-ttl': () => 'The sale time limit must be between 30 and 900 seconds.',
  'bad-clock': () => 'Check the terminal clock and retry.',
  'bad-received': () => 'Enter the received amount.',
  'busy': () => 'Finish or cancel the current sale first.',
  'not-active': () => 'There is no active sale.',
};

/** User-facing text for an error code; `bad-link` shows checkLink's specific reason. */
export function errorMessage(code, currency = 'USD', detail) {
  if (code === 'bad-link') return detail ?? 'Paste a GhostPay payment link.';
  return (MESSAGES[code] ?? (() => 'Something went wrong. Cancel the sale and start again.'))(currency);
}
