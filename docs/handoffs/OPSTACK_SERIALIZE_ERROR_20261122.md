# GhostPay — OP Stack fee serialization boundary, 2026-11-22 UTC

## Identity and ownership
- Cycle/worker: `20261122T1036Z`, a single GitHub connector coordinator operating sequentially; **no native parallel worker, independent verifier, or GitHub approval** took place.
- Isolated branch: `automation/20261122T1036Z/bug/opstack-serialization-boundary`. Original main and task base: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Initial product blob: `2f55a4af5b36ff10f279c66e0b13dcf83e87b1bb`. Patched product logic blob: `bea2bbd480e7b35802e50b4e92856d02a72e2221` (current source/JSDoc blob: `22c0e91d1eae6f09b5b3349c8d596b7bc837981a`). Last regression-file blob: `bb0adff5db50d7823baa83d0888fcfdc4f63c748`.
- Owned paths: `apps/web/src/lib/opStackFee.ts`, new `apps/web/src/lib/opStackFee.serialization.test.ts`, additive `docs/ai/ACTIVE_WORK.md`, this handoff. No shared integration files edited.

## Finding and correction
`sweepFeeReserve` serialized the EIP-1559 unsigned transaction **before** the existing try/catch that translates failed fee-oracle work into the fixed `UserFacingError` (`error.sweep.couldNotReadTheL1DataFeeFromThisChain`). An invalid runtime transaction which `viem` rejects at serialization could instead escape as a low-level error. This is defensive error-path correctness; live reachability, exploitability, and a real-wallet failure are **not established**.

The single-statement production repair moves `serializeTransaction({ type: 'eip1559', ...tx })` inside the existing try/catch; OP Stack L1/operator fee math, reserve multiplier, non-OP zero-fee fast path, RPC request ordering, wallet signing, and transaction authority remain unchanged.

Commit sequence:
1. Claim before product edits: `8de6bfb7acd11fab5c3be05240856f272482e1f9`.
2. Regression first: `0a99c9f44e3e45fd19f7c95f6ab195a3e3182a1f`. Negative nonce, gas, and value, plus a tip above the EIP-1559 fee cap; non-OP fast path; valid OP Stack fee controls. Committed **before** production change, but not run as repository Vitest.
3. Production repair: `18c49808d4f8af2f998ac7f6c750d3857cc415c3`.
4. Test-only assertion simplification: `c64172fb96b0a40fcf8cee15cda3cf350253ac02`.
5. Extra deterministic EIP-1559 tip-over-fee-cap regression: `c896e55058268416d2ec6cc83d2e2bde2864d6f4`; inspected upstream viem source shows `assertTransactionEIP1559` rejects this mismatch, but the repository Vitest case remains unexecuted.
6. Updated production JSDoc only: `b3285eff16acf3ed4b7000548aa6b60ad7598bca`.

## Actual verification and limitations
- Executed Node.js **v22.16.0** on local `/mnt/data/ghostpay-r11/fee-boundary-replay.mjs`: **2/2 source-equivalent assertions passed**, showing a raw RangeError escapes the old catch boundary and a typed user-facing error comes from the corrected boundary with a mocked serializer. This script is a source-equivalent control-flow reproduction, **not** actual `viem`, repository Vitest, TypeScript, lint, build, browser, integration, static security/Mythril, or wallet test. The local scratch file is not durable and is not an authoritative checkpoint.
- `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed: `Could not resolve host: github.com`. Native checkout/dependency execution therefore unavailable. GitHub connector source/commit writes succeeded.
- Check exact **final branch HEAD**, GitHub-hosted CI/Pages/Beta checks, Vitest for the new test and adjacent `sweep.test.ts`, typecheck/lint/build, and separate verification before any promotion. Any future failing test is a blocker, not a reason to suppress or relax the test.

## Collision, security and integration limits
- Reviewed `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `docs/ai/ACTIVE_WORK.md`, `SECURITY.md`, Pages workflow and the live integration-lock JSON.
- Inspected changed-file lists of active #372/#278/#264/#262/#349/#307/#380/#454/#455/#461/#462/#452/#449/#450/#274: no edit to `opStackFee.ts` observed. Open-PR description search also found no `opStackFee`, `sweepFeeReserve` or `GasPriceOracle` claim. This is **bounded**, not exhaustive, and must be refreshed at integration.
- Larger active consolidation and recovery PRs do change adjacent `sweep.ts`/Pay flow. Recheck exact ancestry, patches, required checks, security findings and product policies at qualification.
- Integration metadata branch `automation/ghostpay-integration-lock`, HEAD `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`, is **held**, generation **11**, owner `994a0d214fb9-root-r3`. Do not steal because its time expired; coordinate with prior owner. No shared-ledger or protected merge was authorized. Source-pinned broader ledger is draft PR #380.
- Pages PR workflows are validation only; publishing requires an explicit workflow-dispatch path, which must not be invoked. No main merge, deployment, release, paid agent, real-funds transaction, force push, signing/contract/relayer changes, or lock mutation took place.

## Next invocation
1. Read this handoff and live PR/head, exact-head status and logs; fix actual red jobs on this exclusively owned branch.
2. Obtain an independent source/test and exact-final-candidate verifier, including actual serializer rejection and the valid OP Stack fee arithmetic.
3. Compare other active branches, fresh main and their claims, reconcile any overlapping source.
4. Keep draft/unmerged until passing required exact-head gates, valid lock owner, verified no-deployment merge behavior, security clearance and proper independent approval. Continue higher-priority P0 recovery work under its separate owners; do not duplicate #455/#372.
