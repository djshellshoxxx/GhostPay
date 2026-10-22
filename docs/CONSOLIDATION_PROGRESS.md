# Consolidation progress — 2026-10-22

Status: **in progress; migration and main promotion are not yet justified**. The durable integration checkpoint is `ecc29c1`, a 460-file checkpoint atop `f867`; additional fixes and verification are still in progress. Keep source refs and provenance until the remaining semantic and integration checks close. The required main-branch policy note is `docs/CONSOLIDATION_STATUS.md` (introduced by `ed7d709`).

## Published checkpoints

- `13a7596c`: invoice text hygiene, core deep-scan regression, selected chain-adapter migrations and source research/checker.
- `6c52951a`: retry/concurrent chain-identity checks, direct-announcement verification correction, registry/API compatibility and authenticated tag migration.
- `85fd0af0`: relayer hardening. Its migration report is audit 11; build, typecheck, lint and 232 tests passed with required Anvil integration before publishing.
- `ecc29c1`: durable 460-file integration checkpoint atop `f867`. It is a migration checkpoint, not a complete or release-ready snapshot; later work and current verification remain pending.

## Migration coverage

Bardeen `e96cee1` is an ancestor of the consolidated target. Fermat `c1c4ac9` diverges and requires property-level disposition, not wholesale replacement of newer code. Audit 06 tracks source paths and dispositions; audit 07 records branch provenance; audit 19 records the final path-level scan. The ext6/ext7/ext8 package imports are preserved with experimental, disabled, or unintegrated status intact. All 29 imported package suites passed sequentially: 2,253 tests across 128 files. The BTC scanner and BlindBit security ports passed their complete package suite. Source-only historical tests and security reports are retained as snapshots where appropriate, but are not counted as executed evidence.

The final third path scan found no additional missing authored runtime modules in its non-web, non-contract and non-relayer scopes. That does not establish semantic equivalence across all shared deltas. Web, relayer and contract owners still need to close their listed checks, and the current integration snapshot has not passed hosted CI.

## Confirmed verification

- Imported ext6–8 packages: 29 suites passed, 2,253 tests across 128 files.
- `core-crypto`: 55/55 tests passed; coverage 98.47% statements and 98.11% branches.
- `btc-silent-payments`: 353 tests passed; coverage 97.41% statements and 96.17% branches. Ext4 scan hardening and replay regressions are included.
- `chain-adapters`: final required-Anvil coverage run passed; 332 tests, 19 files, 96.1% statements and 94.48% branches. Log: `/tmp/gp-chain-coverage-final.log`.
- Contracts: latest full Foundry run passed 411 tests with no test failures/skips. The deterministic snapshot check passed 370/370; nondeterministic fuzz/invariant gas means are excluded per the documented snapshot policy. See audit 10 for logs and the independent Factory/policy checks.
- Pool contracts: 86 tests passed. Payer-hiding contracts: 108 tests passed in the default full suite.
- FHE/confidential contracts: 37 default-profile tests passed, plus the nine required Anvil chain-guard tests; all 46 cases are covered across the runs without counting pending cases as passes.
- BTC PayJoin real regtest: all four tests passed with the configured Bitcoin daemon.
- Relayer: 238 tests currently pass, but coverage remains below the required 95% statements / 90% branches. The relayer agent is adding coverage; this gate is open.
- Web: current full coverage run has failures under active repair by `qr_flows`; the web migration agent is rerunning the 17 Playwright checks. No final web pass is claimed yet.
- Hosted CI: pending. No green hosted CI result is claimed.

The broad library QA, coverage limits, timeouts and environment-dependent checks are recorded in audit 10. Root-wide build/typecheck/lint and final browser QA remain required against the coherent final snapshot; partial green package suites do not replace them.

## Security and completion boundaries

Audits 09–19 record source dispositions, package QA, migration closure, and remaining security checks. Current fixes include bounded scan and reorg handling, chain-adapter verification, BTC output attribution and replay flags, relayer budget/secret controls, invoice passphrase support, and explicit provider provenance. These changes still require final web/relayer integration evidence and review against the outstanding audit findings.

No mainnet or production readiness is claimed. External gates remain: verified deployment manifests and chain/feed data, funded testnet operation and operator rehearsal, release-signing/key custody, independent professional security review, trusted setup for circuits, and real wallet/device qualification. The pool development ceremony is insecure and must never protect valuable funds.

## Remaining sequence

Close the web coverage failures and rerun Playwright; raise relayer coverage to its required thresholds and rerun its suite; complete root build/typecheck/lint and final stress/security checks; obtain green hosted CI; then refresh the inventory against that final snapshot. Only after those gates close should the validated history be promoted to main and the required status note updated. Preserve outstanding external prerequisites even after repository checks pass.
