# F03 browser qualification repair — independent source review

Reviewer: `f03_repair_review`
Recorded: 2026-11-20 UTC
Standards cross-check: `f03_repair_review/standards_check` (read-only)

## Verdict and reviewed identity

**No actionable source-review finding. Approve this bounded test repair for
hosted full/lean qualification.** The correction matches the existing rendered
memo, preserves exact positive assertions, and repairs an ineffective negative
memo assertion. No further source change is recommended from the evidence
reviewed. Actual repaired-head browser execution remains required.

| Item | Reviewed identity |
| --- | --- |
| Worktree branch | `continuation/f03-browser-qualification-20261120` |
| Base | `976d26ee791836c176431c8a5d0b825486f78caf` |
| Base tree | `91a8610bfd6cb2015f57d7fa32b5dc38d962bdf3` |
| **Reviewed repair commit** | **`95493e10281f0307c225b088ed29884b857ad168`** |
| Repair tree | `fa99439152a436bfc473c1a448c584fd9003d95b` |
| Original test blob | `10e54ccbaebf1e8b520d5b912be45efbf7ec4a68` |
| **Reviewed repaired test blob** | **`c6f9bfcb6af548ba7eb99c6fa053d4575fd8641c`** |
| Changed executable file | `apps/web/e2e/payment-request-file.spec.ts` |

Review began against the uncommitted repair. After the coordinator committed it,
I verified the commit, tree, and unchanged test blob above. The committed diff
from the base contains only the test and the coordinator's additive
`docs/ai/ACTIVE_WORK.md` claim. New round-two reports/evidence are documentation.
No product, dependency, workflow or configuration change is present in the
reviewed repair. A later changed test blob needs follow-up review.

I read the complete original and repaired test, repository instructions and
first ownership claim, the F03 specification, relevant Pay rendering and
import/unlock/forget state transitions, English labels, display sanitization,
invoice helpers, fake manifest preparation, Playwright configuration, and the
browser CI matrix. The following supporting files were unchanged from the
base, verified by their working-file hashes:

| Supporting file | Git blob |
| --- | --- |
| `apps/web/src/views/Pay.tsx` | `197e5f2d69fee42b3fc5d368e22bb4c1581b0540` |
| `apps/web/locales/en.json` | `7250b01ae6d9fcdc9afe351f94a5171233f1833d` |
| `apps/web/e2e/helpers.ts` | `463ecde552e7dd16790053765c879dfd01413c80` |
| `apps/web/playwright.config.ts` | `e936551ec06d0414ba7afe0dc66f9c8fdd038a31` |

## Standards

**Zero documented-standard violations or material code-smell findings.** The
separate standards worker independently reviewed the same repaired test blob
against `AGENTS.md`, `docs/ai/WORKFLOW.md`, and the first active claim.

The small `reviewMemo` helper consolidates the same exact, region-scoped selector
used throughout the affected cases. Its name conveys its purpose and its
repeated use justifies the helper. The change follows the repository's
minimal-change requirement.

Positive memo assertions retain exact matching and visibility checks. The stale
memo assertion retains a zero-count requirement. The pre-unlock memo check now
inspects body text, and the wrong-passphrase path gains the same confidentiality
check. No test is removed, skipped, or marked expected-failure. Network
isolation, wallet probes, storage checks, signature blocking, timeouts, and
thresholds remain unchanged. There is no product, dependency, workflow, or
release behavior change.

The only discovered `CONTRIBUTING.md` belongs to vendored `forge-std` and does
not govern this browser test. The standards worker performed no writes, tests,
staging, commits, remote operations or browser execution.

## Spec and regression review

**Zero missing-repair, scope, or implementation findings.** The repair follows
the active claim's requirement to correct the demonstrated memo-locator defect
without weakening assertions. It supports the F03 specification's explicit
opening, ordinary payment review, passphrase confidentiality, and successive
import behavior.

### The new regional lookup is valid

At `Pay.tsx:1025`, the review is a `section` named by `aria-labelledby="pay-h"`;
its heading uses `pay.title.review`. The English catalog at `en.json:880`
resolves that name to `Review payment`. At `Pay.tsx:1106`, the memo is a paragraph
whose child `strong` contains `pay.memo.label`; `en.json:902` supplies `Memo:`.
The memo itself follows as a text node, so the complete paragraph text is
`Memo: <memo>`. There is no child element containing only the bare memo.

The new helper at `payment-request-file.spec.ts:60` selects that named region
and then the complete exact memo text. The synthetic ASCII memo strings do not
trigger `safeText`'s visible marker suffix. This is consistent with the existing
English fixture vocabulary. The exact regional name prevents a matching memo
elsewhere from satisfying a positive payment-review assertion, while
`toBeVisible()` retains its visibility and uniqueness requirements. The helper
does not use a substring, regular-expression wildcard, `.first()`, or forced
action to conceal a mismatch.

The actual original browser evidence also establishes the region, independently
of the inferred HTML semantics: all eight retained failure contexts identify
`region "Review payment"`, the expected amount, `strong: "Memo:"`, and the
expected memo. See [the investigation](HOSTED_BROWSER.md) and the literal
`artifacts[].contexts[]` excerpts in
[its evidence record](evidence/ci44692101562-browser-evidence.json). I also
compared the memo block with main base `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`;
that renderer block is identical. These failures do not establish a product
memo-rendering defect.

### Positive and negative assertions remain meaningful

The helper repairs all four positive source sites: ordinary/bearer review,
successful passphrase unlock, request B after replacement, and request A after
forget/reopen. The last site had not been reached in the original failing run;
it is repaired now rather than left with the same latent mismatch.

The stale request-A check uses the exact full memo text with `toHaveCount(0)`
inside the review region. The immediately preceding exact, visible request-B
assertion establishes that the region exists and contains the replacement
invoice; absence cannot pass merely because the test never opened a review.
This is an assertion about the active review's signed terms. It is not claimed
as a document-wide absence guarantee.

The confidentiality checks intentionally inspect the whole body's text at
`payment-request-file.spec.ts:119` and `:126`. They reject the confidential memo
whether it appears bare or prefixed by a label, without depending on the review
region existing. The first follows the visible passphrase-required preview;
the second follows completion of the wrong-passphrase attempt. The earlier
bare exact negative could pass with a labeled memo present. Replacing it and
adding the wrong-passphrase check strengthens the intended boundary. These
checks concern document text at those assertion boundaries; they do not claim
continuous observation or inspection of JavaScript memory or form attributes.

All pre-existing wrapper identity, file-passphrase exclusion, amount, URL,
storage, request, wallet, invalid-file retry, and invalid-signature assertions
remain. The six fixtures and profile applicability remain unchanged. Existing
timeout values and browser configuration are untouched.

## What still needs actual repaired-head execution

The original run `44692101562` checked out merge commit
`18c2806e70bb9f1af05edc293e9350bd9c638f2f`, whose tree equals the base tree above.
The investigator's retained logs show six F03 cases executed per profile:
two passed and four failed at bare exact memo lookups. This review inspected
that retained evidence; it did not independently redownload the ZIPs or query
GitHub. Artifact retrieval and digest verification belong to the named
investigator lane.

Passing an earlier statement in a failed fixture does not qualify its remaining
statements. The following repaired boundaries must execute in both profiles:

| Fixture | Repaired or previously unreached checks |
| --- | --- |
| Plain and bearer-encrypted | Exact full memo; post-open wallet snapshot equality; absence of the final-wallet-check heading. |
| Passphrase | Effective body-wide memo absence before unlock and after wrong passphrase; exact full memo after correct unlock; final empty wallet-methods list. |
| Successive requests | Exact request-B memo; no request-A memo in that review; forget/reopen of request A; original amount and exact memo; final unchanged URL and empty wallet-methods list. |

The unchanged invalid-replacement and corrupted-signature fixtures completed in
the original run, but both should remain included in the six-case qualification
at the repaired head. The source review found no definite latent blocker in
the later assertions or their corresponding import/unlock/forget transitions.
Their actual outcomes remain unknown until execution; source approval must not
be reported as six passing browser cases.

The unchanged configuration runs this file in the desktop Chromium project for
both `full` and `lean`; device projects select other specifications. This repair
does not establish real-wallet, real-payment, WebKit, Firefox or real-device
qualification. No such expansion is needed for this bounded repair.

## Verification performed by this reviewer

Read-only commands included `git show`, `git diff` from the pinned base,
`git rev-parse`, `git hash-object`, `git status`, and bounded source/evidence
reads. `git diff --check -- apps/web/e2e/payment-request-file.spec.ts` exited 0
with no whitespace errors. A final memo-selector scan found no remaining bare
memo locator in this file; the remaining bare `Synthetic confidential item`
lookups target the separately rendered line-item cell.

No browser suite, build, lint, typecheck, test collection, dependency operation,
staging, commit, push, merge or deployment was performed by this reviewer.
Coordinator-owned validation and hosted results should be recorded separately
with their own source identities. This lane wrote only this report.

**Standards findings: 0. Spec/regression findings: 0. No source-review blocker
for commit `95493e10281f0307c225b088ed29884b857ad168` and test blob
`c6f9bfcb6af548ba7eb99c6fa053d4575fd8641c`; actual full/lean browser qualification
remains the next gate.**
