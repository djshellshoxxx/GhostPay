# Merchant delivery, billing, embeds, and price-feed research

Research date: **2026-11-03 America/Vancouver / 2026-11-04 UTC**. Source baseline: PR #47 at `f8193502e602c99bb24ff956f142671750b744a0`; separate embed work is already owned by [PR #63][PR63].

This is source research and a proposed implementation backlog. No merchant server, live oracle query, upstream package installation, payment, or runtime test was executed for this note.

## Decision for Claude

Keep merchant services and fiat pricing outside the lean release until their own acceptance work is complete. The most useful reuse is **delivery-state design from BTCPay Server**, **explicit protocol compatibility from Standard Webhooks**, and **current Chainlink interface/documentation checks**. GNU Taler adds a substantive source outside GitHub for durable webhook workers and refund-state separation, with different licensing and payment semantics.

Do not implement these features from scratch based on the older reuse notes: several underlying libraries already exist.

## 1. Current implementation and actual gaps

| Area | Verified in GhostPay source | Follow-up |
|---|---|---|
| Webhook cryptography | `packages/merchant-hooks/src/webhooks.ts` implements HMAC signing, timestamp/nonce verification, strict event parsing, stable serialization, retry-delay calculation, and an in-memory nonce store. | A versioned external contract, durable receiver state, key rotation, and an operator service are separate work. |
| Event idempotency | The same file already has `IdempotencyGuard.begin/complete/release`, including in-flight handling. Its comments explicitly say state is lost on restart. | Preserve the semantics while evaluating a durable transactional adapter. Do not claim idempotency is absent. |
| CLI support | `packages/cli/src/commands/webhook.ts` signs/verifies files. Verification explicitly reports `replayChecked: false` because the command is stateless. | Keep that distinction in documentation; a successful CLI check is not a production replay store. |
| Subscriptions | `packages/merchant-billing/src/subscription.ts` models invoice scheduling, reminders, pause/resume and voluntary payments. | Persist the schedule and issue invoices through the existing schema. This does not authorize recurring debits. |
| Refunds | `packages/merchant-billing/src/refunds.ts` implements idempotent plans, a cumulative amount bound, fresh meta-address validation, and planned/submitted/confirmed/failed transitions. | The caller must supply verified original payment evidence, authenticated refund instructions, durable state, and actual transaction tracking. A plan is not proof of a returned payment. |
| Embeds | The existing SDK/profile implementation is supplemented by PR #63's iframe handshake and browser tests. | Review that branch before proposing further handshake fixes; keep browser confirmation separate from merchant fulfillment authority. |
| Fiat quotes | `packages/chain-adapters/src/quote.ts` already contains `FEEDS`, price validation, RPC readers, and exact bigint conversion. Its inspected registry has one Sepolia ETH/USD entry; heartbeat metadata is absent. | Fetch and record current provider metadata before expansion. The older spec's claim that all feeds are absent is stale. |

Evidence: [webhooks][GP1], [CLI][GP2], [subscriptions][GP3], [refunds][GP4], [quotes][GP5], [embed specification][GP6], [fiat specification][GP7].

The earlier [merchant-api reuse note][OLD1] and [price-oracle note][OLD2] are historical starting points. Use the current functions and paths above when choosing work; adding a parallel webhook package or second quote engine would duplicate existing behavior.

## 2. MERCHANT-01 — BTCPay Server

**Inspected pin:** `btcpayserver/btcpayserver@e5818a52863152ead3d5a28ed964c01ce23261c7`, commit dated 2026-11-03 UTC. Root [LICENSE][B1] is MIT.

Verified source locations:

- [`BTCPayServer/Plugins/Webhooks/WebhookSender.cs`][B2]
- [`BTCPayServer/Plugins/Webhooks/HostedServices/WebhookProviderHostedService.cs`][B3]
- [`BTCPayServer/Plugins/Webhooks/TriggerProviders/InvoiceTriggerProvider.cs`][B4]
- [`BTCPayServer.Client/Models/WebhookDeliveryData.cs`][B5]

The sender keeps distinct delivery identifiers, carries original-delivery identity through redelivery, records HTTP outcomes, and chooses retry behavior by outcome. Its per-webhook queue provides an ordering model. These are useful implementation patterns for a future GhostPay worker; the C# service is not a drop-in TypeScript library. In particular, do not infer crash-safe initial event persistence solely from a database-backed delivery history: inspect where enqueue, send, and save occur. [B2][B3][B5]

The trigger provider distinguishes receipt of a payment from settlement and includes after-expiration context. This is useful for GhostPay's partial/late/overpayment state mapping. BTCPay's official [integration guide][B6] is a second primary reference for merchant lifecycle integration. [B4]

**Reuse recommendation:** adapt the state model and acceptance requirements, not the entire server or its blockchain abstraction. If code is copied, retain its MIT notice and record the exact file/pin in the project's third-party provenance record. No source was copied in this research.

**GhostPay fit:** a future optional operator worker around `merchant-hooks` and `merchant-billing`. Keep payment keys out of webhook handlers. A merchant receiver should use a durable unique event identity and verify the authorized payment state before fulfillment.

**Compatibility boundary:** BTCPay's inspected sender signs the body using `BTCPay-Sig: sha256=...`. GhostPay signs timestamp, nonce, and body using its own header. Neither protocol is interchangeable with the other just because both use HMAC-SHA256. A BTCPay integration should use a separate parser and verification path.

## 3. MERCHANT-02 — Standard Webhooks

**Inspected pin:** `standard-webhooks/standard-webhooks@ab6844147ce9cdb0d2dbf2e60d1ea85001fd2554`, dated 2026-10-30. The root/specification license is **Apache-2.0**, while [`libraries/LICENSE`][W1] and the JavaScript package declare **MIT**. Do not label the entire repository with the JavaScript library's license.

Exact source:

- [`libraries/javascript/src/index.ts`][W2]
- [`libraries/javascript/src/webhook.test.ts`][W3] — test location verified; suite not executed.
- [`libraries/javascript/package.json`][W4] — source version `1.1.1`, CommonJS, dependencies `@stablelib/base64` and `fast-sha256`.
- [`spec/standard-webhooks.md`][W5] and [root LICENSE][W6].

The verifier supports exact payload bytes, signed message identity and timestamp, normalized header names, and multiple versioned signatures. The specification covers stable event identity across retries and key rotation. The inspected source branch also contains endpoint-verification extension work; that does not establish that every feature exists in an already published npm release. [W2][W4][W5]

| Property | GhostPay at PR #47 | Standard Webhooks source |
|---|---|---|
| Header contract | One `GhostPay-Signature` value with `t`, `n`, `v1` components | `webhook-id`, `webhook-timestamp`, `webhook-signature` |
| Signed identity | Attempt nonce plus timestamp and exact body string | Stable message ID plus timestamp and exact payload bytes |
| Signature representation | Lowercase hexadecimal HMAC in GhostPay's format | Versioned base64 signature in the standard's format |
| Key rotation | No multi-signature adapter established by this research | Multiple signatures explicitly supported by the specification |
| Business deduplication | Existing in-memory `IdempotencyGuard` keyed by event ID | Still a receiver responsibility; signature verification alone does not complete business work |

**Reuse recommendation:** first decide whether a second public wire protocol is actually needed. If yes, implement an explicitly versioned adapter and interoperability fixtures. Prefer the maintained library when its released package and dependency footprint have been reviewed; otherwise adapt only the small required, licensed surface with provenance. Do not silently alter the existing GhostPay format or confuse a retry nonce with the stable event ID.

**Acceptance:** serialize/sign on one side and verify on the other using the exact supported protocol; retain raw bytes until verification; exercise body encoding, header normalization, key rotation, restart, duplicate delivery, an interrupted handler, and out-of-order lifecycle notifications. These are proposed conformance requirements, not results from this session.

## 4. MERCHANT-03 — GNU Taler merchant backend, outside GitHub

**Upstream forge:** [git.taler.net/taler/merchant][T1]. This source was inspected directly on the project's own git web service, not through a GitHub mirror.

Concrete files:

- [`src/backend/taler-merchant-webhook.c`][T2]
- [`src/backend/taler-merchant-httpd_private-post-orders-ID-refund.c`][T3]
- [`COPYING`][T4] and the source headers.

The webhook worker uses pending-work database operations, a bounded concurrency count, and explicit connection/request timeouts. The refund implementation separates merchant approval and database work from wallet pickup. The official [merchant REST API][T5] further distinguishes refund approval, pending refunds, and successful per-coin refund confirmations. These are useful questions for GhostPay's service boundary; Taler's exchange-based e-cash protocol is different from EVM settlement.

**License and reproducibility limit:** the two inspected backend file headers declare **AGPL-3.0-or-later**. The root COPYING describes multiple license areas, including LGPL library code; it is not a blanket permissive license. The forge's log and file views were retrieved as mutable web views, and showed different cached update dates. A visible [commit page][T6] identifies `2459fbdd7fbb320ca4723447add0a00276041d3e`, but this research did not prove that the mutable file views match that commit. Consequently this is **architecture/reference-only**, not a pinned code-copy recommendation.

**Useful GhostPay decision:** persist approval, submission, canonical confirmation, and delivery separately. A webhook success means the receiver acknowledged a message; it does not make a refund final. A submitted refund with an uncertain network outcome must remain reserved until reconciled, rather than immediately making its amount available for a second refund.

## 5. ORACLE-01 — Chainlink: verify configuration, preserve exact arithmetic

**Source blocker resolved:** Claude's [PR #72](https://github.com/djshellshoxxx/GhostPay/pull/72) records failed retrieval of primary testnet feed data. This research subsequently fetched both official RDD JSON files successfully. [Report 10](10-chainlink-testnet-source-evidence.md) preserves the exact bytes, hashes, retrieval times and official network mapping, including all four requested Sepolia/Base Sepolia records. Use that concrete evidence in the existing PR lane; it does not replace the health/runtime checks below.

**Inspected code pin:** `smartcontractkit/chainlink-evm@982da1fb36c737664187c787fe5bfcba19d651a7`, dated 2026-10-29.

The current [`contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol`][C1] has an MIT SPDX header. Root [LICENSE][C2] contains additional licensing for other repository areas, so copy/review only the selected file's actual terms. GhostPay already has a matching ABI seam; importing the node repository would add no value.

The current official [API reference][C3] marks `answeredInRound` deprecated. GhostPay applies that historical check **alongside** `updatedAt` age checks. Update the explanation and verify the enabled feed's implementation; the deprecation is not evidence that all freshness checks can be removed or that a positive answer is sufficiently current.

The official [L2 sequencer page][C4] currently says existing listed feeds remain supported, while expansion to additional networks has stopped. Do not assume a new L2 has a suitable uptime feed because an old implementation checklist says so.

**Concrete work before enabling another feed:**

1. Record the provider's current network, proxy address, base/quote pair, decimals, heartbeat, deviation behavior, implementation/version, and retrieval date in `docs/chains/`. Keep uncertain entries disabled.
2. Define the application's maximum accepted price age separately from the provider's heartbeat. A heartbeat describes update behavior; it is not automatically an acceptable checkout risk limit.
3. Preserve integer arithmetic and the existing payer-round-up behavior in `fiatToTokenAmount`. Cover very small amounts, non-18-decimal tokens, currency mismatch, and overflow at the integration boundary.
4. For an L2, document whether sequencer health is available and what startup, outage, recovery-grace, and stale-health results mean for quote availability.
5. Make displayed quote, signature-bound quote, and submitted calldata use the same amount/expiry semantics. Resolve upstream changes by creating a new quote, not mutating the amount behind an accepted preview.

**No address approval:** this research observes the existing Sepolia entry but does not independently certify its current on-chain configuration. No feed address, chain, fiat path, or mainnet flag was changed. The next implementation task is a sourced configuration record and fixture-backed validation, not a second oracle abstraction.

## 6. Suggested task slices and acceptance boundaries

| ID | Proposed deliverable | Evidence needed | Ownership/scope |
|---|---|---|---|
| MERCH-A | Version the current webhook event/attempt contract; decide explicitly whether Standard Webhooks is an additional supported protocol. | Protocol fixtures and documented migration/rotation semantics; no claim of compatibility based only on HMAC. | Deferred merchant work; reuse existing `merchant-hooks`. |
| MERCH-B | Durable event outbox and receiver idempotency adapter with event, attempt and processing-state records. | Restart/interruption/concurrency checks against the actual database transaction model; bounded retries and observable terminal failure. | Optional service, not static browser code. |
| MERCH-C | Map verified payment states to merchant notifications and fulfillment policy. | Partial/late/overpayment, canonicality changes, duplicates, and stale notification ordering have explicit outcomes. | Coordinate with core receipt/finality owner and PR #64. |
| MERCH-D | Persist refund plans and reconcile unknown submission outcomes before releasing reservations. | Original payment authority, destination authorization, cumulative cap, duplicate requests, and confirmed receipt remain bound to the same refund intent. | Deferred `merchant-billing` integration; no new custody framework. |
| ORACLE-A | Refresh provider facts for an intentionally selected testnet feed and record missing fields. | Primary-source record, exact network/configuration fixture and later authorized integration evidence. | `chain-adapters`; keep fiat profile scope intact. |
| EMBED-A | Reconcile PR #63's new tests with the merchant-facing lifecycle contract. | Correct origin/source/nonce behavior and business confirmation semantics, including reconnect and popup failure. | Existing PR #63 owns the implementation; do not duplicate it. |

Milestone escrow is separately scoped in [specification 17][GP8], with a custody/state-machine design decision before implementation. Subscription scheduling and refund planning do not imply an escrow contract exists, and a merchant API should not silently introduce one.

## Sources and evidence ledger

All URLs were retrieved or exact paths were verified during this research unless explicitly marked as test-location-only above. GitHub code links are pinned; protocol documentation and the Taler file views are mutable and should be refreshed before implementation.

[GP1]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/merchant-hooks/src/webhooks.ts
[GP2]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/cli/src/commands/webhook.ts
[GP3]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/merchant-billing/src/subscription.ts
[GP4]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/merchant-billing/src/refunds.ts
[GP5]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/packages/chain-adapters/src/quote.ts
[GP6]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/specs/14-embed-merchant-profile.md
[GP7]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/specs/03-fiat-price-feeds.md
[GP8]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/specs/17-milestone-escrow.md
[PR63]: https://github.com/djshellshoxxx/GhostPay/pull/63
[OLD1]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/research/reuse/merchant-api.md
[OLD2]: https://github.com/djshellshoxxx/GhostPay/blob/f8193502e602c99bb24ff956f142671750b744a0/docs/research/reuse/price-oracle.md
[B1]: https://github.com/btcpayserver/btcpayserver/blob/e5818a52863152ead3d5a28ed964c01ce23261c7/LICENSE
[B2]: https://github.com/btcpayserver/btcpayserver/blob/e5818a52863152ead3d5a28ed964c01ce23261c7/BTCPayServer/Plugins/Webhooks/WebhookSender.cs
[B3]: https://github.com/btcpayserver/btcpayserver/blob/e5818a52863152ead3d5a28ed964c01ce23261c7/BTCPayServer/Plugins/Webhooks/HostedServices/WebhookProviderHostedService.cs
[B4]: https://github.com/btcpayserver/btcpayserver/blob/e5818a52863152ead3d5a28ed964c01ce23261c7/BTCPayServer/Plugins/Webhooks/TriggerProviders/InvoiceTriggerProvider.cs
[B5]: https://github.com/btcpayserver/btcpayserver/blob/e5818a52863152ead3d5a28ed964c01ce23261c7/BTCPayServer.Client/Models/WebhookDeliveryData.cs
[B6]: https://docs.btcpayserver.org/Development/ecommerce-integration-guide/
[W1]: https://github.com/standard-webhooks/standard-webhooks/blob/ab6844147ce9cdb0d2dbf2e60d1ea85001fd2554/libraries/LICENSE
[W2]: https://github.com/standard-webhooks/standard-webhooks/blob/ab6844147ce9cdb0d2dbf2e60d1ea85001fd2554/libraries/javascript/src/index.ts
[W3]: https://github.com/standard-webhooks/standard-webhooks/blob/ab6844147ce9cdb0d2dbf2e60d1ea85001fd2554/libraries/javascript/src/webhook.test.ts
[W4]: https://github.com/standard-webhooks/standard-webhooks/blob/ab6844147ce9cdb0d2dbf2e60d1ea85001fd2554/libraries/javascript/package.json
[W5]: https://github.com/standard-webhooks/standard-webhooks/blob/ab6844147ce9cdb0d2dbf2e60d1ea85001fd2554/spec/standard-webhooks.md
[W6]: https://github.com/standard-webhooks/standard-webhooks/blob/ab6844147ce9cdb0d2dbf2e60d1ea85001fd2554/LICENSE
[T1]: https://git.taler.net/taler/merchant/log.html
[T2]: https://git.taler.net/taler/merchant/file/src/backend/taler-merchant-webhook.c.html
[T3]: https://git.taler.net/taler/merchant/file/src/backend/taler-merchant-httpd_private-post-orders-ID-refund.c.html
[T4]: https://git.taler.net/taler/merchant/file/COPYING.html
[T5]: https://docs.taler.net/core/api-merchant.html
[T6]: https://git.taler.net/taler/merchant/commit/2459fbdd7fbb320ca4723447add0a00276041d3e.html
[C1]: https://github.com/smartcontractkit/chainlink-evm/blob/982da1fb36c737664187c787fe5bfcba19d651a7/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol
[C2]: https://github.com/smartcontractkit/chainlink-evm/blob/982da1fb36c737664187c787fe5bfcba19d651a7/LICENSE
[C3]: https://docs.chain.link/data-feeds/api-reference
[C4]: https://docs.chain.link/data-feeds/l2-sequencer-feeds
