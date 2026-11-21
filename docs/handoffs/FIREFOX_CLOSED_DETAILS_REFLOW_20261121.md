# Native Firefox closed-disclosure reflow qualification handoff — 2026-11-21 UTC

## Frozen source and ownership
- Repository: `djshellshoxxx/GhostPay`.
- Original parent: PR [#373](https://github.com/djshellshoxxx/GhostPay/pull/373) exact head `b660b2d8f3f84ddf72f684d13913f643f33f2eee` at branch creation. It is a child of #372 and remains draft.
- Baseline `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da`, reconfirmed before publication.
- Isolated QA branch `automation/20261121T0900Z/qa/firefox-closed-details-reflow`.
- Ownership claim `5e44dcf2ac4ef9c08c8992b5e2f8b772b4d06051` in `docs/ai/ACTIVE_WORK.md`.
- Regression and test helper correction `94adcbbdae36a43de49e0979ed0f2da79d50bacb` in `apps/web/e2e/accessibility.spec.ts`; resulting blob `34c8301adde6348cc9f8855d11249f639f9496a6`.
- No application, cryptographic, contract, payment, custody, dependency, or deployment files changed.

## Observed hosted evidence (not claims of successful qualification)
[Native browser run 44885795475](https://github.com/djshellshoxxx/GhostPay/actions/runs/44885795475):
- Job `136790671588` WebKit full: **success**; job `136790671848` WebKit lean: **success**.
- Job `136790671725` Firefox full: **failure**, nine failed cases; job `136790671922` Firefox lean: **failure**, seven failed cases.
- Full Firefox failed a real assertion at `apps/web/e2e/accessibility.spec.ts:32`: at `Home-100percent-320px`, `main input` was reported with bounding x=[33,959] outside a 320px viewport, despite document scroll width being within bounds. The home view itself has no input; an always-mounted merchant-profile prelude renders a text input within a `<details>` that is closed when the search URL is empty. It is a **plausible**, not proven, visibility-detection false positive. Do not claim the root cause is verified without an exact-head hosted run and browser inspection.
- Other Firefox failures include browser page crashes, `Script terminated by timeout`, and Playwright Juggler errors. They remain **open**, independent of this reflow adjustment; no test threshold was waived and no failure was ignored. WebKit passes do not qualify Firefox.

## Bounded change and regression
- The reflow helper already excluded elements with zero client rects. It now additionally ignores descendants of a closed `<details>` that are outside that element's exposed direct `<summary>`; this models noninteractive, nonpainted disclosure bodies even if a browser reports nonzero bounding rectangles.
- It continues inspecting visible/opened buttons, inputs, selects, textareas, and summaries and continues checking document horizontal scrolling.
- Added a deterministic synthetic 320px browser regression: a 900px input in a closed `<details>` must not be counted; the *same input when the disclosure opens* must trigger a control-out-of-viewport assertion; a wide button in a still-visible summary must also trigger the assertion. This guards against broad exclusions accidentally concealing a real layout failure.
- No product styling was changed without proving a genuine CSS defect. No test was deleted/skipped; no retry, timeout, or CI gate weakening.

## Qualification limits and next gates
- This execution environment cannot clone GitHub over DNS; no local Playwright, TypeScript, lint, native Firefox, or browser regression execution was performed. No local test pass is claimed.
- Require exact-head CI plus native Firefox full/lean and WebKit full/lean jobs on the child. If the home reflow assertion persists, inspect the captured element's closed-disclosure ancestry and computed layout, then repair genuine visible overflow in production CSS under separately reconciled ownership.
- Analyze remaining native Firefox crashes using retained [artifact logs and traces](https://github.com/djshellshoxxx/GhostPay/actions/runs/44885795475), preserving the original test count and all payment/recovery assertions.
- Integrate the child into parent #373 only with independent review and required checks. Parent #373 must then requalify against #372; any downstream main merge requires lock-owner release, protected-branch approvals and current-head checks.
- Separate consolidation R9 source [PR #378](https://github.com/djshellshoxxx/GhostPay/pull/378) froze 447 branch heads and an exhaustive exact-main diff. A subsequent fresh terminal pagination counted **450** (100/100/100/100/50/0). Three newly named branches compared against the same unchanged main: `audit/ghostpay-main-447-census-20261121-r9` (33 ahead, docs only); `automation/20261121T0842Z/bug/payment-uri-query-boundaries` (13 ahead/44 behind, 8 files, owned by PR #379); `integration/ghostpay-autonomous-ledger-20261121-5ceb` (1 ahead/0 behind, 26 ledger files, owned by PR #380). The remaining 447 names were *not individually rechecked for head movement during this incremental run*: re-fetch their pinned heads before reuse.
- Integration lock `automation/ghostpay-integration-lock:integration-lock.json` observed **held**, generation **11**, owner `994a0d214fb9-root-r3`. Expired timestamp is not proof of release; no mainline merge or shared-lock mutation.

This is a qualification candidate, not a completed Firefox fix, application release, or security sign-off.
