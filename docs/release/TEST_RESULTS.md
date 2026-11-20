# Test results and qualification limits

## Current continuation — 2026-11-19

See the [current source-pinned matrix](../engineering-handoffs/continuous-20261119/README.md#verification-checkpoint) and [retrieved hosted baseline](../engineering-handoffs/continuous-20261119/HOSTED_BASELINE.json). Final combined workspace typecheck/lint,65 library builds, full web build with bundle scan and payments-disabled16-file Pages build passed. Original invoice coverage:804/804,98.07% statements,97.6% branches; the receipt discloses the concurrent behavior-preserving test-fixture edit. Original full web coverage/nocov and final hosted qualification are still pending; no immutable final whole-suite pass is inferred.

Independent generation 4 checks:112 Pages tooling tests and 10 real-Git lease tests passed, no skips. Current contract evidence:64 original disposition tests with unchanged four 10,000-run fuzz budgets and 6 exact-trace/residual probes passed. Focused worker results overlap and are not summed. Local Chromium failed before page startup due socket permission denial; hosted c993 full/lean jobs actually ran, with four failures each now targeted by reviewed repairs. Echidna on c993 passed; strict Mythril did not. These source-qualified observations supersede conflicting historical counts below.

## Historical qualification evidence

Checkpoint: 2026-11-19. Integration branch: `release/ghostpay-beta-qualification-20261119`; implementation checkpoint `c5a2b09ea5dd7ee19400f29cbaddbe5cd93acc0a`; evidence checkpoint `4eb69699a59da84d17d0baa5dfe8dd6c9baaef9a`. Observed main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. [Draft PR #278](https://github.com/djshellshoxxx/GhostPay/pull/278) is the review entry point. Local and connector-published commits have identical trees and ordered source parents but different metadata; use [PUBLICATION_MAP.json](PUBLICATION_MAP.json) for their exact mapping.

Each result identifies its execution source. Identical component inputs can demonstrate applicability to later integration, but do not turn an earlier run into a fresh whole-candidate run. Counts overlap; no combined grand total is claimed.

## Fresh results after executor replacement

| Check | Actual result | Source / qualification boundary |
| --- | --- | --- |
| Clean installation | 721 packages, exit 0; then independent normal checkout npm 10.9.8 clean install, exit 0 | Published `d7e66ff4...` normal checkout; unchanged lock inputs. Installation is not product validation |
| Production dependency graph | Complete npm 10.9.8 graph exit 0 in normal checkout | Initial development symlink-layout graph failure retained; no overrides/ranges removed |
| Workspace library compilation | All 65 builds passed twice after clean installs | Normal checkout `d7e66ff4...`; library inputs unchanged by later web-only repairs |
| Full web TypeScript/build/CSP/bundle | Exit 0; 19-file bundle scan passed | `4ce683bc...`, published equivalent `5a103dab...`; later combined QR/lint build remains separately required |
| Native sweep focused matrix | 384 passed, 0 failed/skipped, ten files | `ed95c560...` / published `3da1f551...`; 374 cases plus ten disjoint destination-privacy cases. Historical 342 count is not reused |
| Lint repair affected tests | 367 passed, 0 failed/skipped, ten files | `e8e2edec...` / published `c835d202...`; preserves original assertions |
| Lint repair complete web type/lint | Both exit 0 | Same immutable repair source; original six-error complete lint retained as RED. Final combined QR+lint matrix remains separate |
| Multipart/single QR helpers | 17 passed | `98786e75...`; prior exact regression 1 failed/4 controls |
| QR exchange package | 233 passed; original coverage/type/build/lint passed | 97.57% statements, 95.17% branches, 100% functions, 99.08% lines; thresholds unchanged at 95/90/95/95 |
| Independent recovery | 23 passed, zero skipped | `6aeb0f8a...`; actual Anvil/cast binaries required, including fresh-directory offline recovery and spending recovered keys |
| Pages/build-profile/egress tooling | 151 passed, zero skipped | `f7802f89...`; final native inventory rerun remains required |
| Strict analyzer tooling | 54 passed after integration, zero skipped | `6aeb0f8a...`; synthetic analyzer fixtures, not a native Mythril pass |
| Foundry | 490 passed, 34 suites, zero failures/skips | Original compiler/config/fuzz/invariant settings; contract-package inputs unchanged during the web-only integration |
| Slither | 34 contracts/64 detectors, exit 0; existing Medium/High gate passed | `e8680e13...`; exact 36 compiler inputs and original settings recorded |
| Dependency audit | Production 0; full 17 Low, 0 Moderate/High/Critical | Dated fresh reports retained, including full-report exit 1 |

Fresh coordinator commands, source/working-state pins, exit codes and compressed/uncompressed hashes are in [evidence/recovered](evidence/recovered/). Worker evidence is committed with its [native](../handoffs/native-sweep-fee-review-20261119/README.md), [lint](../handoffs/final-web-lint-repair-20261119/QUALIFICATION.md), [QR](../handoffs/qr-surrogate-review-20261119/QUALIFICATION.md), [analyzer](../handoffs/recovered-mythril-evidence-20261119/README.md) and [Slither](../handoffs/recovered-contract-analyzers-20261119/README.md) handoffs.

## Required checks not yet complete

- Final integrated full workspace typecheck and lint (68 typecheck scripts; 67 lint scripts; the original confidential-contracts workspace has no lint script). The first 4eb69699 attempt was interrupted by executor replacement before an exit result; workspace lint had not started. Its original STARTED receipt and partial log are retained. A fresh normal installation and rerun are in progress.
- Complete original web coverage with unchanged 90/85/90/90 thresholds, plus the separate original nocov pass. The earlier interrupted attempt had 1,319 passing case lines but no aggregate/coverage verdict. No partial run is a pass.
- Remaining original workspace unit/integration groups, contract coverage and applicable security scripts on the final candidate.
- Final full/lean Pages artifact, independent inventory verification, two-build byte comparison and `/GhostPay/` HTTP validation.
- Complete native Echidna campaign and strict Mythril qualification/disposition. Echidna's Router and Policy attempts exited 137 before their required totals; Sweep completed 300,048 calls with four safety properties passing and two required canaries falsified. The complete campaign returned exit 1, not a partial pass.
- Exact-source hosted required workflows and current finding-level security clearance.

## Browser and testnet acceptance

**0/12 mandatory real-browser scenarios verified (0%).** These are generation/backup, actual-file verification, invoice creation, buyer review, local-chain buyer payment, seller detection, confirmation, receipt creation, native sweep, browser close/reopen, keys/history restore and rejection of expired/revoked permissions. Startup failed before any scenario assertion. Fresh system Chromium 156.0.8078.79 reports socket EPERM/SIGABRT; installed browser binaries were absent, and the pinned managed Chromium download was not a valid archive. Firefox/WebKit/mobile/keyboard/accessibility remain unqualified. No kernel-policy bypass was attempted.

Local Anvil, mocked RPC/browser fixtures and real public-testnet acceptance are different evidence. No actual public-testnet deployment, wallet payment, sweep or transaction hash is claimed.

## Hosted evidence

The [census observation](../handoffs/branch-census-delta-20261119/REMOTE_OBSERVATIONS.json) pins its times and source. At published `d7e66ff4...`: nine runs were pending/queued, thirteen checks queued and one publishing-only check skipped. No candidate Actions pass. Snyk alone produced the legacy combined success status. Main's CodeQL jobs passed on main, not the candidate. New source publications require new exact-head checks.

Historical passing source remains useful provenance, never a substitute for a current required run. Skips, cancellations, CLI errors, SIGKILL/OOM and incomplete reports are retained and labeled.
