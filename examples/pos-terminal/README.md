# pos-terminal

Static point-of-sale page: amount + payment link in, QR out, countdown (300 s), states idle/awaiting/paid/expired/cancelled. No remote scripts, no inline script/style, CSP via `<meta>` (`connect-src 'none'`: the page makes no requests). The link and QR are removed when the sale ends. This is an example for testnet experiments, not a hosted or audited product.

- Serve the folder from any static host or open `index.html` locally.
- QR: vendor `qrcode-generator` (apps/web pins 2.0.4) as `vendor/qrcode.js` and check its hash against the lockfile; without it the page shows the link text only (the browser logs one 404 for the script).
- `pos-logic.js` mirrors `posReduce` from `@ghostpay/merchant-hooks`; run `node examples/pos-terminal/parity.test.mjs` to prove they agree.
- `pos-session.js` is the DOM-free session layer on top of it (sale creation, amount entry, customer display, payment feed, persistence). `pos.js` only wires it to the page, clock and storage.
- Amounts become invoice minor units with the GhostPay app's exponent for the sale currency (0 decimals for JPY, KRW, VND, CLP, ISK, UGX, XAF, XOF, else 2, KWD included; the parity test checks the table against `apps/web`). An amount with more decimals than that is refused, never rounded. The touch keypad cannot enter such an amount.

## Operating the terminal

- **Start a sale**: amount (type it or use the keypad), currency, optional invoice reference (your backend's invoice id, used to match payment reports; default `pos-sale`) and the payment link. Errors are announced, the field is marked invalid and receives focus.
- **Customer screen**: shows the amount due, remaining balance, an m:ss countdown and the QR. On a tablet wider than 900 px it sits beside the operator controls; **Show customer screen** fills the screen with it for a tablet turned toward the customer. **Back to operator** or Escape returns. Status changes and the last minute are announced to screen readers.
- **Cancel / New sale**: cancelling keeps the recorded partial total on screen. **New sale** clears amounts, reference and link and keeps the selected currency. Nothing from a closed sale counts toward the next one.

## Payment completion

The terminal listens on the same-origin `BroadcastChannel` named `ghostpay-pos-feed`. Post the **raw body** of a webhook event that your server has already checked with `verifyWebhook` (see `webhook-receiver`):

```js
new BroadcastChannel('ghostpay-pos-feed').postMessage(verifiedRawBody);
```

The body is checked with the same rules as `parseWebhookEvent`. Its `data.amountMinor` is the cumulative total for the invoice, so only the increase over the highest total already counted is added. Replays, retries, older totals, other invoices or currencies and `invoice.expired` notices add nothing. A report at the deadline expires the sale uncounted; a report after the sale closed is shown for review and never counts toward the next sale.

Any script on the terminal's origin can post to this channel, and such a script could also control the page directly, so serve the terminal from an origin only you control. A feed report is a notification from your server, not on-chain proof: the terminal says so, and you should confirm payments with your own policy before releasing goods.

"Payment received" is a manual demo control. Amounts entered by hand are labelled as not verified. Never let a staff click settle a sale in production.

## Reloads and recovery

While a sale is awaiting payment, `sessionStorage` (this tab only) keeps its amounts, deadline and recent report ids, never the payment link. After a reload the sale resumes with its countdown; paste the same link and choose **Show payment QR** to show the QR again, or cancel. A sale whose deadline passed while the page was closed is shown as expired. A record that cannot be read, or whose deadline is further ahead than any allowed TTL (the clock moved back), is discarded or closed with an explanation. A closed or idle terminal stores nothing.

An unusable clock blocks a new sale or payment. During a sale the countdown retries once per second, the recorded balance stays intact, and the cashier can still cancel. A payment received at the deadline expires the sale without adding to the total.

## Tests

- `node --test examples/pos-terminal/parity.test.mjs`: 400 seeded property cases across both reducers.
- `node --test examples/pos-terminal/session.test.mjs`: the full session lifecycle with a deterministic clock, a storage double, a mock wallet and a mock merchant server that signs and verifies webhook bodies with `@ghostpay/merchant-hooks`; feed totals are checked against `@ghostpay/merchant-ledger` `reconcile`.
- The Playwright spec exercises the real terminal controls, the pinned QR renderer, the feed channel, reload recovery, touch keypad, customer screen and axe checks at tablet and phone widths. From the repository root, after installing dependencies and building the libraries, run `npm run test:e2e -w @ghostpay/web -- pos-terminal.spec.ts --project=desktop`.
