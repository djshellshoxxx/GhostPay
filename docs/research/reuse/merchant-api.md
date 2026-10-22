# Reuse research: merchant-api

Scope: BTCPay Greenfield API, webhook HMAC/replay patterns, hosted checkout state machines.
Method: read-only. WebSearch/WebFetch on public pages and raw.githubusercontent.com. No clone, no install, no code copied.
Session note: `api.github.com` and `gh api` returned 403 ("GitHub access to this repository is not enabled for this session"). Repo metadata below comes from github.com HTML pages, raw files and `commits/master.atom`. Anything not seen is marked UNVERIFIED.

## Existing GhostPay state

- No `packages/merchant-api` exists. `packages/` has no webhook or HMAC module.
- `packages/invoice-schema` exists (src, dist, DEVIATIONS.md). Use it as the invoice type source of truth, not a new one.
- `webhook|hmac` hits exist in `apps/relayer/src/{secrets,service,quoteToken,limiter}.ts` and `packages/relayer-guard/src/challenge.ts`. Not reviewed here; check before writing a second HMAC helper.

## Candidate table

| # | Repo | Licence (verified how) | Commit SHA (verified how) | Last commit | Stars | Maintained | Worth reusing | Deps / language |
|---|---|---|---|---|---|---|---|---|
| 1 | https://github.com/btcpayserver/btcpayserver | MIT. `LICENSE` raw: "MIT License / Copyright (c) 2017-2023 btcpayserver" (standard text). Page says MIT. | `419f96ca62e9a6c9d4c29a5ae82daef59cefb4e4` (commits.atom, master) | 2026-10-21T13:36:51Z | 7815 (API) | Yes, very active | Reference only: webhook sender and `BTCPay-Sig` format. Exact `WebhookSender.cs` path NOT confirmed (raw/blob 404 on guessed path). | C# / ASP.NET. Whole server, not a library. |
| 2 | https://github.com/btcpayserver/btcpayserver-greenfield-php | UNVERIFIED. Raw `LICENSE` returned 404; GitHub page shows no licence. Do not copy. | `2835146578c5c23b02b9baf739c1cd4091ca59d8` (commits.atom, master; "Merge PR #144 webhook-delivery-count-encoding") | 2026-10-12T15:50:50Z | 34 | Yes | `examples/webhook.php`: raw-body read, case-insensitive `btcpay-sig` lookup, `isIncomingWebhookRequestValid($raw, $sig, $secret)`, `hash_hmac('sha256', ...)`, then re-fetch invoice. README best practice: "load the data fresh using the API". | PHP 8.0+, composer `btcpayserver/btcpayserver-greenfield-php`. Language mismatch. |
| 3 | https://github.com/jon4hz/go-btcpay | MIT. `LICENSE` raw: "MIT License / Copyright (c) 2021 Jonah". | UNVERIFIED (not visible on page) | UNVERIFIED | 7 | Marked work in progress in search results; 78 commits on master | `invoices.go`, `notifications.go`, `authentication.go`, `btcpay_types.go` as type/endpoint reference for Greenfield shapes. | Go, `go.mod`. Language mismatch. |
| 4 | https://github.com/AskAHumanOnline/btcpay-java | Apache-2.0. `LICENSE` raw: "Apache License, Version 2.0, January 2004". Needs NOTICE if copied. | UNVERIFIED | UNVERIFIED | 0 | 62 commits on main; has renovate.json and release.sh | Webhook signature validation and invoice-creation client, as design reference. | Java, Maven. Language mismatch. |
| 5 | https://github.com/syntr0x79/btcpay-gate | MIT (GitHub page; LICENSE file not fetched raw). | UNVERIFIED | UNVERIFIED | 0 | Unknown; looks new | Only candidate with an explicit "reorg-aware invoice lifecycle" and "signed webhooks" design. Read for state-machine ideas, not code. | Go, own chain backend (not BTCPay). Low trust: 0 stars, single author. |

Not used: OpenReceive (`github.com/OpenReceive`, org page lists openreceive, openreceive-php, openreceive-laravel). Licence not shown on org page; repo not fetched. UNVERIFIED. LnMe (`bumi/lnme`): licence per a directory listing only, repo not fetched. UNVERIFIED.

## Facts established (with source)

- BTCPay signing header: `BTCPay-Sig`, value `sha256=` + HMAC-SHA256(webhook secret, raw body). Source: third-party connector docs and the PHP example (`hash_hmac('sha256', $raw, $secret)`). Hex encoding and `WebhookSender.cs` NOT confirmed from source. Confirm against btcpayserver source before shipping.
- Raw body is required. Re-serialising parsed JSON breaks verification. Source: btcpayserver issue #2300 (maintainer reply, as surfaced by search).
- No timestamp, nonce or delivery-id replay protection in the PHP example. The example checks only `invoiceId` non-empty and `type == "InvoiceSettled"`, then re-fetches the invoice. Replay defence must be built by us.
- Webhooks can be resent after errors, so handlers must be idempotent. Source: greenfield-php README.

## Recommendation

Decision: **reference-only** for all five repos. None is a copyable module for `merchant-api` (language mismatch for 2, 3, 4, 5; licence unverified for 2; server-sized for 1). The core pieces are small. Write our own.

Exact files to read for reference, not copy:
- greenfield-php: `examples/webhook.php`, `README.md` (Best practices section)
- go-btcpay: `invoices.go`, `notifications.go`, `authentication.go`, `btcpay_types.go`
- btcpay-java: its webhook-validation class (path not confirmed; find via search in the repo)
- btcpayserver: `BTCPayServer/Services/Webhooks/` (path not confirmed)

## Integration plan (own code, pattern-level reuse)

- Target path: `packages/merchant-api/` (TypeScript, same style as `packages/invoice-schema`). Files: `src/webhook.ts`, `src/greenfield-client.ts`, `src/checkout-state.ts`, `src/types.ts` (import from `invoice-schema`).
- Webhook verify (`src/webhook.ts`): take raw body bytes (Buffer), not parsed JSON. Read `BTCPay-Sig`, case-insensitive. Expect `sha256=<hex>`. Compute `createHmac('sha256', secret).update(raw).digest('hex')`. Compare with `timingSafeEqual` on equal-length buffers. Reject on missing header or length mismatch before compare.
- Replay: dedupe on a key of `invoiceId + type + deliveryId` (or sha256 of raw body) stored in an idempotency table with TTL. Reject duplicates with 200 (no reprocessing). Reject bodies older than N minutes only if BTCPay supplies a timestamp; UNVERIFIED that it does.
- Fresh load: after verify, GET the invoice from Greenfield (`/api/v1/stores/{storeId}/invoices/{invoiceId}`, path to confirm against docs.btcpayserver.org) and trust only that status, not the webhook body.
- Checkout state machine (`src/checkout-state.ts`): pure reducer, states and transitions mirror BTCPay invoice statuses (New, Processing, Settled, Expired, Invalid; names to confirm against docs). Transitions only forward, except Processing to Invalid/Expired. Every transition is a pure function returning new state or an error. This is where btcpay-gate's reorg-aware idea would fit later.
- API shape: `POST /merchant/invoices` (create, returns checkout URL), `GET /merchant/invoices/:id`, `POST /merchant/webhooks/btcpay` (raw body parser mounted only on this route). Keep the Greenfield API key store-scoped, per greenfield-php best-practice guidance.
- Tests (vitest, as in `packages/invoice-schema`):
  - sig valid, sig wrong, sig missing, sig with wrong prefix, body re-serialised (must fail)
  - duplicate delivery returns 200 and does not reprocess
  - state reducer: every legal transition, every illegal transition rejected
  - webhook then fresh GET mismatch: stored state wins
  - Greenfield client: mock fetch, verify auth header and path

## Risks

- Supply chain: none of this should be a dependency. Reimplementing ~40 lines avoids pulling C#/PHP/Go/Java trees.
- Abandonment: go-btcpay is WIP, btcpay-gate has 0 stars and an unknown last commit date. Do not depend on either.
- Licence traps: greenfield-php has no verified licence (do not copy). btcpay-java is Apache-2.0 (copying needs NOTICE and attribution). btcpayserver is MIT with copyright 2017-2023; keep notice if any text is copied.
- Spec drift: `BTCPay-Sig` encoding and invoice status names are from secondary sources. Verify against btcpayserver source and docs.btcpayserver.org before merging.
- Unverified SHAs: only btcpayserver and greenfield-php have SHAs. Others are UNVERIFIED.
- Security: webhook body is attacker-controllable until the HMAC passes. Do not log raw bodies or the expected HMAC (the PHP example logs both).
- Gateway GitHub access was denied in this session, so SHAs and repo metadata for 3, 4, 5 are missing. Re-run with `add_repo` read access if precise pins are needed.
