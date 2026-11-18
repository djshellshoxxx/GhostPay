# GhostPay completion audit (2026-11-18)

Experimental, unaudited project. Nothing deployed, no mainnet, no real funds, no release published, nothing merged to `main`.
Integration branch `claude/lucid-meitner-apalzc` is built on the PR #157 head (`a89a2e94`). Companion docs: [historical branch audit](GHOSTPAY_HISTORICAL_BRANCH_AUDIT.md),
[security reassessment](GHOSTPAY_SECURITY_REASSESSMENT.md), [Haiku random audit](GHOSTPAY_HAIKU_RANDOM_AUDIT.md), [final ledger](../consolidation/GHOSTPAY_FINAL_INTEGRATION_LEDGER.md),
[remaining work](../handoffs/GHOSTPAY_REMAINING_WORK.md).

## Final review: the ten questions
1. **Fully implemented now**: everything the baseline #157 CI already gated (wallet create/import, backup gates, pairing preview, receipt panel, relayer/sponsor flows, lean Pages build with bundle scan) plus this run's fixes below. "Fully implemented" here means wired and unit-tested; end-to-end Playwright and Anvil suites were not runnable here.
2. **Recovered from historical branches**: one functional item, the off-filter transfer fail-closed guard + regression test (from the #159/#161/#162/#163 family, ported once); and the removal of an invalid workflow fragment from #151.
3. **Completed from partial implementations**: sponsor `OUTCOME_UNKNOWN` handling (receipt failure after broadcast), pool-relayer bounded admission, Tron block-range completeness, pool-circuits zero rule, manifest/RPC/quote input bounds, full-screen QR warning parity.
4. **Still incomplete**: `embed-sri.mjs` unwired (known, owner decision); the Registry view ships in the lean bundle; 6 `PENDING_OWNER_REVIEW` deps in the lean source closure; unknown-outcome tracking in pool-relayer/sponsor send errors (B-W5); sponsor lane queue unbounded; paymaster `validAfter<=validUntil` and NatSpec need `forge`; full list in the remaining-work handoff.
5. **Security defects fixed** (each RED then GREEN): receipt-timeout charge + hash (Med), per-chain nonce race (Med), unbounded relayer admission (Med), two polynomial-ReDoS regexes (CodeQL High), off-filter telemetry (Med), QR dialog warnings dropped (Med), source-sink scan bypassable (Low), `tx.origin` check bypassable (Low-Med), Tron block gaps (Low), manifest date / NaN retries / price decimals (Low), pool-circuits zero values (Low), `maxQueue` NaN (Low). Details in the reassessment.
6. **Branches with valuable missing functionality**: only the #159-#163 family (one guard) and #151 (one workflow fix). All other unique content was either already present, weaker than baseline, or deferred.
7. **Already superseded**: 22 of the 46 branches outside the baseline (plus 130 fully contained). See the ledger.
8. **Integration conflicts resolved**: #151 A5-1 and A3-2 (baseline stricter, skipped), #162 qrKinds (already present), b16c7936 (baseline stricter). No blind ours/theirs merges; every pick was read on both sides.
9. **Tests** (below): passed except where noted as not run. **Failed: none.** One transient run failure was an environment collision, diagnosed and rerun.
10. **Gates outstanding**: Foundry/contract format/NatSpec, Slither, Anvil-required tests (`REQUIRE_ANVIL=1`), Playwright E2E, reproducibility (`repro-check`, `qualify-lean`), signed release/attestation, gitleaks, CodeQL confirmation, hosted CI on the final HEAD; plus owner decisions (lean scope, reverted payment guard, vendored viem, agent infra, AUD24-01, manifest trust root).

## Test evidence (this container: Node 22.23.4, npm 10.9.9; no forge/anvil/slither/gitleaks/Playwright browsers)
| Check | Result | Notes |
|---|---|---|
| `npm ci --ignore-scripts`, `npm run build:libs` | pass | |
| root `npm run typecheck` | pass | |
| root `npm run lint` | pass | after fixing my own `require-await` test lint |
| `npm test` (all workspaces, with coverage) | 65 workspaces: 8,835 passed, 0 failed, 108 skipped | run at `e4755332`, before the last 3 fix commits. `cli` initially errored: coverage dir locked by stray Vitest processes from an earlier aborted run (environmental). `cli` rerun alone: 558 passed |
| after-run fixes, rerun targeted | pass | web `scanBundle`+`privacyInvariants` 81; pool-relayer 40 (9 skipped); `scripts/tests` 113 pass / 1 skip (pre-existing skip not investigated) |
| `apps/web` full vitest (worker C, own branch) | 178 files, 2,569 passed, 8 skipped, 0 failed | before later merges; web suite not re-run in full after the AST scanner change; its direct tests and real `npm run build` + postbuild scan pass |
| web build + bundle scan | pass | 18 files scanned |
| `check-tx-origin`, `scan-secrets`, `check-actions-pinned` (109 SHA-pinned refs) | pass | scripts only; not gitleaks |
| Anvil-dependent tests | **not run** (skipped) | payer-sponsor 4, pool-relayer 9, apps/relayer 5, chain-adapters/pool-circuits skips |
| Foundry, Slither, contract format/NatSpec, Playwright, repro-check, release/signing | **not run** | tools/browsers/clean clones unavailable |
| Hosted CI on the final HEAD | **not confirmed** | PR #164 CI results seen earlier were mostly cancelled aggregators from superseded pushes (concurrency); #164 was then closed without merge |
| Regression-test strength (revert each fix, confirm a test fails) | MUTATION_CHECK_PLACEHOLDER | |

## Reviews performed
- 3 independent randomized Haiku rounds (37 files, seeds 20261115/16/18): 13 + 6 + 6 findings, all triaged; see the Haiku doc. Round 3 is also the post-fix regression pass and caught an incomplete fix.
- Worker reviews: B (payments/relayer), C (wallet/web wiring), D (release/lean-core/CodeQL), E (crypto + re-verification of prior audits).
- Opus adversarial review of the combined code diff: no regression; 6 Low findings, 3 fixed, 3 recorded.
- Limitations stated by the workers: the sampled reviews were not exhaustive (rest of `Scan.tsx`, most of `Pay.tsx`, ops-monitor lifecycle, several audit items, `embed-sri`); a review finding no problem is not proof of none.
