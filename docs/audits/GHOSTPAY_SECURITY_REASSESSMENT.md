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
| H-R1-F1 | Low | web scripts | `scan-bundle` comment stripper hid same-line sinks after `https://` | RED/GREEN |
| H-R2-F1 | Low-Med | CI script | `check-tx-origin.sh` missed `tx` and `.origin` on separate lines | RED/GREEN. Gap left: an inline `/* */` between the lines is still not joined |
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

## Open, not fixed
- B-W4 (Low): pool-relayer/sponsor trust the RPC-returned tx hash (sweep relayer already verifies).
- B-W5 (Low-Med): a send error after possible broadcast is a plain failure with no unknown-outcome tracking in pool-relayer/sponsor (pool nullifier limits duplicates).
- B-W6 (not reproduced): possible duplicate send if an identical request is queued while the first receipt is pending.
- Paymaster `validAfter <= validUntil` (Info): fails closed because the EntryPoint rejects; add the check and the `WrongChain` NatSpec 31337 note (Haiku R2 F4) when `forge` is available.
- Haiku R2 F5/F6 (Low, doc/test wording): donation test title overstates uppercase-hex coverage; `reminder-bridge.ts` comment implies recurrence the schema lacks.
- Lean-core reachability: the lean source graph still includes btc/solana/tron and 6 `PENDING_OWNER_REVIEW` deps; the final bundle excludes btc/solana/tron, pir-two-server, policy-scheme but **includes** the deferred-by-name Registry view (`AppShell` static import). `AppLean.tsx` comment "optional views not imported" is inaccurate. Owner decision.
- Audit 25 dependency audit not re-run; SOLANA-TRON-10..12, 24 L4-I1 not re-checked. Unreviewed in this run: rest of `Scan.tsx`, most of `Pay.tsx`, `ops-monitor` lifecycle logic.

## Fail-closed posture
Unchanged or strengthened: missing/invalid manifests and unverified deployments still refuse; unknown tx outcomes are now reported honestly (B-W1); incomplete block ranges (Tron) and off-filter telemetry now fail closed.
Privacy model unchanged: no fix added telemetry, new network calls or new stored identifiers.
