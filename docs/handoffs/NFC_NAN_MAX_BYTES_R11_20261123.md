# BUG-ONLY R11: NDEF maxBytes NaN bypass — 2026-11-23

## Verified repository / ownership
- Live main at discovery: `8ddb344973e80b8e1eda6821e970ee6a2b808b29` (recheck before integration).
- Worker isolated branch: `automation/20261123T1719Z/bug/nfc-nan-limit-r11`. No other worker branch was modified.
- Paths: `packages/merchant-hooks/src/nfc.ts`, new `packages/merchant-hooks/src/nfc.nan-max.test.ts`, additive `docs/ai/ACTIVE_WORK.md` ownership and this file. Existing `hooks.test.ts` untouched.
- Main source Git blob: `310640bdffccdb253ad66cf09f3c45037bbd2f67`; repair blob `daeed88bebf35377c64a0c96a95d6011b79eb401`. The exact baseline was recreated locally and verified by `git hash-object` before execution; the one-line repaired source also hashed exactly to the GitHub repair blob.
- Live inventory: 272 open PRs in three pages; title screening and actual changed-file preflights on broad PRs #278/#264/#262 and relevant PRs #513 (merchant button), #406 (POS), plus other focused PRs found no ownership on `nfc.ts` / the new test path. **Not all 272 changed-file lists were successfully enumerated** (bulk request hit connector tool-call cap). Treat full ownership census as an outstanding integration gate, not as completed work.
- Integration ref `refs/heads/automation/ghostpay-integration-lock`: generation 12 released at `082e754f44944ebb4be283f89176b966bf8f7b4f`; no lock acquisition, merge or release authority inferred.
- PR #390 exact head `b655bc273a6704c9c140287b8adcdf4085b91882`: 39 exact-head checks (36 success / 3 skipped), five required workflow groups success; zero submitted reviews, reported nonmergeable. No edits to its owner branch.

## Concrete bug and root cause
`encodeNdefUri` documents and exports `HARD_NDEF_MAX_BYTES = 8192`. A valid HTTPS `#gpi=v1.` URL with a base64url fragment can produce a 9,032-byte NDEF URI record. With `options.maxBytes = NaN`, `Math.min(NaN, 8192)` produces NaN and `total > max` is false. The encoder silently returns an oversized message despite the hard cap. The same is true for `Number('invalid')`. This is a deterministic caller-policy boundary defect; no real NFC write or attacker traffic was exercised.

## Regression-first and minimal repair commits
1. Additive ownership claim: `a066c552861d9184209f9c6d8d859857d8b8adb4`.
2. Failing regression committed **before** production change: `2fe47127d3b6ccc601ac947cd85ec717b45d1405`.
3. Short-record test-vector correction (still before production repair): `ee53574dfddfb7fe70466f39c1bd737a38d19c28`.
4. One-line production repair: `080f21e522ff142e652504dab7da635df663546d`. The conditional becomes `Number.isNaN(max) || total > max`, preserving finite policies and the hard cap.

## Executed verification and limits
- Local tool: Node.js v22.16.0, global TypeScript `tsc` with NodeNext/ES2022 settings. Exact baseline source `nfc.ts` blob hash `310640bd...`; repaired blob hash `daeed88...`. Dependencies `HooksError` and `assertPaymentLink` were isolated local stubs with the documented existing behavior (not whole-repository checkout).
- Baseline: **8/10 passed; the two NaN-policy guard checks failed** as expected; exit 1.
- Repair: **10/10 passed; exit 0**, including 8192-byte exact bound, 8193-byte rejection, custom 129/128-byte short-record cap boundary, default cap acceptance/rejection, single-record URI roundtrip and the untouched `tagFit` helper.
- The committed `nfc.nan-max.test.ts` includes three Vitest cases; full repository Vitest, lint, typecheck, build and native-browser verification **were not run locally** because native GitHub checkout DNS resolution failed. Do not conflate isolated probe with repository CI.
- No real NFC hardware, funds, payment contract, network requests, deployment, dependencies, UI redesign or release changed.

## Outstanding gate / handoff
- Run/inspect all required **exact final-head hosted GitHub CI**, especially TypeScript tests, lint/typecheck and applicable Pages browser acceptance. Fetch CI logs and repair only proven task-owned defects.
- Confirm all 272+ currently open PR changed-file inventories for direct source/test ownership and actual update-before-merge conflicts.
- Obtain genuine independent review (not the author reasoning under another label). Resolve conflicts and require held legitimate integration lease before any merge to main.
- Leave the task PR draft and unmerged while any gate is unresolved. Continue next round on an unowned separate package/file.
