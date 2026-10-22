import { INITIAL, checkLink, formatMinor, parseMinor, reduce } from './pos-logic.js';

const $ = (id) => document.getElementById(id);
let state = INITIAL;
let timer;

function newSessionId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function clearCustomerView() {
  $('qr').replaceChildren(); // textContent/DOM only; never innerHTML
  $('linkText').textContent = '';
  $('link').value = '';
}

function render() {
  $('status').textContent = state.status.toUpperCase();
  $('status').dataset.status = state.status;
  const due = state.dueMinor ?? 0n;
  $('amounts').textContent = state.dueMinor === undefined ? '' : `${formatMinor(state.paidMinor)} / ${formatMinor(due)} ${state.currency}`;
  const live = state.status === 'awaiting';
  $('start').disabled = state.status === 'awaiting';
  $('received').disabled = !live;
  $('cancel').disabled = !live;
  if (!live) {
    clearTimeout(timer);
    clearCustomerView(); // the link is a bearer secret: remove it when the sale ends
    if (state.status !== 'idle') $('countdown').textContent = '';
    if (state.status !== 'awaiting' && state.status !== 'idle') $('start').textContent = 'New sale';
  }
}

function tick() {
  const now = Math.floor(Date.now() / 1000);
  state = reduce(state, { type: 'tick' }, now).state;
  if (state.status === 'awaiting') {
    $('countdown').textContent = `${Math.max(0, state.expiresAt - now)}s left`;
    timer = setTimeout(tick, 1000);
  }
  render();
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
  if (el.localName === 'svg') $('qr').replaceChildren(document.importNode(el, true));
}

$('start').addEventListener('click', () => {
  $('error').textContent = '';
  if (state.status !== 'idle') { state = { ...INITIAL }; clearCustomerView(); render(); $('start').textContent = 'Start sale'; return; }
  const due = parseMinor($('amount').value);
  const err = checkLink($('link').value.trim());
  const cur = $('currency').value.trim().toUpperCase();
  if (due === undefined || due <= 0n) { $('error').textContent = 'Enter an amount like 12.50.'; return; }
  if (!/^[A-Z]{3}$/.test(cur)) { $('error').textContent = 'Currency must be 3 letters.'; return; }
  if (err !== undefined) { $('error').textContent = err; return; }
  const link = $('link').value.trim();
  const now = Math.floor(Date.now() / 1000);
  state = reduce(state, { type: 'start', sessionId: newSessionId(), invoiceId: 'pos-sale', currency: cur, dueMinor: due, ttlSeconds: 300 }, now).state;
  $('linkText').textContent = link;
  drawQr(link);
  tick();
});

// DEMO ONLY: a real terminal must get payment events from your server (webhook receiver), not from a staff click.
$('received').addEventListener('click', () => {
  if (state.status !== 'awaiting') return;
  const amt = parseMinor($('received-amount').value || '0');
  if (amt === undefined || amt <= 0n) { $('error').textContent = 'Enter the received amount.'; return; }
  state = reduce(state, { type: 'payment', invoiceId: state.invoiceId, currency: state.currency, amountMinor: amt }, Math.floor(Date.now() / 1000)).state;
  render();
});

$('cancel').addEventListener('click', () => {
  state = reduce(state, { type: 'cancel' }, Math.floor(Date.now() / 1000)).state;
  render();
});

render();
