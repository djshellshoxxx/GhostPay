# GhostPay BUG-ONLY R11: CSV column descriptor validation (2026-11-23 UTC)

## Scope and source pins
- Repository: https://github.com/djshellshoxxx/GhostPay
- PR: https://github.com/djshellshoxxx/GhostPay/pull/490 (**draft, do not merge**).
- Exact default-branch `main` at discovery: `eb59d93cffed7848c4aac37d0e9650b87239c6da` (2026-11-21 merge).
- Isolated branch: `automation/20261123/bug/export-column-holes-r11`.
- Additive work claim before implementation: `df773c21a2e6951e71ef26741e614c340b09513b`.
- **Test-first regression commit:** `625466be2a177f2c5de0eac8331fc1b4f0711d43`.
- Minimal production repair commit: `2474c6bc1d924990b00b06cf8d261f5887d8ad89`.
- Source `packages/ux-export/src/types.ts`: original blob `c1dcf159c65e6dff5d1225ea540b1211f3af2092`, repaired blob `85f1e02d592a5a5579538e87be83a7b5ebc184e8`.
- Files: `packages/ux-export/src/types.ts`, new `packages/ux-export/src/types.column-spec.runtime.test.ts`, additive `docs/ai/ACTIVE_WORK.md` claim, this source-pinned handoff.

## Confirmed existing failure
`resolveColumns()` used `specs.map()` on untrusted runtime column lists. A sparse three-element list with index 1 absent skips that validator call, silently returns a sparse `ResolvedColumn[]`, and can produce CSV output with an unnamed/missing header/data cell rather than `ExportError('INVALID_OPTION')`. Null/undefined descriptors and a missing/null header could raise raw `TypeError`; a numeric header could be accepted. These are deviations from the documented strict `resolveColumns` validation and `ExportError` contract.

## Regression before fix, repair and verification
- Regression added *first* under dedicated test path, checking sparse arrays, null and malformed descriptors, wrong runtime collection types, valid dense ordering/custom headers and CSV header formatting; no pre-existing test files touched.
- Fix: reject non-array collections, enumerate **every** slot with `Array.from(specs, callback)` (unlike `Array.map`, holes reach the validator), reject malformed descriptors with `INVALID_OPTION`, and require a real string header of 1..64 UTF-16 units. Valid dense columns retain their order and meaning.
- Actual source-blob-matched isolated V8 execution: extracted the unmodified `resolveColumns()` body from GitHub's exact before/after file blobs, erased only TypeScript-specific declarations, and supplied identical `ALL_COLUMNS` and `ExportError`. Thirteen directed checks: **before 5/13 passed (8 failed); after 13/13 passed**. All ten malformed cases rejected after repair; three neighboring dense/invalid-baseline cases unchanged.
- This is a **function-level source-matched V8 replay only**; not repository Vitest, Node unit suite, TypeScript project typecheck, lint, build, or native browser execution. The committed Vitest regression is for hosted CI execution.
- Regression-only head `625466be2a177f2c5de0eac8331fc1b4f0711d43` launched five workflows which were **cancelled when superseded** by repair commit; do not call those jobs a hosted red regression.
- Repair head `2474c6bc1d924990b00b06cf8d261f5887d8ad89` launched CI run `45100421011`, Pages `45100420963`, Beta acceptance `45100421021`, Hosting kit `45100420955`, and CLI qualification `45100420958`. At the documented pre-handoff checkpoint, Hosting kit's two jobs were green, CI had eight passing and 14 running, Pages one passing/one running/one skipped, Beta one running, CLI three running, **zero failed then**. These checks must be re-verified against the **final PR head after this handoff commit** and any subsequent repair.
- No independent reviewer was available or recorded; no approval is claimed.

## Ownership, other workers and integration
- Queried all 248 previously open PR changed-file inventories (including broad integration #238/#246/#262/#264/#278/#302/#307); no pre-existing PR changed either isolated production or dedicated regression test path. Export PRs #415, #444, #467, #483 own other files; avoid them.
- Rechecked PR #390 exact head `b655bc273a6704c9c140287b8adcdf4085b91882`: the CI, Hosting kit, Pages, Beta acceptance and CLI qualification workflows all concluded success; Snyk status success; **zero submitted independent GitHub reviews**. PR #390 is currently **ready for review**, not draft. The owner branch was left untouched.
- The integration metadata branch `automation/ghostpay-integration-lock` at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` has `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`: status **held**, owner `994a0d214fb9-root-r3`, generation 11. No lease takeover or shared-branch edit.
- No consolidation, feature development, dependency changes, fund/contract use, real-world traffic attack, deployment, or release occurred.

## Outstanding gates / next worker
1. Read the **new exact PR head** after this handoff commit, fetch its five hosted workflows and failed-job logs; fix genuine CI failures only on this owned branch, with a new regression for any fresh defect.
2. Require native browser verification where applicable to Pages, project Vitest/lint/typecheck/build, CI and security checks all GREEN on that **same exact head**; do not infer results from superseded SHAs.
3. Obtain genuinely independent review; reconcile current main, file ownership and dependency PRs before any integration attempt. Request integration lease release/legitimate ownership, do not self-takeover. Leave #490 draft until all gates are met.
4. Subsequent BUG-ONLY rounds should rotate to a separate genuinely unowned existing-functionality defect and avoid these owned paths.
