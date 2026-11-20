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
