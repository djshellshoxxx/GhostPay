/*! ghostpay-embed-v2.js - "Pay with GhostPay" button. Popup (default) or sandboxed iframe; no dependencies; unminified on purpose.
 * ghostpay-embed-v1.js stays frozen (popup only) so pinned hashes keep working.
 *
 *   <button data-ghostpay data-invoice="APP_ORIGIN/#gpi=v1...."
 *           data-mode="iframe" data-profile="BASE64URL_SIGNED_PROFILE" data-template="t1">Pay with GhostPay</button>
 *   <script defer src="APP_ORIGIN/ghostpay-embed-v2.js" integrity="sha384-..." crossorigin="anonymous"></script>
 *
 *   integrity: no SRI value is published yet. Compute it yourself from the exact file you reviewed and embed (ideally
 *   the copy in a verified release tarball):  openssl dgst -sha384 -binary ghostpay-embed-v2.js | openssl base64 -A
 *   This URL is a moving alias: when the deployment changes the file, the browser rejects the new bytes and the button
 *   stays a plain, inert button (fails closed) until you review the new file and update the hash. SRI on a cross-origin
 *   script needs crossorigin="anonymous" and the Access-Control-Allow-Origin header the deployment sends for this file.
 *
 * Rules (docs/specs/14-embed-merchant-profile.md, Roadmap Feature 2):
 *  - Attributes are untrusted. The invoice link must be https (or localhost), same origin as this script, with a v1 fragment.
 *  - Default is a top-level popup (noopener, noreferrer). data-mode="iframe" opens a sandboxed iframe on the checkout origin
 *    and is used ONLY if the checkout answers a handshake: it does so only on a header-capable deployment built for
 *    iframe mode whose frame-ancestors allowlist includes this page's origin, and only if the merchant profile lists it.
 *    frame-ancestors is the only real gate today: the profile is verified only against the key embedded in it, so it
 *    does not authorize an origin (apps/web/DEVIATIONS.md item 6; GitHub Pages cannot send frame-ancestors at all).
 *    With no valid answer in 4 s the iframe is removed and the popup is used instead.
 *  - postMessage: exact targetOrigin (never "*"); incoming messages must have event.origin === checkout origin, event.source ===
 *    iframe.contentWindow, a closed v1 schema, <= 2 KB and the per-instance 128-bit nonce. Completion is delivered once, as a
 *    "ghostpay:done" CustomEvent on the button with {status, chainId, txHash} only, and shown with textContent.
 *  - Only DOM APIs, setAttribute and textContent. No innerHTML, no eval, no network requests, no globals.
 */
(function () {
  'use strict';
  var PREFIX = '#gpi=v1.';
  var MAX_LINK = 22000;
  var MAX_PROFILE = 11000;
  var MAX_MSG = 2048;
  var HANDSHAKE_MS = 4000;
  var NONCE_RE = /^[0-9a-f]{32}$/;
  var TX_RE = /^0x[0-9a-f]{64}$/;
  var TEMPLATE_RE = /^[a-z0-9_-]{1,32}$/;
  var PROFILE_RE = /^[A-Za-z0-9_-]+$/;
  var script = document.currentScript;
  var appOrigin = '';
  try {
    appOrigin = script && script.src ? new URL(script.src).origin : '';
  } catch (e) {
    appOrigin = '';
  }

  function checkoutUrl(el) {
    var raw = el.getAttribute('data-invoice');
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LINK || appOrigin === '') return null;
    var u;
    try {
      u = new URL(raw);
    } catch (e) {
      return null;
    }
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && u.hostname === 'localhost')) return null;
    if (u.origin !== appOrigin || u.username !== '' || u.password !== '') return null;
    if (u.hash.indexOf(PREFIX) !== 0 || u.hash.length <= PREFIX.length) return null;
    var profile = el.getAttribute('data-profile');
    if (profile !== null) {
      if (profile.length === 0 || profile.length > MAX_PROFILE || !PROFILE_RE.test(profile)) return null;
      u.searchParams.set('gpm', profile);
    }
    var template = el.getAttribute('data-template');
    if (template !== null) {
      if (!TEMPLATE_RE.test(template)) return null;
      u.searchParams.set('gpt', template);
    }
    return u.href;
  }

  function nonce() {
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    var s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }

  function own(o, keys) {
    var k = Object.keys(o);
    if (k.length !== keys.length) return false;
    for (var i = 0; i < keys.length; i++) if (!Object.prototype.hasOwnProperty.call(o, keys[i])) return false;
    return true;
  }

  function isPlain(v) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
    var p = Object.getPrototypeOf(v);
    return p === Object.prototype || p === null;
  }

  // Returns {t, data} for a valid message carrying `expected`, otherwise null. Never throws.
  function parse(d, expected) {
    try {
      if (!isPlain(d) || !own(d, ['t', 'n', 'v', 'data'])) return null;
      if (d.v !== 1 || d.n !== expected || !NONCE_RE.test(d.n) || !isPlain(d.data)) return null;
      if (JSON.stringify(d).length > MAX_MSG) return null;
      var x = d.data;
      if (d.t === 'gp:init') return own(x, []) ? { t: d.t, data: {} } : null;
      if (d.t === 'gp:status') {
        return own(x, ['phase']) && (x.phase === 'ready' || x.phase === 'submitting' || x.phase === 'closed') ? { t: d.t, data: { phase: x.phase } } : null;
      }
      if (d.t === 'gp:done') {
        var withTx = Object.keys(x).length === 3;
        if (!own(x, withTx ? ['status', 'chainId', 'txHash'] : ['status', 'chainId'])) return null;
        if (x.status !== 'submitted' && x.status !== 'failed' && x.status !== 'cancelled') return null;
        if (typeof x.chainId !== 'number' || x.chainId % 1 !== 0 || x.chainId < 1 || x.chainId > 4294967295) return null;
        if (withTx && (typeof x.txHash !== 'string' || !TX_RE.test(x.txHash))) return null;
        if ((x.status === 'submitted') !== withTx) return null;
        return { t: d.t, data: withTx ? { status: x.status, chainId: x.chainId, txHash: x.txHash } : { status: x.status, chainId: x.chainId } };
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  function popup(el, url) {
    var w = window.open(url, '_blank', 'popup,noopener,noreferrer');
    if (!w) el.setAttribute('title', 'Popup blocked: allow popups for this site, then click again');
  }

  function say(el, text) {
    var s = el.nextElementSibling;
    if (!s || s.getAttribute('data-ghostpay-status') !== '1') {
      s = document.createElement('span');
      s.setAttribute('data-ghostpay-status', '1');
      s.setAttribute('role', 'status');
      el.parentNode.insertBefore(s, el.nextSibling);
    }
    s.textContent = text;
  }

  function openFrame(el, url) {
    var n = nonce();
    var overlay = document.createElement('div');
    var frame = document.createElement('iframe');
    var close = document.createElement('button');
    var settled = false;
    var timer = 0;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'GhostPay checkout');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483647';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    frame.setAttribute('title', 'GhostPay checkout');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('allow', '');
    frame.setAttribute('loading', 'eager');
    frame.style.width = 'min(480px, 100vw)';
    frame.style.height = 'min(720px, 90vh)';
    frame.style.border = '0';
    frame.style.background = '#fff';
    close.setAttribute('type', 'button');
    close.textContent = 'Close';

    function teardown() {
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function onKey(e) {
      if (e.key === 'Escape') teardown();
    }
    function onMessage(event) {
      if (settled || event.source !== frame.contentWindow || event.origin !== appOrigin) return;
      var m = parse(event.data, n);
      if (m === null) return;
      if (m.t === 'gp:init') {
        window.clearTimeout(timer);
        timer = 0;
      } else if (m.t === 'gp:status') {
        el.setAttribute('data-ghostpay-phase', m.data.phase);
      } else if (m.t === 'gp:done') {
        // Single use: the nonce stops being accepted after the first completion.
        window.removeEventListener('message', onMessage);
        settled = true;
        var detail = { status: m.data.status, chainId: m.data.chainId };
        if (m.data.txHash) detail.txHash = m.data.txHash;
        el.setAttribute('data-ghostpay-phase', m.data.status);
        say(el, m.data.status === 'submitted' ? 'Payment submitted. Transaction ' + m.data.txHash : 'Payment ' + m.data.status + '.');
        el.dispatchEvent(new CustomEvent('ghostpay:done', { bubbles: true, detail: detail }));
      }
    }
    close.addEventListener('click', teardown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onMessage);
    frame.addEventListener('load', function () {
      if (settled || !frame.contentWindow) return;
      frame.contentWindow.postMessage({ t: 'gp:hello', n: n, v: 1, data: {} }, appOrigin);
    });
    timer = window.setTimeout(function () {
      // No valid handshake: this host (or this merchant origin) is not enabled for framing. Use the popup instead.
      teardown();
      popup(el, url);
    }, HANDSHAKE_MS);
    overlay.appendChild(close);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    frame.setAttribute('src', url);
  }

  function setup(el) {
    if (el.getAttribute('data-ghostpay-ready') === '1') return;
    el.setAttribute('data-ghostpay-ready', '1');
    if (el.textContent.trim() === '') el.textContent = 'Pay with GhostPay';
    var url = checkoutUrl(el);
    var mode = el.getAttribute('data-mode');
    if (url === null || (mode !== null && mode !== 'popup' && mode !== 'iframe')) {
      el.setAttribute('disabled', '');
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('title', 'Invalid GhostPay checkout parameters');
      return;
    }
    var framed = mode === 'iframe' && !!window.crypto && typeof window.crypto.getRandomValues === 'function';
    el.addEventListener('click', function (event) {
      event.preventDefault();
      if (framed) openFrame(el, url);
      else popup(el, url);
    });
  }

  function init() {
    var nodes = document.querySelectorAll('[data-ghostpay]');
    for (var i = 0; i < nodes.length; i++) setup(nodes[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
