# GhostPay R66 — security-status provenance repair and untruncated source triage

Checked UTC: 2026-11-23T14:12:27.361Z. Protected main observed `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. R65 predecessor PR #471 head `8a23a8e20266bb797bb61707b8dd315b9ae4235d`; R65 CI run [45181771633](https://github.com/djshellshoxxx/GhostPay/actions/runs/45181771633) finished **successfully** on precisely that SHA. No new source has reached protected main in this worker cycle.

## Actual code engineering on existing draft PR #471

A cross-checkpoint ledger can retain an unresolved P0 finding in `evidence` while silently changing the visible `disposition` from `unsafe-p0-refund-absence-proof` to generic `unresolved-review-required` with unchanged SHA, counts, ownership and evidence. The R65 validator preserved evidence but did not guard that nonfinal high-risk disposition rewrite. This is a provenance-integrity defect, not a demonstrated exploitable payment flow.

- Test-first commit: `0260523dae7de314bbdd0c741c0e252251d75c5b`, modifying only `scripts/tests/consolidation-ledger.test.mjs` (blob `b4d8dd1cbd907ef99b9f5779b91a8fd9fa4a14e5`).
- Implementation commit: `29cc36669c80233caebfba927e5c5d90f645edf3`, modifying only `scripts/consolidation/validate-ledger.mjs` (blob `c21b2ad8f0088934c4d8c5cf219c37a7f318619e`).
- When a previously unresolved/unsafe/P0/blocked donor is relabeled, the validator now requires append-only `evidence.riskDispositionReview` containing both old and new classifications, current immutable SHA, comparison SHA, source proof and nonempty assessment. Otherwise the transition rejects it. Normal non-risk pending-to-eligible progression is not arbitrarily blocked. Existing evidence retention still applies.
- GitHub Actions on the code-fix exact head was **in progress** at earlier inspection. Do not count new regression tests, native Node, full application, browser or security suites as passed until exact-head evidence is available. The first test-only commit triggered workflows separately; the CI workflow was superseded/cancelled before a recorded RED run. Regression-first authoring, not a successful RED test execution, is claimed.

## Untruncated historical donor/tree comparison

Using the live Git-object API and `recursive=1`, inspected immutable complete trees (**all returned `truncated=false`**):

| Tree | Commit | Tree SHA | Blobs |
|---|---|---|---:|
| Clipboard qualification PR #297 | `04910f65dc0268e415c4b1a44e83264272f0bf` | `352654f24314d8d396ec583397f6ff568d6f8217` | 4,895 |
| Historical coordinator qualification/evidence | `52122f8b7076b2636d47f59f8bb607b189d3ab39` | `747652a3dc66013956ee987ce0a5afdce93e3d07` | 4,952 |
| Protected main | `8ddb344973e80b8e1eda6821e970ee6a2b808b29` | `e24909bd48515b76bd4110cea90f3a5ac95b239d` | 3,987 |
| Composite C1 PR #504 | `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1` | `2e069f2b5695ce0ce0d8cc92cbdfe8cdc35eecda` | 4,220 |

Between the first two historical donors, **4,882 common paths have identical blob SHA**. The clipboard donor has **13 paths that differ or are absent** in the qualification donor; the qualification donor has 61 paths absent from the clipboard donor (chiefly dated audit/CI artifacts). The differences contain real executable source/test variants, so **neither historical branch is finalized or marked main-integrated**. Specific examples:

- `apps/web/src/lib/clipboardPrivacy.ts`, blob `5e55f2ca693ef3112e8d12409572b29d96ef86a8`, and `clipboardPrivacy.test.ts`, blob `9a3c70863ea0373a6cd9bb6adf9960116cfd4c2d`, exist in the clipboard donor but not in the comparison donor or protected main. The implementation is a best-effort, optional, generation-guarded clipboard cleanup (not an atomic OS clipboard compare-and-swap).
- Clipboard donor `Common.tsx` blob `6d83d05d31ce3812f3ac9faebdea994a491bf188`, whereas qualification donor `Common.tsx` blob `71b607b3e92f583b6bc784c7ec929567dd6f75da` **matches protected main exactly**. Recovering the clipboard module without its vetted integration and current UI compatibility would not establish completed beta functionality.
- The donor `qrKinds.ts` blob `68de6518783cc57bd7f3a66d0588d530e27d21b6` matches main, while qualification donor `qrKinds.ts` blob `a85e1011cdface74c87683146ff7428654b7830d` differs. Do not blanket select either tree.
- PR #297 has relevant test/CI failures: run [44653818354](https://github.com/djshellshoxxx/GhostPay/actions/runs/44653818354) failed web unit, full/lean browser and aggregate jobs. The owner reports Settings/persistence/translation/end-user activation incomplete. Keep PR #297 and parent #293 owner-held and unmerged.

## Source-pinned payment-safety integration opportunities, still blocked

- Invoice jitter rollback donor PR [#274](https://github.com/djshellshoxxx/GhostPay/pull/274) exact head `a4c6f945adef0438bfd0b347fb7c11057e3973ce`: `jitter.ts` blob `9845576adfb522c17db145b1772276f66523180c` adds monotonic elapsed-time expiry floor and nonfinite clock guards. Current main **and C1** retain older blob `f4d6fefe892130d70bfa9cea5113f611ccea8b02`. PR #274 is draft, no exact-head workflows returned, and no GitHub reviews. Preserve owner and require tests/review.
- Strict invoice base64url donor PR [#289](https://github.com/djshellshoxxx/GhostPay/pull/289) exact head `856b2d60fd38eabb8a1c856c95ad82f1c7d30c64`: source blob `5466ee0b99925dedd23e753636ae7ab3f6f48234` adds runtime string-type rejection; main and C1 still have older blob `eb7b8723f4a3b80a6ce457012636a5b29e1f8ccb`. Hosted [CI 44631965189](https://github.com/djshellshoxxx/GhostPay/actions/runs/44631965189) failed ts-lint and dependent typescript aggregate. Exact lint failure `base64url.test.ts:36:33`: unused `_index` parameter, `@typescript-eslint/no-unused-vars`. Owner was notified in [comment 7103622579](https://github.com/djshellshoxxx/GhostPay/pull/289#issuecomment-7103622579), with proposed narrow test-only repair. Do not overwrite owner-held code or pretend source is merged.

Source findings are additive. No payment code was modified, no main merge occurred, and no deployment, real funds, forced ref update or branch deletion was performed. Independent reviews, exact-head CI and browser/payment-security gates are mandatory before integration.
