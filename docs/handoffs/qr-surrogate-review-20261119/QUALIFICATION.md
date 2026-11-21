# PR 279 — independent multipart QR integrity qualification

## Disposition

**Compatible, independently useful fail-closed Pages hardening; original ancestry
retained in the isolated candidate.** This corrects silent data substitution for
malformed JavaScript strings. No fund-loss or key-exposure exploit is claimed.

The candidate branch is `repair/ghostpay-qr-surrogates-20261119`, based on
`75cc6149e2fd560f26725e806b24f859f999d647`. Normal merge
`98786e75f7979708b52fbe7424825a41100e2d98`, tree
`37bf0e722ddbd068504f0a6445fbbba642ae8d8f`, has both parents:

- Regression-first candidate `397c9e140120bdbc9b683de5c157cb35b02b365a`.
- Original [PR 279](https://github.com/djshellshoxxx/GhostPay/pull/279) head
  [`b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0`](https://github.com/djshellshoxxx/GhostPay/commit/b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0).

All five original PR commits remain ancestors. The sole merge conflict was the
additive ownership registry; both records and the other workers' claims were
retained. The original historical handoff remains unchanged at
`docs/handoffs/QR_MULTIPART_SURROGATE_20261119.md`.

| File | Baseline blob | Reviewed merged blob |
| --- | --- | --- |
| `apps/web/src/lib/qrMultipart.ts` | `48032d32ea18fa660ac72c342263d741ceb7cc0d` | `d8c9a8cc2d6eb90f1a6a45fe463a6f8e7ab1abb3` |
| `apps/web/src/lib/qrMultipart.test.ts` | `4fd6b1e` prefix, before the upstream regression | `45992f537d1f226dd20e57d96a246c6f18419395` |

The two merged files are byte-for-byte the upstream source and test. No QR
package source, wire format, dependency, configuration, threshold, network grant,
other web component or native-sweep file changed in this integration.

## Defect and correction

`toMultipart` previously passed arbitrary JavaScript text to `TextEncoder`.
Unpaired UTF-16 surrogate code units are replaced with U+FFFD during that
conversion. The multipart checksum then verifies the substituted bytes, so it
does not establish preservation of the caller's original text. The existing
single-QR path already rejected these inputs.

The guard rejects lone surrogate code points before encoding with the existing
fixed `QrExchangeError('BAD_INPUT')`. Unicode-mode matching preserves valid
surrogate pairs, including astral characters. `multipartIfNeeded` inherits the
rejection when it falls through from single-QR detection. Valid GPQ1 framing,
payload limits, checksum handling and assembly behavior remain unchanged.

## Fresh tests and static checks

All commands used the original repository configurations and supported Node
22.23.5. Tests used one worker; these scoped commands used a 512 MiB V8 old-space
cap. Complete byte-preserving logs and actual child exit codes are retained in
the linked receipts.

| Check | Exact outcome | Evidence |
| --- | --- | --- |
| Actual upstream regression against current, unchanged runtime | 1 failure: expected `QrExchangeError`, but no exception occurred; 4 existing controls passed, including UTF-8 round-trip | [Receipt](evidence/baseline-red.json), [complete log](evidence/baseline-red.log.gz) |
| Merged multipart and single-QR web helpers | 17/17 passed in 2 files; original new astral-pair control executed successfully; exit 0 | [Receipt](evidence/web-qr-green.json), [complete log](evidence/web-qr-green.log.gz) |
| Complete QR package suite with original coverage gate | 233/233 passed in 7 files; exit 0 | [Receipt](evidence/qr-package-coverage.json), [complete log](evidence/qr-package-coverage.log.gz) |
| QR package TypeScript check | Original `tsc -p tsconfig.json --noEmit`, exit 0 | [Receipt](evidence/qr-package-typecheck.json), [complete log](evidence/qr-package-typecheck.log.gz) |
| QR package build | Original `tsc -p tsconfig.build.json`, exit 0 | [Receipt](evidence/qr-package-build.json), [complete log](evidence/qr-package-build.log.gz) |
| QR package typed lint | Original root ESLint configuration over complete package `src`, exit 0 | [Receipt](evidence/qr-package-lint.json), [complete log](evidence/qr-package-lint.log.gz) |

The complete package coverage result is **97.57% statements, 95.17% branches,
100% functions and 99.08% lines**. Its unchanged thresholds are respectively
**95%, 90%, 95% and 95%**. The complete native LCOV output covers nine source
files and is retained as [an artifact](evidence/qr-package.lcov.info.gz) with its
[hash receipt](evidence/qr-package-coverage-artifact.json). These package metrics
are not full web application coverage metrics.

The original PR's 16 standalone JavaScript assertions were not treated as a
repository-suite pass. This independent execution establishes the previously
missing actual Vitest RED and GREEN results. The positive astral-pair assertion
appears after the malformed-input loop in the upstream case: it did not execute
in the failing baseline case and did execute in the passing merged run. Existing
baseline UTF-8 controls passed separately.

`git diff --check` from the integration base passed. All raw log archives were
decompressed and checked against their recorded original byte lengths and
SHA-256 hashes; stored archive hashes also matched. The accompanying
`run-check.py` records child status rather than treating an empty diagnostic as a
successful check. It refuses to overwrite earlier evidence.

## Independent source review

The provenance reviewer approved source at the immutable normal merge
`98786e75f7979708b52fbe7424825a41100e2d98`. It independently checked Unicode-mode
surrogate semantics, ordering before `TextEncoder`, fixed public errors, exact
upstream source/test identity, unchanged existing assertions and original PR
parentage. It found no concrete introduced defect. The source-only review is
recorded in commit `422fe16e991035cccf1862f0b2f7c929242de33d` at
`docs/handoffs/branch-census-delta-20261119/QR279_SOURCE_REVIEW.json`, SHA-256
`6598300f44560b7b832af67b9ed9d60cfeb4d2d7e1824fc9b12d7dd1d67ba999`.
Runtime execution remains attributed to this worker's separate receipts.

## Integration and release boundaries

The coordinator owns integration into the shared candidate and all main-branch
promotion decisions. At this checkpoint, scoped web typed lint and the final
combined application checks remain coordinator-owned pending gates. No fresh
browser run, complete web coverage, deployment, release or testnet transaction
is claimed by this handoff.

The [upstream CI observation](evidence/upstream-observation.json) records all five
retrieved PR-triggered workflows as queued. The successful Snyk status does not
replace those required jobs. Obtain fresh exact-candidate hosted results before
approved promotion; this local qualification does not waive release approvals,
dedicated-origin decisions, manifest authenticity or external review.
