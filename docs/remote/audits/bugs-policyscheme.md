# Bug hunt: @ghostpay/policy-scheme vs PolicyAccount contracts

Scope: packages/policy-scheme (src, DEVIATIONS.md), test-vectors/policy-scheme.json, PolicyAccount.sol, PolicyAccountFactory.sol, GhostPayPolicyRouter.sol, CONTRACTS_SPEC section 4. Read-only; no source changed.

## Verified findings

### F1. Low. buildWithdrawTypedData trusts caller-supplied limit values
- File: packages/policy-scheme/src/eip712.ts:228-230
- Evidence: only `verifyLimitProof(root, lp.leaf, lp.proof)` (leaf is in tree) is checked. `lp.limit` and `lp.windowSeconds` are never hashed and compared to `lp.leaf`. The `amount > lp.limit` guard therefore uses unauthenticated data.
- Failing scenario: real leaf for T1 is (limit 100, window 3600). Caller passes `{...getLimitProof(tree,T1), limit: 10n**30n}` with amount 1000. `buildWithdrawTypedData` returns typed data and digest without error. `encodeRequestWithdraw` then throws INVALID_PROOF. Contract would revert AmountExceedsLimit at requestWithdraw. No fund loss. The owner is asked to sign an order that cannot execute, and the S3 claim ("refuses amount > limit") does not hold for such inputs.
- Verified: probe run (see below), the forged build succeeds and encodeRequestWithdraw throws.
- Fix: before line 229, require `limitLeafHash({token, limit: lp.limit, windowSeconds: lp.windowSeconds}) === bytes32(lp.leaf)`, else fail INVALID_PROOF.

### F2. Info. Anvil cross-check is silently skipped by default
- File: packages/policy-scheme/src/anvil.test.ts:55, 93
- Evidence: `packages/contracts/out/GhostPayPolicyRouter.sol/GhostPayPolicyRouter.json` is missing, so `describe.skipIf(!available)` skips the whole anvil suite (`npx vitest run` gives 7 skipped). Router-path on-chain checks are not run unless REQUIRE_ANVIL=1 with artifacts.
- Fix: run `forge build` in CI and set REQUIRE_ANVIL=1, or document the skip in DEVIATIONS "Not verified".

### F3. Low. Router calldata builder does not check the router's factory
- File: packages/policy-scheme/src/router.ts:buildPolicyPaymentTx (deployment and feeRecipient are caller inputs)
- Evidence: nothing ties `input.deployment.factory` to the router's `FACTORY()`. Mismatch yields calldata that reverts with NotPolicyAccount. Not verifiable here because the router artifact is missing (see F2).
- Fix: have the caller read `FACTORY()`/`FEE_RECIPIENT()` from the chain or the pinned manifest and assert equality before building.

## Checked, no bug found (with evidence)
- CREATE2: TS predictAccountAddress equals factory predictAddress and policyHashOf. Confirmed on anvil for 4 cases: 3 with a 3-leaf limits root, 1 with zero root. Clone prefix and suffix match OZ 5.6.1 Clones.sol.
- abi.encode vs packed: salt, policyHash, limitLeafHash, typehash structs all use abi.encode. Metadata is packed 57 bytes BE and matches `_checkMetadata`.
- Merkle: 0-leaf rejected (EMPTY_TREE). 1-leaf root==leaf, empty proof. Sorted-pair hashing matches OZ commutative keccak. On anvil, requestWithdraw for a 3-leaf tree succeeded with the TS proof and signed leaf.
- Bigint bounds: gross cap MAX/25 matches checked-mul overflow. uint64 window bound matches. delay 1h..30d matches factory MIN/MAX.
- ABI: payERC20/WithPermit/WithBuffer/Native argument types and order match the Solidity signatures.
- Owner derivation: `h = keccak(S) mod n`, tag = digest[0], same as core-crypto sharedHash.

## Probe run (scratch, not committed)
- `npx vitest run` in packages/policy-scheme (no coverage): 4 files passed, 1 skipped, 53 passed, 7 skipped.
- Scratch probe (vitest, anvil 31337 on port 18547, out/ artifacts): F1 forged proof; factory predict/policyHashOf equality for 4 cases; deploy; requestWithdraw success on a 3-leaf tree. 2/2 passed.

## Not verified
- Scanner (checkScheme2Announcement) against real router-emitted announcements: not run.
- Executing a withdrawal (executeWithdraw, window accounting) and destination change on anvil: not run.
- Router payment paths on anvil (router artifact missing): not run.
- Foundry test suite: not run.
- Vectors generator (test-vectors/generate-policy-scheme.mjs): not re-run.
