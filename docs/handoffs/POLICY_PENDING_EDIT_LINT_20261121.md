# GhostPay policy pending-edit lint repair — 2026-11-21 UTC

## Source-pinned checkpoint

- Repository: `djshellshoxxx/GhostPay`; checked `main` `aec179910c39081d820396409ff3139ff2264132` (unchanged from previous checkpoint).
- Parent PR: [#345](https://github.com/djshellshoxxx/GhostPay/pull/345), head `9a10d335d048b197e90d257a5322ff5d5260572d` at inspection. Child branch: `fix/ghostpay-policy-pendingedit-lint-20261121-r1`, created directly from parent.
- Claim commit: `1635b080abe24765c51ac82106a5f08a4e96e5a0`. One-line test repair commit: `bbe625ee03e6fe10163acc2f9b01795123c3c446`.
- Edited test: `apps/web/src/features/policy/PolicyPay.pendingEdit.test.tsx`, old blob `dcc3b2a3471183ad48af4b6e9d405527f1c2a4dd`, new blob `0f4ffeb91f02d226f956b8c734d45f495a7fd221`.
- Dedicated census artifacts: `docs/handoffs/BRANCH_COMPARE_20261121/p01.json` commit `9bc60ee2b40e10ae9ffaf17c402779fd3149b2b2` (15 branches) and `p02.json` commit `436b30b27db042c7f2023ea1082cf0a0706eade7` (15 branches). An additional `p03.json` was committed as `61320c551852ac40c9130f933278cd44c2e2fb58` (15 refs). **45 of 427** named refs have been freshly compared to pinned main; metadata limitations remain explicit inside files.

## Defect and correction

[PR #345 CI run 44842199985](https://github.com/djshellshoxxx/GhostPay/actions/runs/44842199985) failed the `ts-lint` job [136687978951](https://github.com/djshellshoxxx/GhostPay/actions/runs/44842199985/job/136687978951) on ESLint `@typescript-eslint/require-await` at `PolicyPay.pendingEdit.test.tsx:53:5` (`createRpc: async () => rpc` contains no await). At the inspected parent head, 22 other CI jobs passed, including `ts-test (web)`, full and lean E2E, typecheck and contract jobs; the aggregate TypeScript job fails only because lint failed. This is **parent-head** evidence, not child-head validation.

The isolated correction is `createRpc: () => Promise.resolve(rpc)`. It preserves a Promise-returning RPC factory and the same mock client. No production source or regression assertions are changed, no async behavior is made synchronous, and no lint/test gates are relaxed. The original GP-BUG-07 race regression (amount edit while account request is paused, no `eth_sendTransaction`) remains intact.

## Consolidation and dependency review

An exhaustive branch-name pagination at the start of this run returned 427 refs with page sizes 100/100/100/100/27/0. However, **the 427 branch heads have not all been freshly compared or semantically reviewed** in this run. The separately pinned old 425-branch handoff and this incremental 45-ref named-branch comparison do not establish that every remaining historical branch contains unique code. Full head-SHA pinning and large (300-file-truncated) diff review are pending. Do not use these files to authorize bulk merges.

Verified PR dependencies: #345 is the parent of this repair and must be reconciled first; #340/#342, #337/#351, #336/#348/#352 form other separate stacks; #332 and #335 overlap in receipt-archive identity; #349 is stacked on a broad integration base. No overlapping source changes are imported by this repair. The shared integration-lock branch `automation/ghostpay-integration-lock` was observed in status `held` at generation 11 (its expiry alone is not proof of available ownership). No lock or protected integration branch changed.

## Qualification and next worker

1. Run `npm run lint -w @ghostpay/web` plus focused `PolicyPay.pendingEdit.test.tsx` Vitest against this exact child head; run the applicable complete CI, full/lean browser and security gates. Host workflow results must be captured for the child PR, not copied from #345.
2. Request independent source review of the one-line test change and the parent GP-BUG-07 authorization guard, including the async in-flight edit regression. Do not self-approve.
3. Once exact-head checks pass, selectively include the one-line correction in #345 (or a reviewed combined descendant) and requalify the combined head against fresh main. Do not merge this child independently to main because it is stacked on unqualified #345.
4. Continue branch census from cursor `NDU` (offset 45) with a fixed 15-ref page size and record failed comparisons instead of treating them as redundant; confirm branch count and SHA again before final integration.

## Explicit limitations

The local execution environment failed DNS resolution for `github.com` when probing `git ls-remote`. The repository's Vitest, lint, typecheck and builds were **not executed locally**. Hosted CI on this new exact head must be checked after PR creation. No independent reviewer, new contract/RPC behavior, secret, main merge, release or deployment in this task.
