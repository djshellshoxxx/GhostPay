# pos-terminal

Static point-of-sale page: amount + payment link in, QR out, countdown (300 s), states idle/awaiting/paid/expired/cancelled. No remote scripts, no inline script/style, CSP via `<meta>` (`connect-src 'none'`: the page makes no requests). The link and QR are removed when the sale ends.

- Serve the folder from any static host or open `index.html` locally.
- QR: vendor `qrcode-generator` (apps/web pins 2.0.4) as `vendor/qrcode.js` and check its hash against the lockfile; without it the page shows the link text only (the browser logs one 404 for the script).
- `pos-logic.js` mirrors `posReduce` from `@ghostpay/merchant-hooks`; run `node examples/pos-terminal/parity.test.mjs` to prove they agree.
- "Payment received" is a manual demo button. For production, receive events from `webhook-receiver` on your server and push them to the terminal; never let a staff click settle a sale.
Status: parity test passes. The HTML/JS was NOT run in a browser; QR rendering untested.
