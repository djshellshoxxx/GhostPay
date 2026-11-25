# POS terminal session lifecycle completion — 2026-11-25 UTC

## Source

- Branch: `nodata/gracious-meitner-0yy6do`; base main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
- Issue #400 reducer guards (#406) and POS reliability (#576, with #411 as ancestor) were already on main. Open #411 is a stale ancestor of main; open #614 is documentation-only. A blob-level scan of every remote branch (714 refs) found POS source blobs not on main only in older branches, all weaker than main (pre-guard reducers, fixed two-decimal parsing). No newer unfinished POS implementation existed to consolidate.
- F09 GhostPOS (`future/f09-ghostpos`) is specification-only and depends on unbuilt providers (F03/P03/P05). It is not implemented here.

## What changed

All behaviour sits in the static example, which keeps its CSP (`connect-src 'none'`) and adds no dependency.

| Path | Change |
| --- | --- |
| `examples/pos-terminal/pos-session.js` | New DOM-free session layer over the unchanged `pos-logic.js` reducer: sale creation and validation, exact minor-unit amounts and keypad input, customer display model and m:ss countdown, cancel/new sale, payment feed (strict `parseWebhookEvent` mirror, cumulative-to-delta, replay/stale/wrong-sale/late handling, bounded report ids), unverified manual entries, persistence record without the payment link, strict restore with expiry, clock-change and corrupt-record handling. |
| `examples/pos-terminal/pos.js`, `index.html`, `pos.css` | UI wiring: keypad, invoice reference, customer panel and full-screen customer mode, live announcements, focus and `aria-invalid` error handling, `BroadcastChannel('ghostpay-pos-feed')`, `sessionStorage` persistence, restored-sale link re-entry. Responsive two-column layout from 900 px, 48 px touch targets. |
| `examples/pos-terminal/session.test.mjs` | New node tests (26) with a deterministic clock, storage double, mock wallet and mock merchant server that signs and verifies bodies with `@ghostpay/merchant-hooks`; generated cases compare feed validation with `parseWebhookEvent` and totals/status with `@ghostpay/merchant-ledger` `reconcile`. |
| `apps/web/e2e/pos-terminal.spec.ts` | Serves `pos-session.js`; three added scenarios (feed completion, reload recovery, touch tablet/phone with axe). The five existing scenarios are unchanged. |
| `.github/workflows/ci.yml` | Existing POS regression step also runs `session.test.mjs`. |

Not modified: `packages/merchant-hooks`, `packages/merchant-ledger`, `packages/invoice-schema`, `examples/pos-terminal/pos-logic.js`, `parity.test.mjs`.

## Trust and wording

- The feed accepts only bodies a merchant server has already authenticated with `verifyWebhook`. The channel is same-origin; any script on that origin could also control the page directly, so the README asks operators to serve the terminal from an origin they alone control.
- A feed report is labelled as a server notification, not on-chain proof. Manual demo amounts are labelled not verified.
- The payment link (bearer secret) is never written to storage, announcements or notices; it is held in memory and cleared when a sale closes.

## Verification (local)

See the PR description for the exact commands and results on the final commit.

## Remaining

- Hosted CI on the PR head and owner review are required before merge.
- Physical tablets and WebKit/Safari are not qualified; Playwright used Chromium viewport and touch emulation.
- Server-side forwarding of verified webhook bodies to the terminal is the integrator's responsibility; no backend was added.
