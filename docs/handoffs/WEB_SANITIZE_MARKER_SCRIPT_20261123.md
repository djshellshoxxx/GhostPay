# Web SafeText: generated markers must not trigger mixed-script warnings — 2026-11-23

## Source and ownership

- Main verified twice: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.
- Isolated branch: `automation/20261123-r11/bug/sanitize-marker-mixed-script`.
- Ownership claim: `a5f80abef422688b2a8cc02c9b12804cd0a2bf99`.
- Regression-first commit: `acbdaae4bec40ddc5747cb80ec59d9c778f14872`.
- Production repair: `c7f4cf2cdf74a002afed5a9e7a361323cc1f6642`.
- Source: `apps/web/src/lib/sanitize.ts` base blob `e5c281aa7f8105b71ef93ea407e8dfa454892317`; repair blob `ad29c5812951ff8a7500fcdad47f00c771fa4cca`.
- New regression: `apps/web/src/lib/sanitize.marker-script.test.ts`. Existing hardening and component tests untouched.
- Actual open PR inventory: REST pulls pages 1–4 (100, 100, 83, 0), 283 open through #528. All 283 changed-file inventories checked in bounded batches; no path beginning apps/web/src/lib/sanitize. in those inventories. The complete main ACTIVE_WORK file had no claim on sanitize.ts or sanitize.*. Main and latest PR number rechecked just before branch creation. Recheck ownership again before integration.

## Observed failure and minimal repair

The documented mixedScript field describes a word containing Latin and Cyrillic or Greek letters. The production helper classified the expanded display text, which introduces ASCII U and hex digits/letters in the markers. Greek-only or Cyrillic-only input containing an escaped code point can thus receive a false lookalike warning. Common.tsx SafeText consumes the field directly and displays the localized mixed-script explanation when true. This is distinct from displayText.ts and its #390/#419/#422 owners.

Example: input Greek alpha/beta, U+200B, Greek gamma renders as αβ⟨U+200B⟩γ with replaced=1. Baseline mixedScript=true; expected and repaired false. The repair changes only the classification source from rendered text to original input, keeping the exact tokenization regex, marker substitution and counts. Genuine mixed-script warnings remain.

## Executed verification

Node 22.16.0, TypeScript 5.8.3. Reconstructed the complete dependency-free source from the GitHub blob and independently ran git hash-object on both source versions; hashes above matched. Compiled each with `tsc --target es2022 --module commonjs --strict --outDir out sanitize.ts` and executed Node assert/strict against the compiled module (not repository Vitest). Baseline 6/10 passed, four failures: Greek with zero-width marker, Cyrillic with bidi marker, marker before Greek, Greek with private-use marker. Repaired 10/10 passed including the four plus genuine mixed scripts with/without invisible character, separate words, line separator across scripts, Latin with marker, and normal multilingual/emoji input. The committed Vitest regression expresses these same ten assertions; its actual hosted run is pending. No dependency stubs. Local git ls-remote failed DNS resolution; full repository Vitest/lint/typecheck/build and native browsers were not executed here. Sequential source review is not independent review.

## PR #390 and lease

PR #390 is now non-draft, open, nonmergeable, exact head b655bc273a6704c9c140287b8adcdf4085b91882. All five hosted workflows completed successfully (CI 44898786362, Hosting kit 44898786427, Pages 44898786411, Beta acceptance 44898786416, CLI operator qualification 44898786403); Snyk success; no submitted GitHub reviews. Existing discussion records overlapping child #422. No repair to owner branch warranted by CI; no owner branch or state changed. Integration metadata ref automation/ghostpay-integration-lock at 082e754f44944ebb4be283f89176b966bf8f7b4f: released generation 12, not acquired. A released lease is not integration authorization.

## Outstanding gates

Publish draft, verify all exact-final-head required CI and applicable native browser evidence; obtain genuine independent review, check dependencies/ownership and legitimately acquire integration lease before any merge. Do not merge or change PR state based on this handoff alone. No new dependencies, protocol changes, fund/contract interactions, real traffic, deployment, release or consolidation. Next: rotate to another unowned existing-functionality defect only after current snapshot has been reconciled.
