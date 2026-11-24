# R42 — uncapped Git-tree donor recovery triage

Read-only immutable comparisons verified on 2026-11-22. This is **structural evidence, not semantic final disposition, CI qualification, or merge approval**. Full recursive Git trees returned `truncated:false`, including all blob path/mode/SHA entries, bypassing GitHub compare's 300-changed-file cap.

| Immutable source | Commit SHA | Recursive Git tree SHA | Blob files |
|---|---|---|---:|
| current main | `eb59d93cffed7848c4aac37d0e9650b87239c6da` | `d8aa628cbc531c6969bdf0af621795ceacfc00c3` | 3,981 |
| historical qualification/evidence donor | `52122f8b7076b2636d47f59f8bb607b189d3ab39` | `747652a3dc66013956ee987ce0a5afdce93e3d07` | 4,952 |
| historical idle-lifecycle donor | `7e6089e2e40a2a7daf93961eddef17d3fe8501fd` | `64ae98aa2616d52ee213d040f33c6a8d896fc83b` | 4,169 |
| owned recovery PR #372 | `055d33e042c63edf1d5bbbdd7833d3c1ef93733d` | `65e5cc6fdb7ab3337951ba0b0b58e87b71df095b` | 5,762 |

## Full tree comparison to main

- Qualification donor: **3,531** identical shared blob paths; **388** different shared blobs, **1,033** donor-only paths, **62** main-only paths. Of 1,033 donor-only paths, **891** are docs and **100** are within apps. These are raw differences, not 1,033 recoverable features.
- Idle donor: **3,604** identical; **285** different shared blobs, **280** donor-only, **92** main-only. Of 280 donor-only paths, **222** are docs and **34** are within apps. Numerous historical export and privacy tests are present.

## Full donor comparison to recovery PR #372

- Qualification donor versus #372: **4,680** identical shared blobs, **197** different shared blobs, **75** donor-only paths. Only **seven donor-only paths** under `apps/web/src`, `apps/web/e2e`, or `packages/`:
  1. `packages/cli/src/global-switches.test.ts`
  2. `packages/cli/src/observation-input.test.ts`
  3. `packages/cli/src/reconcile-stored-only.test.ts`
  4. `packages/cli/src/untrusted-echo.test.ts`
  5. `packages/confidential-contracts/contracts/mocks/ReturnBombStealth.sol`
  6. `packages/contracts/scripts/capture-mythril-evidence.py`
  7. `packages/relayer-guard/src/limiter.abuse.test.ts`
  
  Remaining **137 different shared source paths** need semantic/patch examination, including browser, payment, privacy, security and network-authorization code. They are not safe to wholesale import.

- Idle donor versus #372: **3,849** identical shared blobs, **317** different shared blobs, **three** donor-only paths, and **zero donor-only files** under the listed browser/package source prefixes. Remaining **247 different shared source paths** still require semantic review; absence of donor-only file names does not imply semantic inclusion.

## Review of available donor-only files

The qualification donor's Mythril script `packages/contracts/scripts/capture-mythril-evidence.py` at exact blob `e0d317c8462e9119a1564106562ca7db5afe92d9` is a **passive provenance/evidence collector**, not a findings disposition or contract-security sign-off. It inventories fixed inputs, hashes source paths, records tool/compiler identity, and explicitly says it cannot accept findings. It is *not* proof that #372's outstanding Mythril failures were resolved. Current owned [PR #468](https://github.com/djshellshoxxx/GhostPay/pull/468) implements a different `scripts/audit/mythril-evidence.mjs` summarizer; preserve both evidence concepts without replacing or copying owned code.

The donor's `packages/relayer-guard/src/limiter.abuse.test.ts` (blob `944162cb2dcea4f92ebadcba38956aacf1a17a0b`) contains synthetic per-group overflow and saturation regressions; it is relayer scope, **not** browser-only beta functionality. The four donor-only CLI test files, and the `ReturnBombStealth.sol` mock, are likewise not directly importable into the static Pages-only beta. They may remain useful to future scoped test owners; preserving branch history matters.

## Disposition and next action

Both historical branches remain **unresolved source donors**, not finalized, because their differing paths have not been proved redundant/superseded/eligible by source-level behavior. Review the exact 137 and 247 differing source paths by owner/feature, prioritizing key-export/recovery, invoice/timeout, funding/replay safety and privacy. Compare unique diffs against main and the strongest reviewed recovery implementation before selecting any patches. Coordinate #372 and #468 claims before edits. No local execution, browser tests, integration, contract simulation, or independent review is claimed.

No mainline merge, deployment, release, source/test changes, key exposure, real-funds transaction or security-gate waiver occurred.
