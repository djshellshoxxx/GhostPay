# R36 — Fiat input separator boundary, source-pinned handoff

Date: 2026-11-22 UTC. Repository: djshellshoxxx/GhostPay. Browser-only, static, noncustodial scope.

## Verified exact sources

- Protected `main` SHA `eb59d93cffed7848c4aac37d0e9650b87239c6da` (verified identical via GitHub compare at start).
- Original `packages/ux-fiat/src/format.ts` Git blob `ef6adf3fb5833d9746eb272813e7c4f5bc2c1409`.
- Branch: `automation/20261122-r36/bug/ux-fiat-runtime-separators`.
- Ownership claim commit `cf620b8650bd83b904ca8f77a4219617d3e2fc26`.
- New test file committed BEFORE source repair: `72482c24e643e6e99ac9fbcbfe3eec388eb28366` (`packages/ux-fiat/src/format.runtime.test.ts`).
- Production repair commit: `3602cc1f481941277143a8cae5dc9453c2f0003f`; new `format.ts` blob `775e277b1092088a3c1c4a8737d9b2d0beef13bd`.

## Problem and bounded change

`parseFiatInput` in `packages/ux-fiat/src/format.ts` dereferenced `fmt` and `d.length` without checking for malformed runtime descriptors, despite returning a typed Result with existing `bad-format` code and handling untrusted raw input. A missing/null descriptor or missing/nonstring decimal separator could throw, and nonstring group separator could coerce and be incorrectly accepted. The parser also accepted separators longer than the two-character limit already used by `formatFiatParts` in the same file. These findings follow directly from pinned source; **no original-source runtime RED execution is claimed**.

The source change adds early `fmt` object validation and checks that each separator is a string and at most two characters, retaining the existing nonempty decimal, inequality and bad-character checks. No changes to BigInt math, payment flows, custody, locales, dependencies, network behavior, contracts, wallet operation, or deployment.

The new Vitest test covers 15 invalid descriptors (including null, undefined, objects missing fields, wrong primitive types, excessive separator lengths, digit and identical separators), typed bad-format response, absence of thrown exceptions, exact US/German/ungrouped minor-unit parsing, and excess-precision preservation.

## Coordination and qualification

- A full GitHub REST inventory before starting this branch returned 520 branches (pages `100/100/100/100/100/20/0`) and 212 open PRs (`100/100/12/0`); matching refs confirmed 520 exact name/SHA matches. R33 immutable baseline contained 515; changes included five new heads and one advanced docs head.
- Main is unchanged from R35. In scope for this new work, checked changed filenames of PRs #424–#453 and broad #278/#264/#262/#372/#371/#307/#302/#246 plus F04 #397 and others. Wide recovery PRs change `ux-fiat/src/fiat.test.ts` and package metadata; they do **not** change `ux-fiat/src/format.ts` or new `format.runtime.test.ts`. Full 212-PR file-level exhaustion was not performed. Preserve the broad recovery owner and avoid competing modifications.
- Live integration lock: `automation/ghostpay-integration-lock:integration-lock.json` shows `status=held`, generation 11, owner `994a0d214fb9-root-r3`. Lease time fields are old, but no legitimate ownership handoff is established; no merge is authorized.
- Local `git ls-remote` failed due DNS resolution of github.com; no checkout-based or full local Vitest/typecheck/lint/build/browser qualification is claimed. Regression was committed before fix, but original-source RED is not yet run. Recheck exact-head hosted CI and Vitest regression after opening PR.
- Historical 59 capped donor histories and the wide #372/#397 feature recovery remain separately owned and **not** wholesale merge-qualified. #449→#450→#452 is a distinct stacked receipt-validation chain; #453 is the new nonstring-address fix with exact-head CI awaiting independent review.

## Integration checklist / next worker

Verify unchanged main and PR parent, confirm exact-head CI jobs including `ts-test (rest-*)` test shards and typecheck/lint, investigate any failures, obtain genuinely independent review, recheck active ownership and held integration lock, then consider merge only when qualified. Keep no-deploy/no-release/no-real-funds constraint. Follow up F04 merchant export through existing #397 without duplicating it. Record specific SHA and run IDs; do not infer success from source inspection.
