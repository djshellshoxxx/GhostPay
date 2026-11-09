# Merchant companion acceptance ledger — November 9, 2026

Track B starts at PR #90, `5628bc00b05a6dd0d9cd89f04f0385d9119281ac`.
Main was `14f9b2673ac25c7ec60a0a3a78eb17e2c7acf44d`. The dedicated branch is
`codex/ghostpay-companion-merchant-20261109`, a sibling of Track A's continuing
work. The parent stack #84 → #88 → #89 → #90 remains draft; this work cannot
clear its Sonar gate. This is an in-progress development ledger, not release acceptance.

| Lane | Writer / paths | Acceptance | Reviewer | Status |
| --- | --- | --- | --- | --- |
| B1 | subscriptions: subscription-cron, billing subscription, ux-schedule | Stable issuance after crash, private state, no live lock stealing | merchant_review | Implementing |
| B2 | coordinator: merchant-operations refund/batch files | Exact immutable plans, transactional reservations, unknown outcomes stay reserved; reject real evidence without an owned verifier interface | merchant_review | Implementing fixture-only workflow |
| B3 | webhooks: merchant-hooks, webhook-receiver | Durable nonce/event/claim/completion, cross-process and restart checks, exact-byte fixtures | shops / coordinator | Implementing |
| B4 | merchant_review: merchant-multisig, approvals example | Strict exchange and runtime state, fresh quorum/policy and time validation | subscriptions / coordinator | Reproduced invalid imported timestamps; implementing |
| B5 | cli: CLI package | Supported runtime, bounded descriptor reads, atomic private outputs, executable journeys | plugin_sandbox | Implementing |
| B6/B7 | shops: WooCommerce / PrestaShop | Settings, packaging, PHP suites; real platform/database evidence separately | webhooks / coordinator | Preparing tools and implementation |
| B8 | plugin_sandbox: plugin-api, sandbox, plugin-conformance | Revocation, global storage serialization, isolated simulator snapshots | cli / coordinator | Reviewing and implementing |

Each worker uses a separate branch/worktree and mutable dependency/build directory.
No root manifest, lockfile, CI, application, chain, crypto, ledger or shared handoff
file is writable in this track. New evidence and integration requests stay here.

Initial tooling: Node 24.22.1, npm 11.9.0. `npm ci --ignore-scripts --offline`
completed successfully (747 packages); builds and acceptance runs are pending.
PHP and Docker are absent from PATH at start; actual provisioning attempts and
their outcomes will be recorded, rather than calling platform tests passed.

## Integration request: original-payment and refund authority

The existing billing planner accepts a caller-supplied `OriginalPayment` and
destination; it does not independently authenticate either. Track A owns payment
truth and the merchant ledger. Track B will not make a duplicate verifier.
Before any real refund workflow can be accepted, Track A must supply an approved
interface binding original canonical payment identity, chain, asset, eligible
amount, invoice and authenticated fresh refund instructions, plus authoritative
submission reconciliation and definitive-failure evidence. Tests must reject
changed/reorged originals, stale/mismatched destination authorization and uncertain
submission outcomes. Local fixture tests do not close this boundary.
