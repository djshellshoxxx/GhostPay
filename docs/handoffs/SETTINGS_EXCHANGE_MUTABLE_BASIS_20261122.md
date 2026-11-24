# GhostPay — settings exchange stale-basis snapshot

## Scope and source-pinned checkpoints
- Cycle: 2026-11-22 00:35 UTC, single ChatGPT coordinator running sequential phases. No parallel native worker, independent verifier or Caveman runtime executed.
- Main baseline: `eb59d93cffed7848c4aac37d0e9650b87239c6da` (read live this cycle).
- Isolated branch: `automation/20261122T0035Z/bug/settings-exchange-stale-basis`.
- Ownership claim: `10ae67fc68062e3db59a46096980ea39b2a7bb63`.
- Regression-first tests: `d4db4d696b37c0396b91c2a546aefd9ef626984d`.
- Minimal implementation: `df0d8cb03054fec84a0f6b7fca02dc8f43823942`.
- Original settings-exchange source blob `8ab2753690b4bb99621278db22c04b25a00791f2`; corrected source blob `fb13a22a70a9bf1a5f9f4eb1edb934ffc7b2e9a7`.

## Finding
`previewSettingsExchange` previously stored `basis: current` with object identity, including nested RPC maps and pinned signer array. The apply path checks `sameSettings(current, preview.basis)` to reject stale reviews. When an object (or its nested maps/array) is edited in place after preview creation, that mutation changes `preview.basis` too and the stale check silently accepts it. This is a local exported-API correctness defect; actual production UI mutation reachability or malicious exploitation is not established.

## Repair and tests
- Capture a shallow Settings copy and independent copies of both RPC maps and the pinned signer list at preview creation. These are the mutable structures `sameSettings` compares.
- No change to the parsed QR, trust confirmations, imported URL validation, stored settings, cryptography, key custody, network calls or workflow configuration.
- Five new test cases in `apps/web/src/lib/settingsExchange.mutableBasis.test.ts`: mutate theme, primary RPC, secondary RPC, signer list in place and confirm rejection; an unchanged value-equivalent copy must still apply.
- A Node v22.16.0 **source-equivalent** baseline reproduction showed mutation bypassing the original identity-based comparison.
- Source-equivalent Node `--test /tmp/ghostpay-settings-basis-replay.cjs`: **5/5 passed** after applying the copy pattern. This is not actual repository Vitest, typecheck, lint, build or browser testing.
- Native checkout cannot resolve `github.com` (DNS). Do not claim the five committed Vitest tests executed locally. Obtain hosted exact-head evidence.

## Ownership and integration
A bounded active-PR path inspection covered #278/#293/#307/#372, recent #356/#427, and historical #117 (closed); no matching current owner of the product and new regression path was found. This is not a full branch census. The default branch and broad consolidation heads must be refreshed before any integration.
The metadata integration lock at `automation/ghostpay-integration-lock` remains **held generation 11**, owner `994a0d214fb9-root-r3`, ref `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`. Its expired time is not takeover permission. Do not integrate into a shared branch or `main`.
The Pages workflow at source blob `5ef7f8f55035f852da2e1398ae39fc6455a91ebb` validates pull requests; actual publication requires a separately requested `workflow_dispatch` on main with `deploy=true`. No publication authorized.

## Next-cycle acceptance
1. Inspect exact-head GitHub CI jobs (targeted web unit, TypeScript, lint, build, Pages and browser suites), repair actual failures on a separately scoped child branch if necessary.
2. Obtain **independent verification** of the exact code/test diff and review of stale-check semantics; do not count self-review as external approval.
3. Re-read active writers, lock/ref SHAs, required checks and safe no-deployment behavior. Preserve this PR as draft and unmerged until every applicable gate is satisfied.
4. Continue the high-priority recovery/security queue without duplicating active #372 or #427.

No main merge, shared ledger mutation, deployment, release, tag, force push, live-wallet transaction, contract edit or security-gate waiver occurred.
