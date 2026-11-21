# Receipt archive identity recovery — 2026-11-20

**The bounded recovery is implemented, independently reviewed and locally qualified on `a656c3e5dbc385a892e3efc9bd12389b214051b8`. Exact published-head hosted and browser gates remain open.**

## Source and behavior

This continuation starts from PR #333 `3172a93ceb8fce5a4343a93b453dcc0e68f09d87` and selectively recovers PR #332 `71632fa389ae93824b2f42d265278a9bd0f6de59`. The tests-first checkpoint is `0bbe400ec804f250f21f056117e31aca77191367`; runtime `06c17144d3839f5a093dec3ed9041374fb2de79e` follows it. The final qualification source is `a656c3e5dbc385a892e3efc9bd12389b214051b8`, tree `4c5edaf70dd704336f0720415f012a07adb883ef`. That last commit changes two test expressions only. Its runtime remains blob `e056b485f4dbaab5ac9fdc1af78349a8e633b516`.

Receipt A's completed archive state previously survived invoice invalidation and a newly signed receipt B. A delayed success could also mark B archived; a delayed rejection could report A's error on B. The recovery advances archive-completion generation and resets receipt status on invoice invalidation, a new accepted invoice load, and a new signature. Both success and rejection respect that ownership.

A separate synchronous ref and pending state retain the lifetime of A's immutable archive write while B is displayed. B cannot start another write from the same mounted panel until A settles. The finalizer clears the pending lifetime even when A's result has become stale; the existing inner finalizer still locks the created vault.

This is **per-panel serialization**, not a cross-panel or cross-tab queue. Already-started immutable writes may finish; no rollback is promised. Existing session and vault compare-and-swap guards retain their authority and conflict responsibilities.

Only `ReceiptPanel.tsx` changes at runtime: **21 insertions and two deletions**. All four current print-target adaptations remain. Independent normalization removes those four adaptations and one scope-clarifying comment to reproduce the donor component exactly. Existing receipt, invoice, profile, locale and print tests, along with newer session, backup and Sweep source, remain intact. Signature/archive formats, dependencies, configurations and coverage thresholds are unchanged.

## Qualification

| Gate | Exact source | Result |
| --- | --- | --- |
| RED: donor's two cases, supplemental rejection case, existing archive and panel controls | `0bbe400e` | 10 passed, 3 expected behavioral failures, 0 skipped; 10.819 s |
| Same four complete files GREEN | `06c17144` | 13/13 passed, 0 skipped; 9.932 s |
| First compatibility run: all seven panel files, receipt library and print hook | `06c17144` | 57/57 passed in nine complete files, 0 skipped; 18.526 s |
| First original web typecheck/lint | `06c17144` | Typecheck passed; lint found two `require-await` errors in the new test callbacks |
| Same nine complete compatibility files after the test correction | `a656c3e5` | **57/57 passed, 0 failed, 0 skipped**; 21.753 s |
| Original full web typecheck | `a656c3e5` | Passed; 20.650 s |
| Original full web typed ESLint | `a656c3e5` | Passed; 47.177 s |
| Original lean production build, including TypeScript, Vite and postbuild scan | `a656c3e5` | Passed; 21.480 s; **17 files / 2,496,896 bytes** |
| Original secret and whitespace checks | `a656c3e5` | Passed |

**These test runs overlap.** The final compatibility result contains 57 cases, including the earlier 13-case set and all three new regressions. Repeated qualification does not increase the distinct test total.

The regressions use real receipt signing and verify distinct valid A/B signatures. The archive writer is deliberately mocked to control completion order. RED stops respectively at B's incorrectly retained button label, A's stale success status, and A's stale error. GREEN completes the remaining writer-argument, vault-lock and subsequent-B-archive assertions. All ten original archive/panel controls passed during RED, including selected-receipt printing.

## Preserved failure and correction

The donor regression was initially copied byte-for-byte at blob `a43a5e9e5e5c073ce96b58d001aaea6237ad879f`. The original web lint gate then found an `async` act callback without an inner `await` in that file and in the supplemental test. The original failed lint report and its passing typecheck remain archived, including byte-identical preservation copies.

The correction changes each callback to return `Promise.resolve(...)` around the same native completion call. The surrounding awaited `act` boundary remains asynchronous; every assertion and all runtime code remain unchanged. A separate [independent addendum](LINT_REVIEW_ADDENDUM.md) approved those exact two expressions before the nine-file rerun. The final donor test therefore has one explicit callback-expression adaptation; the original exact-blob provenance remains historical. No rule or test was disabled.

## Evidence and remaining gates

The [independent source review](INDEPENDENT_REVIEW.md) approved the runtime before GREEN; it executed no runtime tests. This worker executed RED, GREEN and both compatibility runs. The coordinator executed the original web gates. [EVIDENCE.json](EVIDENCE.json) keeps those owners, source identities, commands, original outputs, failures and build-file hashes separate. [ARTIFACTS.md](ARTIFACTS.md) explains lossless decoding and validation. The [handoff](../../handoffs/RECEIPT_ARCHIVE_IDENTITY_R2_20261120.md) records publication boundaries.

Tests used one worker and a 512 MiB Node heap. Original web gates used 1536 MiB, Node 24.22.3 and npm 11.19.1. Existing Sweep dependencies and built workspace libraries were reused only after equality checks for the root lock/manifests, relevant configuration and complete package source tree. Cache directories are local. There was no installation or dependency copy. The lean artifact retains `GP_COMMIT=a656c3e5dbc385a892e3efc9bd12389b214051b8`; it is not relabeled with the later documentation or published commit.

No local browser body or complete original web coverage/no-coverage suite is claimed for this receipt revision. The separate idle candidate's broader suite is separate source evidence. Required checks must qualify the exact published candidate before coordinated integration. No main merge, release, deployment or live transaction was performed by this worker.
