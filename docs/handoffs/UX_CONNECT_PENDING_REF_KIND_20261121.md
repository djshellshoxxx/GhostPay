# GP-BUG-22 — Pending-reference runtime kind boundary

Date: 2026-11-21. Repository: `djshellshoxxx/GhostPay`. Target: existing static-Pages-compatible `@ghostpay/ux-connect` pure pending-reference parser; no wallet or network operations.

## Exact source and defect

- Base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da` (verified live at discovery).
- Branch: `automation/20261121/bug/ux-connect-pending-kind-r12`.
- Original `packages/ux-connect/src/compat.ts` Git blob: `7647a8c59b64370bdc16cb85bc762269cb8f483e`.
- Corrected `packages/ux-connect/src/compat.ts` Git blob: `135cd7480f07353fd9c17461c281cd071fcd1e02`.
- The existing `parsePendingRef(kind,hash)` validated only the 32-byte hash. A runtime `kind='transactionHash'` or `null` with a valid hash returned `ok:true` despite the only supported kinds being `txHash`, `safeTxHash`, and `userOpHash`. Downstream `isVerifiable` assumes a canonical supported kind and tests only `txHash`. Invalid pending-reference states should be rejected at the existing parser boundary rather than silently passed along.
- Reproduction: isolated Node v22.16.0 source-equivalent bodies from exact main `hex.ts` and `compat.ts`; unknown string and null kinds both incorrectly accepted. A baseline rejection assertion failed (exit 1, `true !== false`). No user wallet, live transaction, RPC, or browser was exercised.

## Regression-first implementation

1. Additive branch-local ownership claim: `4a43fda6f793b5e2ef4a1a33d9b740bba10300cc`.
2. Committed failing Vitest regression: `dda3af1f7908f7838aed784be6482d54f30dabcc`, new `packages/ux-connect/src/compat.pending-ref.test.ts`. Tests unexpected string/null/undefined/object kinds, preservation of three supported kinds and normalization, and existing malformed-hash rejection.
3. Smallest repair: `5d192528ecdc4cb240b084e862baa8f452401801`. `kind` now crosses the parser as `unknown` and is narrowed to the three permitted kinds before hash validation; same canonical return shape and error pattern.

## Verification evidence and limits

- Before: source-equivalent Node 22 rejection assertion **failed**, as expected; the baseline returned `ok:true` for invalid kinds.
- After: **283/283 source-equivalent Node 22 assertions passed** for invalid kinds, three supported kinds, malformed hashes and 256 neighboring lowercase hashes. This is an extracted-logic proof, **not** repository Vitest, full-module execution or a native-browser test.
- New Vitest cases are committed but **were not executed locally**; container cannot resolve github.com for an actual repository checkout. Hosted exact-head CI is required to validate them in the repository.
- No independent human/agent verifier exists in this run; own self-review is not independent.

## Ownership and integration gates

At discovery, all **188** GitHub open PR changed-file inventories were checked and none touched `packages/ux-connect/src/`. The new test file is new and the handoff is unique; `docs/ai/ACTIVE_WORK.md` was updated only on this isolated branch with an additive claim. Recheck conflicts and main head before any integration.

Draft PR only. All exact-head CI, relevant native browser coverage, independent reviewer approval, verified absence of overlap and legitimate integration-lease transfer/release remain mandatory for merging. The distinct `automation/ghostpay-integration-lock` branch contains generation **11**, status **held**, owner `994a0d214fb9-root-r3`, as of this run. The lock's expired timestamp grants no takeover authorization. No merge, release, deployment, contract/fund interaction, or unrelated changes were made.

## Publication checkpoint (additive, 2026-11-21)

- Published **draft PR [#430](https://github.com/djshellshoxxx/GhostPay/pull/430)** on the isolated branch; initially published head `73b144ff5de934a70804ccee04ed8d8815d217bd`.
- Initial exact-head GitHub Checks inspection reported three CodeQL analysis jobs in progress (zero recorded failures at that observation); other required workflows had not populated. **This is not a CI PASS.** A documentation-only status commit after publication moves the branch head, so all checks must be refreshed against the final live PR head, not the initial head.
- The PR has zero submitted GitHub reviews at publication. No qualified merge/release ownership; leave draft.
