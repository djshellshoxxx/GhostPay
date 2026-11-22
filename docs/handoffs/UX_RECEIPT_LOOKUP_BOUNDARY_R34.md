# GhostPay R34 — receipt verifier fail-closed runtime lookup boundary

Date: 2026-11-22 UTC. Scope: BUG-ONLY, pure browser-compatible `@ghostpay/ux-receipts` verification logic. No network calls, wallet keys, signing, contracts, relayers, deployment, release, real funds or user-data collection.

## Exact provenance, ownership and stack

- Default `main` at start: [`eb59d93cffed7848c4aac37d0e9650b87239c6da`](https://github.com/djshellshoxxx/GhostPay/commit/eb59d93cffed7848c4aac37d0e9650b87239c6da).
- Parent [PR #449](https://github.com/djshellshoxxx/GhostPay/pull/449) exact head `ff8c800a495f1cc4d2df704d321b3d22e6f67a78`, fixes the separate invalid `facts.confirmed` issue. Parent branch is not modified here.
- Isolated branch `automation/20261122-r34/bug/ux-receipts-lookup-boundary`, **stack onto #449**, not directly onto main.
- Ownership claim: `4a5640644e630bc220c50fbf1c9f7f99e2efa147`; regression-first test commit: `9fcbc9d82d4c8b67a62703d405a53b8934a3fdee`; minimal production fix: `9bddc7d6bfc3eb1dcceaaf8374b11f20440c8fb6`.
- Owned new test `packages/ux-receipts/src/verify.lookup-boundary.test.ts`; additive changes to `packages/ux-receipts/src/verify.ts` and `docs/ai/ACTIVE_WORK.md` are child-only, preserve the parent guard. No modifications to the parent branch or existing receipt test file.

## Confirmed from the pinned source

The parent guards `res.facts` for null/object and `facts.confirmed` for boolean, but reads `res.status` outside its `try/catch` before checking whether `res` itself is a nonnull object. A `ChainVerifier.lookup` promise resolving to null/undefined can therefore throw instead of degrading to `unavailable`. Optional fields inside an otherwise valid `facts` object are trusted as strings: malformed sender/recipient types can throw in `matchesAddress`, and nonstring amount/asset values can be treated as definitive mismatches rather than as invalid adapter evidence. These are violations of the verifier's documented fail-closed boundary, **not evidence of a real-funds exploit**.

The child fix rejects null, primitive, and array top-level lookup responses and rejects nonstring nonundefined optional evidence fields. It returns `unavailable` / `self_consistent_unverified` / `chain_unavailable`, without changing valid true/false confirmation, exact amount/asset/address matches, the `tx_exists_only` case or not-found. It preserves browser-only, noncustodial behavior and adds no dependencies or exported API.

## Regression verification and review gates

- Regression tests were committed **before** the implementation. Cases: six invalid top-level response forms, six malformed optional evidence forms, and valid confirmed/unconfirmed/tx-exists-only/not-found neighbors. The tests are source files in this branch; baseline fail and fixed native Vitest outcomes are **not claimed until hosted CI**.
- Source inspection: parent branch plus `verify.ts`, `address.ts`, `disclose.ts`, receipt fixture, existing receipt tests and ownership instructions; CI for parent #449 passed five workflows with 24/24 main CI jobs at exact parent head before this child.
- GitHub Actions exact-child-head tests/typecheck/lint/build/browser coverage must pass. This coordinator cannot fetch a local checkout because `github.com` DNS resolution fails in the container. Do not substitute transcribed JS for repository-native test evidence.
- Independent review is not yet available. Inherited #449 owner remains active; coordinate stacked changes and recheck changed-file ownership before changing parent or merging.
- Integration lock verified held at generation 11 by `994a0d214fb9-root-r3`. Do not release/reassign lock; do not merge into main or deploy absent authorized transfer, parent qualification, independent review, and exact-head required gates.

## Next worker

1. Revalidate live parent/child SHAs; inspect PR workflow run conclusions and specific CI job errors.
2. Repair child only if regression/typecheck/lint fail; preserve test-first commits and parent source guard.
3. Obtain truly independent review of chain-verifier runtime handling; consider exotic throwing getters as a separate explicitly scoped issue, not untested broadening here.
4. Merge in parent-child order only when custody/privacy tests, approval and legitimate integration ownership permit it. Never claim beta feature completeness on this narrow regression fix.
