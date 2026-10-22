# Final migration completeness check

Review date: 2026-10-22. Durable comparison checkpoint: `origin/integration/consolidated-2026-10-21` at `ecc29c1ec998c4f131471967e2691678ca33f0fa`, plus later shared worktree changes. The previous path inventory snapshot used `46c9136cd54a1b52d9a7f329176342f94876aa73`; final candidate SHA is not assigned. Read-only source refs: Fermat `c1c4ac9b648174db33c87b59bc9c09267eca731c`; Bardeen `e96cee1a4e12773a6f66781c5a6797cbf9ff4ec5`; extension refs 1–10; `pages-site-1` `7f77a44`; `docs/readme-and-wiki` `ab2b616`. This is a path and evidence reconciliation, not a release signoff.

## Result

The tree comparison found no missing authored runtime source modules from the checked refs in the non-web/non-contract/non-relayer areas (library packages, examples, integrations, GitHub actions, docs-site source, and wiki source). The ext6/ext7/ext8 package imports are all present, as are the ext5 donation package, ext3 authored guides/specs, and pages-site source. Historical test snapshots and old-API regression tests are retained under `docs/remote/migration-source/**` with `.source` suffix; their presence preserves provenance but does not count as execution or passing tests. Generated `origin/gh-pages` output and generated security-tool result files are not product source and are not treated as current evidence.

The source/path migration review and package/contract evidence are recorded. Code is frozen for candidate preparation, but the candidate commit/upload and final hosted verification are still pending. Root reports core-crypto 55/55 with coverage thresholds, required-Anvil chain-adapters 332/332 at 96.17% statements and 94.42% branches, main contracts 411 default-profile tests and deterministic snapshot 370/370, relayer 248 tests (97.25% statements/92.35% branches), relayer-guard 146 tests (98.05%/93.67%), and QR exchange 52 tests (98.39%/91.04%). The remaining migration evidence is full web coverage on the candidate and green candidate hosted CI; the fresh signed-fixture Playwright run has passed 17/17. Details and limits are in audit 18. No Mythril/mutation result is claimed. Focused receipt integration security review 21 is closed 86/86; this does not replace a professional external audit. External deployment/security gates remain open in audit 08.

## Package-level source dispositions

| Source delta | Current disposition | Evidence / remaining limit |
|---|---|---|
| Fermat `packages/btc-silent-payments/src/adapter-types.ts` and ext4 scanner/BlindBit/URI fixes | Ported and tested | `packages/btc-silent-payments/src/audit-fixes.test.ts`, `audit-fixes-r4b.test.ts`, scanner and adapter suites; full package suite passed 21 files / 353 tests, 97.41% statements / 96.17% branches, typecheck and lint passed. Exact outpoint remains the selected item; duplicate-key and verification states are explicit. Web presentation/provenance is detailed in audit 16. |
| Fermat `packages/chain-adapters/src/index.ts`, `logs.ts`, `registry.ts`, registry tests and router Anvil tests | Adapted and validated | Current exports retain signature/deployment verification, scan verification, registry, payments and deep-scan APIs. `logs.ts` adds bounded `toBlock`, hostile head/cursor checks, canonical block checks, bounded pagination and safe rollback; current tests include `logs.test.ts`, `scanHardening.test.ts`, `scanVerify.test.ts`, `registry.test.ts`, `registry.compat.test.ts`, and `router.anvil.test.ts`. Required-Anvil final QA passed 332 tests across 19 files: 96.17% statements, 94.42% branches, 96.91% functions, 98.27% lines (`/tmp/gp-chain-coverage-final.log`); no chain-adapters QA pending is carried forward. |
| Fermat `packages/core-crypto/src/stealth.ts` | Source delta is documentation/comment-level; current behavior retained | Root reports 55/55 tests and coverage thresholds passed for core-crypto. Current differential/negative tests include the stealth derivation behavior; no functional omission found in source comparison. |
| Fermat invoice-schema `README.md`, `DEVIATIONS.md`, `src/errors.ts` | Updated docs and error model retained | Current docs describe text-hygiene rejection and passphrase mode/limits; current errors keep `ForbiddenCharacterError` and passphrase-specific errors. `passphrase.test.ts` and package schema tests cover the new envelope; the invoice-schema suite passed 626 tests (audit 18). |
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
- The docs/readme branch's design-only README claims were not copied because they conflict with the implemented source tree. Authored wiki/help pages are present; a fresh checker run after audit 18 reports 557 Markdown files and zero broken relative links (see below).

## Remaining migration checks

1. Complete full-web coverage on the frozen candidate; the fresh signed-fixture Playwright run passed 17/17 in 2.1 minutes after Pay receipt integration.
2. Obtain green hosted CI/Integration on the candidate and update audit 06 with the candidate SHA; root typecheck and workspace build have passed on the checkpoint, but coherent candidate verification is pending.
3. Reproduce any selected Mythril/mutation/fuzz checks and record unavailable tools rather than inferring a pass; focused receipt review 21 is closed 86/86 but is not an external audit.
4. Keep external professional audit, trusted setup, real deployment/key custody and funded device/testnet prerequisites open.

The inventory remains `complete: false`; this pass found no additional missing runtime modules in the scopes listed above, but it does not declare all source semantics equivalent or the product/security gates complete.

## Post-checkpoint integration evidence

The following changes were verified after the durable `ecc29c1` checkpoint; they are worktree evidence, not yet a frozen candidate result:

- Pay-side seller receipt import and race guards are implemented. The focused related suite passed 86/86, `payExec` passed 17/17, web typecheck and scoped lint passed, and independent review 21 passed another 86/86 while closing the cross-invoice prepared-payment and stale-import races. Receipts are signed seller-key attestations, not independent on-chain payment proof. Durable seller-side reconciliation remains open in audit 08.
- Live web BTC regtest passed once with no skips on Bitcoin Core 28.1 and the Esplora shim: scan found 50,000,000 sats, the signed sweep paid 49,999,802 sats, the verified fee was 198 sats, and rescan confirmed the source spent. Process state was cleaned. This is local-regtest evidence only.
- Required EVM helper integrations passed with real local tools: Registry 4/4, router 3/3, policy-scheme 7/7 and chain guard 9/9. Operator scripts passed 13 tests in the CI rest-0 shard. Root typecheck and workspace build passed on the checkpoint. The fresh signed-fixture Playwright rerun passed 17/17 in 2.1 minutes after Pay receipt integration; full web coverage and candidate hosted CI remain pending.
- Focused security review 21 is closed 86/86. This is not a full application audit or release signoff.

## Fresh documentation-link and ancestry check

After audit 18 was added, `node docs/tools/check-links.mjs` was rerun from the repository root. It checked **558 Markdown files and reported 0 broken relative links**. This includes links to current documentation and assets when referenced with relative paths; the checker also validates Markdown heading anchors. It does not fetch external HTTP(S) targets or validate links embedded in non-Markdown files. The prior 553- and 557-file results are superseded by this 558-file run.

The durable source-integration checkpoint is `origin/integration/consolidated-2026-10-21` at `ecc29c1ec998c4f131471967e2691678ca33f0fa`. At that checkpoint, ancestry against the pinned source-ref tips is:

| Source ref | Pinned tip | Ancestor of checkpoint? | Commits in source tip not in checkpoint | Disposition record |
|---|---:|---:|---:|---|
| `origin/claude/laughing-bardeen-4t20ys` | `e96cee1` | yes | 0 | Ancestor; target evolution is retained. |
| `origin/claude/remote-extensions-10` | `698404c` | yes | 0 | Ancestor. |
| `origin/claude/inspiring-fermat-vxv689` | `c1c4ac9` | no | 4 | Selective ports and remaining owner checks in audits 06, 07, 10, 11, 16, and 19. |
| `origin/claude/remote-extensions-1` | `39cce46` | no | 2 | Source/test/report disposition in audits 07, 13 and 19; historical test snapshots are not executed. |
| `origin/claude/remote-extensions-2` | `df150cb` | no | 6 | Source/test/report disposition in audits 07, 11, 13 and 19; Mythril/mutation results remain unrun. |
| `origin/claude/remote-extensions-3` | `cdfc2ba` | no | 34 | Package/web/docs dispositions in audits 07, 13, 16 and 19; historical assertions remain non-executed snapshots. |
| `origin/claude/remote-extensions-4` | `4ffb7a9` | no | 9 | BTC regression ports in audits 07/19; web and relayer checks in audits 11/16; chain-adapter tests in audit 10. |
| `origin/claude/remote-extensions-5` | `1337f6c` | no | 8 | Donation package and extension source dispositions in audits 07, 13 and 19. |
| `origin/claude/remote-extensions-6` | `7fb7aca` | no | 11 | Four research/PoC packages and docs in audits 07, 13 and 19. |
| `origin/claude/remote-extensions-7` | `e2ac361` | no | 23 | UX modules/specs preserved with integration boundaries in audits 07, 13 and 19. |
| `origin/claude/remote-extensions-8` | `ad76a87` | no | 18 | Merchant/deploy/examples integrations in audits 07, 13 and 15. |
| `origin/claude/remote-extensions-9` | `f09decc` | no | 16 | Privacy modules and remaining QA disposition in audits 07, 10, 12 and 19. |
| `origin/claude/pages-site-1` | `7f77a44` | no | 1 | Authored site source is present; generated `gh-pages` output is excluded. See audits 07/13/15/19. |
| `origin/docs/readme-and-wiki` | `ab2b616` | no | 1 | Wiki/help pages are present; inaccurate design-only README rewrite was not applied. See audits 07/13/19. |

The source branch tips remain non-ancestors where shown; this is expected because migration used selective ports rather than merges. Their authored source dispositions are recorded by owner: web in audit 16, contracts and package QA in audit 10, relayer in audit 11, ext8 deployment/integrations in audit 15, and remaining path/provenance work in audits 06/07/13/19. Generated reports, `.source` regression snapshots and `gh-pages` output are not represented as merged runtime code or as current passing test evidence.

The candidate final commit has not been created at this check. Therefore `06-migration-inventory.json` remains `complete: false`, and neither this link pass nor the ancestry table closes merge-completion, final-snapshot QA, hosted-CI or release gates.
