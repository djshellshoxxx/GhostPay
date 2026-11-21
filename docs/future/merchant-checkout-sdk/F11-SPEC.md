# F11 — Minimal Merchant Checkout SDK

**Status:** FUTURE FEATURE — specification only; not implemented or release-authorized  
**Priority:** P2 | **Estimate:** 2–5 engineering days for a prototype, subject to source audit; security and real-payment qualification additional  
**Target:** Static GitHub Pages/HTTPS, optional separately qualified Tor onion hosting  
**Audience:** Third-party merchant websites and applications accepting customer payments

## Objective and non-goals

Enable a merchant to embed or open an isolated GhostPay checkout with minimal JavaScript, using GhostPay's existing invoice, cryptographic, wallet, chain-adapter, network-transport, and verification components. The customer authorizes payment in their own wallet; the merchant independently verifies settlement. No mandatory GhostPay-operated backend, custody, new payment protocol, new cryptographic engine, REST daemon, recurring debits, hosted webhook service, or new chain integrations.

## Prerequisite: reuse audit

Before implementation, inspect latest main, active embed PRs, `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/ACTIVE_WORK.md`, and existing embed SDK/checkout message protocol. Identify exact reusable entry points and gaps. Preserve existing API naming where suitable; do not duplicate or replace working components. Record baseline SHA and owners.

## MVP interface (illustrative, not implemented)

```js
const checkout = GhostPay.mount({
  container: "#ghostpay-checkout",
  invoice: signedInvoice,
  onStatus: event => renderStatus(event)
});
checkout.close();
checkout.destroy();
```

Provide a minimal documented integration supporting an iframe mount, optional popup, lifecycle cleanup, typed status subscription, and signed invoice input. Merchant-facing API may adapt to existing embed names. Include a standalone static merchant example. Merchant-side invoice creation can use existing supported invoice creation methods; do not invent server-side signing.

## Payment lifecycle and settlement

1. Merchant creates an invoice with the existing supported flow and passes it to the SDK.
2. SDK validates configuration and opens an isolated GhostPay checkout at an explicitly configured trusted origin.
3. Customer reviews the verified invoice, network, asset, amount and destination and explicitly authorizes a wallet transaction.
4. Checkout reports bounded events: `created`, `awaiting_payment`, `submitted`, `pending`, `confirmed`, `expired`, `failed`, `cancelled`. Events must be session/invoice bound and reflect real states.
5. Merchant verifies settlement independently against invoice terms, chain, asset, amount, destination, confirmations/finality policy, and reorg/duplicate risks before fulfilling orders.

**Never treat a browser callback, `submitted` event, or claimed `confirmed` event alone as authoritative proof of settlement.** Expose only minimal identifiers and verifiable evidence necessary for reconciliation; avoid public order/customer identifiers in transaction metadata.

## Privacy and trust boundaries

- No GhostPay account, analytics, mandatory backend, or unnecessary persistent customer identifier.
- Merchant scripts must not access checkout private keys or customer wallet signing authority. Cross-origin isolation is preferred; embedding cannot prevent merchants from observing their own pages.
- Default to minimal callback fields; do not expose customer wallet addresses unless required and explicitly authorized.
- Reuse existing fresh stealth destination derivation where supported; do not claim sender anonymity on transparent chains.
- Network provider grants must be explicit, scoped, revocable, and bounded; no unapproved external requests or silent downgrade from required privacy transport.
- Tor-required behavior must fail closed if routing cannot be verified. External wallets, RPCs and merchant systems remain separate trust boundaries; do not claim end-to-end anonymity without evidence.
- Never log secrets or embed them in URLs, callback payloads, traces, or analytics.

## Secure iframe/popup messaging

Reuse the existing GhostPay embed handshake and message schema. Enforce exact origin and message-source validation, schema and invoice binding, session nonce/generation, bounded retry and timeout, replay rejection, safe reload/reconnect handling, cleanup, and cancellation. No sensitive wildcard-origin messages. Stale messages cannot authorize payment or falsely confirm settlement.

## Implementation phases

1. **Audit:** source/PR inventory and exact reusable modules.
2. **Wrapper:** smallest merchant-facing SDK around existing iframe/popup checkout, with no new mandatory dependencies.
3. **Events:** typed lifecycle and error/cancellation semantics with stale-session isolation.
4. **Example:** static merchant integration and independently verifiable settlement guidance.
5. **Qualification:** unit, integration, Chromium/Firefox/WebKit browser tests, applicable build/lint/typecheck/CI, privacy/security review, and evidence.

Third-party candidates such as viem, wagmi, or Reown are **not** automatically authorized dependencies; consider only if a documented gap remains after existing-code reuse, with license, maintenance, privacy, and bundle-size review.

## Negative and regression tests

Test forged or wrong-origin messages, wrong source, malformed payloads, replay, stale checkout generations, iframe reloads, popup closure, duplicate submissions, invalid/expired/tampered invoices, wrong chain, wallet rejection, network interruptions, false confirmation, missing/late settlement, cross-origin data exposure, cleanup, and existing web-app regression. Use deterministic tests where possible. Do not weaken existing assertions or release gates.

## Acceptance gates

- [ ] Merchant can embed/open checkout using minimal JS without visiting GhostPay's main GUI.
- [ ] Existing invoice validation, wallet authorization, payment preparation and observation are reused.
- [ ] Checkout lifecycle and cleanup work; callbacks are typed, bounded, and session-bound.
- [ ] Merchant cannot access customer private keys; forged/stale messages are rejected.
- [ ] Duplicate submission and expired/invalid invoice handling are safe.
- [ ] Merchant settlement verification is independently documented and tested.
- [ ] No mandatory backend, new custody, or unapproved third-party tracking.
- [ ] Static hosting and existing application tests pass.
- [ ] HTTPS/Tor compatibility is claimed only to the extent actually verified.
- [ ] Independent security review completed; all critical/high findings resolved.
- [ ] Exact final commit, commands, test outcomes, skipped checks, and limitations recorded.

## Delivery and governance

This document is **planning only**. It does not authorize implementation, workflow dispatch, merge, deployment, or release. Follow repository ownership rules; use an isolated implementation branch and reconcile active PRs first. Request explicit approval for consequential GitHub actions. Keep documentation and tests grounded in the actual final source.
