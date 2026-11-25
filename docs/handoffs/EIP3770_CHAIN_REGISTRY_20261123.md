# GhostPay — EIP-3770 custom chain registry validation (2026-11-23 UTC)

## Cycle, exact source and ownership
- Cycle coordinator: `20261123T0441Z-root`; single sequential implementer, audit and integration-gate inspection. No separate native worker or independent verification/PR approval was available.
- Start approximately `2026-11-23T04:41Z`; source-patch and scoped local checks finished by `2026-11-23T04:45Z` UTC.
- Main/base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`; tree `d8aa628cbc531c6969bdf0af621795ceacfc00c3`. Main was re-read unchanged before this handoff.
- Isolated branch: `automation/20261123T0441Z/bug/eip3770-registry-guard`; source owner claim `a3e68663ae605d8f2cb99acbc208db7d9b218e72`, regression-first `960b0a0d76fe2638301ed5ac6ff77ba63f168191`, production patch `6667a073ae74117e736fe4c9037fbb557b8446aa`.
- Product source: `packages/payment-uri/src/eip3770.ts` blob before `8bbf5214d1131ee99865220c262b3a7c7073a109`, after `ce0154850ec97b2edf8d7a4d587de0a5b77a6725`.
- Added test: `packages/payment-uri/src/eip3770.registry.test.ts`; existing tests untouched. Ownership claim is an append-only addition to `docs/ai/ACTIVE_WORK.md`. This file is the unique isolated task handoff, not a new shared ledger.

## BUG-EIP3770-R11-01 — bounded audit finding and repair
- Priority: P2 defensive payment-address chain-selection correctness. Exploitability unknown/conditional; no remotely reachable browser exploit, successful payment misrouting, or funds impact demonstrated.
- Pre-fix `parseChainAddress` ensured the short name existed in its injected registry but returned the mapped chain ID without checking its numeric type or EIP-155 validity. Pre-fix `buildChainAddress` reverse-selected a registry mapping without checking the supplied chain ID or mapped short-name grammar. A malformed runtime custom registry could therefore yield negative, zero, fractional, infinite, unsafe or nonnumeric chain identifiers, or build a URI the parser itself would reject.
- Fix: share `validChainId(value: unknown)` guard (positive `Number.isSafeInteger` number) across parsing and building; refuse a selected reverse-mapping name that violates the existing SHORT grammar. Reject with the existing `PaymentUriError('INVALID_CHAIN_ID')`; do not silently replace or coerce the supplied chain. Keep valid default and custom registries unchanged.
- Test-first file contains nine malformed mapping cases for both directions, one invalid-name builder case and one group of valid default/custom controls. No new dependencies, changes to signing, chain selection policies, contracts, transaction construction, network egress, keys or deployment.

## Executed checks (do not conflate with full repository CI)
1. Node v22.16.0 source-equivalent baseline harness reproduced **18 of 19** malformed parse/build acceptance cases. The remaining `NaN` builder reverse lookup already refused the mapping; this is not marked as a new defect.
2. Fetched final product file's text was copied exactly into a temporary standalone TypeScript compilation. `git hash-object` of the copied source equalled the exact GitHub product blob `ce0154850ec97b2edf8d7a4d587de0a5b77a6725`.
3. Installed global TypeScript compiler compiled the source with `module=NodeNext`, `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` using **local stub implementations** for `fail` and `parseEvmAddress`. Scoped typecheck passed. Stubbed `parseEvmAddress` accepts only the fixed all-digit EVM address used in the probes.
4. The source-pinned compiled module passed **22/22** standalone runtime assertions: 18 malformed mapping pairs, one bad-name mapping and three valid controls. This was not original-dependency `Vitest` nor whole workspace typecheck, lint, build, browser, full-package coverage, secret scan or any live-chain test.
5. The connector compared base vs product branch before this handoff: **3 ahead/0 behind**, only `ACTIVE_WORK.md`, new focused test, and `eip3770.ts` changed. This establishes only bounded history, not a semantic census of every branch.

## Coordination and consolidation
- The six existing open PRs matching `payment-uri` were inspected. #370/#379/#360 own `query.ts`, #313 owns `decimal.ts`, #309 docs-only, and #310 browser request-file work. No overlap with the two owned EIP-3770 files was observed in this bounded sample. Other PR/branch claims remain active until checked.
- Previous candidate #491 has five successful exact-head workflow groups at `8dd2dee49994f872aa9788206afa5878a2b49258`, including 24/24 reported Core CI jobs; that evidence does not qualify this new patch. Keep #491 draft pending independent review.
- Existing atomic integration metadata branch `automation/ghostpay-integration-lock` head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79` remains status `held`, generation 11, owner `994a0d214fb9-root-r3`. A past expiry is not evidence the other coordinator has stopped; no takeover, lock write, main merge or shared integration was attempted.
- Existing Mythril inventory (three Medium, seven Low) still requires finding-specific disposition and external security clearance. No security finding is silently resolved.
- `.github/workflows/pages.yml` was inspected: pull-request builds validate, while Pages publication requires a main-only explicit `workflow_dispatch deploy=true`. No deploy was requested. All merge gates remain in force, including independent verification, fresh exact-head required CI and ownership.

## Required next steps
1. Create a draft PR from this exact isolated branch to main. Fetch the new final PR head and its Core CI, Pages, Beta, Hosting and CLI jobs; inspect any actual failures and repair only on an owned isolated follow-up branch.
2. Obtain a genuinely independent reviewer to inspect source, tests and custom-registry consumers, and run the committed Vitest tests with actual dependencies on exact candidate.
3. Recheck fresh main/PR heads, all affected claims, release triggers, required reviews and legitimate atomic integration-lock ownership before any protected merge. Otherwise keep this draft unmerged.
4. Continue the separately owned recovery, issue #286, and Mythril/security clearance work rather than duplicating active implementations.

No production deployment, release, contract changes, real-funds testing, branch deletion, force-push, paid agents, external coding jobs, security-gate bypass or false independent approval occurred.
