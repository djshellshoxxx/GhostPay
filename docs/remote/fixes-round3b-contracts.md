# Round 3b: contracts fixes (verified)

Branch `claude/remote-extensions-3`, 2026-10-21. Inputs: `docs/remote/round-audits/contracts.md` (C-xx), `docs/remote/stress/contracts.md` (F-x),
`docs/remote/research/sec-contracts-assurance.md` (N-x, R-x), `docs/remote/audit-parts/contracts.md`, `packages/contracts/DEVIATIONS.md`.
Every round-1 claim was reproduced with a test before acting. Scope rule: only `packages/contracts/**` and this file were edited; changes that
belong elsewhere are given as a ready patch (appendix A), not applied.

Toolchain: forge 1.8 (`/opt/tools`), solc 0.8.28, halmos 0.3.3 (installed with `uv tool install --python 3.12 halmos` through the proxy).

## Final state

| Check | Result |
|---|---|
| `forge test` (24 suites) | 391 passed, 0 failed (baseline 383) |
| `forge fmt --check` | clean |
| `forge snapshot --check` | pass (non-fuzz entries regenerated in eb59006 because gas changed) |
| `scripts/check-natspec.sh` | OK for all 4 contracts |
| `halmos --match-contract RouterHalmos` | 3/3 pass |
| `REQUIRE_ANVIL=1 npx vitest run` (packages/policy-scheme) | 69/70. The 1 failure ("GhostPayPolicyRouter: pay a counterfactual account ...", `anvil.test.ts:313`) is a client-side throw in `buildWithdrawTypedData` (`merkle proof does not verify`). It fails the same way against artifacts built from d5c355f, which is before any contract change in this round. So it comes from sibling commit b85e0b5 (policy-scheme limit hardening), not from this work. |

Commits: d5c355f (item 7), eb59006 (items 2, 6, the item 1/3 reproductions, docs inside packages/contracts), 454c581 (Halmos).

## Items

### 1. Unsalted `policyHash` dictionary attack (C-01): reproduced yes; documented, contract not changed (owner decision)

Evidence (`test/audit/Round3b.audit.t.sol`):
- `test_item1_policyHashDictionary_limitsRootZero_recoversDestination`: with `limitsRoot == 0`, 64 candidate destinations x 720 hourly delays (1 h .. 30 d)
  recover the destination and the delay from the meta-address `policyHash`.
- `test_item1_deployCalldataAndGettersPublishPreimage`: `deploy` calldata decodes to the full pre-image, and the public getters repeat it.
- `test_item1_blindingLeafWorkaround_defeatsDictionary_andStillWithdraws`: a mitigation that needs no contract change (below).

Design note: salted policyHash
- Proposal: `policyHash = keccak256(abi.encode(destination, delaySeconds, limitsRoot, policySalt))`, with a 32-byte random `policySalt` that the owner
  keeps next to the viewing key. Payers still receive only `policyHash` through the meta-address, and the router is unaffected (it takes only the CREATE2 salt since R10).
- ABI and spec impact: `policyHashOf`, `deploy` and `initialize` gain a parameter. The `initialize` CREATE2 re-derivation changes. CONTRACTS_SPEC section 4's formula changes.
  `@ghostpay/policy-scheme` `computePolicyHash`, its test vectors (`policy-scheme.policyHash`), `encodeDeployAccount` and the generated ABIs all change
  (they are outside `packages/contracts`). No EIP-712 typehash changes. Nothing is deployed (ADR-0014), so there are no migration costs, only coordination.
- Limit: a salt protects only until the first deploy. Deploy calldata (the salt must be passed) and the getters publish the pre-image, so it buys
  "no destination inference from the meta-address before any deploy". It does not buy post-deploy privacy. A design that keeps the pre-image private needs a deployer
  that proves knowledge without revealing it, which is out of scope.
- Why not implemented: keeping the ABI, spec formula and policy-scheme vectors coherent requires edits outside this round's scope. A contracts-only change would
  leave the TS client computing different addresses (funds sent to undeployable addresses). **Owner decision:** either (a) adopt the salted form
  across contracts, spec and policy-scheme in one change, or (b) keep the current form and use the blinding-leaf workaround.
- Workaround available now, with no contract change: the client adds a secret random "blinding" leaf (`token = address(uint160(keccak256(secret)))`, any limit) to
  the limits tree. That makes `limitsRoot` high entropy. Cost: every token the owner wants to withdraw then needs its own leaf, unlimited or
  capped (P1: a token without a leaf cannot leave). The test shows the dictionary fails even when the public leaves are known, and withdrawals still work.
  Recorded as DEVIATIONS R16.

### 2. Pending withdrawals follow a later destination change (C-02, review-policy F-03): reproduced yes; fixed (eb59006)

- Before: `test_attack_changeAppliesAfterTwiceDelay_pendingWithdrawalsFollowNewDestination` passed, i.e. a request made before the change paid the
  new destination.
- Fix: `requestWithdraw` stores the current `destination` in an internal `StoredRequest`. It is packed into the `windowSeconds` slot, so no new slot is used.
  `executeWithdraw` reverts `DestinationChangedSinceRequest(requested, current)` before any state change while they differ. The request stays
  `Pending`: it can be cancelled, or it becomes executable again if the destination is changed back. New view `requestDestination(id)`.
  The `requests(id)` ABI, the `Request` struct and all typehashes are unchanged. The ABI gains one error and one view, so `packages/policy-scheme/src/abi` should be regenerated
  with `scripts/gen-abi.sh` (outside scope; existing calls are unaffected).
- Tests: the old test was replaced by `..._pendingWithdrawalsDoNotFollowNewDestination`. That test covers the revert, no window booking, a fresh request paying the new destination,
  and switching back re-enabling the old request. Also `Policy.audit.t.sol::test_pendingWithdrawDoesNotFollowDestinationChange` and the new invariant
  `invariant_pendingRequestsPayOnlyTheirBoundDestination`. A manual mutant that disables the check makes the invariant fail.
- Gas: up to about +3k per `requestWithdraw`.
- Client consequence: after a destination change, pending requests must be signed again, which costs one more delay. Spec text: see appendix A.

### 3. Fee-token failure freezes funds at an undeployed account (C-04 / audit M-03): reproduced yes on the old code (audit PoC); already fixed by `FeeWaived` (R11). Residuals documented

- `test_item3_blacklistedRecipient_nativeFundsReachable`: with the recipient blacklisted, the deploy succeeds fee-free and the 5 ETH at the address is reachable. The existing
  `test_feeTokenBlacklistNoLongerFreezesCounterfactualAccounts` covers ERC-20 funds.
- `test_item3_blacklistedCaller_getsWaiver`: this is the accepted edge from R11. A caller that the token itself blacklists deploys fee-free.
- Residual (not fixable without trusting the token): `test_item3_residual_brokenFeeTokenViews_freezeCounterfactual`. If the fee token's `balanceOf`
  reverts, `deploy` reverts and the funds stay frozen until the issuer repairs the token (the test shows they are recovered after the repair).
  `test_item3_residual_feeOnTransferFeeToken_reverts`: a fee token that charges on transfer gives `UnexpectedFeeDelta`. Mitigation is operational: choose a mainstream fee token, or `FLAT_FEE = 0`.

### 4. Stolen-key claim overstated (C-08, review-policy F-01): reproduced yes (wording); fixed in packages/contracts, patch for the rest

- Claim checked: `PolicyAccount.t.sol` stolen-key tests show that the contest is symmetric. The thief can cancel and re-propose (DEVIATIONS "Spec observations").
- Fixed: the `PolicyAccount` contract NatSpec, and `packages/contracts/README.md` Limitations (R17).
- Not in scope, so given as a patch (appendix A): `docs/CONTRACTS_SPEC.md:63` ("Goal: a stolen stealth key cannot redirect funds.") and
  `docs/guides/policy-accounts.md:13` ("A thief who steals the key cannot redirect the funds ..."). The guide's "1 second up to 30 days" ignores
  the factory's 1 h minimum (`MIN_DELAY`). This is not patched; flagged for the docs owner.

### 5. `deployments/schema.json` lacks `GhostPayPolicyRouter` (N3 / R-7): reproduced yes (no `policyRouter` key); not applied, patch provided

- The schema sets `additionalProperties: false` and has no `policyRouter` in the top level, `deployTx` or `bytecodeHashes`.
- Appendix A adds `policyRouter` (address), `deployTx.policyRouter` and `bytecodeHashes.policyRouter`, plus `dependentRequired: policyRouter -> policyFactory`.
- It must land together with the strict key allowlist in `packages/chain-adapters/src/deployments.ts` (`loadDeployment`). Otherwise a manifest
  carrying the new key is rejected by the loader, or the schema and loader disagree. It also needs the client read-back `policyRouter.FACTORY() == policyFactory`.
  That is chain-adapters/deployments scope, so the owner must sign off on the schema change (research R-7).

### 6. PolicyAccount `uint64` wrap (stress F-3): reproduced yes (stress PoC: request at `2^64-11` stored `executeAfter = 86389`); fixed (eb59006)

- `executeAfter` and `pendingEffectiveAt` now use `SafeCast.toUint64`, so the call reverts instead of wrapping.
- Test: `test_item6_timestampNearUint64Max_revertsInsteadOfWrapping` expects `SafeCastOverflowedUintDowncast(64, t + delay)` and `(64, t + 2*delay)`.
- `check-natspec.sh` now ignores the inherited OZ error.
- The `_consume` bucket cast is unchanged (the quotient is below 2^64 for any `uint64` timestamp). DEVIATIONS P15/R15.

### 7. PolicyRouter invariant handler overflow (stress F-1): reproduced yes; fixed (d5c355f)

- Repro: `FOUNDRY_PROFILE=dev FOUNDRY_INVARIANT_FAIL_ON_REVERT=true forge test --fuzz-seed 0xd4 --match-path test/GhostPayPolicyRouter.invariant.t.sol --mt invariant_routerHoldsNothing`
  gave `panic 0x11` in `payWrongRecipient(2^256-1, ...)`.
- Fix: the seed arithmetic is in `unchecked`. With `fail_on_revert=true`, seeds 0xd4, 0xe5, 0xf6 and 0x1 now pass.

### Halmos: installed and run

- `test/formal/Router.halmos.t.sol` has these specs:
  - RT-1: `check_payERC20_conservation`, for any gross ≤ 2^128 and any admissible stealth.
  - PR-1: `check_policyRouter_rejectsNonCloneStealth`, for any salt and any non-clone stealth.
  - FA-1: `check_factory_deployMatchesPrediction`, for any owner, destination, delay and root.
- All three pass. They are not vacuous: an injected wrong expectation produces a counterexample (`gross = 0x18f`), and a trailing `assertTrue(false)` fails each check.
- Command (from `packages/contracts`):
  `FOUNDRY_DYNAMIC_TEST_LINKING=false FOUNDRY_OUT=/tmp/out-halmos halmos --match-contract RouterHalmos --forge-build-out /tmp/out-halmos`.
  `FOUNDRY_DYNAMIC_TEST_LINKING=false` is required because forge 1.8 defaults to dynamic test linking, which compiles `new X()` in tests into `vm.deployCode`, and halmos does not support that cheat code.
- Not done: a CI/nightly job, the PolicyAccount specs PA-1..PA-6 (they need a signature model) and the Sweep specs.

## Appendix A: patch for files outside this round's scope (not applied)

Apply from the repo root with `git apply` (verified with `git apply --check` at 7ee28a6). Also in the scratchpad as `round3b-outside-scope.patch`.

```diff
diff -ru a/deployments/schema.json b/deployments/schema.json
--- a/deployments/schema.json
+++ b/deployments/schema.json
@@ -46,6 +46,10 @@
       "description": "Optional. Factory FEE_RECIPIENT (may differ from the router's).",
       "$ref": "#/$defs/address"
     },
+    "policyRouter": {
+      "description": "Optional. GhostPayPolicyRouter (scheme 0x47500002 checkout). Requires policyFactory; its FACTORY() must equal policyFactory.",
+      "$ref": "#/$defs/address"
+    },
     "deployTx": {
       "type": "object",
       "additionalProperties": false,
@@ -54,7 +58,8 @@
         "router": { "$ref": "#/$defs/bytes32" },
         "sweepRelayer": { "$ref": "#/$defs/bytes32" },
         "policyImplementation": { "$ref": "#/$defs/bytes32" },
-        "policyFactory": { "$ref": "#/$defs/bytes32" }
+        "policyFactory": { "$ref": "#/$defs/bytes32" },
+        "policyRouter": { "$ref": "#/$defs/bytes32" }
       }
     },
     "solcVersion": { "type": "string", "pattern": "^0\\.8\\.\\d+(\\+commit\\.[0-9a-f]{8})?$" },
@@ -68,13 +73,15 @@
         "router": { "$ref": "#/$defs/bytes32" },
         "sweepRelayer": { "$ref": "#/$defs/bytes32" },
         "policyImplementation": { "$ref": "#/$defs/bytes32" },
-        "policyFactory": { "$ref": "#/$defs/bytes32" }
+        "policyFactory": { "$ref": "#/$defs/bytes32" },
+        "policyRouter": { "$ref": "#/$defs/bytes32" }
       }
     },
     "date": { "type": "string", "format": "date-time" },
     "signature": { "type": "string", "pattern": "^0x[0-9a-fA-F]+$" }
   },
   "dependentRequired": {
+    "policyRouter": ["policyFactory"],
     "policyFactory": [
       "policyImplementation",
       "policyFeeToken",
diff -ru a/docs/CONTRACTS_SPEC.md b/docs/CONTRACTS_SPEC.md
--- a/docs/CONTRACTS_SPEC.md
+++ b/docs/CONTRACTS_SPEC.md
@@ -60,11 +60,11 @@
 
 ## 4. Policy-guarded stealth account (scheme id `0x47500002` = "GP" + 2) , built after the core audit
 
-Goal: a stolen stealth key cannot redirect funds. Hardened derivation reuses scheme-1 maths to obtain the **owner** EOA address `A_owner`; funds are sent to the counterfactual account `A_acct = CREATE2(factory, salt = keccak256(abi.encode(A_owner, policyHash)), clone-of(implementation))`.
+Goal: a stolen stealth key cannot redirect funds faster than `2 × delay`, and the honest owner (who holds the same key) can cancel within that window. It is a delay, not a prevention: the thief can cancel the owner's actions and re-propose without limit, so funds stay safe only while the owner (or a watcher with a pre-signed cancel) cancels every hostile proposal in time (packages/contracts DEVIATIONS "Spec observations", R17). Hardened derivation reuses scheme-1 maths to obtain the **owner** EOA address `A_owner`; funds are sent to the counterfactual account `A_acct = CREATE2(factory, salt = keccak256(abi.encode(A_owner, policyHash)), clone-of(implementation))`.
 
 - `policyHash = keccak256(abi.encode(destination, delaySeconds, perTokenLimitsRoot))` is part of the seller's scheme-2 meta-address. It hides the destination only with a high-entropy `perTokenLimitsRoot`: with a zero root, a candidate destination is confirmed by trying the 1 h .. 30 d delay range. `deploy` calldata publishes the full pre-image, so the first deployment reveals the destination and links the seller's deployed accounts. The checkout router takes only the per-payment CREATE2 salt `keccak256(abi.encode(A_owner, policyHash))`, never `policyHash`, so router payments are not linked to the seller (packages/contracts DEVIATIONS R10).
 - `PolicyAccountFactory(address implementation, address feeToken, uint256 flatFee, address feeRecipient)` immutable. `deploy(owner, destination, delay, limitsRoot)` checks `policyHash`, pulls `flatFee` of `feeToken` from `msg.sender` to `feeRecipient` (F-SECURE; waived, with a `FeeWaived` event, only when the token refuses the transfer although the caller's balance and allowance cover the fee, so a blacklisted or paused fee recipient cannot freeze counterfactual funds, DEVIATIONS R11), deploys the minimal clone (EIP-1167) and initialises it once. Anyone can deploy; the account address is independent of who pays.
-- `PolicyAccount` rules: only `destination` may receive funds; `requestWithdraw(Withdraw w, LimitProof lp, bytes sig) returns (bytes32 id)` where `Withdraw{token, amount, deadline, nonce, limitLeafHash}` and `LimitProof{limit, windowSeconds, proof}` (EIP-712 `Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce,bytes32 limitLeafHash)`, signed by `owner`; `limitLeafHash` is the limit's merkle leaf and the supplied proof must use it) starts a timer, `executeWithdraw(id)` callable by anyone after `delay`, `cancel(id, sig)` by owner; destination change = `proposeDestination` + `2 × delay` timelock + owner signature, cancellable; per-token cap enforced with two fixed buckets of `windowSeconds` (bucket = `timestamp / windowSeconds`; `previous + current <= limit` at every booking, so up to two windows may pass before the next full spend; leaf = `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))`; no cap when `limitsRoot == 0`; the cap is booked at `executeWithdraw`, not at request; a token whose `windowSeconds` differs from the recorded one reverts `WindowMismatch`); no `delegatecall`, no generic `execute`, no ETH callback logic beyond `receive()`.
+- `PolicyAccount` rules: only `destination` may receive funds; `requestWithdraw(Withdraw w, LimitProof lp, bytes sig) returns (bytes32 id)` where `Withdraw{token, amount, deadline, nonce, limitLeafHash}` and `LimitProof{limit, windowSeconds, proof}` (EIP-712 `Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce,bytes32 limitLeafHash)`, signed by `owner`; `limitLeafHash` is the limit's merkle leaf and the supplied proof must use it) starts a timer and records the current destination, `executeWithdraw(id)` callable by anyone after `delay` (reverts `DestinationChangedSinceRequest` if the destination changed since the request; DEVIATIONS R14), `cancel(id, sig)` by owner; destination change = `proposeDestination` + `2 × delay` timelock + owner signature, cancellable; per-token cap enforced with two fixed buckets of `windowSeconds` (bucket = `timestamp / windowSeconds`; `previous + current <= limit` at every booking, so up to two windows may pass before the next full spend; leaf = `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))`; no cap when `limitsRoot == 0`; the cap is booked at `executeWithdraw`, not at request; a token whose `windowSeconds` differs from the recorded one reverts `WindowMismatch`); no `delegatecall`, no generic `execute`, no ETH callback logic beyond `receive()`.
 - Announcement: `schemeId = 0x47500002`, `stealthAddress = A_acct`, same ephemeral key/view tag derivation as scheme 1. Scanner derives `A_owner`, predicts `A_acct`, compares.
 - Fee: F-SECURE flat fee, immutable per factory deployment. Documented limitation: opt-in, new scheme, no wallet interoperability, key theft still permits withdrawals to the owner's own destination after the delay.
 
diff -ru a/docs/guides/policy-accounts.md b/docs/guides/policy-accounts.md
--- a/docs/guides/policy-accounts.md
+++ b/docs/guides/policy-accounts.md
@@ -10,7 +10,7 @@
 - every withdrawal waits a **delay** (1 second up to 30 days) before it can be executed;
 - optional **per-token caps** over a rolling window.
 
-A thief who steals the key cannot redirect the funds, and cannot drain them faster than the caps allow, before the delay passes. During the delay a key holder can cancel.
+A thief who steals the key cannot redirect the funds before twice the delay has passed, and cannot drain them faster than the caps allow. This is a delay, not protection forever: the thief holds the same key, can cancel your actions and can propose a new destination again and again. Your funds stay safe only while you (or a watcher you trust) cancel each of the thief's destination proposals in time, so watch the account and move future payments elsewhere.
 
 ![Policy account timelock: withdraw waits one delay, destination change waits twice the delay, owner can cancel in between](../assets/diagrams/policy-account-timelock.svg)
 
@@ -19,7 +19,7 @@
 | Action | What happens | Wait |
 |---|---|---|
 | `requestWithdraw` | Owner signs an EIP-712 message; anyone may submit it | Starts the delay |
-| `executeWithdraw` | Anyone may call; funds go only to the destination, within caps | After the delay |
+| `executeWithdraw` | Anyone may call; funds go only to the destination, within caps; a request made before a destination change cannot execute (cancel and request again) | After the delay |
 | `cancel` | Owner signature cancels the pending request | Before execution |
 | `proposeDestination` | Owner proposes a new destination | Starts a 2 x delay timer |
 | `executeDestinationChange` / `cancelDestination` | Apply or cancel the change | After 2 x delay / before |
```
