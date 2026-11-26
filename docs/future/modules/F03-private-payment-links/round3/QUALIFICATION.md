# F03 reconciliation with current main

Recorded November 20, 2026. The selected F03 implementation remains signed-invoice
request-file interchange. This continuation resolves the feature branch's conflict with
newly landed mainline work and verifies the resulting combination.

## Inputs and preserved source

| Input | Commit |
| --- | --- |
| Canonical feature before reconciliation | `1de98f6c9371010883253450446e6f7294da84fa` |
| Current main input | `aa3df1cb37274fae73af0ca957183c15c51b62d3` |
| Common base | `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` |
| Reviewed and locally tested merge | `f0968b9541dbd3234a6b0516023773845c04c4e4` |
| Exact-tree API equivalent | `7c30385a44d1cac76e9137eea9fc522865ac53f0` |
| Exact merged source tree | `6c3c65280f693bd6477218f10aff46b2a3d95e1f` |
| Unchanged F03 browser test blob | `085bbccd0ad1d434e8c6f67965d7fbdf1fe72d4f` |

Main advanced through PRs #306 and #311 while the previous head's CI was queued.
GitHub then reported PR #310 as conflicting. A read-only merge preview established that
the sole conflict was `docs/ai/ACTIVE_WORK.md`.

The new main input carries five focused shared-web fixes and payment-URI builder length
guards. No F03-specific source conflicted. The reconciliation preserves all 23 nonregistry
main changes and all 84 nonregistry F03 changes exactly. The complete 4,004-path union was
independently checked; no source, dependency, workflow or threshold was rewritten while
resolving the conflict. The F03 ownership prefix precedes the complete incoming main registry,
including its appended QA-02 claim. The common base appears once.

The API merge uses canonical `1de98f6c` as primary parent and main `aa3df1cb` as additional
parent, preserving both histories. Its tree exactly equals the local review/test checkpoint.
Subsequent publication documentation retains the same executable source. These source maps
let fresh workers reproduce local pins from the durable remote equivalent.

The existing earlier audit records remain source-pinned. Round-two investigation, memo-fix
review, concurrent-worker reconciliation and exact original CI artifacts are preserved at
[audit checkpoint `9a0e2680`](https://github.com/djshellshoxxx/GhostPay/tree/9a0e268034ee2321c5e333c35a3aa1825b1c8f63/docs/future/modules/F03-private-payment-links/round2).
Those records describe their own earlier source and observations; they do not qualify this merge.

## Fresh independent integration audit

Reviewer `f03_main_reconciliation_review`, with separate read-only standards and specification
checks, found zero actionable integration issues. See [RECONCILIATION_REVIEW.md](RECONCILIATION_REVIEW.md).
The reviewer checked every merged path, both input ancestries, registry preservation and the
shared QR/profile/merchant-pin/payment-URI consumers. Root performed the serial execution below.
Source approval and successful unit/DOM tests do not establish native-browser completion.

## Executed local gates

All commands use the original checked-in configurations and source checkpoint above.
`evidence/verification-summary.json` indexes the 15 command records and raw-log hashes.
`evidence/original-console.json` preserves all original stdout/stderr bytes as hash-checked
gzip/base64 entries. Readable `.log` files remove only terminal color and line-end/EOF padding;
each command record supplies both original and normalized hashes. No output is silently discarded.

| Gate | Actual outcome |
| --- | --- |
| Payment-URI complete package suite with original coverage thresholds | 206/206 tests in 4/4 files passed |
| Payment-URI coverage | 97.5% statements, 97.09% branches, 100% functions, 99.08% lines |
| Payment-URI build, typecheck and original lint | All exit 0 |
| Combined shared-web, F03, QR consumer and localization regressions | 294/294 tests in 24/24 files passed |
| Real QR image-decoder interchange included in that run | Plain, bearer and passphrase cases all passed |
| Whole-web typecheck | Exit 0, 1,024 MiB heap, 20.448 seconds |
| Scoped typed lint of incoming shared-web source/tests and unchanged F03 browser fixture | Exit 0 |
| Full and lean Vite builds | Both exit 0 |
| Original postbuild bundle scanner after each profile | Both exit 0; 19 full files and 17 lean files |
| Original full and lean Playwright collection | Six F03 cases collected in each; no native execution |
| Whitespace check against actual main input | Exit 0 |
| Existing repository secret scanner | Exit 0, with its original scope |

Prepared dependencies and unchanged workspace outputs were reused from the prior worktree with
identical lockfile bytes. The payment-URI package was rebuilt at the new source before any web
consumer check. The focused web run disables coverage only for that selected regression run;
the unchanged full-web coverage gate remains required in CI. The invoice-schema implementation
is unchanged and its earlier 813-test result is not relabeled as a new run.

The static build stages were run serially: whole-web TypeScript, Vite for each profile, and the
unchanged postbuild scanner immediately after each build. Node heap and Rayon concurrency were
bounded; no compiler, scanner, timeout assertion, build-profile rule or dependency was weakened.
Warnings about existing help CSS resolution, a browser-externalized Node module, dynamic-import
chunking and chunk sizes remain in the raw build logs. Profile inventories in
`evidence/static-build-{full,lean}.json` hash the actual emitted files. These are local static
inventories, not browser-tested artifacts or deployment attestations.

The canonical-to-merge whitespace comparison exposes one inherited trailing space in main's
`docs/handoffs/PAYMENT_URI_LENGTH_20261120.md:23`. The handoff is preserved byte-for-byte.
The comparison against actual main passes. The repository secret scanner excludes `docs`;
its success is not a complete credential audit of these reports.

## Remaining current-head gate and worker prompt

Continue PR #310 on `future/f03-private-payment-links`. Fetch the actual feature/main heads and
inspect new commits before editing. The source-pinned local merge/API equivalent above is the
qualified integration input; any later runtime or test change needs its own review and checks.
Preserve incoming source and ownership. No main merge or deployment is part of this continuation.

Inspect the workflow run associated with the actual published feature head. Earlier run
`44769994546` belongs to `1de98f6c`; earlier run `44692101562` contains the original memo-locator
failures. Neither supplies a completed browser qualification for this merged source. A new
feature-head update may supersede/cancel the previous run under existing workflow concurrency.

Require all six F03 fixtures to execute and pass without F03 skips in both full and lean jobs.
Read the actual fixture result lines, including assertions after the original memo failures.
Retain the unchanged broader browser tests and existing profile exclusions. Verify exact-envelope
download/import, explicit preview/open, refusal/retry, stale replacement, A-to-B-to-A behavior,
signature/payment blocking and the no-wallet/no-network probes.

For successful jobs, verify `browser-build.json` against the actual merge checkout, feature head,
tree, profile and lockfile, and hash-check the retained build ZIP. Its `browser-tested-web-*`
artifact name uses the actual checkout SHA, which may differ from the feature head. Artifact
existence alone does not prove that the six scenarios ran. Do not persist temporary download
URLs or unrelated generated invoice state. The local Chromium socket restriction remains;
collection, DOM checks and QR image decoding are not substitutes for native browser execution.

Keep the PR draft while required checks or browser execution are pending/failing. If a real
feature regression appears, record owned paths first, preserve a focused failing regression,
make the minimal repair and hand it to an independent worker. Do not change guards, thresholds,
skips or timeouts to obtain a pass. After actual current-head gates pass, record source and
artifact identities and hand off the completed feature with its fresh audit reports for review.
