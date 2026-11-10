# 07 Relayer metrics and observability

Priority P1 | Effort S (2 d) | Owner: apps/relayer | Deps: none
Sources: gap-analysis item 10 (R-08, G-26); breaker/budget/lane modules; privacy ADR stance (no tracking).

## 1. Interfaces
`GET /metrics` (Prometheus text) and `GET /v1/stats` (JSON), both disabled unless `METRICS_ENABLED=1`, bound to `METRICS_BIND` (default 127.0.0.1) and optionally `METRICS_TOKEN` bearer. Never on the public listener by default.
Metrics (counters unless noted; labels limited to `chainId`, `reason`; **no owner, destination, token amount, IP or tx hash labels**):
- `gp_relayer_quotes_total{chainId}`, `gp_relayer_sweeps_total{chainId,result="ok|rejected|reverted|dropped"}`
- `gp_relayer_reject_total{reason}` (reasons from the existing error enum)
- `gp_relayer_gas_spent_wei_total{chainId}`, `gp_relayer_fee_earned_usd_micro_total{chainId}`, `gp_relayer_loss_wei_total{chainId}` (reverted/griefed sweeps, ties to spec 04)
- gauges: `gp_relayer_wallet_balance_wei{chainId}`, `gp_relayer_budget_remaining_wei{chainId}`, `gp_relayer_breaker_state{chainId}` (0 closed, 1 half-open, 2 open), `gp_relayer_lane_depth{chainId}`
- histograms: `gp_relayer_sweep_latency_seconds`, `gp_relayer_rpc_latency_seconds{chainId}`; `gp_relayer_price_age_seconds{chainId}` (spec 03)
Alert webhook: `ALERT_WEBHOOK_URL` (HTTPS only, allowlisted host), POST JSON `{event, chainId, value, threshold, ts}` with HMAC-SHA256 header `X-GP-Signature` using `ALERT_WEBHOOK_SECRET`. Events: `low_balance` (< `LOW_BALANCE_WEI`), `breaker_open`, `budget_exhausted`, `reject_spike` (>N/5 min), `rpc_disagree`, `price_stale`. Dedupe: one per event per chain per 15 min; payload contains no user data.
Logging: structured JSON; redaction list (owner, destination, signatures, IP); log level via env.
Runbook: add `docs/operators/relayer-monitoring.md` with alert thresholds and response steps.

## 2. Threats
Metrics endpoint exposure (loopback default, token); label cardinality blow-up (fixed label sets, unit test); privacy leakage via per-request timing logs (no per-request ids in metrics); webhook SSRF (HTTPS + host allowlist, no redirects, 3 s timeout); secret in logs (redaction test).

## 3. Test plan
Unit: counter increments per outcome; label whitelist test fails on new high-cardinality label; endpoint 404 when disabled, 401 without token. Integration: drive anvil e2e (existing) then scrape and assert totals; breaker trip emits one webhook; HMAC verifies. Log redaction test with canary values.

## 4. Acceptance
- [ ] /metrics off by default; loopback when on. - [ ] No label or log line contains addresses or hashes (canary test). - [ ] All six alerts fire in tests. - [ ] Runbook merged.

## 5. State note (2026-11-04, EVM-3 unknown broadcast outcome)
Implemented in `apps/relayer` (names follow the shipped `relayer_*` registry, not the `gp_relayer_*` plan above):
- `ChainClient.sendSweep` signs locally, hashes the signed bytes, then sends `eth_sendRawTransaction` once. It throws `SendRefused` only when nothing reached the RPC (encoding, chain id check, signing) or the node's JSON-RPC answer is a fixed refusal (nonce too low/high, insufficient funds, intrinsic gas, underpriced, base fee, type, execution reverted; never "already known"/"already imported"). Everything else is `SendOutcomeUnknown` with the hash; any other thrown error is treated the same (fail closed).
- A refused send keeps the old behaviour: reservations released, nonce re-read, `send_failed` 503. Pre-handoff `deadline_too_soon` stays neutral.
- An outcome-unknown send also answers `send_failed` 503 (clients keep their lock), but keeps its daily-budget and loss reservations and blocks the chain lane: later sweeps get `send_unsettled` 503 + `Retry-After` until reconciliation, so its hot-key nonce is never reused or skipped. Reconciliation runs at the start of each later job: a receipt for the hash settles the reservations; a node pending count above the nonce confirms the broadcast (an unmined one joins the L5-06 receipt lookups; without a hash the reservations are kept until they lapse); a pending count at or below the nonce for `queue.receiptTimeoutSeconds` counts as never broadcast and releases everything. RPC failures leave it unsettled.
- Metrics: `relayer_send_outcome_unknown_total{chain_id}`, `relayer_send_not_broadcast_total{chain_id}`. Logs: `send_outcome_unknown` (warn), `send_broadcast_confirmed`, `send_not_broadcast`, `receipt_late`.
- Open: no alert kind yet for an unknown send (alerts.ts); state is in memory only, so a restart forgets an unsettled send (as for L5-06 lookups); "never broadcast" trusts one RPC's pending view after the grace.
