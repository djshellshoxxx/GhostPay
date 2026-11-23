# BUG-ONLY handoff — WalletConnect request clock validation (2026-11-22)

## Live baseline and ownership
- Repository: `djshellshoxxx/GhostPay`; live `main` at start: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Instructions read: `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `docs/ai/ACTIVE_WORK.md`.
- Isolated branch: `automation/20261122/bug/wcsession-request-clock-r11`; sole production file `packages/ux-connect/src/wcsession.ts`; dedicated new test `packages/ux-connect/src/wcsession.clock.test.ts`; this handoff and additive ownership claim in `docs/ai/ACTIVE_WORK.md`.
- Before source edits, the live open-PR inventory had **228** entries (REST pages of 100/100/28/0). All 228 changed-file inventories were checked, including broad #278, #262, #264, #372 and nearby ux-connect #430. **No direct ownership collision** on either owned source/test path was found. Recheck immediately before integration.
- Main source baseline Git blob `4dc521ec53e5d386217fe495b6c6a7a232734ee3`; repaired source blob `c92d205f85bf3c42ae900d2d67d4026d048a5b56`; final regression test blob `1b59ac6229c73d5728f980e514d0610e01d46394`.

## Confirmed existing-functionality failure
`buildRequest()` in `packages/ux-connect/src/wcsession.ts` used `Math.floor(input.nowMs / 1000)` for session expiry and `Math.min(input.nowMs + ttl, s.expirySec * 1000)` for the pending expiry without validating the injected millisecond clock. A runtime value such as `NaN` causes the expired-session comparison to be false and yields an accepted pending record with `expiresAtMs: NaN`. The existing `sweepExpired()` never removes such an entry because comparisons against `NaN` are false. Additional malformed clocks (negative, fractional, infinite, out-of-safe-range, untyped) violate the millisecond timestamp and typed-result contracts.

## Test-first sequence and repair (exact commits)
1. `d5490ea94bdb1a1bf228d446466c3b2237c9b364` — append isolated claim to `docs/ai/ACTIVE_WORK.md` before code changes.
2. `7cf1262b785bd16acfb41e608ea134d608510188` — commit a failing Vitest regression for malformed clocks, finite valid clocks and session-expiry boundaries **before** the production fix.
3. `27e7dd97bf1877ec5b0368f55e3fbcddb290f40a` — correct a test-only expectation to account for the documented 300,000 ms default TTL; still before the production fix.
4. `208d20ab7ef3dac8d7c036d3c0c9ef7acf7ad632` — add one production condition ahead of the session-expiry comparison: `if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) return bad('bad request clock');`. Uses existing `invalidParams` code `-32602`; no added dependencies or changed valid request behavior.

## Checks actually executed
- Read the exact GitHub source and test blobs at both the baseline and repaired branch.
- Node.js `v22.16.0` isolated, manually source-equivalent control-flow reproduction: **9 of 11 invalid clock inputs were accepted by baseline** (other two rejected for an unrelated error), so the new regression's expected `bad request clock` result was not met. With the one-line guard, **18 source-equivalent assertions passed**, including 11 invalid-clock rejects, 4 valid-clock/TTL/sweep cases and 3 expired-session rejects. The harness model was checked against source blob `4dc521ec53e5d386217fe495b6c6a7a232734ee3`; it does **not** execute the full repository module and is **not** a Vitest run.
- The committed failing regression has **not been executed with repository Vitest**, so no RED Vitest result is claimed. No local repository install, full-workspace typecheck/lint/build, or native browser tests were executed. No independent verifier was available here, so the operator's own source check is not an independent approval.
- Await the draft PR's exact-head hosted CI; inspect failures and repair only on this isolated owned branch.

## PR #390 and integration gates
- PR [#390](https://github.com/djshellshoxxx/GhostPay/pull/390) remains open (not draft) at exact head `b655bc273a6704c9c140287b8adcdf4085b91882`. At that head CI, Hosting kit, Pages, Beta acceptance and CLI operator qualification all completed successfully; Snyk status also succeeded. Submitted GitHub review inventory is **empty**; same-owner conversation comments do not satisfy an independent approval. A stacked overlapping follow-up [#422](https://github.com/djshellshoxxx/GhostPay/pull/422) depends on #390. No branch change to #390 was needed or attempted.
- The **live** `automation/ghostpay-integration-lock` branch's `integration-lock.json` blob `97523a9ce00231ac883b32178ab48a547eb0dd8f` records `status: held`, `generation: 11`, owner `994a0d214fb9-root-r3`. Recorded expiry in the past is not permission to seize or rewrite the lock. Do **not** merge this draft or #390 without legitimate release/transfer and exact-head qualification.

## Outstanding acceptance
- Verify exact final draft PR head GitHub CI, Pages, Hosting kit, Beta acceptance and CLI operator qualification. If any real code/CI error appears, fix on this branch only and requalify the new head.
- Run package `@ghostpay/ux-connect` focused Vitest and package typecheck/lint/build in an actual checkout or establish equivalent trusted hosted evidence; verify neighboring wallet requests and rejected session clocks. Native browser acceptance when applicable.
- Obtain a genuinely independent submitted review; recheck all other open PR ownership and dependencies, and ensure the integration coordinator legitimately owns/releases the held generation-11 lock before any qualified merge.
- Do not add features, refactor broadly, change dependencies/contracts/fees, access funds or live network endpoints, attack real systems, deploy or release.
