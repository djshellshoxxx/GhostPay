# GhostPay security reassessment (2026-11-18)

Experimental, unaudited software. This is an engineering review, **not** an independent audit, and no audit approval is claimed.
Detail tables: [worker E](GHOSTPAY_SECURITY_REASSESSMENT_WORKER_E.md) (crypto/chain packages, re-verification of audits 02, 05, 09, 17, 24-27),
[worker B](GHOSTPAY_WORKER_B_RELAYER.md), [worker C](GHOSTPAY_WORKER_C_WALLET_WEB.md), [worker D](GHOSTPAY_WORKER_D_RELEASE.md), and the Haiku rounds.
Evidence rule: "fixed" below means a regression test failed before the change and passes after. "Read-only" means found by reading source, with no test or tool run.

## Verified defects fixed on this branch
| ID | Sev | Area | Defect | Evidence |
|---|---|---|---|---|
| B-W1 (Haiku R2 F2) | Medium | payer-sponsor | Receipt timeout after broadcast returned UNAVAILABLE: no tx hash, no loss charge (honest-unknown violation, budget bypass) | RED/GREEN `workerB.test.ts`; now `OUTCOME_UNKNOWN` (504) + hash + worst-case gas charged |
| B-W2 | Medium | payer-sponsor | No per-chain send serialization; 2 sends in flight raced the hot-key nonce | RED showed 2 concurrent sends; per-chain lane added |
| B-W3 | Medium | pool-relayer | Unbounded admission (resource exhaustion) | RED: 10 reqs vs cap 4 refused none; 503 `queue_full`, default 32/chain |
| CodeQL x2 | High (scanner) | i18n readability, ops-monitor fetcher | `js/polynomial-redos` (5.5 s / 4.2 s on 60k-char input) | RED/GREEN; both now linear. Whether CodeQL now clears is unverified (needs a CI run) |
| off-filter | Medium | web scan | Token/block-window telemetry from off-filter logs was accepted | recovered from #162/#163 with its test |
| C-1 | Medium | web | "Show larger" QR dialog dropped bearer/secret/caution warning | RED 3 failed, GREEN |
| H-R1-F1, H-R3-F1, Opus-1 | Low | web scripts | `scan-bundle` src sink scan was bypassable through its comment stripper three ways (URL in a string; `//` in a regex; nested template, regex after `)`, URL in JSX text) | Heuristic stripper **replaced by a TypeScript AST scan** (`scanSourceSinks`): comments/strings/regex/JSX text cannot hide a sink; also flags compound `+=`, `el['innerHTML']`, `(0,eval)()`, and fails closed on unparsable source. RED/GREEN; 142 real src files: 0 hits; real build + postbuild scan pass |
| H-R2-F1, Opus-2 | Low-Med | CI script | `check-tx-origin.sh` missed `tx` / `.origin` split across lines, comments or an inline block comment | RED/GREEN. Additive whole-file, comment-insensitive pass (node); the stricter per-line checks are unchanged, so it can only add failures. 39 real `.sol` files still OK |
| Opus-5 | Low | pool-relayer | `maxQueue` NaN disabled the bound; 0/negative/fractional refused every request | RED (5 failed)/GREEN: rejected at construction |
| SOLANA-TRON-08 | Low | tron-adapter | `getBlockRange` accepted short/gapped lists, so a scan could skip payments | RED/GREEN; one old test that expected `[]` was changed deliberately |
| CHAIN-ADAPTERS-10 | Low | chain-adapters | `2026-02-30` accepted as a manifest date; `retries: NaN` looped forever (RED hung); `price.decimals` unbounded | RED/GREEN |
| H-R2-F3 | Low | pool-circuits | Zero values accepted for withdraw/ragequit though the contract rejects them | RED/GREEN |

## Previously reported findings, current status (worker E; read-only for contracts, no `forge` here)
- Fixed in current code: 02 M-02/M-03/L-01/L-04/I-02; AUD24-06; BITCOIN-01/-02; SOLANA-TRON-01/-02/-03/-07; WALLET-SAFETY-02; EXTRA05-F1; S3-14; CONTRACTS-POOLS-01.
- Still valid, Low/Info and mostly latent: contracts AUD24-01 (policyHash in router calldata, owner decision), CORE-01/-02/-03/-04, AUD24-02/-04/-05/-07, 02 M-01 (by design);
  chain-adapters -07/-08/-09; btc BITCOIN-04/-05/-07/-08; Solana SOLANA-TRON-05/-06/-09.
- Severity changed: S3-01 manifest trust High -> Medium (while mainnet stays refused; `RELEASE_KEY` still undefined). CHAIN-ADAPTERS-04 Medium -> Low (evidence is now transfer-bound).
- Still valid, other owner: CRYPTO-CORE-01 (stuck RNG in secret-box).
- **No new Critical or High found** by this review. That is absence of findings in what was read, not proof of absence.

## Final adversarial review (Opus, read-only, over `a89a2e94..HEAD` code)
No regression against baseline and no weakening of privacy found; no new telemetry. Six Low findings: three fixed above (stripper, tx-origin, maxQueue). Not fixed:
- **Opus-3 (Low, speculative)**: payer-sponsor send lane queue is unbounded and a hung simulate/send blocks that chain's lane (viem HTTP timeout bounds it in production; a custom transport might not). `loss.allows()` runs before queueing, so N concurrent requests from one bucket can overrun the budget (older TOCTOU, not introduced here). A `gasPrice()` throw inside the lane is recorded by the breaker as `send_failed` though nothing was sent.
- **Opus-4 (Low, speculative)**: the `OUTCOME_UNKNOWN` worst-case charge (gasLimit x gasPrice) can undercharge if the base fee rises; the client stays charged if the tx later mines (deliberately conservative, no refund) and flaky operator RPC drains honest budgets; `guarded()` logs it as `rejected` without the txHash, which loses reconciliation data.
- **Opus-6 (Low, UX, fail-closed)**: web `checkNetwork` for a Tron node without block 0 now shows the adapter's INVALID_RESPONSE instead of the `tron.error.firstBlock` message.

## Open, not fixed
- B-W4 (Low): pool-relayer/sponsor trust the RPC-returned tx hash (sweep relayer already verifies).
- B-W5 (Low): a send error after possible broadcast is a plain failure with no unknown-outcome tracking in pool-relayer/sponsor (pool nullifier limits duplicates).
- B-W6 (not reproduced): possible duplicate send if an identical request is queued while the first receipt is pending.
- Paymaster `validAfter <= validUntil` (Info): fails closed because the EntryPoint rejects; add the check and the `WrongChain` NatSpec 31337 note (Haiku R2 F4) when `forge` is available.
- Haiku R2 F5/F6 (Low, doc/test wording): donation test title overstates uppercase-hex coverage; `reminder-bridge.ts` comment implies recurrence the schema lacks.
- Lean-core reachability: the lean source graph still includes btc/solana/tron and 6 `PENDING_OWNER_REVIEW` deps; the final bundle excludes btc/solana/tron, pir-two-server, policy-scheme but **includes** the deferred-by-name Registry view (`AppShell` static import). `AppLean.tsx` comment "optional views not imported" is inaccurate. Owner decision.
- Audit 25 dependency audit not re-run; SOLANA-TRON-10..12, 24 L4-I1 not re-checked. Unreviewed in this run: rest of `Scan.tsx`, most of `Pay.tsx`, `ops-monitor` lifecycle logic.

## Fail-closed posture
Unchanged or strengthened: missing/invalid manifests and unverified deployments still refuse; unknown tx outcomes are now reported honestly (B-W1); incomplete block ranges (Tron) and off-filter telemetry now fail closed.
Privacy model unchanged: no fix added telemetry, new network calls or new stored identifiers.
