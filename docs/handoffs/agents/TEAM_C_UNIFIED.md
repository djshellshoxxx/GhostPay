# Team C — unified relayer observability

- Repository: `djshellshoxxx/GhostPay`.
- Worker: Caveman Team C; isolated worktree `ghostpay-observability`.
- Branch: `codex/unified-observability`.
- Base: PR #185, `c738f96e2f1a0dfef9003ae29ad636b03cf74b09`.
- Implementation source: `dad2617ed662351069c8a2df616c2ad1dad33c39`.
- Integration dependency: retain PR #185 and the previously integrated merchant-disclosure ancestry. Root owns unified candidate integration and final combined-source gates.

## Implementation

PR #185's separate opt-in metrics listener, authenticated `/metrics` and `/v1/stats`, signed alerts, configuration, and runbook are retained.

Five new regressions reproduced baseline failures: no absolute timeout before a socket arrives; uncontrolled response-body draining; unlimited concurrent alert delivery; no stable retry identity; transaction hashes in JSON logs. The corrected webhook has a 3-second absolute deadline per attempt, closes response bodies immediately, and allows four active deliveries plus 32 queued events. The dedupe map has at most 512 entries. A transient network failure, HTTP 429, or HTTP 5xx gets one retry after 250 ms using the same body, signature, and idempotency key. Permanent HTTP errors and redirects do not retry. Runtime disposal aborts active deliveries and clears pending events and retry timers. Delivery remains best-effort; dedupe and queued alerts do not persist across restarts.

The new rejection detector counts only failed quote/sweep requests. More than 100 rejects in a trailing five-minute window emits `reject_spike`; each configured chain has a bounded bucket, and malformed or unconfigured chain identifiers share one anonymous bucket. Each bucket retains at most 101 timestamps and emits at most once per 15 minutes. Aggregate rejection counters use fixed error classes. The alert exposes the threshold crossing, not request identifiers.

JSON logging drops transaction hashes. Protected state-journal recovery is unchanged. README, privacy documentation, operator runbook, and spec status reflect the behavior.

## Modified paths

`apps/relayer/src/{alerts.ts,alerts.lifecycle.test.ts,rejectSpike.ts,rejectSpike.test.ts,api.test.ts,log.ts,runtime.ts,server.ts,units.test.ts}`; relayer README/privacy docs; operator monitoring runbook; spec-07 status; active-work claim.

## Executed verification

Counts overlap; do not sum them as unique tests.

| Command / source | Result |
| --- | --- |
| Baseline `vitest run src/units.test.ts src/api.test.ts src/config.test.ts --maxWorkers=1 --no-file-parallelism` on PR #185 | 295 passed. |
| New `alerts.lifecycle.test.ts` against PR #185 source | 5 failed, 1 passed; reproduced the five defects above. |
| Corrected lifecycle plus units | 47 passed. |
| `rejectSpike.test.ts` before implementation | Missing module; feature absent, no tests executed. |
| `vitest run src/alerts.lifecycle.test.ts src/rejectSpike.test.ts src/units.test.ts src/api.test.ts src/config.test.ts src/runtime.test.ts --maxWorkers=1 --no-file-parallelism` on implementation source | 311 passed. This preceded only one added HTTP acceptance test and documentation updates. |
| Final-source API tests selected by `-t 'counts rejected\|authenticated metrics'` | 2 passed, 144 tests filtered out by selection. |
| Focused ESLint for every modified relayer source/test with `NODE_OPTIONS=--max-old-space-size=2048` | Passed. |
| `git diff --check` | Passed. |

The first typecheck passed before the rejection detector was added. A concurrent later typecheck/lint command exited 137 and is not a pass. The exact-source retry `NODE_OPTIONS=--max-old-space-size=2048 tsc -p tsconfig.json --noEmit` passed on `dad2617ed662351069c8a2df616c2ad1dad33c39`. No full coverage run, Anvil run, external HTTPS receiver test, Prometheus deployment, or hosted combined-head CI is claimed by this worker.

## Remaining work and constraints

- `rpc_disagree` and `price_stale` cannot truthfully fire from the current runtime: it has one RPC provider per chain and operator-configured fixed native prices without feed timestamps. Wire approved provider agreement and verified feed evidence before implementing those detectors.
- Reconcile the rest of spec 07's original metric inventory against shipped `relayer_*` metrics. Quote, gas-spent, fee-earned, loss, RPC/sweep-latency, and price-age instrumentation are not all implemented. Preserve bigint accounting; floating-point metric samples do not prove settlement or accounting correctness.
- Configurable log-level filtering remains absent.
- Final integration needs full package coverage, build/typecheck/lint, native Anvil acceptance and hosted CI on the exact combined source. Run real Prometheus scrape and signed receiver acceptance separately.
- Independent reviewer `/root/security_inventory` reviewed `dad2617ed662351069c8a2df616c2ad1dad33c39`: no blocking finding within scope; independently reran lifecycle and rejection-detector tests, 8/8 passed.
- Metrics authentication remains optional as specified; non-loopback HTTP exposure must be controlled by operator network boundaries/TLS. The runbook now states this consequence explicitly.

## Next action

The coordinator can integrate this reviewed milestone. Team C continues the remaining instrumentation/log-level slice on the same isolated branch. Keep unsupported provider/feed detectors and external release acceptance separately pending.
