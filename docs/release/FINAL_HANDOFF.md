# Final engineering handoff — current qualification checkpoint

## Latest engineering follow-up — 2026-11-20 UTC

The [current handoff](../engineering-handoffs/continuous-20261119/README.md) and [follow-up qualification receipt](../engineering-handoffs/continuous-20261119/FOLLOWUP_QUALIFICATION.json) supersede earlier status below. Eight demonstrated runtime defects are repaired, including the independently verified pure merchant-ledger guard. Existing composite-action discovery is recovered without changing update cadence or action versions. Six fresh generations and explicitly reused independent follow-up reviewers contributed.

Published d74 CI failed only the invoice-replacement browser observation (both profiles) and signer fixture synchronization; those exact failures are retained and their focused repairs independently approved. Original local web coverage was3837passed/1failed/13skipped; hosted d74 web3849passed/1failed/1skipped. Follow-up focused tests, full web typecheck/lint and merchant original coverage pass; full original hosted qualification on the follow-up head remains required. Strict Mythril, required external review and owner-controlled origin/testnet/release acceptance remain unresolved. No deployment, release, main merge, fee activation, source-branch deletion or weakened gate is implied.

## Initial continuation checkpoint — 2026-11-19 (historical)

The authoritative current index is [continuous engineering](../engineering-handoffs/continuous-20261119/README.md), with [task ledger](../engineering-handoffs/continuous-20261119/TASK_LEDGER.json) and [publication mapping](../engineering-handoffs/continuous-20261119/PUBLICATION_MAP.json). Frozen combined implementation: `c93f46441bf928d32b6809a9a5cfaf3d53e13aa6`. Continue existing draft PR #278; no main merge or deployment has occurred.

**Release remains BLOCKED.** This cycle integrated five proven unique upstream runtime fixes, an independently reproduced export-expiry security fix, and a manifest generation race fix. Three browser fixtures and lint errors were repaired without weakening assertions or gates. Four worker generations completed source-pinned discovery, repair and independent verification. The fresh census covers 299 branches / 282 PRs; explicit UNKNOWN semantic classifications remain.

Full workspace typecheck and lint, all 65 rebuilt libraries, full web build and a16-file payments-disabled Pages build passed. Invoice coverage passed 804 cases with original thresholds. Full web coverage and final-source hosted checks remain in progress. Previous candidate CI already passed Echidna, Pages acceptance and other recorded jobs; it failed four browser scenarios per profile, lint, and strict Mythril. Mythril's current unchanged-contract artifact has 10 records (3 Medium/7 Low), now assessed individually with 64 original native tests plus 6 current-trace/residual probes. No blanket waiver or external approval is claimed.

The detailed earlier checkpoint below is historical. Its old292-branch census, zero-browser statement, failed initial Echidna attempt and11-record Mythril status must not be treated as current results.

## Historical qualification checkpoint

Checkpoint: 2026-11-19. Integration branch: `release/ghostpay-beta-qualification-20261119`; implementation checkpoint `c5a2b09ea5dd7ee19400f29cbaddbe5cd93acc0a`; evidence checkpoint `4eb69699a59da84d17d0baa5dfe8dd6c9baaef9a`. Observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. [Draft PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278) is the review entry point. Local and connector-published commits have identical trees and ordered source parents but different metadata; use [PUBLICATION_MAP.json](PUBLICATION_MAP.json) for their exact mapping.

**Release verdict: BLOCKED.** Real implementation, consolidation and regression-backed repair are complete for the changes described below. Full verification and mandatory external gates remain unfinished; no public milestone is claimed.

| Metric | Recorded result |
| --- | --- |
| Main | c977b5d6723f6822c3b5d86cd6b231712c53c395 at the latest recorded refresh |
| Canonical branch | release/ghostpay-beta-qualification-20261119; exact implementation/evidence checkpoints above, published equivalents in PUBLICATION_MAP |
| Branches inventoried | 292 at the timestamped census; 284 unchanged/3 advanced/5 new. Not 292 fresh semantic audits |
| Work recovered | Key export/scanning authority, sweep lifecycle and fee review, clock/session fixes, artifact integrity, strict analyzer evidence, QR Unicode rejection and full-lint repairs |
| PRs merged into main by this lane | None; no source PR closed or historical branch deleted |
| Candidate source PRs retained | #269/#270/#272/#274/#275/#276/#277/#279 and earlier lineage; #255 selective backport with remaining scope preserved |
| Tests | Fresh clean install/65 libraries/full web build, scoped native384, lint-fix367, QR17+233, recovery23, tooling54, static151 and Foundry490 pass on recorded sources; counts overlap |
| Security | Fresh Slither established gate passed; first Echidna campaign returned exit 1 after Router and Policy SIGKILL; Sweep completed its original budget; strict Mythril/hosted/external clearance incomplete |
| Feature completeness | Source inventory available; full completion unestablished. Mandatory browser acceptance0/12 (0%) |
| Demonstration | BLOCKED; qualified public milestone0/1 (0%) |
| Testnet beta | BLOCKED; qualified public milestone0/1 (0%); no real-testnet transaction evidence |
| Owner/service dependencies | Dedicated origin and ADR decision, Pages environment, working browser/Actions resources, approved testnet deployment/signing identity, finding-level clearance and external review |
| Next priority | Complete exact-source workspace/coverage/Pages qualification and configured security campaigns; preserve failures and fix actionable defects |

## Current work and preservation

The original temporary environment was replaced. Published source was recovered exactly; native code was reconstructed against recorded blob identities and then freshly tested. Missing old raw logs are not represented as recovered. Current code/evidence are in the repository and published incrementally. Local Git metadata and connector-publication metadata differ; tree identity and ordered ancestry are verified and mapped.

Canonical checkout: `/workspace/scratch/246ff268d20d/GhostPay`. The independent normal dependency/build checkout is `/tmp/ghostpay-qualified-246ff268d20d`; it is reproducible and must not be the sole copy of source or evidence. Coordinator receipts are preserved under `docs/release/evidence/recovered/`. Worker handoffs preserve their commands, sources, independent reviews, compressed logs and hashes. Temporary installed dependencies and compiler outputs can be recreated from the pinned inputs.

Native source was independently reviewed at recovered `ed95c560...`; the later lint repair removes only a dead initializer and tightens test typing. Separate independent reviews approve that narrow delta. The QR source is the exact original #279 implementation and regression; its original ancestry is retained. Existing network/session/defaultServices modules were preserved.

## Reproducible continuation

1. Read AGENTS.md, docs/ai workflow/ownership, the live integration lease and these eight release documents. Refresh live main and relevant PR heads before promotion.
2. Fetch the published candidate; verify tree identities using PUBLICATION_MAP. Keep other workers' branches/checkouts intact.
3. Use the normal clean Node22/npm10 checkout and unchanged lockfile. Complete all original workspace type/lint and unit/integration groups, full web coverage plus nocov, required contract/analyzer/security checks and final full/lean build. No partial or skipped required job is a pass.
4. Keep Echidna's failed attempt and complete a resource-qualified full configured rerun if possible. Do not lower its workers, call budgets or properties. The pinned binary rejected the attempted heap cap; no supported documented memory cap was found. Mythril tooling regression success is not native finding clearance.
5. Verify and reproduce the exact Pages artifact, every asset and /GhostPay/ routes. Obtain a functioning browser environment for all twelve actual scenarios and negative/accessibility/mobile cases.
6. Update final source identities, complete CI observations and artifact hashes. Have an independent reviewer inspect the actual candidate and issue READY FOR DEMONSTRATION, READY FOR TESTNET BETA or BLOCKED from evidence.
7. Only after applicable checks and decisions pass, coordinate normal main promotion, verify resulting main/CI and request/execute the authorized exact deployment. Record live commit/assets/routing/browser smoke.
8. Complete the additional signed deployment, real-wallet/testnet, independent recovery and external-review gates before creating the approved beta release/tag. Never replace a published tag without authorization.

## Release documents

[FEATURE_MATRIX](FEATURE_MATRIX.md), [BRANCH_CONSOLIDATION](BRANCH_CONSOLIDATION.md), [SECURITY_AUDIT](SECURITY_AUDIT.md), [TEST_RESULTS](TEST_RESULTS.md), [RELEASE_BLOCKERS](RELEASE_BLOCKERS.md), [DEPLOYMENT_READINESS](DEPLOYMENT_READINESS.md), [RELEASE_NOTES](RELEASE_NOTES.md). These are qualification records, not permission to publish an unverified candidate.
