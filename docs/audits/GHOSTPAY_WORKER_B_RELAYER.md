# Worker B: relayer and payment lifecycle review (2026-11-16)

AI-assisted review of `apps/relayer`, `packages/relayer-guard`, `pool-relayer`, `payer-sponsor`, `ops-monitor` against the
current code. Not an independent audit. Experimental, testnet only. Anvil not available here: all `*.anvil.test.ts` (relayer,
pool-relayer, payer-sponsor) and pool-relayer circuit-witness tests were NOT RUN (skipped); they must not be counted as passing.

| # | Finding | File:line | Status | Evidence | Test |
|---|---|---|---|---|---|
| W1 | Sponsor: receipt wait failure/timeout after broadcast returned generic `UNAVAILABLE`, no tx hash, no loss charge. Client believes failure and may pay again; relay exposure never counted (budget bypass) | payer-sponsor `sponsor/service.ts` execute (was :524-540) | fixed | RED: code was `UNAVAILABLE`, no hash. Now `OUTCOME_UNKNOWN` (HTTP 504) with `txHash`, worst-case gas charged to client bucket | `sponsor/workerB.test.ts` |
| W2 | Sponsor: no per-chain serialization; concurrent submits race the single hot-key nonce (spurious send failures counted against the breaker) | `sponsor/service.ts` execute | fixed | RED: 2 concurrent sends observed. simulate+send now in a per-chain lane; receipt wait outside it | `sponsor/workerB.test.ts` |
| W3 | Pool relayer: unbounded admission (proof verification and queued sends per chain; requests held up to receipt timeouts each) | pool-relayer `service.ts` relay | fixed | RED: 10 requests, 0 refused with cap 4. Now 503 `queue_full`, default 32 per chain | `pool-relayer/src/workerB.test.ts` |
| W4 | Pool relayer and sponsor trust the RPC's answer to send as the tx hash (sweep relayer verifies it) | pool-relayer `chain.ts:96`, sponsor `viemChain.ts:65` | open (low) | Code read only; needs local signing to fix. A lying RPC is out of the threat model of audit 26 | none |
| W5 | Pool relayer/sponsor: a send error after possible broadcast is reported as plain failure (no unknown-outcome tracking; nullifier/nonce on-chain checks limit duplicates) | pool-relayer `service.ts` send path, sponsor `execute` | open (low) | Code read; safe against double spend by pool nullifier, but may waste gas on retries | none |
| W6 | Pool relayer: identical request queued twice while the first receipt is pending can send a duplicate (second mined revert, gas lost, charged to client) | pool-relayer `service.ts` | open (theory) | Not reproduced; loss budget bounds it | none |
| S3-05 | Breaker latches half_open | relayer-guard `breaker.ts` | verified fixed | permits, probe timeout, health degraded on half_open | existing breaker tests |
| S3-06 | Griefing via reverted sweeps | relayer `service.ts:956-1124` | verified fixed (mitigated) | mined reverts neutral for breaker, charged to loss budget, owner strikes | existing |
| S3-07 | XFF/IP rate bypass, quote RPC per call | relayer `clientip.ts`, `service.ts:674` | verified fixed | gas price cache, trusted proxy handling | existing |
| 26 #1-#5, M1, M2 (journal, lock, budget day) | restart recovery, budget | relayer `stateStore.ts`, `service.ts` | verified fixed | code matches doc; relayer suite 418 pass | existing |
| TODO/FIXME/placeholder grep | owned dirs | none open | FP | single hit is a doc comment (`ops.ts:103`) | n/a |
| ops-monitor | read-only monitor | not reviewed deeply | open (coverage gap) | tests pass; no lifecycle logic | n/a |

Test runs (this branch): payer-sponsor 135 pass, 4 skipped (anvil); pool-relayer 35 pass, 9 skipped (anvil, witness);
relayer-guard 167 pass; ops-monitor 99 pass; apps/relayer 418 pass, 5 skipped (anvil; not run with `REQUIRE_ANVIL`).
