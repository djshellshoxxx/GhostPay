# GhostPay R22 engineering checkpoint — 2026-11-21

## Scope and ownership
- Repository: [djshellshoxxx/GhostPay](https://github.com/djshellshoxxx/GhostPay).
- Frozen current main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Last completed checkpoint: [R21 authoritative ledger](https://github.com/djshellshoxxx/GhostPay/pull/380#issuecomment-7068560432).
- Child branch: `audit/ghostpay-r22-privacy-option-guards-20261121`; starting parent [#421](https://github.com/djshellshoxxx/GhostPay/pull/421) at `55106dad616d548b9beb174c7f5735d1b5821a22`.
- Parent #421 exclusively owns its own source/test and is **untouched** by this child. This isolated extension adds runtime validation and a distinct regression file. No mainline or shared integration modifications.

## R22 full live branch and PR inventory
- REST pagination: branches `100/100/100/100/90/0` = **490**, confirmed by **490** exact `git/matching-refs/heads` SHA values with **zero mismatches**. Source-pinned immutable artifact: [BRANCH_HEADS.json](./BRANCH_HEADS.json).
- All 468 historic heads from R12 remain exact SHA-identical to [R12 frozen evidence](https://github.com/djshellshoxxx/GhostPay/blob/2eb64d0a19e172ca02abe10a191b7d711962cb52/docs/consolidation/20261121-r12/BRANCH_HEADS.json); zero moved/deleted. There are **22** post-R12 additions: 19 already covered by R21 and three newer isolated branches (#421, #422, this child). This reuses historical immutable comparisons and explicitly does **not** assert fresh source review of every historical code path.
- Open PR pagination `100/81/0` = **181**, with **101 main-targeted, 80 stacked, 157 drafts** at inventory time. Each exact head, base and state is in [OPEN_PRS.json](./OPEN_PRS.json), frozen **before** the new child PR.
- Conservative comparison classification is carried from R21 and adjusted for 3 newly added code-like branches: 191 ancestry redundant; 159 ahead code-like; 80 docs/other; 59 historically capped; one unrelated gh-pages. These are triage classes, not merge clearance. Capped/divergent historical donors remain unresolved.

## Verified unique-code and CI overlap
- [PR #421](https://github.com/djshellshoxxx/GhostPay/pull/421) `55106dad616d548b9beb174c7f5735d1b5821a22`: 4 ahead, 0 behind main, 4 changed paths; rejects invalid sweep urgency. Its exact head has five successful hosted workflows, including [CI 44946546419](https://github.com/djshellshoxxx/GhostPay/actions/runs/44946546419) with 24/24 jobs successful. No independent review was present at inspection.
- [PR #422](https://github.com/djshellshoxxx/GhostPay/pull/422) `f846464db3cb2f12c221d0c2f56e3aa3702d4fcb`: 9 ahead, 0 behind main, *stacked* onto [#390](https://github.com/djshellshoxxx/GhostPay/pull/390), composes #390 4096-unit displayed-text cap with #419 surrogate-aware clipping. Five hosted workflows successful, including [CI 44947258902](https://github.com/djshellshoxxx/GhostPay/actions/runs/44947258902) with 24/24 jobs successful. No independent review was present at inspection. #390 and #419 overlap `safeText`; do not blindly merge both source edits or use donor CI as composite qualification.
- No duplicate historical donor cherry-picks or main merges. #372 recovery, browser #395→#402→#412, POS #406→#411, and confidential event investigation [#414](https://github.com/djshellshoxxx/GhostPay/issues/414) remain separate.

## New implementation (test-first child of #421)
Source inspection found a privacy fail-open analogue of #421's malformed urgency: `adviseSweepTiming` accepts TypeScript `fundingMethod?: 'self' | 'sponsored'` and `timingJitter?: boolean`, but ignored malformed runtime values. Unknown `fundingMethod` silently avoids self-funded-gas or sponsored-relayer linkability notes; string `'false'` silently omits the jitter-disabled guidance.

1. Test-first regression commit `50840d00046ebc9656896a42cafb92a410373aba`, file `packages/ux-fees/src/timing.privacy-validation.test.ts`. It asserts rejection of eight malformed funding methods and five malformed jitter settings; verifies valid self/sponsored, boolean true/false, omitted options, and the parent's invalid-urgency guard.
2. Minimal correction commit `beff58563809caaaed2b1db9ad81a91f65d1ec96` in `packages/ux-fees/src/timing.ts`: use existing `fail`/INVALID_INPUT for unsupported funding enums or nonboolean jitter, leaving valid privacy notes/advice unchanged. Parent blob `a3a58d9e25ac41435e2f86e8530e276f2e9fe7a0`, corrected blob `a2d4e56edd046547ff5791bf19c243a45f82c5e3`.
3. Full source-pinned branch and open PR inventories added with commits `37c8d026d4aef918a4a1df6d175f6ad4150b1353` and `5557cb1aa4244a4ad0f7492d3b9c55efd2fe4411`.

Tests were **committed**, not yet executed as real Vitest on this new head at the time of writing. Native checkout fails `Could not resolve host: github.com`. The subsequent child PR must qualify its **final exact head** via hosted CI/typecheck/lint/build/tests/browser/security workflows; no isolated mock passes substitute for that. No formal independent verifier has reviewed this new code.

## Integration and handoff gates
- Integration lock `automation/ghostpay-integration-lock`, ref `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, file blob `97523a9ce00231ac883b32178ab48a547eb0dd8f`, remains **held**, generation 11 by `994a0d214fb9-root-r3`. Its old expiry does not authorize takeover.
- Review and qualify #421 parent; then verify this child against exact current parent SHA and all hosted checks, request a genuine independent review, integrate child to parent only with source-owner coordination, and requalify the resulting combined head before requesting any main merge.
- Keep static browser-only, zero hosted custody/key handling, no automatic sweep, no new dependency, transport, wallet flow, contract or protocol changes. Preserve private-key export, trust revocation, RPC consent, privacy warnings and fail-closed behavior.
- Investigate #414 event decoding and browser Firefox/WebKit failures independently. Do not deploy, release, use real funds or bypass any qualification gate.

No historical branch deletions, force-pushes, shared-lock modifications, mainline merges, deployments, or releases in R22.
