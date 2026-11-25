# pos-terminal

Static point-of-sale page: amount + payment link in, QR out, countdown (300 s), states idle/awaiting/paid/expired/cancelled. No remote scripts, no inline script/style, CSP via `<meta>` (`connect-src 'none'`: the page makes no requests). The link and QR are removed when the sale ends.

- Serve the folder from any static host or open `index.html` locally.
- QR: vendor `qrcode-generator` (apps/web pins 2.0.4) as `vendor/qrcode.js` and check its hash against the lockfile; without it the page shows the link text only (the browser logs one 404 for the script).
- `pos-logic.js` mirrors `posReduce` from `@ghostpay/merchant-hooks`; run `node examples/pos-terminal/parity.test.mjs` to prove they agree.
- Amounts become invoice minor units with the GhostPay app's exponent for the sale currency (0 decimals for JPY, KRW, VND, CLP, ISK, UGX, XAF, XOF, else 2, KWD included; the parity test checks the table against `apps/web`). An amount with more decimals than that is refused, never rounded.
- "Payment received" is a manual demo button. For production, receive events from `webhook-receiver` on your server and push them to the terminal; never let a staff click settle a sale.

The example keeps the current sale in memory. An unusable clock blocks a new sale
or payment. During a sale the countdown retries once per second, the recorded
balance stays intact, and the cashier can still cancel. A payment received at
the deadline expires the sale without adding to the total. **New sale** clears
the previous amounts and link and keeps the selected currency.

The parity script runs 400 seeded property cases across both reducers. The
Playwright spec exercises the real terminal controls and the pinned QR renderer.
From the repository root, after installing dependencies and building the libraries,
run `npm run test:e2e -w @ghostpay/web -- pos-terminal.spec.ts`.
