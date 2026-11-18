# Team C — unified relayer observability

- Repository: `djshellshoxxx/GhostPay`.
- Worker: Caveman Team C; isolated worktree `ghostpay-observability`.
- Branch: `codex/unified-observability`.
- Base: PR #185, `c738f96e2f1a0dfef9003ae29ad636b03cf74b09`.
- Latest implementation source: `364efaf3902351886eb2baa739e8e0dc70101617`.
- Earlier reviewed lifecycle milestone: `dad2617ed662351069c8a2df616c2ad1dad33c39`.
- Integration dependency: retain PR #185 and merchant-disclosure ancestry. Root owns unified integration and final combined-source gates. This handoff does not claim hosted CI or release qualification.

## Completed implementation

PR #185's separate opt-in metrics listener, authenticated `/metrics` and `/v1/stats`, signed alerts, configuration, and runbook remain intact.

Webhook delivery now has an absolute three-second deadline covering DNS, connection establishment and headers, and closes unused response bodies immediately. At most four attempts run concurrently, 32 events wait, and 512 event/chain dedupe entries exist. A transient network failure, HTTP 429, or HTTP 5xx gets one retry after 250 ms using identical body, signature and idempotency key. Permanent HTTP errors and redirects do not retry. Runtime disposal cancels active deliveries and clears queued events and timers. Delivery is best-effort and in memory; failed events retain the 15-minute dedupe interval.

The bounded rejection detector emits `reject_spike` above 100 failed quote/sweep requests within five minutes. Configured chains have separate buckets; malformed and unconfigured chain identifiers share one anonymous bucket. Each bucket retains at most 101 timestamps and emits at most once per 15 minutes. Aggregate rejection reasons are counted without retaining request data.

New telemetry includes supported quote attempts, confirmed gas spent, mined-revert gas loss, successful nominal stablecoin fees, missing recovered fee data, confirmed receipt outcomes, sweep latency and actual viem HTTP fetch latency. Large counters use bigint and emit decimal strings through JSON `integerCounters` and per-chain `integerSamples`; fees carry sub-micro-USD fractions across token decimal scales. Timeouts and unknown submissions do not count as confirmed spending or fees. Restart recovery deliberately lacks token/fee data and reports `relayer_fee_unknown_total` rather than inventing revenue. Fixed latency buckets have at most 64 series; ordinary and exact integer counters each have a 512-series cap.

`LOG_LEVEL=info|warn|error` filters JSON logs; unknown values fail startup without being echoed. Logs drop transaction hashes. Protected transaction-journal behavior is unchanged. Native acceptance now scrapes the private listener after a real Anvil permit sweep, checks exact gas/fee telemetry, validates authentication, and confirms addresses and hashes are absent.

## Owned paths

`apps/relayer/**`; `docs/operators/relayer-monitoring.md`; spec-07 implementation status; active-work claim; this handoff. Source changes are isolated from contract, chain-adapter, web and vault implementations.

## Executed evidence

Counts overlap; do not sum them as unique tests.

| Check | Result |
| --- | --- |
| Baseline PR #185 units/API/config | 295 passed. |
| New lifecycle regressions against PR #185 | 5 failed, 1 passed: absolute timeout, response disposal, concurrency bound, retry identity and transaction-hash redaction. |
| Corrected first milestone relevant suites | 311 passed; separate HTTP acceptance selection 2 passed/144 filtered. |
| New instrumentation API regressions before implementation | 3 failed/146 filtered: confirmed totals, timeout/late evidence and fractional fee carry. |
| Instrumentation affected metrics/runtime/API/units/restart suites | 219 passed. |
| Native relayer acceptance, `ANVIL_BIN=/tmp/ghostpay-analyzers/bin/anvil REQUIRE_ANVIL=1 vitest run src/e2e.anvil.test.ts --maxWorkers=1 --no-file-parallelism` | 5 passed, zero skips, including the real authenticated HTTP scrape. |
| Final `ANVIL_BIN=/tmp/ghostpay-analyzers/bin/anvil REQUIRE_ANVIL=1 NODE_OPTIONS=--max-old-space-size=2048 vitest run --coverage --maxWorkers=1 --no-file-parallelism` | **443 passed, zero skips; 15 files passed.** Coverage: statements **97.23%**, branches **92.96%**, functions **97.95%**, lines **98.89%**. All original thresholds pass. |
| Final `tsc -p tsconfig.json --noEmit`, `tsc -p tsconfig.build.json`, full `eslint --config ../../eslint.config.js src` (2 GiB heap) | Passed. |
| `git diff --check` | Passed. |

The source files tested above match implementation commit `364efaf3902351886eb2baa739e8e0dc70101617`; later edits to this handoff are documentation only. Native artifacts came from the coordinator's verified solc 0.8.28 / Foundry 1.8.5 build. The contract source tree ID is identical in both worktrees: `9b715848b64f4d70de349631a6facefc9f8a12b0`. Artifact/dependency symlinks are untracked and not part of the commit. Full coverage log: `/tmp/ghostpay-observability-coverage.log` in the current execution environment.

An earlier concurrent typecheck/lint attempt exited 137; later standalone typecheck, build and full lint passed. The failed attempt is not counted as evidence.

## Independent review

`/root/security_inventory` found no blocking issue in either implementation slice. It independently ran lifecycle/rejection-detector tests (8/8), then metrics/runtime tests (14/14). Review covered absolute deadlines and disposal, queue/dedupe caps, retry identity, bounded rejection state, log redaction, integer fee scaling, late/restart receipt semantics and transport preservation. This is an independent agent source review, not an external security audit.

## Remaining dependencies and acceptance

- `rpc_disagree` lacks an actual comparison input: `buildChainClients` constructs one client per chain from `rpcUrl`. It must not infer agreement from that single provider.
- `price_stale` and price-age metrics lack feed evidence: `FixedStablePriceSource` uses `nativeUsdMicro` from configuration, with no feed timestamp or source quorum. Approved provider/feed integration must supply those facts before a detector can be truthful.
- Real production HTTPS receiver/HMAC/replay acceptance and a deployed Prometheus scrape remain external checks. The completed local HTTP scrape and native chain test are explicitly narrower.
- Telemetry is not financial accounting: counters reset on restart, recovered fees can be unknown, USD values assume configured stablecoin parity, and the receipt model omits additional chain-specific fees. Prometheus float64 storage can round exact integer text; JSON per-chain decimal samples retain integers. The runbook states these limits.
- Metrics authentication remains optional as specified. The runbook explicitly documents non-loopback exposure and HTTP/TLS boundaries.

## Next action

Integrate the reviewed branch into the unified candidate, then rerun affected combined-source gates. Resume the two missing detector paths only when verified provider/feed inputs exist. No production deployment, public-chain transaction, protected merge or release occurred.
