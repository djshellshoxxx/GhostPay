// Terminal wiring: DOM, clock, storage and the payment-feed channel around the pure session layer (pos-session.js).
import { formatMinor } from './pos-logic.js';
import {
  IDLE_SESSION, STORAGE_KEY, amountsText, applyFeedMessage, cancelSale, customerView, errorMessage, keypadInput,
  newSale, presentLink, recordManualPayment, restoreSession, serializeSession, startSale, tickSession, verificationText,
} from './pos-session.js';

/** Same-origin channel for the payment feed: post the raw body of a webhook event your server has verified. */
export const FEED_CHANNEL = 'ghostpay-pos-feed';

const $ = (id) => document.getElementById(id);
const nowSeconds = () => Math.floor(Date.now() / 1000);
const clockError = errorMessage('bad-clock');
let session = IDLE_SESSION;
let timer;
let lastStatus = session.sale.status;
let announcedMinute = false;
let stored = null; // last value written to sessionStorage (null: unknown), to skip identical writes every tick
let storageWarned = false;

function newSessionId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function announce(text) {
  $('announce').textContent = text; // live region, read politely by screen readers
}

function setNotice(text) {
  $('notice').textContent = text;
}

function showError(text, field) {
  $('error').textContent = text;
  for (const id of ['amount', 'currency', 'invoice', 'link', 'received-amount']) $(id).removeAttribute('aria-invalid');
  if (field !== undefined) {
    $(field).setAttribute('aria-invalid', 'true');
    $(field).focus();
  }
}

/** Keep sessionStorage equal to the active sale (never the link); a closed or idle terminal stores nothing. */
function persist() {
  try {
    const text = serializeSession(session);
    if (text === stored) return;
    if (text === undefined) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, text);
    stored = text;
  } catch {
    // Warn once: the countdown persists every second and must not overwrite later notices.
    if (!storageWarned) setNotice('This browser cannot keep the sale across a reload. Keep this page open until the sale ends.');
    storageWarned = true;
  }
}

function drawQr(link) {
  const lib = globalThis.qrcode; // optional vendored qrcode-generator (see README); absent -> text only
  if (typeof lib !== 'function') return;
  const qr = lib(0, 'L');
  qr.addData(link, 'Byte');
  qr.make();
  const svgText = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const el = doc.documentElement;
  if (el.localName === 'svg') {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Payment QR code');
    $('qr').replaceChildren(document.importNode(el, true));
  }
}

function renderCustomer(now) {
  const view = customerView(session, now);
  $('customer').dataset.status = view.status;
  $('customer-title').textContent = view.title;
  $('customer-due').textContent = view.dueText;
  $('customer-remaining').textContent = view.remainingText;
  $('customer-countdown').textContent = view.countdownText;
  if (!view.showQr) {
    $('qr').replaceChildren(); // textContent/DOM only; never innerHTML
    $('linkText').textContent = '';
  } else if ($('linkText').textContent !== session.link) {
    $('linkText').textContent = session.link;
    drawQr(session.link);
  }
}

function announceTransition(status) {
  if (status === lastStatus) return;
  const cur = session.sale.currency;
  const due = session.sale.dueMinor === undefined ? '' : `${formatMinor(session.sale.dueMinor, cur)} ${cur}`;
  const text = {
    awaiting: `Sale started. ${due} due.`,
    paid: `Payment recorded in full. ${amountsText(session)}.`,
    expired: 'Sale expired. The payment request is closed.',
    cancelled: 'Sale cancelled.',
    idle: 'Ready for a new sale.',
  }[status];
  announce(text);
  lastStatus = status;
  announcedMinute = false;
}

function render(now = nowSeconds()) {
  const { status } = session.sale;
  const live = status === 'awaiting';
  $('status').textContent = status.toUpperCase();
  $('status').dataset.status = status;
  $('amounts').textContent = amountsText(session);
  $('verification').textContent = verificationText(session);
  $('start').disabled = live;
  $('start').textContent = live || status === 'idle' ? 'Start sale' : 'New sale';
  $('received').disabled = !live;
  $('cancel').disabled = !live;
  $('present').hidden = !(live && session.restored);
  $('link').disabled = live && !session.restored;
  for (const key of $('keypad').querySelectorAll('button')) key.disabled = status !== 'idle';
  if (!live) {
    clearTimeout(timer);
    $('link').value = ''; // the link is a bearer secret: remove it when the sale ends
    $('countdown').textContent = '';
    $('received-amount').value = '';
  }
  renderCustomer(now);
  const wasLive = lastStatus === 'awaiting';
  announceTransition(status);
  if (wasLive && !live && document.body.dataset.mode !== 'customer') $('start').focus();
}

function commit(next, now) {
  session = next;
  persist();
  render(now);
}

function tick() {
  clearTimeout(timer);
  const now = nowSeconds();
  const { session: next, clockOk } = tickSession(session, now);
  if (!clockOk) {
    showError(clockError);
    $('countdown').textContent = '';
  } else if ($('error').textContent === clockError) showError('');
  commit(next, now);
  if (session.sale.status === 'awaiting') {
    if (clockOk) {
      const left = session.sale.expiresAt - now;
      $('countdown').textContent = `${left}s left`;
      if (left <= 60 && !announcedMinute) { announcedMinute = true; announce('One minute left to pay.'); }
    }
    timer = setTimeout(tick, 1000);
  }
}

const FIELD_FOR = { 'bad-currency': 'currency', 'bad-amount': 'amount', 'bad-link': 'link', 'bad-invoice': 'invoice' };

$('start').addEventListener('click', () => {
  showError('');
  setNotice('');
  if (session.sale.status === 'awaiting') return;
  if (session.sale.status !== 'idle') {
    $('amount').value = '';
    $('invoice').value = '';
    commit(newSale(session));
    $('amount').focus();
    return;
  }
  const currency = $('currency').value.trim().toUpperCase();
  const now = nowSeconds();
  const r = startSale(session, { amount: $('amount').value, currency, link: $('link').value, invoiceId: $('invoice').value }, now, newSessionId);
  if (r.error !== undefined) {
    showError(errorMessage(r.error, currency, r.detail), FIELD_FOR[r.error]);
    return;
  }
  commit(r.session, now);
  tick();
  $('cancel').focus();
});

$('present').addEventListener('click', () => {
  const r = presentLink(session, $('link').value);
  if (r.error !== undefined) { showError(errorMessage(r.error, session.sale.currency, r.detail), 'link'); return; }
  showError('');
  setNotice('');
  commit(r.session);
});

// DEMO ONLY: a real terminal must get payment events from your server (the feed below), not from a staff click.
$('received').addEventListener('click', () => {
  if (session.sale.status !== 'awaiting') return;
  const r = recordManualPayment(session, $('received-amount').value || '0', nowSeconds());
  if (r.error === 'bad-clock') { showError(clockError); return; }
  if (r.error !== undefined) { showError(errorMessage(r.error, session.sale.currency), 'received-amount'); return; }
  showError('');
  $('received-amount').value = '';
  commit(r.session);
});

$('cancel').addEventListener('click', () => {
  showError('');
  commit(cancelSale(session, nowSeconds()));
});

$('keypad').addEventListener('click', (event) => {
  const key = event.target instanceof HTMLElement ? event.target.closest('button')?.dataset.key : undefined;
  if (key === undefined || session.sale.status !== 'idle') return;
  $('amount').value = keypadInput($('amount').value, key, $('currency').value.trim().toUpperCase());
});

function setMode(mode) {
  document.body.dataset.mode = mode;
  if (mode === 'customer') $('customer-title').focus();
  else $('show-customer').focus();
}
$('show-customer').addEventListener('click', () => setMode('customer'));
$('show-operator').addEventListener('click', () => setMode('operator'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.dataset.mode === 'customer') setMode('operator');
});

const FEED_NOTICES = {
  'wrong-sale': 'A payment report for a different invoice or currency was ignored.',
  'not-active': 'A payment report arrived while no sale was open. It was not added to any sale: review it in your records.',
  late: 'A payment report arrived at the deadline. The sale expired and the report was not counted: review it in your records.',
  malformed: 'An unreadable payment report was ignored.',
};

function onFeedMessage(raw) {
  const now = nowSeconds();
  const r = applyFeedMessage(session, raw, now);
  if (r.outcome === 'bad-clock') { showError(clockError); return; }
  const { currency } = session.sale;
  if (r.outcome === 'counted') setNotice('');
  else if (FEED_NOTICES[r.outcome] !== undefined) setNotice(FEED_NOTICES[r.outcome]);
  if (r.session !== session) commit(r.session, now);
  // After commit, so a completing payment is not announced and then immediately replaced by the transition message.
  if (r.outcome === 'counted' && session.sale.status === 'awaiting')
    announce(`Payment of ${formatMinor(r.deltaMinor, currency)} ${currency} reported.`);
}

if (typeof BroadcastChannel === 'function') {
  const feed = new BroadcastChannel(FEED_CHANNEL);
  feed.addEventListener('message', (event) => onFeedMessage(event.data));
}

const RESTORE_NOTICES = {
  restored: 'The sale was restored after a reload. The payment link is not stored: paste it again and choose Show payment QR, or cancel the sale.',
  'expired-while-away': 'The sale expired while the page was closed. Recorded amounts are shown.',
  'clock-changed': 'The terminal clock changed while the page was closed, so the restored sale was closed. Recorded amounts are shown.',
  discarded: 'A saved sale could not be read and was discarded. Check your records before starting a new sale.',
};

function restore() {
  let text = null;
  try { text = sessionStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable: start empty */ }
  const now = nowSeconds();
  const r = restoreSession(text, now);
  session = r.session;
  lastStatus = session.sale.status;
  if (RESTORE_NOTICES[r.notice] !== undefined) setNotice(RESTORE_NOTICES[r.notice]);
  if (session.sale.currency !== undefined) $('currency').value = session.sale.currency;
  persist();
  render(now);
  if (session.sale.status === 'awaiting') tick();
}

restore();
