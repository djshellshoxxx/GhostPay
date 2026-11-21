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


## Continuation R10 — hosted failure isolation and 453-branch checkpoint (2026-11-21 UTC)

### Confirmed first-child CI defect and isolated fix

- First exact child head `886371cbe9e57be70a60e8230f0df562f8c1ea57` failed [CI 44887854510](https://github.com/djshellshoxxx/GhostPay/actions/runs/44887854510): `e2e (full)` job `136797429943` and `e2e (lean)` job `136797429947` each had **4** Chromium project failures in the **new synthetic test only**, while the other listed CI jobs, including TypeScript/lint/web tests, passed. Failure at `accessibility.spec.ts:47`: the promised negative `assertReflow` test resolved instead of rejecting after toggling the fixture open. This is a failed regression, **not** a passing browser check.
- [Native browser 44887854529](https://github.com/djshellshoxxx/GhostPay/actions/runs/44887854529): Firefox full/lean and WebKit full/lean all failed. WebKit failures include the new synthetic assertion; Firefox continues to show independent Juggler/page-crash failures. The prior WebKit pass on the unmodified parent cannot be attributed to this child.
- New commit **`b28b817d4f111c2a04ac5cf59af77127f1478ac6`** updates only `apps/web/e2e/accessibility.spec.ts`. It creates a separate blank Playwright page for the synthetic layout fixture instead of replacing the actively running app page from `beforeEach`; ensures the input is visibly open and wider than 320px before expecting the reflow rejection; ensures the summary button is visible; and closes the probe page in `finally`. The original live-app page remains intact for afterEach evidence.
- Separate **local Chromium DOM probe** (installed Chromium binary, *not* the repository E2E suite) confirmed control geometry for the exact standalone HTML fixture: closed `details` -> zero violations; open `details` -> input right edge 908px; closed `details` with 900px summary button -> summary button right edge 900px. This establishes expected fixture geometry, **not** that the new hosted child passes.
- Parent-to-child comparison after the fix: **4 commits ahead / 0 behind**, exactly three paths: the Playwright spec, additive ownership registry, and this handoff. No runtime, custody, contract, package, network, security-policy or release change.
- New head `b28b817d4f111c2a04ac5cf59af77127f1478ac6` started CI, Pages, Beta acceptance, Tor static and native browser runs `44892417468`, `44892417437`, `44892417541`, `44892417423`, `44892417438`, initially **queued**. Exact-head completion and independent review are mandatory before stacking into #373.

### Exact-ref branch reconciliation (453 branches)

- Immutable comparison base `main`: **`eb59d93cffed7848c4aac37d0e9650b87239c6da`**, still identical to the previous R9 base at this checkpoint.
- Exhaustive branch pagination reached terminal empty page: **100/100/100/100/53/0 = 453**. Git matching-ref enumeration returned exactly 453 branch names and SHAs. Against [R9 BRANCH_HEADS](https://github.com/djshellshoxxx/GhostPay/blob/c493df9e210f6227471864a623ee536cc9483a3a/docs/consolidation/20261121-r9/BRANCH_HEADS.json): **446 unchanged names+heads, six added names, one moved head, zero removed**. The full 447-branch exact-main R9 compare remains valid for the 446 unchanged heads; the seven changed/new names were compared to the **same immutable main SHA**:
  - `audit/ghostpay-main-447-census-20261121-r9` @ `c493df9e210f6227471864a623ee536cc9483a3a`: 33 ahead / 0 behind, **33 docs paths only**, ledger work; do not treat as application donor.
  - `automation/20261121T0842Z/bug/payment-uri-query-boundaries` @ `31b943bbc5bc3c3fdd3d1aec0d3fb5fa3d35c8a2`: 13 ahead / 44 behind, **8 paths including 4 payment-URI source/test paths**; owned by existing PR #379, not a separate cherry-pick.
  - `automation/20261121T0900Z/qa/firefox-closed-details-reflow` @ `b28b817d4f111c2a04ac5cf59af77127f1478ac6`: 583 ahead / 0 behind; broad 300-file compare cap because stacked on recovery/browser integration. Recover **only bounded QA child** by comparing with #373 parent, not main.
  - `feature/ghostpay-invoice-timestamp-retention-20261121-5ceb` @ `cfa8131bab9a012cd1ce970f4afa8de23adfdf80`: 577 ahead / 0 behind; **300-file cap**, already owned by PR #383; separate policy and browser qualification required.
  - `integration/ghostpay-autonomous-ledger-20261121-5ceb` @ `80dd9eb9669fba0171a037b0b690d17a7e2b655e`: 1 ahead / 0 behind, **26 docs-only paths**, existing PR #380 ledger.
  - `repair/ghostpay-btc-lifecycle-20261121-5ceb` @ `4fc5c3dceb682067d6ebc7da1759cbeadd20dddf`: 577 ahead / 0 behind; **300-file cap**, owned by PR #382.
  - Moved `qualify/ghostpay-native-browsers-20261121-5ceb`: `22569e2a83e3f8bc3c86982f69bbb1d90ca8356c` → `b660b2d8f3f84ddf72f684d13913f643f33f2eee`; 579 ahead / 0 behind; 300-file cap, owner PR #373. Do not count its shared ancestry as newly unique code.
- All branch classifications are **path/ancestry screening**; 300-file cap and positive-ahead counts cannot establish semantic uniqueness. Do not bulk-merge.

### Cross-PR Tor qualification overlap

- Existing PRs [#382](https://github.com/djshellshoxxx/GhostPay/pull/382) and [#383](https://github.com/djshellshoxxx/GhostPay/pull/383) each passed main CI, Pages, Beta acceptance and Hosting kit, but failed Tor static hosting: [run 44888411159](https://github.com/djshellshoxxx/GhostPay/actions/runs/44888411159) job `136798667266` and [run 44889095031](https://github.com/djshellshoxxx/GhostPay/actions/runs/44889095031) job `136800770473` both time out on `scripts/tor/browser-acceptance.mjs:81` expecting obsolete text `Scan privacy settings saved. They apply to the next scan.`.
- Both heads have script blob **`1f57b2d5a102f398cfc111e349dfc2684d498518`**. Existing parent qualification PR #373 has the already-corrected script blob **`835b8e0c609f4a59a1c856397784a5a406945a22`** using `Network privacy settings saved. Pending network operations were cancelled; start a new action to use these settings.` This is **overlap requiring reconciliation**, not evidence that either child is Tor-qualified. Do not duplicate fixes or import a broad parent without an exact-head combined CI run.
- The generation-11 integration lock was previously reported held by another worker; **do not** modify shared branches or main until ownership and approvals are verified.

### Next bounded action

Recheck #381 exact-head full/lean Chromium plus native Firefox/WebKit. If the isolated fixture is still failing, inspect actual saved Playwright trace/DOM and repair its fixture without disabling geometry assertions. Then integrate qualified #381 → #373 → #372 under the integration owner; independently reconcile #382/#383 Tor fixture dependency, and resume R9 capped-branch semantic work. No merge/deploy/release from this checkpoint.
