# F03 browser-qualification continuation — 2026-11-20

This record supersedes the original handoff's statement that the six browser fixtures had only
been collected. Original hosted execution is now established; execution of the corrected test
head remains the next gate at the time this record is written. Consult PR #310 and its actual
current-head workflow results for subsequent outcomes, rather than inferring success from this
historical record.

## Re-established repository and execution state

PR #310 remained open and draft at source `976d26ee791836c176431c8a5d0b825486f78caf`.
Main remained `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. The broader F03 specification branch
remained separate. A new isolated continuation worktree was created from the canonical published
head, preserving the earlier local-author history and every historical audit snapshot.

CI run [44692101562](https://github.com/djshellshoxxx/GhostPay/actions/runs/44692101562) completed
with 22 successful jobs and two failed browser jobs. Pages, Hosting kit, CLI operator qualification
and Beta acceptance workflows reported success. Those workflow/job statuses are not claims that
every possible release or external-wallet scenario executed.

The actual browser checkout was merge `18c2806e70bb9f1af05edc293e9350bd9c638f2f`, whose tree
`91a8610bfd6cb2015f57d7fa32b5dc38d962bdf3` equals the published source-head tree. The fresh
investigator independently inspected both job logs and hash-verified retained failure artifacts.

| Original browser job | Whole-suite result | F03 cases |
| --- | --- | --- |
| Full, `136181689920` | 84 passed, 4 failed, 1 existing skip | 2 passed, 4 failed, no skips |
| Lean, `136181689927` | 72 passed, 4 failed, 3 existing skips | 2 passed, 4 failed, no skips |

All eight failed contexts contain the expected memo paragraph. All failures stop at a new test's
bare exact memo locator; the unchanged renderer includes the `Memo:` label in that element's
complete text. The failure is in the test assertion, with no missing-memo product defect
established. Assertions after the stopping points remain unqualified by this original run.

See [HOSTED_BROWSER.md](HOSTED_BROWSER.md) and its bounded JSON evidence for exact cases,
source lines, execution excerpts, artifact hashes and limits. No unrelated generated invoice
state, signed download URLs, ZIPs or screenshots were added to the repository.

## Historical local correction and independent review

The first locally prepared proposal changed only `apps/web/e2e/payment-request-file.spec.ts`
among executable files. It was reviewed and validated before publication discovered the
concurrent canonical repair described below. This helper-based proposal is retained as
historical evidence, not substituted for the current canonical test:

- A small helper locates the exact full `Memo: <memo>` text inside the named `Review payment`
  region. Every positive memo assertion, including the previously unreached return-to-request-A
  check, uses this helper.
- The stale request-A check retains its zero-count assertion in the active review immediately
  after request B's memo is required to be visible.
- The pre-unlock confidentiality check now searches the page's text for absence of the memo,
  so a labeled paragraph cannot evade it. The wrong-passphrase case gains the same check.

All envelope, amount, URL, storage, request, wallet, invalid-file and invalid-signature assertions
remain. No test timeout, skip, expected-failure marker, threshold, workflow, dependency, configuration
or product source was changed. This is an assertion repair, not an exemption from browser testing.

Fresh reviewer `f03_repair_review`, supported by a separate read-only standards worker, reviewed
the complete original/repaired test, renderer, fixture helpers, labels, state transitions, browser
configuration and original hosted artifacts. [REPAIR_REVIEW.md](REPAIR_REVIEW.md) records zero
actionable findings and approves the repair for hosted full/lean qualification. It does not
claim that the repaired browser cases have executed.

| Identity | Value |
| --- | --- |
| Reviewed local repair | `95493e10281f0307c225b088ed29884b857ad168` |
| API-created equivalent repair object | `9dedda1ded9511922a9faa5ee617a01cba245095` |
| Exact repair tree | `fa99439152a436bfc473c1a448c584fd9003d95b` |
| Exact repaired test blob | `c6f9bfcb6af548ba7eb99c6fa053d4575fd8641c` |
| Parent published checkpoint | `976d26ee791836c176431c8a5d0b825486f78caf` |

The GitHub API object has different commit metadata but the identical verified source tree.
Its documentation successor `aae046621f1152911d2a3f3a222b287103e40d47` has tree
`95e96458c7421a85a3012dc27fa37a53d64cf575`, equivalent to local
`21d456e1e8c5ed9f99ec2f8373eb16e1ea377810`. Neither object replaced the canonical branch:
the expected-head update did not apply after a concurrent worker advanced it. The evidence
branch retains these objects as historical ancestry. Do not restore the helper proposal merely
to reproduce its local checks; use the current canonical test for continued qualification.

## Local validation at the historical proposal's test blob

| Check | Actual result | Record |
| --- | --- | --- |
| Typed lint of the changed test | Exit 0, 13.77 seconds | `evidence/repair-lint.json` and `.log` |
| Whole-web typecheck, first attempt | Process killed, exit -9, 33.22 seconds; no diagnostic output | `evidence/repair-web-typecheck.json` and `.log` |
| Whole-web typecheck, bounded retry | Exit 0, 27.02 seconds, 1,024 MiB Node heap | `evidence/repair-web-typecheck-bounded.json` and `.log` |
| Full-profile Playwright collection | Exit 0; all six F03 cases collected | `evidence/repair-collection-full.json` and `.log` |
| Lean-profile Playwright collection | Exit 0; all six F03 cases collected | `evidence/repair-collection-lean.json` and `.log` |

The successful typecheck changed only the heap allowance from 1,280 to 1,024 MiB; source and
typechecking options were unchanged. Collection is not native-browser execution. Existing runtime
and package sources are byte-identical to the previously audited and hosted-tested implementation,
so the expensive cryptographic suite was not needlessly repeated for this test-only correction.

Prepared dependencies and built workspace outputs were copied into the isolated worktree from
the prior exact-runtime-source checkout. Lockfile bytes match. This is reuse of the previously
documented prepared environment, not a new network installation or new package-integrity attestation.

## Adopted concurrent canonical repair

Another authorized worker published `1de98f6c9371010883253450446e6f7294da84fa` before this
worker's guarded update. Its parent is the same `976d26ee` checkpoint; its tree is
`bb171ebd63e38dce3496e3a7e84990c3dd020fc1`. The adopted test blob is
**`085bbccd0ad1d434e8c6f67965d7fbdf1fe72d4f`**. The incoming test and incoming
`docs/handoffs/PR310_MEMO_BROWSER_CHECKS_20261120.md` are preserved byte-for-byte.

The canonical repair uses per-test lazy locators for the exact named review region and exact
full labeled memo text. Global substring zero-count checks cover the confidential memo before
unlock and after a wrong passphrase, request A after B opens, and request B after A reopens.
This preserves the intended assertions and adds the reverse stale-memo check. It changes no
product source, dependencies, configuration, timeouts, skips or workflows. A saved Playwright
locator re-resolves the current review after forget/reopen; it does not retain an old element.

The fresh repair reviewer and its independent standards cross-check separately reviewed this
exact incoming source and reported zero findings. Their separately pinned addendum is in
[REPAIR_REVIEW.md](REPAIR_REVIEW.md). The incoming worker's own validation and its independent
review are recorded in the unchanged incoming handoff. The local command table above remains
pinned to the historical `c6f9` blob; it is not relabeled as a run of `085b`.

The supporting branch `audit/f03-browser-qualification-20261120` consolidates the two
ownership entries and these additional reports while retaining the canonical source exactly.
The canonical feature branch remains the qualification target; a documentation-only evidence
publication must not cancel/restart its live CI or be mistaken for the tested feature head.
Main remains outside this reconciliation.

## Exact-current-head continuation gate

The next worker must inspect PR #310's actual head and find its corresponding CI run. Both full
and lean browser jobs must execute all six F03 fixtures with no F03 skips and complete the
previously unreached wallet, final-check, confidentiality and A-to-B-to-A assertions. Preserve the
existing broader browser cases and profile-specific exclusions. Examine failures before changing
code; do not accept a successful collection or partial fixture as completion.

Record the actual merge checkout, parent/head relationship, tree, profile, result counts and
successful `browser-build.json` artifact identity when available. Verify that the repaired test
blob remains the adopted `085bbccd0ad1d434e8c6f67965d7fbdf1fe72d4f` reviewed in the addendum,
or independently review any later change. The existing CI upload/record steps run only after successful
browser execution. No real-wallet, real-payment, non-Chromium-browser or production-deployment
qualification is inferred from these synthetic Chromium journeys.

At the reconciliation observation, CI run
[44769994546](https://github.com/djshellshoxxx/GhostPay/actions/runs/44769994546) is queued
for canonical head `1de98f6c9371010883253450446e6f7294da84fa`. Its initial `changes` and
`secrets-and-egress` jobs have not started; no repaired-head browser pass is established.
Use the actual current PR head and run state before acting, rather than treating this snapshot
as a live status or rerunning/cancelling work merely because it is queued.

Keep the PR draft while required checks are pending or failing. Update the PR's qualification
summary from actual completed results; a later documentation-only commit must not be presented
as having run CI merely because an earlier source-equivalent checkpoint passed. Main merge and
deployment remain separate task scope.
