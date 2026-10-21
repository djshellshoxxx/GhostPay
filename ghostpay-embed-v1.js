/*! ghostpay-embed-v1.js - "Pay with GhostPay" button. Popup mode only; no dependencies; unminified on purpose.
 *
 * Usage on a merchant page:
 *   <button data-ghostpay data-invoice="APP_ORIGIN/#gpi=v1....">Pay with GhostPay</button>
 *   <script defer src="APP_ORIGIN/ghostpay-embed-v1.js"></script>
 *   (APP_ORIGIN is the https origin of your GhostPay deployment.)
 *
 * Rules (docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md, Feature 2):
 *  - The link must be https, must point at the SAME origin this script was loaded from, and must carry a v1 invoice
 *    fragment of bounded length. Anything else disables the button. Attributes are untrusted input.
 *  - The checkout opens in a top-level popup (noopener, noreferrer). No iframe: static hosts such as GitHub Pages
 *    cannot send frame-ancestors, so framing cannot be restricted there. Because of noopener there is no postMessage
 *    channel and no completion callback in v1.
 *  - Only DOM APIs, setAttribute and textContent are used. No innerHTML, no eval, no network requests, no globals.
 */
(function () {
  'use strict';
  var PREFIX = '#gpi=v1.';
  var MAX_LINK = 22000;
  var script = document.currentScript;
  var appOrigin = '';
  try {
    appOrigin = script && script.src ? new URL(script.src).origin : '';
  } catch (e) {
    appOrigin = '';
  }

  function validLink(raw) {
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
    return u.href;
  }

  function setup(el) {
    if (el.getAttribute('data-ghostpay-ready') === '1') return;
    el.setAttribute('data-ghostpay-ready', '1');
    if (el.textContent.trim() === '') el.textContent = 'Pay with GhostPay';
    var link = validLink(el.getAttribute('data-invoice'));
    if (link === null) {
      el.setAttribute('disabled', '');
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('title', 'Invalid GhostPay invoice link');
      return;
    }
    el.addEventListener('click', function (event) {
      event.preventDefault();
      window.open(link, '_blank', 'popup,noopener,noreferrer');
    });
  }

  function init() {
    var nodes = document.querySelectorAll('[data-ghostpay]');
    for (var i = 0; i < nodes.length; i++) setup(nodes[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
