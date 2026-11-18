# GhostPay independent randomized Haiku audit (3 rounds)

Independent read-only inspections by a Haiku agent; findings were verified by the coordinator before any fix. Experimental, unaudited project.
Detail per round: [round 1](GHOSTPAY_HAIKU_RANDOM_AUDIT_ROUND1.md), [round 2](GHOSTPAY_HAIKU_RANDOM_AUDIT_ROUND2.md), [round 3](GHOSTPAY_HAIKU_RANDOM_AUDIT_ROUND3.md).
Reproducibility: `random.Random(seed).sample(sorted(candidate_files), 10)` over `git ls-files` (apps, packages, contracts, tests, workflows, scripts; vendored `lib/`, deps, docs, lockfiles excluded),
removing files sampled in earlier rounds. Each report lists its exact files. The candidate-list files the agents wrote lived in an ephemeral scratch directory and are not preserved; the seed + filter rules + the file lists in each report are the record.
Round 1 discarded and resampled its first draw (vendored OpenZeppelin file + `.gitignore`). Round 2 added a stratum of 3 relayer/sponsor/ops-monitor/workflow files. Round 3 added a regression stratum of 4 files from `a89a2e94..HEAD`.

| Round | Seed | Files | Coverage |
|---|---|---|---|
| 1 | 20261115 | 10 | paymaster, scan-bundle, write-state, rfc8032 test, pool-prover config, invoice-parity test, ux-presets validate test, confidential-amounts registry, prestashop plugin, PolicyReceive.tsx |
| 2 | 20261116 | 13 (10 + 3 stratified) | donation, ops-monitor, ux-notify, btc-silent-payments, payer-sponsor, pool-circuits, scripts/check-tx-origin.sh, shielded pool interface |
| 3 | 20261118 | 14 (10 + 4 regression) | see round 3 report; includes embed-sri, TagArchive, payjoin, rpc, QrFrame |

Honest scale note: 37 files of ~1,900-2,000 candidates is under 2% of the repository. This is a sampling check for things the other workers missed, not coverage.

## Findings and disposition
| Round | # | Sev | Class | Finding | Disposition |
|---|---|---|---|---|---|
| 1 | F1 | Low | Confirmed | `scan-bundle` comment strip hid same-line sinks after `https://` | **Fixed** (string-aware stripper, RED/GREEN) |
| 1 | F7 | Low | Missing validation | Paymaster has no `validAfter <= validUntil` check | Open, Info: fails closed (EntryPoint rejects). Needs `forge` |
| 1 | F4, F10, F12 | Low | Probable/doc | stale snapshot in `PolicyReceive` finalizer; invoice-parity test name overstates; `ctm-cleartext` selectable with no prod guard | Open, Low (no prod callers found) |
| 1 | F8 | - | False positive | paymaster gas-cap math and signed-field coverage verified correct | closed |
| 2 | F1 | Low-Med | Potential vuln (reproduced) | `check-tx-origin.sh` missed `tx` / `.origin` on separate lines | **Fixed** (RED/GREEN); comment-split gaps found by the Opus review fixed by an additive whole-file pass |
| 2 | F2 | Med | Probable | payer-sponsor receipt timeout: no hash, no loss charge | **Fixed** (worker B W1, `OUTCOME_UNKNOWN`) |
| 2 | F3 | Low | Probable | pool-circuits accepts zero values the contract rejects | **Fixed** (worker E) |
| 2 | F4-F6 | Low | Doc/test | WrongChain NatSpec omits 31337 refusal; donation test title overstates; reminder-bridge comment implies recurrence | Open (F4 needs `.sol` edit + `forge`) |
| 3 | F1 | Low | Confirmed (incomplete R1 fix) | stripper still fooled by `//` or `/*` inside a regex literal | **Fixed**, then superseded: a regex heuristic was itself bypassed (Opus review), so the stripper was replaced by a TypeScript AST scan |
| 3 | F2 | Doc | Documentation | scanBundle JSDoc ended up on `stripComments` | Open, trivial |
| 3 | F3 | Med (as reported) | Missing functionality | `embed-sri.mjs` not called by any build step | **Known and documented** (`apps/web/README.md`, `DEVIATIONS.md` S3-10/11 still open). Wiring changes release output and CORS headers: owner decision |
| 3 | F4 | Low | Probable | `embed-sri` appends duplicate `_headers` block on re-run; silently skips if `_headers` missing | Open (script is unwired) |
| 3 | F5, F6 | - | Potential, **unverified** | TagArchive late-result test may pass vacuously; payjoin in-flight lock is per session instance | Open, not verified by the coordinator |

Round 3 also spot-checked the earlier fixes: R2-F1, R2-F2 and R2-F3 were re-confirmed fixed (check-tx-origin 8/8, worker-B test, pool-circuits). Round 3 found R1-F1's fix incomplete, which is the main value of re-sampling changed code.
Haiku did not edit source in any round. Round 3's checks ran: TagArchive.retry 4/4, readability 2/2, rpc 86/86, scanBundle+QrFrame 46/46, check-tx-origin 8/8; `forge` not installed so Solidity was read only.
