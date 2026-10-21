# Security spec: relayer abuse, DoS, fee griefing, sybil, breaker, monitoring

Status: draft. Date: 2026-10-21. Branch: `claude/remote-extensions-1`. Scope: `apps/relayer` (sweep relayer, `POST /v1/sweep`, `GET /v1/quote`, `GET /healthz`), its operator runbook, and the web client's use of it. Contracts out of scope except where noted.

Evidence rule: `docs/remote/audits/*` (haiku reports) are unverified and not relied on. Authority: `docs/audits/0*.md`, code read at review time, `docs/threat-model/THREAT_MODEL.md` s6.3. Line refs are to the working tree at 2026-10-21 and may drift.

## 1. Purpose

Define what the relayer MUST resist (abuse, denial of service, fee griefing, sybil), how its circuit breaker MUST behave, and what it MUST expose to operators for monitoring and alerting. Requirements are testable. Existing docs describe gaps; this spec sets the target.

## 2. Existing coverage (checked, thin)

| Doc | Covers | Gap |
|---|---|---|
| `docs/remote/security-specs/review-relayer-app.md` R-01, R-02, R-05, R-12, R-25 | breaker `half_open` latch, sybil DoS, mined-revert griefing, proxy trust, threat list | Review findings, not requirements. No monitoring or alerting section. No numbered MUST set with test IDs for abuse. |
| `docs/audits/03-security-review-client-relayer.md` S3-05/06/07 | breaker latch, griefing, rate-limit bypass | Findings only. |
| `docs/operators/relayer-runbook.md` s7, s8 | `/healthz`, `/metrics` names, alert webhook, griefing note | Self-described "In progress". Not normative. |
| `docs/threat-model/THREAT_MODEL.md` s6.3 | attack tree (drain, DoS, surveil) | Controls marked "in progress". No requirements. |
| `docs/audits/01-completeness-audit.md` R-06, R-08, G-26 | rate limits and breaker "Done"; balance alerts "Partial" | Log event only. No pager or metrics. |
| `docs/remote/modules-needed.md` rows 2, 6 | names `specs/relayer-guard.md` and `specs/ops-monitor.md` | Both files are absent from `docs/remote/specs/` (dangling links). |
| `apps/relayer/DEVIATIONS.md` | referenced as item 15 for balance alerts | Not reviewed here. |

Verdict: no adequate normative spec for relayer abuse, breaker states, or monitoring. This file fills it.

## 3. Assets

- A1 Relayer hot-key native balance (gas and fee funds share one key; R-06).
- A2 `dailyBudgetWei` and per-chain `minBalanceWei` headroom.
- A3 Serial per-chain lane (one in-flight tx per chain, `lane.ts`).
- A4 Availability of sponsored sweeps for honest users.
- A5 Operator visibility (health, metrics, alerts).
- A6 User privacy (no bodies or raw IPs in logs; `apps/relayer/PRIVACY.md`).

## 4. Adversaries

- ADV1 Anonymous spammer, one IP or a small botnet.
- ADV2 Sybil attacker minting owner keys (free, unlimited) and destinations.
- ADV3 Griefer who front-runs the relayer's own signed sweep so it reverts after the relayer pays for simulation and send.
- ADV4 Proxy-spoofer sending forged `X-Forwarded-For` or rotating IPv6 addresses.
- ADV5 RPC-level adversary or unreliable RPC returning errors that look like user faults or timeouts.
- ADV6 Malicious or careless operator (out of scope for trust; in scope for detection and config checks).

Not in scope: on-chain fund theft (blocked by signed destination, amount, fee, feeTo per threat model 6.3 item 4); compromise of the operator host (document only).

## 5. Requirements

Numbering: `RA-<area>-<n>`. Each requirement has a test in s7. "Fixed" means implemented and covered by a passing test at HEAD.

### 5.1 Circuit breaker

- RA-CB-1 (MUST) The breaker has exactly three states: `closed`, `open(until)`, `half_open(probe)`. Transitions: `closed -> open` on trip threshold; `open -> half_open` when `now >= until` and one probe is admitted; `half_open -> closed` on probe success; `half_open -> open` on probe failure.
- RA-CB-2 (MUST) Every admitted job MUST end by calling exactly one of `recordSuccess` or `recordFailure`, including early exits (simulation revert, `gas_limit_too_high`, `budget_exhausted`, `gas_price_too_high`, `rpc_unavailable` from gas price). Use `finally` or equivalent. Verifies R-01 / S3-05.
- RA-CB-3 (MUST) A `half_open` state older than `cooldownSeconds` MUST revert to `open` with a fresh `until`. It MUST NOT latch.
- RA-CB-4 (MUST) `/healthz` MUST report `degraded` while any chain is `open` or `half_open` for longer than `cooldownSeconds`. It MUST report `ok` only when every chain is `closed`.
- RA-CB-5 (MUST) Only failures attributable to the relayer count toward the trip threshold: RPC errors, send failures, and receipts with status 0 on a relayer-chosen transaction. A user-attributable outcome (simulation revert, nonce already used, quote expired, bad signature, front-run revert where the simulation passed on the same block) MUST NOT count. Verifies S3-06 partially.
- RA-CB-6 (SHOULD) Breaker trips MUST be per chain. A chain trip MUST NOT block other chains' sweeps.
- RA-CB-7 (MUST) Breaker transitions MUST emit a structured log event and increment a metric (s5.5 RA-MON-2).

### 5.2 Rate limiting and sybil

- RA-RL-1 (MUST) Quote (`GET /v1/quote`) and sweep (`POST /v1/sweep`) MUST both pass an IP-keyed limiter before any RPC call. Quote currently has IP limit only (R-02) and calls `eth_gasPrice` per request (`service.ts:304-314`).
- RA-RL-2 (MUST) Owner-keyed limits MUST apply to quote and sweep after signature recovery, and MUST NOT rely on owner identity alone for sybil defence (owner keys are free).
- RA-RL-3 (MUST) Sybil defence MUST include at least one owner-independent cost bound per chain: a global per-chain sweep rate cap, or a cap on unreimbursed simulation-cost per window. Limits are per relayer instance, not per owner.
- RA-RL-4 (MUST) Client IP MUST be derived only from the socket address or from `X-Forwarded-For` hops counted by `trustProxyHops`. Startup MUST refuse `trustProxyHops > 0` with a non-loopback listener (R-12).
- RA-RL-5 (MUST) IPv6 keys MUST be bucketed by /64 (S3-07).
- RA-RL-6 (MUST) Limiter time MUST be monotonic (`performance.now()` or equivalent) or clamped; a backwards clock step MUST NOT reset buckets. Verifies bugs-btcapps L6 claim (unverified haiku source; reproduce before relying).
- RA-RL-7 (MUST) Limiter state MUST be bounded (`maxKeys`), with eviction that cannot be forced by one client to reset another client's bucket.
- RA-RL-8 (SHOULD) Rate-limit responses MUST be `429` with `Retry-After` (RFC 6585; RFC 9110 s10.2.3). Budget exhaustion MUST be `503` with `Retry-After` (R-05 / R-10).

### 5.3 Fee and gas griefing

- RA-FG-1 (MUST) Before the lane (`lane.ts`), the relayer MUST run a cheap check that the owner's balance and allowance cover the fee and that the nonce is unused, where the RPC permits. A failing check MUST return a client error without consuming a lane slot or paying gas. Addresses S2 / M1 in `security-btcapps.md` (unverified source; spec-level requirement stands on its own).
- RA-FG-2 (MUST) Every sweep MUST simulate immediately before send through the operator's RPC (R-13 applies: pin or cross-check RPC for simulation). A simulation revert MUST NOT reach `eth_sendRawTransaction`.
- RA-FG-3 (MUST) Gas paid per sweep MUST be capped by `maxGasLimit` and `maxGasPriceWei`. Fee paid to the relayer MUST be checked against actual gas at send time, not only the quote (R-04). If the fee is below cost at send time, refuse.
- RA-FG-4 (MUST) Front-run griefing: a sweep that reverts after the relayer has sent it, and whose revert the attacker caused, MUST be counted in per-owner and per-destination failure caps (S3-06). Caps MUST be keyed on owner and destination, not IP alone. Thresholds MUST be operator config with defaults in code.
- RA-FG-5 (MUST) Failed sweeps MUST NOT be refunded from the daily budget, and the budget MUST debit gas actually spent, not the quoted maximum (see `budget.ts`).
- RA-FG-6 (SHOULD) Document that per-owner caps are bypassable by minting addresses and that sybil cost is bounded by RA-RL-3, not by owner caps.
- RA-FG-7 (MUST) Quote TTL and sweep deadline MUST be checked against relayer time with a stated skew tolerance (R-25 clock skew). Expired quotes MUST be rejected before any RPC call.

### 5.4 Resource and queue bounds

- RA-RS-1 (MUST) Queue depth MUST be bounded (`queue.maxPending`, default 16). Overflow MUST return `queue_full` (503 with `Retry-After`) without an RPC call.
- RA-RS-2 (MUST) Every RPC call MUST have a timeout. RPC errors MUST be reported as `rpc_unavailable`, not as `timeout` for the user (R-13).
- RA-RS-3 (MUST) Required config numbers (`maxGasLimit`, `maxGasPriceWei`, `dailyBudgetWei`, `minBalanceWei`, `rateLimit.*`, `breaker.*`, `queue.maxPending`) MUST have no unsafe defaults. Startup MUST refuse missing or zero values for budget and balance (R-23).
- RA-RS-4 (SHOULD) Relayer MUST document the one-hot-key-per-chain constraint: horizontal scaling needs one budget and one hot key per instance (`onion-i2p-research.md` 1.7 context).

### 5.5 Monitoring and alerting

Current state: metrics, webhook, and cooldown are "In progress" in `docs/operators/relayer-runbook.md` s7 and `apps/relayer/src` has no metrics module. Requirements below are normative regardless of progress.

- RA-MON-1 (MUST) `GET /healthz` returns per-chain breaker state and aggregate status per RA-CB-4. It MUST NOT expose IPs, owner addresses, or request bodies.
- RA-MON-2 (MUST) Expose at minimum these metrics, names as in the runbook: `ghostpay_relayer_http_requests_total`, `_errors_total`, `_sweeps_total` (label `result`), `_failed_gas_wei_total`, `_breaker_state` (0 closed, 1 half_open, 2 open), `_hot_balance_wei`, `_daily_budget_used_wei`, `_daily_budget_limit_wei`, `_queue_pending`. Counters MUST NOT carry owner, destination, or IP labels.
- RA-MON-3 (MUST) `/metrics` MUST be disabled by default. When the listener is not loopback it MUST require a bearer token (`metrics.bearerTokenEnv`).
- RA-MON-4 (MUST) Alert conditions, each with a cooldown and a named owner in the runbook: `breaker_open_or_half_open_over(cooldownSeconds * 2)`, `hot_balance < minBalanceWei * 1.5`, `daily_budget_used > 0.8 * limit`, `failed_gas_wei_total` rate above operator threshold, `rate_limited_*` rate above threshold, `healthz != ok` for 3 consecutive probes from outside the host.
- RA-MON-5 (MUST) Alert delivery failure MUST be logged and MUST NOT block sweeps.
- RA-MON-6 (SHOULD) Ship example Prometheus alert rules in `docs/operators/` using Prometheus alerting practice (`for:` clauses, severity labels). Verify against the Prometheus version the operator runs.
- RA-MON-7 (MUST) Logs MUST NOT contain request bodies or raw IPs (`PRIVACY.md`). Log `errorClass`, chain id, and counts only.
- RA-MON-8 (SHOULD) On-chain watch: alert when the configured `feeTo` or relayer address appears in token blacklist or pause events (threat model / contracts M-01). Owned by ops monitor, not this service.

### 5.6 Operator response

- RA-OP-1 (MUST) Runbook MUST state the restart rule: in-memory state (limits, budget counter, breaker window) resets on restart; do not restart in a loop.
- RA-OP-2 (MUST) Runbook MUST say how to tell abuse from outage using `errorClass` mix and `rate_limited_*` surge, and the two actions allowed (tighten `rateLimit`, `queue.maxPending`; block at proxy).
- RA-OP-3 (MUST) Runbook MUST replace "in progress" text with exact state after each RA item merges. Stale status is itself a finding.

## 6. Design notes

- Breaker: keep `allow()` pure of side effects except the open-to-half-open transition; add a `probeDeadline` so `half_open` self-expires (RA-CB-3). Wrap the lane call so every exit calls `record*` (RA-CB-2). Use a failure-rate window, not a raw count, to avoid one-shot trips from a single bad RPC.
- Sybil: owner keys are free, so owner limits only shape honest traffic. The real bound is per-chain cost: global sweep rate plus unreimbursed-simulation budget (RA-RL-3). Per-IP limits fail behind a single proxy with `trustProxyHops=0` (all clients share one bucket; see `docs/remote/onion-i2p-research.md` 1.7). Option: `bucketBy: "owner+global"` mode when IP cannot discriminate (research doc P3).
- Griefing: the relayer pays gas for transactions an attacker can front-run. Mitigations ordered by strength: (a) pre-lane balance and nonce check (RA-FG-1); (b) simulate just before send (RA-FG-2); (c) per-owner and per-destination failure caps (RA-FG-4); (d) charge fee from gas actually used (RA-FG-3). Private submission (bundle or private RPC) is an open question (s8).
- Anonymous rate limits: RLN-style proofs remove IP logging (`docs/remote/anonymization-research.md` 5.5). Not required by this spec; tracked as later option.
- Monitoring: pull model (Prometheus scrape) plus webhook for alerts. Keep metric cardinality bounded: no per-owner or per-IP labels.

## 7. Acceptance tests

Each requirement maps to a test ID. Tests MUST run against the anvil harness (`apps/relayer/src/e2e.anvil.test.ts`) or a unit test with a fake clock. Test IDs are proposals; names may change.

| Test ID | Covers | Assertion |
|---|---|---|
| T-CB-1 | RA-CB-1, RA-CB-2 | For each non-recording exit (simulation revert, `gas_limit_too_high`, `budget_exhausted`, `gas_price_too_high`), breaker returns to `closed` or `open` within one cooldown; a later valid sweep is admitted. |
| T-CB-2 | RA-CB-3 | `half_open` with no probe result for > cooldown becomes `open` with new `until`. |
| T-CB-3 | RA-CB-4 | `/healthz` returns `degraded` while a chain is `half_open` > cooldown; returns `ok` only when all `closed`. |
| T-CB-4 | RA-CB-5 | 100 simulation reverts from fresh owners do not open the breaker. |
| T-CB-5 | RA-CB-6 | Trip on chain A leaves chain B sweeps admitted. |
| T-RL-1 | RA-RL-1 | Quote flood from one IP returns 429 before any `eth_gasPrice` call (mock RPC counts calls). |
| T-RL-2 | RA-RL-3 | 1000 sybil owners from distinct IPs hit the per-chain cap; sweeps beyond cap return 429/503 with `Retry-After`. |
| T-RL-3 | RA-RL-4 | Forged `X-Forwarded-For` with `trustProxyHops=0` shares one bucket; startup with `trustProxyHops=1` and non-loopback listener fails. |
| T-RL-4 | RA-RL-5 | Ten IPv6 addresses in one /64 share one bucket. |
| T-RL-5 | RA-RL-6 | Simulated backwards clock step does not reset an exhausted bucket. |
| T-RL-6 | RA-RL-7 | `maxKeys + 1` distinct clients do not evict an active client's bucket below its limit. |
| T-FG-1 | RA-FG-1 | Owner with zero balance: rejected pre-lane, no `eth_sendRawTransaction`, lane slot not taken. |
| T-FG-2 | RA-FG-2 | Simulation reverts: no send call made. |
| T-FG-3 | RA-FG-3 | Fee below actual gas at send time: refused. |
| T-FG-4 | RA-FG-4 | Attacker front-runs own sweep (nonce consumed) 20 times from one destination: destination cap trips; other destinations unaffected. |
| T-FG-5 | RA-FG-5 | Reverted send debits gas actually used, not quoted maximum. |
| T-FG-6 | RA-FG-7 | Quote expired by skew-adjusted clock: rejected with zero RPC calls. |
| T-RS-1 | RA-RS-1 | Pending count at `maxPending` returns `queue_full` without RPC. |
| T-RS-2 | RA-RS-2 | RPC hangs past timeout: user sees `rpc_unavailable`, not timeout. |
| T-RS-3 | RA-RS-3 | Config missing `dailyBudgetWei` or `minBalanceWei`: startup fails. |
| T-MON-1 | RA-MON-1, RA-MON-7 | `/healthz` and logs contain no IP, owner address, or body bytes under sweep traffic. |
| T-MON-2 | RA-MON-2 | `/metrics` scrape has listed names, no owner/IP labels. |
| T-MON-3 | RA-MON-3 | Non-loopback listener with metrics enabled and no token: `/metrics` returns 401/403. |
| T-MON-4 | RA-MON-4, RA-MON-5 | Each alert condition fires once per cooldown; webhook down does not block sweep path. |

## 8. Open questions

1. Private submission: use a private RPC or bundler for relayer txs to reduce front-run griefing (RA-FG-4)? Trade-off: provider trust (R-13) and chain support. Unverified for target chains.
2. Owner-independent cost bound (RA-RL-3): what per-chain numbers? Needs operator input and load test.
3. Which breaker failure window (count or rate, length) is right for expected traffic? Needs measurement on testnet.
4. Does `bucketBy: "owner+global"` (onion research P3) become default when `trustProxyHops` cannot discriminate clients?
5. Is an RLN-style anonymous quota (`anonymization-research.md` 5.5) worth the cost before mainnet? Current assumption: no.
6. Ownership of on-chain blacklist/pause watch: this service, ops monitor, or both? `docs/remote/modules-needed.md` row 6 refers to a missing `specs/ops-monitor.md`.
7. Dangling reference: `docs/remote/modules-needed.md` rows 2 and 6 point to `docs/remote/specs/relayer-guard.md` and `docs/remote/specs/ops-monitor.md`, which do not exist. Create or correct the links.
8. Whether `apps/relayer/DEVIATIONS.md` item 15 (balance alerts) is current. Not reviewed here.

## 9. References

Primary sources, retrieved 2026-10-21 unless stated. Status of each fetch is marked; items marked [U] were not fetched in this session and are unverified as to current content.

- RFC 6585, Additional HTTP Status Codes (429). https://www.rfc-editor.org/rfc/rfc6585 [U, not fetched]
- RFC 9110, HTTP Semantics (s10.2.3 Retry-After). https://www.rfc-editor.org/rfc/rfc9110 [U, not fetched]
- RFC 7239, Forwarded HTTP Extension. https://www.rfc-editor.org/rfc/rfc7239 [U, not fetched]
- OWASP API Security Top 10 2023, API4 Unrestricted Resource Consumption. https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/ [U, not fetched]
- Martin Fowler, CircuitBreaker (state model). https://martinfowler.com/bliki/CircuitBreaker.html [U, not fetched]
- Prometheus, Alerting best practices. https://prometheus.io/docs/practices/alerting/ [U, not fetched]
- ERC-4337 Paymaster security and griefing. https://docs.erc4337.io/paymasters/security-and-griefing [U, not fetched; also cited in `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md`]
- Repo sources: `docs/threat-model/THREAT_MODEL.md` s6.3; `docs/operators/relayer-runbook.md`; `docs/audits/03-security-review-client-relayer.md` S3-05/06/07; `docs/remote/security-specs/review-relayer-app.md`; `apps/relayer/src/breaker.ts` (state machine at lines 30-50 at review time).
- Existing non-repo claims in `docs/remote/audits/*` (haiku): unverified, not cited as evidence here.
