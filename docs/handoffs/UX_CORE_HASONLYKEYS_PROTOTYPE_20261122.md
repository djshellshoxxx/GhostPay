# GP-BUG — Reject non-plain objects in `hasOnlyKeys`

Date: 2026-11-22. Scope: **BUG ONLY** (public UX-core schema helper; no wallet, fee, transaction, contract, UI design or network changes).

## Source pins and ownership

- Live `main` at discovery and test-first branch creation: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated branch: `automation/20261122/bug/store-onlykeys-plain-r1`.
- Claim first: `d6df03c273e45d26c75fb8ae140b04c5e071283f`.
- Regression-only commit before any production change: `2dbf82b1c51d42a95f7645180c32e4f15c6acc57`.
- Minimal production repair commit: `e78aff8cc47360482914da1bcc062df94fe2be91`.
- Original `packages/ux-core/src/store.ts` blob SHA `d5e3f8da603121b87d9345d4588b9e1bf33fc185`; repaired blob SHA `a5efd4b5dfa45f7d57a8276c7645d2363a0a11ae`.
- Owned code paths: `packages/ux-core/src/store.ts` and new `packages/ux-core/src/store.onlykeys-prototype.test.ts`. Additive work registry claim and this handoff are the only other changes.
- The open-PR file inventories from the live 232-open-PR snapshot were checked for direct source ownership; none included this `store.ts`. Prior claims in other branches remain in force; recheck at integration.

## Confirmed bug, impact and root cause

The exported `hasOnlyKeys(o, allowed)` contract promises `true` only for a *plain* object with no disallowed own keys. On frozen main it only ruled out arrays, null and nonobjects before calling `Object.keys(o)`. `Object.keys` does not reveal prototype identity or inherited properties. Consequently `hasOnlyKeys(new Date(0), [])`, `hasOnlyKeys(new Map([['label','Alice']]), ['label'])`, and `hasOnlyKeys(Object.create({ hidden: 'value' }), [])` all returned `true`, incorrectly reporting non-record inputs as valid records. A class instance with one approved own key was also accepted. This is a reproducible type/schema classification error. There is no claim of actual fund loss or attacker exploit.

One additional prototype guard now rejects nonplain prototypes but retains ordinary objects and null-prototype dictionary records (the latter are valid data dictionaries). Existing disallowed-key filtering is unchanged. The regression covers four rejected nonplain cases and six neighboring valid/invalid cases.

## Exact execution and limitations

- Isolated Node v22.16.0 checks transcribed the full `hasOnlyKeys` function logic from the source blob pinned above; BEFORE: **6 passed, 4 failed** against the intended contract. AFTER: **10 passed, 0 failed**, including ordinary objects, empty records, null-prototype dictionaries, extra own keys, arrays and null.
- The tested function logic matches the GitHub source shown in the two pinned revisions; **the full repository file was not checked out or compiled locally**, and the Node checks are **not repository Vitest**.
- `store.onlykeys-prototype.test.ts` was committed before the source repair. The regression-only commit did not have a hosted workflow run available at the first check; no CI red result is claimed.
- Repository Vitest, full-workspace typecheck, lint, build, native browser checks and independent review: **not yet verified** at the time of this source handoff. Use hosted exact-head Actions qualification and do not merge on these isolated checks.
- Source is a pure validator: no external calls, wallet actions, releases, deployments or production traffic tests were performed.

## Separate PR #390 first-gate recheck

`#390` at head `b655bc273a6704c9c140287b8adcdf4085b91882`: CI, Pages, Hosting kit, Beta acceptance and CLI operator qualification all completed with `success`; security/Snyk status is `success`. The independent submitted GitHub review list is empty. Its owned branch was left unchanged. No specific CI/code defect was substantiated by this recheck, and review is not waived.

## Unmet integration gates

Keep this repair in a narrowly scoped **draft** PR. Recheck its final exact-head five hosted workflow groups, Snyk, applicable browser evidence, overlapping ownership/merge dependencies, and a genuinely independent submitted code review. The authoritative integration lease is recorded as **held at generation 11 by another coordinator**; no acquisition, merge or release is authorized here. Add a source-pinned PR comment with exact-head qualification results if CI completes. Do not mistake an expired timestamp for lock ownership. No force push or branch overwrite.
