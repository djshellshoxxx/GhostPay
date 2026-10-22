# Final migration completeness check

Review date: 2026-10-22. Comparison target: `origin/integration/consolidated-2026-10-21` at `46c9136cd54a1b52d9a7f329176342f94876aa73`, plus the shared uncommitted worktree. Read-only source refs: Fermat `c1c4ac9b648174db33c87b59bc9c09267eca731c`; Bardeen `e96cee1a4e12773a6f66781c5a6797cbf9ff4ec5`; extension refs 1–10; `pages-site-1` `7f77a44`; `docs/readme-and-wiki` `ab2b616`. This is a path and evidence reconciliation, not a release signoff.

## Result

The tree comparison found no missing authored runtime source modules from the checked refs in the non-web/non-contract/non-relayer areas (library packages, examples, integrations, GitHub actions, docs-site source, and wiki source). The ext6/ext7/ext8 package imports are all present, as are the ext5 donation package, ext3 authored guides/specs, and pages-site source. Historical test snapshots and old-API regression tests are retained under `docs/remote/migration-source/**` with `.source` suffix; their presence preserves provenance but does not count as execution or passing tests. Generated `origin/gh-pages` output and generated security-tool result files are not product source and are not treated as current evidence.

This does not close the whole migration. Root owns final web, relayer, and contract evidence. Root reports core-crypto full coverage passed 55/55 tests with thresholds; the chain-adapters final coverage run is still in progress. No mutation-testing or Mythril result is claimed. Full workspace build/CI, browser/contract final snapshot checks, selected stress/fault tests, and external deployment/security gates remain open in audit 08.

## Package-level source dispositions

| Source delta | Current disposition | Evidence / remaining limit |
|---|---|---|
| Fermat `packages/btc-silent-payments/src/adapter-types.ts` and ext4 scanner/BlindBit/URI fixes | Ported and tested | `packages/btc-silent-payments/src/audit-fixes.test.ts`, `audit-fixes-r4b.test.ts`, scanner and adapter suites; full package suite passed 21 files / 353 tests, 97.41% statements / 96.17% branches, typecheck and lint passed. Exact outpoint remains the selected item; duplicate-key and verification states are explicit. Web presentation/provenance is detailed in audit 16. |
| Fermat `packages/chain-adapters/src/index.ts`, `logs.ts`, `registry.ts`, registry tests and router Anvil tests | Adapted to the current API, with final QA owned by root | Current exports retain signature/deployment verification, scan verification, registry, payments and deep-scan APIs. `logs.ts` adds bounded `toBlock`, hostile head/cursor checks, canonical block checks, bounded pagination and safe rollback; relevant tests include `logs.test.ts`, `scanHardening.test.ts`, `scanVerify.test.ts`, `registry.test.ts`, `registry.compat.test.ts`, and `router.anvil.test.ts`. Root's final chain-adapters coverage run is not yet complete at this report. Anvil-dependent cases are not claimed unless the final test report confirms execution. |
| Fermat `packages/core-crypto/src/stealth.ts` | Source delta is documentation/comment-level; current behavior retained | Root reports 55/55 tests and coverage thresholds passed for core-crypto. Current differential/negative tests include the stealth derivation behavior; no functional omission found in source comparison. |
| Fermat invoice-schema `README.md`, `DEVIATIONS.md`, `src/errors.ts` | Updated docs and error model retained | Current docs describe text-hygiene rejection and passphrase mode/limits; current errors keep `ForbiddenCharacterError` and passphrase-specific errors. `passphrase.test.ts` and package schema tests cover the new envelope. Final invoice-schema test evidence belongs to root's final package QA; do not infer from the core crypto result. |
| Ext5 `packages/donation/**` | Imported into previously absent package path | Audit 13 records 6 files / 68 tests and package type/build typechecks. It remains an optional, unwired feature and does not imply product integration. |
| Ext6 chain ports | All four packages present | `btc-family`, `chain-evm-extra`, `chain-solana`, `chain-tron`; 337 tests passed. Keep research/PoC/disabled states described in audit 07; no chain activation is inferred. |
| Ext7 UX modules | All 17 packages present | 1,454 package tests passed. Pure-logic modules remain unintegrated with production screens; audit 07 describes the boundary. |
| Ext8 CLI/merchant modules | All eight packages present | 462 package tests passed; ext8 deployment/examples/integrations/action content is present and hardened per audit 15. Build ordering and end-to-end product integration remain root-level gates. |
| Ext9 privacy modules | Runtime source package paths present | Current package QA is detailed in audit 10 and audit 12; this path scan alone is not a substitute for the recorded package-by-package test status or integration checks. |

## Preserved source-only evidence and exclusions

- Ext1/5 Stryker killer tests, ext2/4 historical relayer/web/chain regression tests, and ext3 readback/view tests are preserved as `.source` snapshots under `docs/remote/migration-source/`. They use obsolete APIs or are historical test sources; they were not renamed into default Vitest discovery and are not counted as green tests. Current equivalent coverage must be supported by the live tests/reports from their owning scopes.
- Ext2 Mythril/Gambit harness sources and historical outputs are not treated as executed security evidence. The final security-tool gate remains open until the tools are run against the final snapshot with reproducible commands and results.
- Ext1/4 assurance, stress and mutation reports describe older snapshots and remain historical only. No result is carried forward without reproduction.
- `origin/gh-pages` is generated site output. Source site builder/pages are in the worktree; deployment permissions, headers and release workflow remain subject to final security review.
- The docs/readme branch's design-only README claims were not copied because they conflict with the implemented source tree. Authored wiki/help pages are present; the current link check reports 553 links and zero broken (root-provided evidence).

## Remaining migration checks

1. Close the current chain-adapters final coverage run and confirm all intended tests actually executed, including any optional Anvil tests and worker-pool-sensitive suites.
2. Root to attach final evidence for the Fermat web, relayer and contract inventory rows; audits 11, 13 and 16 currently contain the detailed owner-specific review, with their stated pending checks.
3. Run/record final clean-checkout workspace build, typecheck, lint, test, contract, browser and CI checks; no statement here treats concurrent dirty-worktree test runs as a clean reproducible baseline.
4. Reproduce Mythril/mutation/fuzz checks selected by the security review, record unavailable tools explicitly, and keep independent professional audit and real testnet/deployment prerequisites open.

The inventory remains `complete: false`; this pass found no additional missing runtime modules in the scopes listed above, but it does not declare all source semantics equivalent or the product/security gates complete.
