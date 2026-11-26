# Shared payment utility completion — 2026-11-25 Pacific

Status: exact donor composition, bounded local qualification and independent
source review complete. Fresh hosted qualification remains an integration gate.

## Scope and source

Branch: `finish/shared-payment-utilities-20261125-8812`.
Canonical base: request-file candidate `521a917da4dabe02d5e0075e750c7b4ec10e7d5f`.
It is now integrated in main `84b80260b9c16b928e440dd81750d9bfb6cdb2b4`, whose
tree is identical to the tested base. Main was adopted by an ordinary merge;
the seven reviewed source/test blobs are unchanged. Publication uses that main
merge as the first parent and the three original donors as additional parents.
Implementation: `6ad23050addc4b563cd409af995e59ceadef1492`.
Implementation tree: `e63f006b94e7b4d9223f1815269fac95288182b1`.
Initial claim: `20f457b2` before any source change.

| Donor | Exact head | Result |
| --- | --- | --- |
| #628 | `0fe0f06f1f7cd1dde2c4dc849702f0ab4cd509cd` | Quote a literal leading U+FEFF in CSV fields so payment-history text survives exact export/import, including an independent file BOM |
| #634 | `898106124f7fc2ae90916a8d62348d0d4dd5e120` | Give uppercase Cyrillic/Greek lookalikes the existing confusable diagnostic for local payment handles; all acceptance/rejection rules remain unchanged |
| #663 | `d05108873af1ab79edee9c22fe01b0a22cf3a213` | Snapshot receipt lookup fields once, make the existing throwing-proxy test reach verification, and retain the missing regression for the already-existing exact-amount decimals bound |

All seven source/test blobs are byte-identical to their donor heads. The donors
are ordinary merge ancestors. Original branches and frozen archives are unchanged.
The only merge conflicts were ownership records. The final registry retains the
complete canonical base as its prefix, the coordinator claim, and each donor claim
exactly once. One local intermediate merge retained conflict markers after a prefix
assertion rejected an insertion at the top of the file; the following documentation
commit resolved it additively. The final tree is marker-free and passes diff checks.
That intermediate local coordinator commit is not a canonical publication parent.

The package READMEs establish independent payment-history, local payment-sharing
and selective-disclosure receipt uses. No tip/donation, storefront, dashboard
analytics, GhostID profile or other stopped-product implementation changes. These
packages are not imported into the current application by this work; no activation,
dependency, manifest, lockfile, workflow, protocol, contract or release change.
The numeric regression preserves the owner's exact-amount requirement and does not
enable fiat conversion. Existing receipt documentation still states that a checksum
alone is not proof of payment and that chain corroboration depends on its adapter.

## Current qualification

An independent locked `npm ci --offline --ignore-scripts --no-audit --no-fund`
installed 722 packages successfully without changing the lockfile. Python's standard
library sufficed for Git-object and preservation checks.

| Check | Actual result |
| --- | --- |
| ux-export: leading BOM, existing text and ledger-import cases | 39 passed; four property cases unselected |
| ux-links: new and existing local handle cases | 12 passed; one property case unselected |
| ux-receipts: accessor, lookup, invalid facts and receipt cases | 102 passed; one property case unselected |
| chain-adapters: exact amount/quote cases | 22 passed; one property case unselected |
| **Distinct selected package cases** | **175 passed; seven existing property cases not run locally** |
| Typecheck | All four affected packages passed |
| Lint | Full ux-export, ux-links and ux-receipts passed; changed chain-adapters test passed |
| Build | All four affected packages and core-crypto/invoice-schema prerequisites passed |
| Existing lean dependency/reachability gate | All four tests passed; gate unchanged |
| Source preservation | All seven donor source/test blobs exact; canonical ownership prefix retained; no app, manifest or workflow delta |
| Committed-secret scan and full-diff whitespace check | Passed |

The package test commands used `--coverage.enabled=false` and selected existing
ordinary deterministic cases. No coverage percentage or whole-package pass is
claimed locally. Existing coverage thresholds, generated cases and test files are
preserved for ordinary hosted CI. No fuzz, mutation or exploit campaign was run.

The new regressions' original red/green results belong to the source-pinned donor
handoffs; this run claims a fresh native pass on the composed implementation, not
a new baseline reproduction. Browser runtime is unavailable locally. No browser
test, live wallet, real funds, release or deployment was executed by this worker.

## Review and integration

Independent read-only reviewer `/root/branch_triage` approved implementation
`6ad23050` and its exact tree with no source findings. Review confirmed all seven
donor blobs, receipt-state outcomes, unchanged current state tests, scope, complete
ownership preservation and unchanged app/dependency/workflow boundaries. The
reviewer ran no application tests and made no source or remote changes.
Renew donor heads, comments and
ownership before integration; the initial fresh reads showed completed donor
handoffs and no separate active claim or human-approval gate on these paths.

Canonical publication must match the final independently reviewed Git tree exactly,
with canonical base and all three donor heads as parents. Preserve the source heads;
do not rewrite original refs. Publish a draft, require all applicable fresh hosted
checks on the actual composition, then acquire the released cooperative lock with a
non-force expected-head transition before an ordinary merge. A later main change
requires composition review and renewed checks where relevant.
