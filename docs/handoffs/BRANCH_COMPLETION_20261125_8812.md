# Reviewed branch completion — 2026-11-25 Pacific

## Scope and preserved source

This is an isolated, ancestry-preserving completion candidate for the owner's
instruction to finish unfinished GhostPay branches. It retains the approved
EVM testnet privacy-payment and recovery scope, including P14. It does not
reopen archived products or claim all remaining branches are complete.

Base main: `8aca5a06a9435dd30e40378ba606da3c68f94863`.
Branch: `finish/in-scope-branches-20261125-8812`.
Reviewed implementation commit: `99ef75a441ea9871e39ccc79bd368850d85c219f`.

| PR | Preserved donor head | Completed work |
| --- | --- | --- |
| #647 | `6fd126dbb4d3377ff3cf7d97cfcb426a1e22fee3` | Independent recovery from the seller keystore; format documentation and browser acceptance fixture |
| #666 | `92ff633176760a513a37cb12e3ef96b0e0cb9d80` | Payer-specific warning before payment-key export and raw-key download |
| #671 | `4f674cdd71706d1c2566f8cb67cc8421fdc89d6a` | Help-page scope containment, preserving ordinary reconciliation and QR exchange |
| #673 | `e2bd32c55155f345e52630910135bf32ed1318a0` | Final-artifact exclusions and the #623/#626/#627/#633 ICU, QR clock, Unicode and locale fixes |
| #680 | `f1ec352245d8a9bcb9a201a50db0569b1ec31652` | Reconcile #659/#667 owner scope records with the mandatory shared-core privacy clarification |

All donor heads are merge ancestors. Original branches and archive refs remain
unchanged. Merge conflicts were confined to additive `ACTIVE_WORK.md` entries;
both inputs were retained. The four locale catalogs merge current main with
exactly the two reviewed #666 warning values; every other current key, value and
catalog metadata item remains unchanged.

Independent AI source reviewers approved the individual changes, the four-PR
composition at `c4c9f755dedfeb4235b8b4fc3f4e7159c8579c01`, and the final recovery
composition at `99ef75a441ea9871e39ccc79bd368850d85c219f`. The final review verified
that all ten #647 nonlog files are donor-exact, all prior nonlog files remain
unchanged, and all prior ownership lines and unique claims survive. These are
source reviews, not a human audit or formal GitHub approval.

The qualification commits named above are local source checkpoints. Direct Git
push has no authenticated credential in this environment, so publication uses
the connected GitHub Git-data API. The published candidate must have the exact
same Git tree as the final local checkout, with base main and all five original
donor heads as parents. Verify the returned tree SHA before creating its branch.
This preserves the original workers' histories; the local coordinator's merge
commit IDs are not asserted to be remote objects. The published PR and its head
provide the canonical replay target for the fresh hosted checks.

## Local verification actually executed

Environment: Node `v24.22.3`, npm locked installation via
`npm ci --ignore-scripts --no-audit --no-fund`. The lockfile was not changed.
Workspace libraries were built; the two affected packages were rebuilt after
composition. No additional Python package is needed for the standard-library
Git-object preservation checks.

| Check | Actual result |
| --- | --- |
| `node --test apps/web/scripts/localBuildProfile.test.mjs scripts/tests/release-exclusions.test.mjs scripts/pages/*.test.mjs scripts/tests/workflows.test.mjs` | 164 passed, no failures or skips |
| Typecheck and lint for `@ghostpay/i18n` and `@ghostpay/ux-intake` | Passed |
| `npm test -w @ghostpay/i18n -w @ghostpay/ux-intake` | 230 + 115 passed; existing coverage thresholds passed |
| Eight focused web suites: message, quoted literals, export warning, catalog, security keys, translator, languages, StealthExportPayment | 89 passed |
| Full web lint; final web typecheck; lint of the new recovery browser spec | Passed |
| `node scripts/i18n/check.mjs` | Four catalogs, zero errors, 783 untranslated-copy warnings; no translation completion claim |
| `bash scripts/scan-secrets.sh`; `bash scripts/check-actions-pinned.sh` | Passed; 116 action references pinned |
| `node --test --test-skip-pattern='^security:' scripts/recovery/seller-keystore-recover.test.mjs` | 16 selected ordinary compatibility/recovery tests passed; the separate security demonstration was excluded by the name filter |
| `node --test scripts/recovery/stealth-export-recover.test.mjs` | 23 passed, no failures or skips |
| Recovery script syntax; `git diff --check` | Passed |

The non-recovery tests above ran at `c4c9f755dedfeb4235b8b4fc3f4e7159c8579c01`.
The later #647 merge did not change those implementation or test files. Recovery
tests and the final web typecheck ran at `99ef75a441ea9871e39ccc79bd368850d85c219f`.

The local development-mode Pages build at `c4c9f755dedfeb4235b8b4fc3f4e7159c8579c01`
passed: 364 rendered modules and 17 final site files passed the exclusion check.
It used no deployment manifests, so payments remained disabled. This is a local
development artifact, not release evidence or a deployment. Path-based exclusion
does not establish dormancy of product code embedded in shared-core modules.

## Hosted qualification and integration gate

At prepublication, the original donor heads had successful applicable hosted
checks, including browser acceptance where their paths required it. Those runs
are evidence about the donors, not the new combined head.

No local browser test was executed: the installed `/usr/bin/chromium` wrapper
has no browser binary, and the pinned Playwright download returned HTTP 403.
No workaround changed browser assertions or test configuration. Fresh hosted
CI, including lean/full browser tests, Pages artifact acceptance, beta acceptance
and CodeQL, remains mandatory on the published combined head before merging.
No fuzz campaign, Anvil test or real transaction was run locally.

Before integration, re-read main, all five donor heads, reviews and checks.
Acquire the cooperative lock only from its released state with a non-force
compare-and-swap transition; verify ownership immediately before the normal
merge and release the acquired generation afterward. Never force a shared ref
or take over an expired held lock. Do not dispatch deployment, create release
tags, delete archived refs or treat the older donor trackers as live status.
