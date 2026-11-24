# GhostPay BUG-ONLY handoff: EVM pay-again address case mismatch — 2026-11-21

## Source/branch pins
- Repository: `djshellshoxxx/GhostPay`; base `main` **`eb59d93cffed7848c4aac37d0e9650b87239c6da`** (rechecked before branch creation).
- PR: [draft #417](https://github.com/djshellshoxxx/GhostPay/pull/417), isolated branch `automation/20261121/bug/payagain-evm-address-case-r6`.
- Ownership commit **`dbba6d5a29eba250359fe226ffe46e2167d77d73`** appended an acceptance/owned-path section to `docs/ai/ACTIVE_WORK.md` before code changes.
- RED regression-first commit **`d271ed47d74a20e3cd72836c831767d9d71418ac`** created only `packages/ux-presets/src/payAgain.address-case.test.ts` (Git blob **`52c2d89a2941a7d5f19db4e786018b02e32dcbc6`**).
- Production fix commit **`501412ba00bb25499c8c3ead740b697f240c44e6`** updated only `packages/ux-presets/src/payAgain.ts`; old Git blob **`2539cee39f5a2d5239ffcb4376a6ae52091fa64d`**, new Git blob **`0cd4e7c15f9ad284d9610b0ca34658dbda6ca092`**.
- No files under another owner's claimed paths changed, except the additive shared-claim registry on this isolated branch.

## Observed failure / root cause
`derivePayAgain` compares `base.prevAddress !== address` and adds a blocking `address-changed` flag. For `eip155:1`, recorded `0xAbCdEf0123456789abcdef0123456789ABCDEF01` and freshly resolved `0xabcdef0123456789abcdef0123456789abcdef01` represent the **same 20 bytes** yet trigger the block. A deterministic Node 22 comparator reproduction of the exact old source expression identified **1 failing of 4 focused expectations**, while distinct EVM addresses, case-different non-EVM identifiers, and malformed short hex correctly remained blocking. No network, wallet, funds or contract calls were made.

The fix preserves the existing early exact string match. Only when chain begins with `eip155:` **and both strings are canonical `0x` plus exactly 40 hexadecimal characters**, it compares lowercase byte encodings. All other strings/chains continue to compare exactly. The host's current-address validator still runs before comparison, with never-auto-send and explicit review unchanged. No new dependency, feature, schema, UI or broad refactoring.

## Verification evidence / strict limitations
- RED regression committed before production fix: four new Vitest cases in the isolated `payAgain.address-case.test.ts` file (EVM same bytes/different case, different EVM recipient, other-chain case distinction, malformed/short EVM-like input).
- **Source-equivalent** Node 22 (v22.16.0) focused reproduction, original expression pinned to old blob: 1/4 checks mismatched expected behavior.
- **Source-equivalent** Node 22 comparator verification pinned to new blob: **2,009 of 2,009 assertions passed** (9 explicit boundaries and 1,000 deterministic generated hex addresses evaluated for both EVM and non-EVM cases).
- These comparator checks **are not repository Vitest, package build, lint, typecheck, Playwright or native browser tests**. The container cannot resolve `github.com`, so an npm checkout and tests were unavailable. Exact-head GitHub Actions must independently qualify the added regression and changed source.
- No genuinely separate reviewer was available in the foreground run, so **independent review has not been performed**; self-inspection does not count.

## Coordination and merge gates
- Before branch creation, the GitHub connector enumerated all **175 currently open PRs** and retrieved their complete changed-filename inventories. No open PR claimed `packages/ux-presets/src/payAgain.ts` or `payAgain.address-case.test.ts`. Broad PRs #238/#262/#264/#278/#372 modify only `packages/ux-presets/src/validate.test.ts` and/or `package.json`; those remain untouched.
- [Draft #390](https://github.com/djshellshoxxx/GhostPay/pull/390) rechecked at exact head **`b655bc273a6704c9c140287b8adcdf4085b91882`**: 39 exact-head GitHub check runs reported 36 success, 3 skipped, 0 failure and 0 running; six workflows completed successfully, including full/lean e2e and web tests. Independent reviews: **zero**. No confirmed defect warranted modifying its owner's branch.
- Shared `automation/ghostpay-integration-lock` `integration-lock.json` blob **`97523a9ce00231ac883b32178ab48a547eb0dd8f`** says generation **11**, status **held**, owner `994a0d214fb9-root-r3`. Its recorded timestamp may be stale, but no release/reclaim/ownership authorization was verified; do not mutate it or merge.
- This PR stays **draft**. The integration coordinator must recheck exact PR head, all required CI green (including package regression), applicable native browser/Pages acceptance, independent review, full dependency/file conflict inventory, and legitimate integration-lock ownership before any merge. No deployment or release authorized.

## Next worker
1. Refresh `main` head, PR #390 evidence/CI/reviews and PR #417 exact head, check runs, independent review and other owners.
2. If PR #417 CI exposes an actual defect, repair *only* the PR owner's scoped files with proper ownership coordination, preserve test-first history, and append source-pinned evidence. Otherwise leave it draft for independent review and authorized integration.
3. For the next unowned bug, rotate to another existing Pages/runtime package or function; reproduce first, claim an isolated branch, commit the failing test before the smallest fix, and preserve integration ownership.
