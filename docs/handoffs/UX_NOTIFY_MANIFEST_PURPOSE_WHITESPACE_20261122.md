# GhostPay BUG-ONLY handoff — PWA manifest icon purpose whitespace

**Cycle:** 2026-11-22 UTC. **Task:** Accept otherwise-valid ASCII whitespace between existing web manifest icon `purpose` keywords, without expanding supported keywords.

## Source and ownership pins

- Repository: `djshellshoxxx/GhostPay`; starting live `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated task branch: `automation/20261122/bug/ux-notify-manifest-purpose-whitespace`. No source from a donor branch was merged.
- Pre-fix `packages/ux-notify/src/manifest.ts` Git blob: `a92288f2b1de35bbbbe26cb4695fcb7b6b747c17`; repaired blob: `3a9fcaddcab53f3d672d96451ff8ed3442bf264c`.
- Failing-regression test path: `packages/ux-notify/src/manifest.purpose-whitespace.test.ts`, Git blob `115ef171cac24ea14432447d8ba3e967d1511faf`.
- Additive ACTIVE_WORK ownership-claim commit: `de4ff4f14985695e19523f9033b5f6fb1a2f4d0c`.
- **Regression committed before source fix:** `d963c5528c9a8868d153498c8014772ad6370759`.
- **Minimal source fix commit:** `07151a3774291912fbb89ab160e1f072d9618300`. No existing test files or unowned production files changed.
- Ownership: read R30's [source-pinned full 196-open-PR inventory](https://github.com/djshellshoxxx/GhostPay/blob/745004a16dbb712a1085d3e7377d9abe951e9599/docs/consolidation/20261122-r30/OPEN_PRS.json), and independently queried GitHub's changed-file inventory for **all 196** PRs with zero failures. No PR changed either owned manifest source or the new regression path; current additional #438 is documentation-only. #409 owns separate cache policy files and #433 owns separate redaction files. Snapshot ownership can change; recheck at integration.

## Concrete defect and reproduction

The existing `checkIcons` parser used `purpose.split(' ')` even though Web App Manifest `purpose` is a space-separated keyword list using ASCII whitespace. For `purpose: 'maskable  any'`, the pre-fix parser yielded `['maskable', '', 'any']` and incorrectly flagged `icons[2].purpose:icon_purpose`. It also rejected tab, CR/LF and form-feed separators, preventing valid manifests from passing the existing validator.

The test-first regression covers seven valid variants (repeated, leading/trailing, tab, LF, CRLF, form-feed, single ASCII space) and five invalid variants (empty string, whitespace-only, unknown keyword, non-ASCII NBSP separator). A source-equivalent Node.js control-flow replay gave **six failures among seven valid cases before** the fix; it gave **12/12 passing cases after** the one-line fix. This replay is **not a native repository Vitest run**. The exact pre-/post-fix lines were checked against the GitHub source blobs named above; no browser, deployment, network traffic or wallet execution was attempted.

Repair: tokenize with `/[\\t\\n\\f\\r ]+/` and discard empty tokens before the existing allowed-keyword validation. Valid keywords and required sizes, file extensions, origins and other manifest constraints are unchanged.

## Qualification and handoff

- Local checkout and native Vitest/lint/typecheck/browser runs: **not executed**; repository checkout was inaccessible from the local runtime. Hosted exact-PR-head GitHub CI, lint/typecheck, package Vitest, static Pages/beta/hosting and independent review remain required; record their actual run IDs/conclusions before integration.
- PR #390 still has head `b655bc273a6704c9c140287b8adcdf4085b91882`: five exact-head workflow groups passed (CI 44898786362, Hosting 44898786427, Pages 44898786411, Beta acceptance 44898786416, CLI 44898786403), no GitHub review recorded. No unrelated code changes there.
- Existing isolated PR #437 head `9e72c9820ed457f18c2635e17da629216eedbbdf`: five exact-head workflows passed (CI 44980936442, Hosting 44980936411, Pages 44980936446, Beta 44980936400, CLI 44980936478), no independent GitHub review recorded.
- Integration lock: generation 11 remains held by another coordinator, as reported in current [R30](https://github.com/djshellshoxxx/GhostPay/pull/438) and authoritative [coordination PR #380](https://github.com/djshellshoxxx/GhostPay/pull/380). **No main merge, release or takeover.** Independent source review must be performed by a genuinely different reviewer, not this sequential coordinator.
- Future worker: inspect exact PR head and new Actions/reviews; repair actual CI errors only on this owned branch after ownership recheck; rerun exact-head tests/browser as applicable, verify reviewer approval and integration lock release before any merge. Once qualified, rotate to a different, unclaimed existing functionality bug; do not broaden this PR.
