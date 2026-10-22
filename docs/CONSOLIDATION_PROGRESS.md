# Consolidation progress — 2026-10-22

Status: **in progress; main promotion is not yet justified**. Development continues on `integration/consolidated-2026-10-21`. Keep the source refs until the semantic migration reviews, package validation and final integration checks close. The required main-branch note is `docs/CONSOLIDATION_STATUS.md` (introduced by `ed7d709`).

## Published checkpoints

- `13a7596c`: invoice text hygiene, core deep-scan regression, selected chain-adapter migrations and source research/checker.
- `6c52951a`: retry/concurrent chain-identity checks, direct-announcement verification correction, registry/API compatibility and authenticated tag migration.
- `85fd0af0`: consolidated relayer hardening, with its migration report in audit 11. Relayer build, typecheck, lint and 232 tests passed with required Anvil integration and no skips before publishing.

Subsequent UI, scanner, vault, receipt and imported-package work remains under validation in the shared worktree. A passing worktree test does not imply the change is published or CI is green.

## Migration coverage

Bardeen `e96cee1` is an ancestor of the consolidated target; its present differences are later target evolution. Fermat `c1c4ac9` is divergent and requires property-level disposition, not wholesale replacement of newer code. Audit 06 provides the path/blob inventory; audit 07 tracks every fetched source ref and unresolved semantic differences. An independent second pass is checking source-only authored work and shared deltas. A final third pass must compare the completed tree and recorded dispositions.

Twenty-nine previously absent package directories from extension refs 6–8 have been preserved. Their experimental/disabled status remains intact. Sequential package suites are running, and compatibility failures are being fixed within the imported packages. Other authored source material, registry flows, documentation and regression harnesses are still being reconciled. No branch has been discarded and no migration-complete claim is made.

## Confirmed verification so far

- Invoice schema: 626 tests passed across nine files; focused text-hygiene regression rerun passed.
- Core deep-scan negative regression suite: 25 tests passed.
- Chain adapters: latest full non-required-Anvil run passed 325 tests, with two Anvil cases skipped; the required-Anvil rerun is pending. Scanner bounds/reorg regressions and retry/backend-switch regressions pass.
- Main contracts: 400 tests passed, no failures/skips, across 26 suites, using Solidity 0.8.28 and the default 10,000-run fuzz profile. Pool-contract run reached its time limit; remaining suites are being run separately. RealProof and SharedVectors completed 11 additional tests successfully; Poseidon differential fuzz is still running.
- Relayer: 232 tests passed with required Anvil integration; build/typecheck/lint passed.
- Existing Solana package: 107 tests passed after adapter type parity fix. TRON targeted parity suite: eight passed; its prior other 63 tests passed.
- Privacy profiles: 176 tests passed with coverage thresholds met; full 1,440-context grid retained with a narrowly scoped 180-second coverage/stress timeout (audit 12).
- Receipt/Scan feature: 18 focused tests passed; strict v1 payload, domain separation, uint256 bounds and stale-state checks included.
- Tag migration/settings/manifest hardening: 49 focused tests passed. Vault and camera races are under additional review.
- Production dependency audit: zero reported vulnerabilities. Relative Markdown link scan: 357 files, zero broken links at that checkpoint.

Audit 10 will record the broad library baseline with actual timeouts, skips and tool limits. The final build, root typecheck/lint, browser QA and uncancelled CI checks remain gates. Browser installation fallback recovered Chrome for Testing after the default download returned invalid archives; no browser QA pass is claimed yet.

## Security and completion boundaries

Audit 09 records new findings and regressions. Fixed areas include RPC backend switching, provider-disagreement results, balance incorrectly treated as payment evidence, bounded scanning/reorg handling and camera stream ownership. Vault authorization is being checked inside the signing/submission path so an idle lock or changed seller session invalidates pre-broadcast work. Historical audit 05 findings require current-code verification before closure.

The pool development ceremony is intentionally insecure and must never protect valuable funds. Real deployments, release-signing custody, verified network/feed data, independent professional audit, trusted setup and real wallet/device qualification require external evidence. These are distinct from completing repository code and cannot be certified by local tests.

## Remaining sequence

Finish source dispositions and missing authored work; validate imported packages; complete vault/registry/UI reviews; run final build, QA and stress/security checks; publish a coherent snapshot and obtain green CI; perform the third migration check; then consolidate source histories, promote the validated large branch to main, update the required note and close superseded pull requests with provenance. Continue feature and audit work from that canonical branch.
