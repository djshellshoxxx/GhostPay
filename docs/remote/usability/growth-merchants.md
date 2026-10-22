# Growth features: merchants and commerce

Date: 2026-10-21. Branch `claude/remote-extensions-1`. Lens: point of sale, checkout, plugins, billing, refunds, payouts, accounting, teams, offline. `docs/remote/usability/features.md` did not exist when this was written (checked); IDs here are `M-nn` so they cannot collide. Where features.md later lists the same idea, keep the merchant-specific spec here and link.

Ground rules every feature obeys: no third-party call by default; keys stay local; no custody; nothing new is trusted to a GhostPay server; new code lives in a new package or `apps/*` directory, not in the audited core. Pre-audit software; nothing here is deployed.

## 1. What exists today (verified)

| Area | State | Evidence |
|---|---|---|
| Invoices are stateless links | No merchant-side record of issued invoices, so no "open/paid" view. Only the signed link is produced. | `apps/web/src/lib/invoiceCreate.ts:88` (`buildInvoiceLink`); the only IndexedDB DB is `ghostpay-tags` (`lib/idbStore.ts:3`) |
| Invoice fields | Line items, tax (bps + minor units), fiat total, `expiresAt`, quote, memo, `feePolicy`, signer key. One chain and one token per invoice. No order id, no deposit/installment policy. | `packages/invoice-schema/src/schema.ts:48-82` |
| Embed SDK | Popup-only, takes a full invoice link in `data-invoice`; no `postMessage`, no status callback, no iframe, no generator. | `apps/web/public/ghostpay-embed-v1.js:4,46,60`; `docs/APP_AND_RELAYER_SPEC.md` s5 row "Feature 2 embed" |
| Router metadata | 57 bytes: tag, selector, token, net amount. No order or invoice reference on chain (good for privacy, bad for reconciliation). | `packages/core-crypto/src/metadata.ts:41,68`; `GhostPayRouter.sol:70-140` |
| Scanner output | Matches carry `blockHash:logIndex` and stealth address, not the transaction hash. | `packages/chain-adapters/src/logs.ts:18-20`; `lib/tags.ts:20-22` comment |
| Tags | Encrypted local client labels per match; no invoice linkage, no export. | `lib/tags.ts:1-60` |
| Keys | `spendingKey`, `viewingKey`, `signingKey` are three independent random scalars; no seed, no child meta-addresses. A viewing-key-only profile cannot be exported. | `lib/keystore.ts:18-19,156-161` |
| Sweep | EIP-712 order has `destination` and `amount`, so a partial sweep to any address is already expressible (ERC-2612 tokens on the relayed path). | `packages/chain-adapters/src/sweep.ts:12-30` |
| Fiat pricing | Option exists but no feed is configured; such invoices cannot be paid. Merchants must price in the token. | `views/CreateInvoice.tsx:126,136`; README "Fiat-priced invoices are disabled" |
| Offline / PWA | No service worker, no web manifest. QR generation is local (`lib/qr.ts`). | grep `serviceWorker` in `apps/web` returns nothing |
| Accounting export | None (`downloadText` only used for the QR SVG: `components/QrView.tsx:30`). | grep |
| Policy account | Contract-only, no client, no recovery. Not a base for team features. | README status table |

Unverified payer-supplied amounts for non-router announcements (audit S3-02) mean any reconciler MUST treat only router-verified or balance-checked amounts as paid.

## 2. Comparable products (primary sources, retrieved 2026-10-21)

- BTCPay Server (self-hosted, no custody): POS app with static, cart and keypad views, tips, inventory; payment button; crowdfunding. https://raw.githubusercontent.com/btcpayserver/btcpayserver-doc/master/docs/Apps.md
- BTCPay Payment Requests: long-lived invoices, partial payments, new address per attempt, printable / exportable for accounting. https://raw.githubusercontent.com/btcpayserver/btcpayserver-doc/master/docs/PaymentRequests.md
- BTCPay Pull Payments, Refunds, Payouts: refund = merchant issues a claim link, customer supplies address, clerk approves in batches; salary payouts reuse it. https://raw.githubusercontent.com/btcpayserver/btcpayserver-doc/master/docs/PullPayments.md , .../Refund.md , .../Payouts.md
- BTCPay Subscriptions: offering/plan/subscriber/portal; manual recurring (reminder) and prepaid credit with automatic deduction, because the chain has no auto-debit. https://raw.githubusercontent.com/btcpayserver/btcpayserver-doc/master/docs/Subscriptions.md
- BTCPay notifications: store-level webhooks and SMTP. https://raw.githubusercontent.com/btcpayserver/btcpayserver-doc/master/docs/Notifications.md (signature scheme not retrieved; do not copy it, design below is our own).
- BTCPay shop plugins: WooCommerce https://raw.githubusercontent.com/btcpayserver/woocommerce-greenfield-plugin/master/README.md , Shopify https://raw.githubusercontent.com/btcpayserver/btcpayserver-shopify-plugin/master/README.md , PrestaShop https://raw.githubusercontent.com/btcpayserver/prestashop-plugin/master/README.md (all call a merchant-run server API, not the chain).
- Safe smart account (multisig treasury destination): https://raw.githubusercontent.com/safe-global/safe-smart-account/main/README.md . MultiSend library and tx-builder format not retrieved; marked "verify" below.
- ERC-681 URL format for transaction requests (why a payer-derived stealth address cannot use it): https://raw.githubusercontent.com/ethereum/ercs/master/ERCS/erc-681.md
- ERC-3009 transfer with authorization (Draft): https://raw.githubusercontent.com/ethereum/ercs/master/ERCS/erc-3009.md
- Web NFC API (Chrome-only in practice, not verified here): https://raw.githubusercontent.com/w3c/web-nfc/gh-pages/README.md
- Plain-text accounting: https://raw.githubusercontent.com/simonmichael/hledger/main/README.md , https://raw.githubusercontent.com/beancount/beancount/master/README.rst
- Not retrievable (blocked or 404): Stripe, Square, Coinbase Commerce, Shopify and WooCommerce product docs, Request Network, Sablier docs. No claim below depends on them.

Pattern across BTCPay: merchants choose it because a clerk can run a shop from a tablet, the shop plugin "just works", and refunds and accounting exist. GhostPay has none of the surrounding workflow; the on-chain half is the easy half.

## 3. Features

Format per feature: **Problem / Why choose-and-keep / Design / Privacy-security / Deps / Effort / Impact (1-10) / Owner.**

### M-01 Merchant ledger and reconciler
- Problem: invoices vanish after creation; merchant cannot see what is open, paid, partial, late or expired.
- Why: every shop needs "did order 1042 get paid?". Without it GhostPay is a demo; with it, it is a till.
- Design: encrypted local store (same HKDF + AES-GCM pattern as `tags.ts`, separate IndexedDB DB `ghostpay-ledger`) with `Order {id, invoiceNonce, signerFp, chainId, token, fiat, createdAt, expiresAt, status, lines[], payments[]}`. `payments[]` entries reference scanner matches (`blockHash:logIndex`) plus receipt (M-02). Reconciler is a pure function `(orders, verifiedMatches, now) -> order states` with tolerance rules: exact, underpaid, overpaid, late, duplicate, unmatched. Matching key priority: receipt MAC (exact) > fixed-token amount + token + chain within invoice window (heuristic, flagged "unconfirmed match") . Statuses: draft, open, partial, paid, overpaid, expired, refunded, void. Encrypted export/import (`.gpledger`) for backup and for team devices.
- Privacy/security: all local; labels never on chain; amounts only from router-verified or balance-checked data (S3-02); heuristics never auto-mark paid, they ask. Export is encrypted with a passphrase; lock on idle like `session.ts`.
- Deps: scanner must expose `txHash` (needs a `chain-adapters` change owned by others; fallback: key on `blockHash:logIndex`); `invoice-schema` unchanged.
- Effort: M. Impact: 10. Owner: new `packages/merchant-ledger` (pure logic + store interface) with a thin `apps/web` "Orders" view.

### M-02 Payer payment receipt (proof of payment bound to the invoice)
- Problem: chain data carries no order id, so "which payment is mine" is a guess; a customer cannot prove "I paid invoice X" without doxxing the wallet.
- Why: lets the clerk say "show me your receipt" and the shop auto-confirm in one tap; also unlocks support lookups and refunds (M-10).
- Design: after `payERC20/payNative` the payer app derives `k = HKDF(ECDH(e, V), "GhostPay/receipt/v1")` where `e` is the ephemeral key and `V` the seller viewing key (merchant computes the same as `v*R`). Receipt = `{v:1, invoiceNonce, chainId, R, txHash, mac = HMAC(k, nonce||chainId||txHash)}` shown as QR and as `#gpr=v1.<base64url>` link. Merchant (viewing key) verifies MAC and that `R` is in a scanner match. No new chain data, no contract change. Not verifiable by third parties (a feature: the receipt is not a public deanonymiser).
- Privacy/security: receipt reveals invoice nonce + txHash to whoever the payer shows it to; the merchant already learns that. Use a domain-separated KDF, never reuse `e` for signing (avoids ECDH/signature key reuse). Receipt MUST NOT contain payer address. Replay of one receipt to another order is blocked by the nonce binding.
- Deps: payer app must keep `e` until receipt is produced (Pay flow, `lib/payExec.ts`); `core-crypto` needs a `deriveReceiptKey` helper (add in new package, wrapping existing exports).
- Effort: S-M. Impact: 9. Owner: new `packages/pay-receipt`.

### M-03 POS terminal mode (keypad, cart, rotating QR, "paid" screen)
- Problem: a cafe cannot make an invoice link per customer on a form with six fields.
- Why: single biggest "feels like a real product" feature; BTCPay's keypad/cart/static views are what merchants name first (Apps.md).
- Design: `/pos` route in a separate static entry (`apps/pos`, same bundle scan rules). Views: Keypad (amount only), Catalog (tiles from local price list, M-14), Tip screen. Each sale = `buildInvoiceLink` with 5-15 min expiry, fixed token amount, `feePolicy` per config; QR shown full screen; screen polls scanner for matches (M-01) and flips to a green "Paid" with amount and a beep; "Next customer" button; refund and void on the order list. Works from a cashier profile (M-09) so the tablet holds no spend key. Install as PWA (M-18).
- Privacy/security: tablet needs the invoice-signing key and viewing key only; spend key stays offline. Screen auto-locks; no analytics; orders encrypted locally. Fixed-token pricing only until a feed exists (rate card M-15).
- Deps: M-01, M-09. Effort: M-L. Impact: 10. Owner: new `apps/pos` (+ `packages/merchant-ledger`).

### M-04 `merchantd`: self-hosted watcher, order API and signed webhooks
- Problem: shop plugins and backends need server-side events ("order paid"); a browser tab cannot be the notifier.
- Why: this is the thing that makes WooCommerce/Shopify/custom backends work; BTCPay is chosen largely for webhooks and the API.
- Design: small Node daemon the merchant runs on their own box (reuse `packages/chain-adapters` scanning; worker-style no-network matcher). Holds viewing key + invoice signing key (never spend key). Local HTTP API on 127.0.0.1 by default: `POST /v1/orders {orderRef, fiat, token, chainId, expirySec} -> {orderId, invoiceLink, qrSvg}`, `GET /v1/orders/:id`, `POST /v1/receipts/verify`. Event sinks: webhook (HMAC-SHA256 over `timestamp.body` with per-sink secret, idempotency key, retry with backoff, 5-minute replay window), self-hosted ntfy URL, SMTP. Events: `order.partial`, `order.paid`, `order.overpaid`, `order.expired`, `order.refunded`. States persist in the M-01 store (file-backed adapter).
- Privacy/security: no outbound call except the configured RPC and the merchant's own sinks; bind localhost, bearer API token, optional unix socket; log field allowlist like relayer runbook s7; viewing key in `secret-box` (`packages/secret-box`). A compromised daemon leaks payment history, cannot spend.
- Deps: M-01. Effort: L. Impact: 9. Owner: new `apps/merchantd`.

### M-05 Accounting and tax export
- Problem: merchants must hand an accountant a ledger; chain data lacks fiat, tax lines and customer labels.
- Why: removes a hard "no" for any registered business; no competitor in the stealth space offers it.
- Design: pure functions over M-01 orders: (a) generic CSV (date, order, customer label, fiat gross, tax rate, tax, token, token amount, chain, tx ref, status); (b) hledger/ledger journal and Beancount file (plain-text accounting, local, diffable); (c) period tax summary by rate; (d) QuickBooks/Xero style import CSV templates (column maps only; formats to be verified from their docs, which are unreachable here). Fiat value comes from the invoice's own signed fiat total and quote, so no price oracle or API is needed; token-only rows are flagged "no fiat basis". Gains/losses are out of scope (stated in export header).
- Privacy/security: file generated in-browser or in `merchantd`, saved by the user. Customer labels optional per export; stealth addresses omitted unless ticked. CSV formula-injection guard (prefix `'` on cells starting `= + - @`).
- Deps: M-01. Effort: M. Impact: 8. Owner: new `packages/merchant-export`.

### M-06 Payment buttons, reusable links and checkout kit
- Problem: embed SDK needs a pre-made invoice link; static sites cannot make per-order invoices, and there is no generator or status callback.
- Why: "paste 3 lines of HTML" is the on-ramp for bloggers, creators and small shops; the free hosted checkout is the GhostPay app itself (hosted-free = merchant never needs a server).
- Design: (1) Button generator in the app: choose price/token/chain/expiry, outputs `<button data-ghostpay data-invoice=...>` and a QR/sticker PDF via print CSS. (2) Reusable fixed-price links: invoice with long expiry and `reusable` note; each payer derives a fresh stealth address, so reuse is safe by construction; ledger counts sales by receipt. (3) SDK v2 (`ghostpay-embed-v2.js`): `postMessage` completion `{status, receiptLink}` to opener with exact-origin check, per-instance nonce and size cap per Roadmap F2 s2A; text-only DOM. Keep v1 frozen and hash-pinned. (4) Donation/pay-what-you-want variant with suggested amounts (client picks amount, signed template bounds it; needs schema `amountPolicy` extension, flagged).
- Privacy/security: SDK sends nothing to GhostPay; callback carries no payer data; popup fallback if iframe policy cannot be met; origin of merchant page never sent. Fixed signed template stops attribute tampering.
- Deps: M-02 (receipt in callback). Effort: M. Impact: 8. Owner: new `packages/embed-sdk` (build from `apps/web/public/ghostpay-embed-v1.js` lineage).

### M-07 Shop plugins (WooCommerce first, then PrestaShop, Shopify)
- Problem: most small merchants run a CMS shop, not custom code.
- Why: plugin directory presence is a discovery channel; BTCPay's three plugins show the demand.
- Design: thin plugin calls the merchant's own `merchantd` (M-04) `POST /v1/orders` at checkout, redirects/popup to the invoice link (or embeds v2 button), receives the signed webhook, marks the order paid/partial/expired; admin page shows order status and refund button (M-10). No crypto in PHP. Settings: merchantd URL, API token, webhook secret, token/chain, expiry. WooCommerce first (HPOS-compatible, no JS from third parties); Shopify needs an app server so ship it as a "custom payment app" template merchants self-host, not a store listing (listing would put GhostPay in the path).
- Privacy/security: order contents never leave the merchant's stack; plugin stores only the API token. Webhook handler verifies HMAC + timestamp + idempotency; amounts re-read from merchantd, not from the webhook body.
- Deps: M-04, M-02, M-10. Effort: L per CMS. Impact: 8. Owner: new `packages/plugin-woocommerce` (then `plugin-prestashop`, `plugin-shopify`).

### M-08 Subscriptions and recurring billing (manual-recurring and prepaid credit)
- Problem: chain has no auto-debit; stealth payments cannot be pulled without exposing the payer to the merchant.
- Why: SaaS, memberships, newsletters, rent are most recurring revenue; BTCPay ships exactly these two modes because pull is unavailable (Subscriptions.md).
- Design: subscription = plan + subscriber + schedule stored in M-01. Mode A manual: at T-3 days `merchantd` emits `renewal.due` with a fresh invoice link (SMTP/ntfy/webhook to the merchant, who forwards, or direct to payer if they gave an address); lapse after grace. Mode B prepaid: payer buys N periods; ledger deducts credit per period and tracks runway. Customer portal page is a static route in the same app using a bearer portal link (`#gps=` fragment: plan, balance, renewal link, receipts). Mode C (authorized pull via ERC-2612/ERC-3009 allowance to a new contract) is out of scope: it reveals payer address and needs a new audited contract.
- Privacy/security: portal link is a bearer secret like an invoice (same warnings); no payer email required; prepaid credit is an IOU the merchant owes (disclose, non-custodial because merchant already holds the funds).
- Deps: M-01, M-04. Effort: M-L. Impact: 8. Owner: new `packages/merchant-billing`.

### M-09 Role-separated merchant keys (owner, cashier, accountant) and per-terminal sub-meta-addresses
- Problem: today one profile holds spend, view and signing keys; handing a till to a clerk hands over the money.
- Why: staff, multiple tills, accountant access are table stakes for any shop with more than one person.
- Design: new seed-based key tree: master seed (BIP-39 optional) -> HKDF per role/terminal -> child `{spend,view}` pairs. Roles export as a "role pack": cashier = signing key + viewing key of its own child meta-address (sees only its terminal's sales); accountant = viewing keys, read-only ledger bundle; owner = seed + spend, offline. Master view key can aggregate all children for the owner. Spend never leaves the owner device; a sweep needs owner approval (M-12).
- Privacy/security: a viewing key reveals all history of its meta-address, so per-terminal children limit blast radius; revoking a cashier = stop using that child (funds remain sweepable by owner). Seed backup uses the existing scrypt+AES-GCM keystore format v2. Needs cryptographer review of the derivation tree; does not alter scheme-1 stealth maths.
- Deps: `core-crypto` scheme-1 primitives; keystore v2. Effort: M-L. Impact: 9. Owner: new `packages/merchant-keys`.

### M-10 Privacy-preserving refunds
- Problem: refunding needs the payer's address, and the obvious refund (merchant treasury -> payer address) links merchant wallet to payer on chain.
- Why: without refunds merchants will not sell physical goods; BTCPay's refund-claim-link is the model (Refund.md).
- Design: refund-before-sweep. (1) Receipt (M-02) optionally carries `refundTo` (payer picks a fresh address, or a one-time meta-address when their app runs a payer-side scan). (2) Ledger marks each order's stealth address as "refund window open" and the sweep policy (M-12) holds funds until the window ends (default 14 days). (3) Refund = a sweep order with `destination = refundTo` and `amount` = full or partial (`sweep.ts:12-30`), signed with that order's derived stealth key; gas via the existing relayer (ERC-2612 tokens) or direct. (4) If no `refundTo`, issue a claim link `#gpf=` (BTCPay pull-payment style): customer opens it, enters a fresh address, merchant confirms. Alternative non-chain refund: store credit in the ledger.
- Privacy/security: funds go stealth -> payer-supplied address; the merchant treasury never appears, and no new link between merchant wallet and payer is created beyond what the payer already knows (they know the stealth address). Disclose that the relayer sees owner/destination/amount. Claim links are bearer: single-use, expiring, bound to order nonce. Refund over a manual-confirm screen showing destination checksum + address-safety checks (`docs/remote/specs/address-safety.md`).
- Deps: M-01, M-02, M-12, relayer. Effort: M. Impact: 8. Owner: new `packages/merchant-refunds`.

### M-11 Deposits, partial payments and installments
- Problem: invoice is all-or-nothing; services need a 30% deposit, contractors need milestones, buyers pay in two goes.
- Why: parity with BTCPay Payment Requests (partial payments, long-lived) and a major B2B win.
- Design: ledger-level first (no schema change): an Order owns a payment plan `[ {label, amount, dueAt} ]`; each installment is a separate normal invoice generated from the plan (link per installment). Later optional invoice schema v1.1 field `plan` once the schema owners agree. Reconciler sums verified payments; status `partial` shows remaining; "request balance" regenerates a fresh invoice for the remainder. Overpay creates credit.
- Privacy/security: each installment is an unrelated stealth address; do not use a shared invoice nonce across installments (nonce reuse makes receipts ambiguous).
- Deps: M-01, M-02. Effort: M. Impact: 7. Owner: `packages/merchant-ledger` (plan module).

### M-12 Treasury destination, sweep policy and batching
- Problem: sweeping each payment to the treasury is both manual work and the main privacy leak (README "A sweep can undo the privacy").
- Why: one weekly approval instead of one per sale; merchants keep the privacy they chose GhostPay for.
- Design: policy `{destination (EOA or Safe), minAmount, minAge, jitterWindow, holdUntilRefundWindow, maxPerBatch, relayerFeeCap}`. Owner device prepares a sweep batch (one signature per stealth address, produced by owner key, in memory), jitters submission times over the window using existing `lib/jitter.ts`, skips orders with open refund windows, and refuses a destination that is not on the allowlist. Destination may be a Safe (plain address to the sweep; verify Safe handles ERC-20 receipt, trivial). Show "linkability" summary: which orders get joined at the destination (a batch of N links those N payments to one treasury, so the policy offers per-bucket destinations).
- Privacy/security: batching trades privacy for convenience; UI states it. Allowlisted destination blocks malware swapping it (hash shown, confirm on hardware screen where possible). Never auto-sweeps without owner unlock.
- Deps: M-01, M-09; existing `lib/sweep.ts`. Effort: M. Impact: 8. Owner: new `packages/merchant-treasury`.

### M-13 Bulk payouts and payroll (stealth-to-stealth)
- Problem: paying 20 contractors/staff means 20 manual transactions, each a copy-paste of an address that then gets reused.
- Why: recurring payroll is high-frequency usage and a strong privacy story (payees receive to fresh addresses and need only publish one meta-address).
- Design: CSV/paste of `payee label, st:eth meta-address, token, amount`. Builder derives a fresh stealth address per payee, emits one transaction per payee through the router (0.25% fee applies on router path; direct transfer + announcement avoids fee but is unverified-amount for payee, S3-02, so default router) with randomized order and jitter; shows total and fee before a single wallet confirmation per tx. Optional Safe batch export (MultiSend; verify before building). Schedule templates: monthly payroll draft that needs owner approval each run. Payee side already works (their Scan).
- Privacy/security: payer-to-payee linkage stays public at the payer's wallet (payees' amounts are visible); document. CSV parse is strict; meta-addresses validated by `core-crypto` parser; label never leaves device.
- Deps: `chain-adapters` router builder (exists); a future batch contract would save gas but is a new audited contract (L, not proposed now). Effort: M. Impact: 7. Owner: new `packages/payouts`.

### M-14 Local catalog, price list, printable receipts
- Problem: typing line items every sale; no receipt a customer or tax office accepts.
- Why: makes POS and buttons fast; receipts satisfy buyers.
- Design: encrypted catalog (SKU, name, price in token, tax class, stock counter) in M-01 store; invoice lines pulled from it; stock decremented on `paid`. Receipt: print-CSS HTML from invoice + payment (invoice number, merchant legal name from signed profile M-16, lines, tax, token amount, tx ref); "save as PDF" via browser print, no PDF library. Static per-SKU QR sheets for shelves (fixed price, reusable link).
- Privacy/security: no images fetched remotely; text-only, escape all fields; receipts omit payer details by default.
- Deps: M-01. Effort: S-M. Impact: 6. Owner: `packages/merchant-ledger` (catalog module) + view.

### M-15 Merchant-signed rate card (priced in fiat without an oracle)
- Problem: fiat invoices cannot be paid (no feed); a shop priced in EUR cannot sell in ETH.
- Why: unblocks the most common pricing model; stablecoin pricing alone excludes volatile-asset buyers.
- Design: merchant sets or imports a rate (`ETH/USD = 2410.55`, valid 15 min, optional spread) locally; the invoice already has `quote.source/timestamp/expiresAt/maxSlippageBps` (`schema.ts`), so use `source: "merchant:rate-card"` and `fixed_token` amount computed at creation. Payer UI labels it "rate set by merchant, not market-verified", shows the implied rate beside any user-configured reference. Optional rate import is a user-chosen URL, off by default (clearly a third-party call when on).
- Privacy/security: no oracle dependency; the payer is protected by fixed token amount and expiry, not by the rate's fairness (disclose). Rejects rates outside configured sanity bounds.
- Deps: none beyond schema as is. Effort: S. Impact: 7. Owner: `packages/merchant-ledger` (pricing module).

### M-16 Signed merchant profile and first-use pinning
- Problem: payers cannot tell the real shop's button from a lookalike (Roadmap F2 threat table: clickjacking, fake widget).
- Why: trust is the conversion blocker for first-time buyers; "verified shop" badge without a registry.
- Design: profile `{name, url, signerPub, logo as data: URI <= 8 KB, contact}` signed by the invoice signing key; embedded in invoice memo area or button `data-profile`. Pay view shows name + short signer fingerprint; first time a fingerprint is seen the payer is asked to confirm and the pin is stored locally (TOFU); a later invoice with the same `name` but a different fingerprint shows a hard warning. Optional DNS-free proof: merchant publishes `/.well-known/ghostpay.txt` containing the fingerprint, checked only by the merchant themselves in their dashboard (no payer-side fetch).
- Privacy/security: all offline on the payer side; no registry, no phone-home. Homoglyph checks via address-safety spec.
- Deps: `invoice-schema` signer (exists); address-safety spec. Effort: S-M. Impact: 7. Owner: new `packages/merchant-profile`.

### M-17 Multi-option orders (pay on any chain or token)
- Problem: one invoice fixes one chain and token; the payer holds USDC on Base and the invoice wants ETH on Sepolia/mainnet.
- Why: the most direct conversion lever: fewer "I cannot pay" abandons.
- Design: Order = N sibling invoices (one per chain/token) behind one link bundle `#gpb=` (list of invoice links, signed bundle header). Pay view lists options with fee and gas estimate; first verified payment closes siblings (ledger marks `void`); late payments on a sibling become "overpaid/duplicate" for refund (M-10).
- Privacy/security: payer reveals chain choice only to their own RPC; bundle size capped (16 KiB decoded, as for invoices).
- Deps: M-01; `MULTICHAIN_SPEC` chains enabled. Effort: M. Impact: 7. Owner: `packages/merchant-ledger` (bundle module) + Pay view change by app owners.

### M-18 Offline-first PWA and NFC tap
- Problem: shop wifi drops; customers want tap-to-pay.
- Why: POS that works in a basement market and "tap the sticker" are distinctive.
- Design: service worker + web manifest (same-origin cache of the hashed bundle; update only after release-hash check); invoice creation and QR are already offline-capable; queue payment detection until RPC returns; show "waiting for network" instead of a false "unpaid". NFC (Web NFC `NDEFReader`, Android Chrome only, feature-detected): POS writes the invoice link to a tag/phone, payer taps to open; static NFC sticker = reusable link (M-06). Registers `web+ghostpay:` protocol handler for deep links where supported.
- Privacy/security: service worker cache scope limited; NFC payload is just a link (bearer warning applies; a sticker is a public fixed-price link, never a one-time invoice); no Bluetooth.
- Deps: M-03. Effort: M. Impact: 6. Owner: `apps/pos` (service worker) and `packages/embed-sdk` (NFC helper).

### M-19 Bulk invoicing from CSV and reminders
- Problem: invoicing 80 clients monthly by hand.
- Why: B2B recurring revenue; pairs with M-08.
- Design: CSV (client label, amount, due date, memo) -> N invoices, a QR sheet, and a mail-merge file (`.csv` with link column) for the merchant's own mail client; reminder schedule fires `invoice.due`/`invoice.overdue` events in `merchantd` or as an in-app list. Invoice numbering template `INV-{yyyy}-{seq}`.
- Privacy/security: links are bearer secrets: warn in the export header and offer "send each by separate channel"; no GhostPay mailer.
- Deps: M-01. Effort: S-M. Impact: 6. Owner: `packages/merchant-billing`.

### M-20 Team sync without a server
- Problem: two tablets and an owner laptop each have different ledgers.
- Why: multi-till and multi-staff shops; removes "who has the latest data".
- Design: ledger is an append-only encrypted event log (Lamport clock + per-device id); sync by file/QR chunks/LAN WebRTC data channel with manual pairing code (no signalling server: offer/answer exchanged by QR). Merge = union by event id, deterministic reducer. Conflict policy: payments from chain win over manual edits.
- Privacy/security: no relay; encrypted with the role pack key; device removal = rotate pack key. WebRTC ICE may reveal LAN IPs, so offer file/QR only mode by default.
- Deps: M-01, M-09. Effort: L. Impact: 6. Owner: `packages/merchant-sync`.

### M-21 Signed coupons, gift cards and loyalty stamps (offline)
- Problem: merchants retain customers with vouchers; no custody-free way.
- Why: repeat business, gifting; fun feature that costs the customer no privacy.
- Design: coupon = merchant-signed `{id, kind, value, expiresAt}` token as QR/link; redemption at POS applies discount to the invoice; double-spend prevented by the merchant ledger's redeemed-set (single-merchant scope, not cross-merchant). Gift card with balance = ledger IOU, same as prepaid credit.
- Privacy/security: bearer instrument, so single-use ids and expiry; no customer account.
- Deps: M-01, M-03. Effort: S-M. Impact: 4. Owner: `packages/merchant-ledger` (vouchers module).

### M-22 Merchant dashboard (local reports)
- Problem: no sense of sales trends.
- Why: daily-use hook: revenue by day, average order, top SKUs, payout/refund rate, open balance owed.
- Design: derived views over M-01; hand-rolled SVG charts (no chart library, no remote assets); date-range picker; "end of day" Z-report for the till, printable.
- Privacy/security: computation local; nothing exported unless the user does. Z-report omits payer data.
- Deps: M-01, M-05. Effort: S-M. Impact: 5. Owner: `apps/web` Orders view + `packages/merchant-export`.

### M-23 Unmatched and wrong-token inbox
- Problem: customers send the wrong token, pay twice, pay after expiry; funds sit at a stealth address nobody tracks.
- Why: support burden is what makes merchants leave; a clear "needs attention" queue keeps them.
- Design: reconciler outputs an Attention list: unmatched router payments, direct (non-router) sends marked unverified, expired-but-paid, duplicates, wrong token (balance check across allowlisted tokens at matched stealth addresses). Actions: link to order, refund (M-10), keep as credit, ignore.
- Privacy/security: balance reads go to the user's configured RPC only; unverified items never count as revenue.
- Deps: M-01. Effort: S. Impact: 6. Owner: `packages/merchant-ledger`.

## 4. Ranked table

Rank = impact first, then lower effort, then dependency order (an item cannot rank above something it needs unless noted).

| Rank | ID | Feature | Effort | Impact | Owner dir |
|---|---|---|---|---|---|
| 1 | M-01 | Merchant ledger and reconciler | M | 10 | `packages/merchant-ledger` |
| 2 | M-02 | Payer payment receipt (MAC proof) | S-M | 9 | `packages/pay-receipt` |
| 3 | M-03 | POS terminal mode | M-L | 10 | `apps/pos` |
| 4 | M-09 | Role-separated keys, per-terminal sub-meta-addresses | M-L | 9 | `packages/merchant-keys` |
| 5 | M-04 | `merchantd` watcher, API, signed webhooks | L | 9 | `apps/merchantd` |
| 6 | M-05 | Accounting and tax export | M | 8 | `packages/merchant-export` |
| 7 | M-06 | Payment buttons, reusable links, SDK v2 | M | 8 | `packages/embed-sdk` |
| 8 | M-10 | Privacy-preserving refunds | M | 8 | `packages/merchant-refunds` |
| 9 | M-12 | Treasury destination, sweep policy, batching | M | 8 | `packages/merchant-treasury` |
| 10 | M-08 | Subscriptions (manual + prepaid) | M-L | 8 | `packages/merchant-billing` |
| 11 | M-07 | Shop plugins (Woo, Presta, Shopify) | L each | 8 | `packages/plugin-woocommerce` etc. |
| 12 | M-15 | Merchant-signed rate card | S | 7 | `packages/merchant-ledger` |
| 13 | M-16 | Signed merchant profile + pinning | S-M | 7 | `packages/merchant-profile` |
| 14 | M-11 | Deposits, partial payments, installments | M | 7 | `packages/merchant-ledger` |
| 15 | M-17 | Multi-option orders | M | 7 | `packages/merchant-ledger` |
| 16 | M-13 | Bulk payouts and payroll | M | 7 | `packages/payouts` |
| 17 | M-14 | Catalog, price list, printable receipts | S-M | 6 | `packages/merchant-ledger` |
| 18 | M-23 | Unmatched / wrong-token inbox | S | 6 | `packages/merchant-ledger` |
| 19 | M-18 | Offline PWA and NFC | M | 6 | `apps/pos` |
| 20 | M-19 | Bulk invoicing and reminders | S-M | 6 | `packages/merchant-billing` |
| 21 | M-20 | Serverless team sync | L | 6 | `packages/merchant-sync` |
| 22 | M-22 | Local dashboard and Z-report | S-M | 5 | `apps/web` Orders view |
| 23 | M-21 | Coupons, gift cards, stamps | S-M | 4 | `packages/merchant-ledger` |

Suggested build order for the top 10 (dependencies): M-02, M-01, M-09, M-03, M-05, M-06, M-12, M-10, M-04, M-08. M-07 follows M-04.

## 5. Top 10 buildable specs

Terms: MUST/SHOULD per RFC 2119. Common acceptance gates for all: `npm test` coverage thresholds hold; Playwright egress test shows zero requests outside same-origin and configured RPC/relayer; build bundle scan passes (no `eval`, `innerHTML`, remote hosts); no secret appears in logs, storage plaintext or exports.

### S1. `packages/merchant-ledger` (M-01)
MUST:
- Export pure `reconcile(orders, matches, receipts, now) -> Order[]` with no I/O, plus a `LedgerStore` interface (IndexedDB and file adapters).
- Encrypt records at rest with AES-256-GCM, fresh 96-bit IV per write, AAD = schema version + record type; key via HKDF from the viewing key and a random salt (mirror `lib/tags.ts`).
- Count a payment only if its amount is router-verified or balance-checked; otherwise status `unverified`.
- Never auto-mark an order `paid` on a heuristic (amount/time) match; require receipt MAC or user confirmation.
- Support statuses draft, open, partial, paid, overpaid, expired, refunded, void with a documented transition table.
- Provide `exportEncrypted(passphrase)` / `importEncrypted` (scrypt N=2^17 as in `lib/keystore.ts`) with round-trip.
SHOULD: property-based tests on reconcile (idempotent, order-independent); handle reorgs by keying payments on `blockHash:logIndex` and re-evaluating when a block hash disappears.
Acceptance:
1. Given order O (fixed 100 USDC) and one verified match of 100 USDC with valid receipt, status `paid`; replaying the same match twice leaves one payment.
2. 60 then 40 verified -> `partial` then `paid`; 120 -> `overpaid` with credit 20.
3. A match flagged unverified never moves status beyond `open`.
4. After `lock()`, reading the DB shows no plaintext label, amount or address (inspect raw records).
5. Export then import on a clean profile yields byte-equal reconcile output.

### S2. `packages/pay-receipt` (M-02)
MUST:
- `makeReceipt({ephemeralSecret, viewPub, invoiceNonce, chainId, txHash}) -> Receipt` and `verifyReceipt({viewSecret, R, ...})`; key = HKDF-SHA256(ECDH shared x, salt = empty, info = `GhostPay/receipt/v1`); mac = HMAC-SHA256(key, nonce||chainId(be32)||txHash).
- Receipt fields: version, invoiceNonce, chainId, R (33 bytes), txHash, mac; no payer address, no amount.
- Encode as `#gpr=v1.<base64url>`, max 512 bytes decoded, strict parser, constant-time MAC compare.
- Zeroize the shared secret and key after use (`zeroize` from `core-crypto`).
- Verification MUST also require that R matches a scanner match for the merchant.
SHOULD: QR rendering using `lib/qr.ts`; payer app keeps `e` encrypted (secret-box) until receipt is issued, then discards.
Acceptance:
1. Round trip valid; flipping any byte of nonce, chainId, txHash, R or mac fails.
2. Receipt for invoice A fails against invoice B (nonce mismatch).
3. A third party with the receipt and public chain data cannot produce a valid receipt for a different txHash (test with random keys, 1000 trials).
4. Fuzz parser: no throw other than typed errors, no >512-byte accept.
5. Static check: package imports no network API.

### S3. `apps/pos` (M-03)
MUST:
- Separate static entry using the same CSP and bundle scan as `apps/web`; routes Keypad, Catalog, Orders, Settings.
- Create an invoice in under 2 taps after amount entry (amount, "Charge") using fixed-token amount and 10 min default expiry; show full-screen QR generated locally.
- Detect payment via the ledger (S1) and show a distinct, non-colour-only "Paid" state with sound that can be muted; show "Underpaid by X" and "Late" states.
- Hold only cashier-pack keys (S4); refuse to start if a spend key is present in the profile.
- Auto-lock after configurable idle (default 5 min); void/refund require owner PIN or owner pack.
SHOULD: tip screen with presets; haptic/beep; large-text mode; works with keyboard only.
Acceptance:
1. Playwright: with mock RPC, charge 5 USDC, inject matching announcement, screen shows Paid within one scan cycle; no request to non-allowlisted origin.
2. Starting with a profile that contains a spend key fails with a typed error.
3. Axe/keyboard test passes for Keypad and Paid screens; status is announced via live region.
4. Airplane-mode test (M-18 optional): invoice and QR still render.
5. Idle lock clears decrypted ledger from memory (heap marker test on keys, not data content).

### S4. `packages/merchant-keys` (M-09)
MUST:
- Derive child meta-address key pairs from a master seed with HKDF-SHA256, info = `GhostPay/merchant/v1/{role}/{index}`; output only valid secp256k1 scalars (reject and re-derive on 0 or >= n deterministically).
- Role packs: `cashier` (child signing key + child viewing key + child spend PUBLIC key), `accountant` (viewing keys only), `owner` (seed). A pack never includes a spend secret except owner.
- Serialize via keystore format v2 (scrypt + AES-GCM, versioned) with import caps for scrypt cost (closes S3-13 pattern).
- Child meta-addresses MUST be valid scheme-1 meta-addresses accepted by `core-crypto` and the existing scanner.
SHOULD: owner-view aggregate scan over all children; `revoke(index)` marks a child retired in the ledger.
Acceptance:
1. Test vectors pinned in `test-vectors/` for 5 seeds x 3 roles; deterministic across runs.
2. A cashier pack cannot derive any spend secret (fuzz: no API path returns one).
3. A payment to child index 2 is found by the child-2 viewing key and not by child-3 (view-tag + full check).
4. Owner can sweep a payment found by a cashier terminal.
5. Pack import with scrypt N above cap is rejected before computation.
Note: derivation tree needs external cryptographer review before any use with value.

### S5. `packages/merchant-export` (M-05)
MUST:
- Pure functions `toCsv`, `toHledger`, `toBeancount`, `taxSummary(period)` over ledger orders.
- Fiat amounts taken only from the signed invoice; rows without fiat basis flagged and excluded from tax totals.
- CSV cells starting with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'`; RFC 4180 quoting.
- Stealth addresses omitted unless `includeAddresses: true`.
- Deterministic output (stable sort, `\n` newlines, UTC dates).
- Header comment states: no gain/loss computation, no tax advice.
SHOULD: hledger/Beancount output passes `hledger check` / `bean-check` in CI when those tools are available.
Acceptance:
1. Golden-file tests for 3 fixtures (simple, partial+refund, multi-tax).
2. Formula-injection fixtures (`=HYPERLINK(...)` in a customer label) emitted inert.
3. Sum of tax column equals `taxSummary` total to the minor unit.
4. Same input twice -> identical bytes.
5. Static check: no network API.

### S6. `packages/embed-sdk` v2 (M-06)
MUST:
- Keep `ghostpay-embed-v1.js` unchanged and hash-pinned; ship `ghostpay-embed-v2.js` unminified plus a minified build with published SHA-256.
- Create DOM only via `createElement/setAttribute/textContent`.
- Open checkout (popup; iframe only if the host sends a `frame-ancestors` allowlist) with `data-invoice`; accept only links on the configured app origin.
- Receive completion via `postMessage` with exact origin match, `event.source` check, per-instance nonce, schema `{type:'ghostpay:done', status:'paid'|'cancelled', receipt?}` and a 2 KiB cap; ignore everything else.
- Button generator view in the app outputs the HTML snippet and a printable QR sheet.
SHOULD: reusable-link mode with expiry warning; optional `data-profile` (M-16).
Acceptance:
1. Extend `embed.test.ts` style tests: spoofed origin, wrong source, replayed nonce, oversized payload, unknown type all ignored.
2. Fuzz attributes (`data-invoice` with `javascript:` or other-origin URL) never open a window.
3. Snippet generated by the app works in a jsdom page and opens the expected URL.
4. SDK bundle contains no `http://` literal, `eval`, `innerHTML`.
5. Receipt delivered in callback verifies with S2.

### S7. `packages/merchant-treasury` (M-12)
MUST:
- Policy schema validated strictly: destination (checksummed, allowlisted), minAmount, minAgeSec, jitterWindowSec, holdUntilRefundWindow, maxPerBatch, relayerFeeCap.
- Planner `plan(policy, ledger, balances, now) -> SweepPlan[]` excludes orders with open refund windows, below-minimum balances and unverified items.
- Execution only after owner unlock; each sweep signed in memory using the order's derived stealth key and discarded; submission times drawn with `lib/jitter.ts` logic across the window.
- Before signing, show destination checksum, total, fee, and a linkability summary ("these N payments will share destination X").
- Refuses a destination not in the allowlist and any fee above cap.
SHOULD: per-bucket destinations; Safe address warning if code size > 0 and ERC-20 receive path unverified.
Acceptance:
1. Plan excludes an order inside its refund window and includes it after.
2. Destination swapped in memory between plan and sign -> signing aborts.
3. Jitter test: submission times spread over window, none outside.
4. Fee above cap rejected.
5. No secret remains reachable after batch completes (zeroize assertions).

### S8. `packages/merchant-refunds` (M-10)
MUST:
- `RefundRequest {orderId, amount, destination, reason}` valid only if `amount <= verified paid - refunded`.
- Build a sweep order (`SweepOrder`) with `destination = refundTo`, `amount` as given, signed by the order's stealth key; support relayed (ERC-2612) and direct paths.
- Claim-link flow: `#gpf=v1.` single-use bearer containing orderId hash and expiry; the customer enters a fresh address; merchant must confirm it.
- Run address-safety checks on `refundTo` (checksum, not zero/router/contract-of-token, not the stealth address itself).
- Show the disclosure: relayer sees owner, destination, amount.
- Record the refund in the ledger as a negative payment, status `refunded` when total refunded equals paid.
SHOULD: store-credit alternative with no chain action; partial refunds only for relay-supported tokens, else direct with user-funded gas.
Acceptance:
1. Partial refund of 40 of 100 leaves status `paid` with refunded 40; second refund of 70 rejected.
2. Refund after sweep-to-treasury is rejected with a message pointing to treasury refund (not silently linked).
3. Claim link used twice or after expiry fails.
4. `refundTo` equal to zero address, router, or token contract rejected.
5. Anvil e2e (existing relayer harness) completes a relayed refund to a fresh address.

### S9. `apps/merchantd` (M-04)
MUST:
- Node >= 22, deps limited to workspace packages + `viem`; config file with RPC, chain, keys via `secret-box` or file mode 600.
- Bind 127.0.0.1 by default; bearer API token compared constant-time; request body cap 16 KiB; strict JSON schema.
- Endpoints: `POST /v1/orders`, `GET /v1/orders/:id`, `POST /v1/receipts/verify`, `GET /healthz`.
- Webhooks: `X-GhostPay-Timestamp`, `X-GhostPay-Signature: v1=<hex HMAC-SHA256(secret, ts + "." + body)>`, unique `event_id`, retries with exponential backoff up to 24 h, receivers told to reject skew > 5 min.
- Never log bodies, links, viewing key or webhook secrets; no outbound request other than configured RPC and configured sinks.
- Holds no spend key; refuses to start if one is present.
SHOULD: ntfy and SMTP sinks; Prometheus-style local metrics; `--dry-run` that prints events without sending.
Acceptance:
1. Integration test: create order, feed a mock announcement + valid receipt, webhook arrives once with valid signature; duplicate delivery carries same `event_id`.
2. Modified body or timestamp fails reference verifier.
3. Starting with spend key in config fails.
4. Egress test: only RPC and sink hosts contacted.
5. Restart mid-retry resumes delivery without duplicates beyond at-least-once semantic.

### S10. `packages/merchant-billing` (M-08)
MUST:
- Models: Plan {id, price (token amount), interval, graceSec, mode: manual|prepaid}, Subscriber {id, label, planId, status, creditBalance, nextDueAt}, with transition table (trial, active, past_due, suspended, cancelled).
- Manual mode: scheduler emits `renewal.due` at `nextDueAt - noticeSec` with a freshly generated invoice (new nonce, new expiry); lapse to `past_due` after `nextDueAt` and `suspended` after grace.
- Prepaid mode: payment buys N periods; credit deducted per period; runway computed; deficit moves to `past_due`.
- Portal link `#gps=v1.` bearer: plan, balance, next due, renewal link; strict parser, 4 KiB cap, no payer personal data.
- All state in S1 ledger; events delivered via S9.
SHOULD: proration on plan change; export of billing history through S5.
Acceptance:
1. Clock-driven test: monthly plan, payment on day 0, due notice day 27, past_due day 30, suspended after grace; late payment restores `active` and extends from original due date.
2. Prepaid: 3-period purchase, deductions on three due dates, fourth date -> `past_due`.
3. Each renewal invoice has a distinct nonce; paying an old renewal invoice does not credit the new one.
4. Portal link tamper or oversize rejected.
5. No network API used in package.

## 6. Cross-cutting risks and open questions

- Receipt design (S2) and key tree (S4) are new cryptographic constructions: both need independent review before any real-value use; keep out of the audited core.
- The router fee (0.25%) applies on router paths; payouts, refunds via sweep and reusable links have different fee consequences: state them in each UI.
- Reconciliation without on-chain references relies on receipts; payers who skip the receipt step produce heuristic matches only. Make the receipt step default and one tap, and keep POS matching on short expiry + exact amount.
- Schema changes (installment `plan`, bounded pay-what-you-want amounts) belong to the invoice-schema owners; the ledger-level versions avoid touching the strict parser.
- Compliance (sanctions, invoicing law, tax): export and receipts are tooling, not advice; hosted plugins/listings would put GhostPay in the legal path, hence self-hosted `merchantd` and template-style Shopify support.
- Verify before building: Safe MultiSend/tx-builder format, Web NFC support matrix, QuickBooks/Xero CSV column specs (none retrievable on 2026-10-21).
