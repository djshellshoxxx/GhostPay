# Selected receipt and bill print isolation — 2026-11-20 continuation

This continuation supersedes the CSS-only implementation and its qualification
status below. It preserves the original PR #316 history and repairs GP-BUG-02
from audit #312 on the same main baseline.

## Source and scope

- Starting PR #316: `56b76e8fbae0aa0d3e9c9394616d4aa600d70fb7`.
- Main at task start: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Pre-publication main reconciliation: `aa3df1cb37274fae73af0ca957183c15c51b62d3`.
  Main added separately reviewed QR/profile/privacy/payment-URI changes. No product
  file in this print repair overlapped; the sole registry conflict was resolved by
  preserving both sets of additive claims and the entire shared base verbatim.
- Local task branch: `fix/receipt-print-isolation-312-20261120`.
- Independent workers: `print_isolation_review` (source review) and
  `print_regressions` (hook and browser regression author).
- Existing source-head CI, Pages, Beta acceptance and Hosting kit were observed
  green before this continuation. Those results do not qualify changed source.

## Why the earlier CSS-only repair was insufficient

The initial `:has(.bill-sheet)` repair restored every `.receipt-print` when no bill
was mounted. Scan renders a receipt panel for each verified payment, so signing
several receipts made them all printable and positioned them over one another.
A real two-panel component regression fails on the original PR #316 source:
clicking the second receipt's print button does not select that receipt.

## Resulting behavior

- A shared `usePrintTarget` hook marks the actual selected document before invoking
  `window.print()`. Both receipt and bill buttons use it; document contents are not
  copied, persisted or sent anywhere.
- One common print stylesheet hides unselected elements and reveals only the
  selected document and its descendants. The conflicting `app.css` print block is
  removed. Bill printing no longer takes implicit priority over receipt printing.
- Multiple signed receipts remain independently printable. Printing without a
  selected document reveals no receipt or bill; use the document's print button.
- Receipt JSON/fields/actions, QR actions and enlarged QR overlays are excluded.
  Existing secret-QR exclusions and ordinary screen styles are preserved. The
  selected receipt layout has enough specificity to keep black text on white with
  no border regardless of stylesheet order; browser fixtures check these values.
- `afterprint` (including cancellation), synchronous print failures, ref replacement
  and unmount revoke the marker and listener. A nonblocking return from `print()`
  keeps selection until completion; repeat requests for the same active document
  are ignored. Switching documents first revokes the previous selection.

## Executed verification

- Pinned dependencies installed without changing manifests or the lockfile:
  Vitest 5.0.5, Playwright 1.64.1, TypeScript 5.9.3 and React 19.3.1.
- Seven focused suites passed: **53 tests**, covering the new eight lifecycle
  cases, real multi-receipt button wiring, printable bills, invoice binding,
  build-profile behavior, archive behavior and translated receipts.
  Command (from `apps/web`):
  `../../node_modules/.bin/vitest run src/lib/usePrintTarget.test.tsx src/components/PrintableBill.test.tsx src/components/ReceiptPanel.test.tsx src/components/ReceiptPanel.invoice.test.tsx src/components/ReceiptPanel.profile.test.tsx src/components/ReceiptPanel.archive.test.tsx src/components/ReceiptPanel.i18n.test.tsx --maxWorkers=1`.
- The same multi-receipt regression was run in an isolated worktree at the original
  PR #316 head and **failed as expected** (one failed, five unrelated tests skipped).
- Typed ESLint passed for all seven changed TypeScript/TSX source and test files.
- Lean Vite compilation and the 17-file bundle scan passed. This independently
  verifies static bundling, not the locally terminated full-web TypeScript gate.
- The repository committed-secret scan passed.
- Playwright discovered **14 print-media fixtures**: both stylesheet orders,
  either selected receipt among multiple documents, bill-only and bill-exclusive,
  no-target behavior, normal screen rendering, and sensitive/control exclusions.
  Discovery is not a browser execution result.
- Independent source review found no blocking regression in the five product
  blobs listed below. `git diff --check` passed.

| Reviewed product file | Git blob |
| --- | --- |
| `apps/web/src/lib/usePrintTarget.ts` | `38b127b71d71597847c82a5e0f1cd96ed9a0b3bc` |
| `apps/web/src/components/PrintableBill.tsx` | `946f38f0d2c8b31c9f5b58309eab726ad23b1989` |
| `apps/web/src/components/ReceiptPanel.tsx` | `1f0e967c587bfb36e191962bc1473351da9d4e3c` |
| `apps/web/src/styles/print.css` | `ae75e16e8cb78c604e9f2c06feaf52edf0acc5e7` |
| `apps/web/src/styles/app.css` | `073bdae58e1af0a31a5e2d1a428516de4adc3c0c` |

## Qualification boundary

Local Chromium could not start because the environment denies its singleton
socket. No local browser render or physical print result is claimed. A full-web
TypeScript/build attempt was terminated with exit 137; this is not a passed gate.
The expanded browser matrix and final source need the unchanged hosted full/lean
browser, typecheck, lint, build and repository CI checks. Preserve the PR as draft
until those checks finish. No main merge or deployment is part of this repair.

---

## Original CSS-only cycle record (historical)

# Receipt versus bill print-target isolation — 2026-11-20

## Exact source and ownership

- Cycle: `20261120T1241Z`, one sequential coordinator/implementer; no separate native worker/verifier.
- Branch: `automation/20261120T1241Z/bug/receipt-print-css` from main `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. Main was refreshed immediately before the claim.
- Audit origin: [GP-BUG-02](https://github.com/djshellshoxxx/GhostPay/pull/312), source-confirmed independently by its original auditor. This cycle did not reproduce a physical print in a browser.
- Source blobs on base: `apps/web/src/styles/print.css` `5c803193b91431c4dd96f6421ae41b5e92740046`; `apps/web/src/styles/app.css` `a1951f57c00346323b6306c3af46867dae6d6262`. The same bill stylesheet is eagerly imported from Pay, while receipt markup lives in ReceiptPanel.
- Ownership: `docs/ai/ACTIVE_WORK.md`, `apps/web/src/styles/print.css`, new `apps/web/e2e/print-targets.spec.ts`, and this handoff. No contracts, signing, deployment configuration, dependency or application flow changes.

## Defect and repair

The bill stylesheet applies `body * { visibility: hidden !important }` under print media and restores visibility only for `.bill-sheet`. The receipt stylesheet attempts `.receipt-print { visibility: visible }` without `!important`; the global hide wins. A receipt's Print action calls `window.print()` but the document can be invisible.

The repair adds a narrowly scoped, important receipt visibility override inside the existing print-media block **only if no `.bill-sheet` is mounted**. PrintableBill mounts the bill only while that print action is active, so a bill remains exclusive even if a signed receipt is elsewhere in the DOM. The global important hide for the rest of the app and the existing receipt action/JSON display restrictions remain intact. This uses CSS relational `:has()` supported by current Chromium/Firefox/Safari families; legacy-browser print compatibility was not measured.

- Claim commit: `88afe1020ddf7a61124f6c9c6a264ab2596c8bbf`.
- Test-first commit: `1a5625082408871cc895cee82638e2c56ea67856`.
- Runtime fix: `876f12438bc3b01b6149c009cc9e49c2f8e7674b`, exact new CSS blob `51796c6ef32305b4b0b62ec8118cad6a0d4d6d45`.
- Test follow-up: `1a7f06aff7969abf54c9e1163e6d3688f12a0a02`, test blob `8fae40faca6473f5a7f209af3b9a9da79a1d1c40`.

## Executed checks

- Repository source fetched directly via authenticated GitHub. Source-level cascade reproduction: global `!important` hide and lower-priority receipt override independently match their pinned base blobs. Eight exact-source static selector/policy assertions passed against the final source/tests. These checks are not a browser test.
- An exact reconstructed copy of the new CSS was parsed with locally installed PostCSS 8.5.6: **PASS**, ten rules inside print media, required important visibility declarations present. `git hash-object` of that parsed file is `51796c6ef32305b4b0b62ec8118cad6a0d4d6d45`, identical to the GitHub production CSS blob.
- Six Playwright print-media fixture cases are authored (receipt-only, bill-only, and both targets, each in both stylesheet orders). They load the real two stylesheets and check computed visibility, actions/JSON and unrelated controls. **They were not executed locally.**
- Local GitHub clone failed `Could not resolve host: github.com`. Chromium headless smoke startup failed/timed out before DOM verification. No repository `npm ci`, Vitest, lint, TypeScript or actual browser print test pass is claimed.
- No independent reviewer was available in this invocation. A self-check is not an independent approval.

## Next cycle and blockers

1. Inspect this PR's exact final head and run all six Playwright tests with the repository's pinned browser toolchain on hosted CI, both regular/full and lean profiles. Inspect the original CSS output and actual print path if a suitable browser environment is available.
2. Complete full hosted CI, typecheck/lint, Pages, security checks, and independent reviewer qualification. Resolve any real failures without changing gates.
3. Recheck all open PRs including #278, #293, #306/#307, #314/#315 and the integration metadata lock before promotion. The latest lock state read in this cycle was **released, generation 7**, ref commit `93b50a03fea1f22ff9dc403099ce1eb09635299c`. This cycle did not acquire it.
4. Inspect Pages/main triggers and exact-source security gates before any eligible protected integration. This draft must not be merged on this handoff alone.

No production deployment, main merge, publication, fee activation, real-funds action, branch deletion, force-push or security waiver occurred.
