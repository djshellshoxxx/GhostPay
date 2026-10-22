# Audit 05: contracts-core

- Area: `packages/contracts/src`, `script`, `test` (GhostPayRouter, GhostPaySweepRelayer, PolicyAccount, PolicyAccountFactory, GhostPayPolicyRouter, deploy scripts incl. DeployAnnouncer).
- Snapshot: commit `88de0018b86884d49d70d269c430bdcbb39a0b4f` (read-only worktree). All file:line references are to that snapshot.
- Nature: AI-assisted review. This is not an independent professional audit.

## 1. Summary

No critical, high or medium issue found. Two new Low findings, both on the native "gas buffer" entry points, and two Info items. Both Lows have forge PoCs, which pass.

| ID | Sev | Title |
|---|---|---|
| CONTRACTS-CORE-01 | Low | Policy-router gas buffer goes into the PolicyAccount. It is not usable as gas, and it is stuck for good when the limits tree has no native leaf |
| CONTRACTS-CORE-02 | Low | `payERC20WithBuffer` sends native value with no fee and no metadata, under an announcement that names the router as caller |
| CONTRACTS-CORE-03 | Info | Factory constructor still accepts a `FEE_TOKEN` with no code (carry-over C-06, not fixed) |
| CONTRACTS-CORE-04 | Info | No read-only post-deploy smoke check for scheme 2 (factory and policy router) |

Regression check against audits 02 and 04 and `docs/remote/round-audits/contracts.md`:
- Fixed, no regression: L-01 (return-data bomb: `GhostPayRouter.sol:241-249`, `GhostPayPolicyRouter.sol:287-298`, `PolicyAccount.sol:203-209` use assembly `call` with no copy), L-04 (`limitLeafHash` is signed, `PolicyAccount.sol:149-161`), M-02 (`GhostPayPolicyRouter`, scheme `0x47500002`), I-02 (factory `MIN_DELAY`, `PolicyAccountFactory.sol:100`), L-06 (a)-(f) (`DeployBase.s.sol`, read-backs, `MAX_FLAT_FEE`, codehash pins, `ALLOW_LOCAL`), C-10 (`foundry.toml` is portable).
- Still open, by design or needing an owner decision (not re-reported): M-01/D5 (immutable fee recipient), M-03/C-04 (fee-token failure freezes counterfactual accounts), L-02/D4 (unauthenticated announcement content, free view tag, ephemeral key checked for prefix only), L-03, L-05/C-05, C-01, C-02, C-08, I-03..I-08, policy-router F1/F3 (`docs/remote/audits/bugs-policyrouter.md`).

## 2. Method

- Read every line of the five `src/` contracts, the interfaces, every `script/` file and the test fixtures/mocks used for PoCs.
- Checked these properties by hand:
  - reentrancy: all state-changing entry points are `nonReentrant`; the guard starts at 0 in clones, which OZ 5.6.1 accepts
  - fee floor and overflow
  - permit try/catch griefing, including phantom-permit tokens (a WETH-style fallback is harmless because `from` is always `msg.sender` in the routers and is signature-bound in the relayer)
  - EIP-712 typehash and field order versus `abi.encode` for Sweep, Withdraw, ProposeDestination and the two Cancel structs
  - domain separation in clones: the EIP712 cache is keyed on `_cachedThis` = implementation, so clones rebuild the separator with their own address
  - nonce bitmaps
  - CREATE2 / EIP-1167 initializer authentication (`PolicyAccount.sol:123-128` against `PolicyAccountFactory.sol:101-118`)
  - two-bucket window math (`PolicyAccount.sol:342-360`)
  - exact-delta checks against fee-on-transfer, rebasing and self-transfer tokens
  - native transfers
  - deploy-script fail-closed paths
- Ran the full suite in the snapshot (`FOUNDRY_PROFILE=dev forge test`): 402 tests passed, 0 failed.
- Wrote PoCs in `packages/contracts/test/audit05/ContractsCore05.t.sol` (scratch, inside the snapshot worktree):
  `forge test --match-path 'test/audit05/*' -vv` gives 2 tests passed.

## 3. Findings

### CONTRACTS-CORE-01 (Low): policy-router gas buffer is not a gas buffer and can be stranded

- Code:
  - `GhostPayPolicyRouter.sol:161-178` (`_sendNative(stealth, msg.value)` where `stealth` is the PolicyAccount clone)
  - `PolicyAccount.sol:112` (`receive`)
  - `PolicyAccount.sol:157-164` (when `limitsRoot != 0`, a token without a leaf cannot be requested)
  - Spec text: `docs/CONTRACTS_SPEC.md:76` ("msg.value is forwarded to stealth as gas buffer").
- What happens: in scheme 2 the gas buffer goes to the account contract, not to the owner EOA `A_owner`. The owner EOA gets no gas. The buffer can only leave through `requestWithdraw(address(0))`, which pays out to `destination` after `delay`. If the seller's limits tree has no `address(0)` leaf (for example, a seller who accepts USDC only), the native buffer can never leave the account.
- PoC: `test_policyBufferStuckWithoutNativeLeaf`.
  1. The tree is a single USDC leaf.
  2. `payERC20WithBuffer{value: 0.01 ether}` succeeds.
  3. `acct.balance == 0.01 ether` and `owner.balance == 0`.
  4. After deploy, a correctly signed native Withdraw reverts with `InvalidLimitProof`. The buffer is lost for good.
- Impact: payer-funded value (bounded by `maxBufferWei`) is lost or misdirected. No third party can steal it. The TS `tx-review` package already refuses buffer calldata for scheme 1 (`packages/tx-review/src/decode.ts:111`), but `packages/policy-scheme/src/router.ts:16` still exposes `payERC20WithBuffer` for scheme 2.
- Fix:
  - Preferred: remove `payERC20WithBuffer` from the policy router, or make it revert. PolicyAccount actions are relayable signatures, so a buffer in the account has no use.
  - Alternative: forward the buffer to `policy.owner` instead. That links `A_owner` to `A_acct` on chain, so it is a privacy trade-off.
  - Also update CONTRACTS_SPEC section 4.

### CONTRACTS-CORE-02 (Low): buffer path sends native value with no fee and no metadata

- Code: `GhostPayRouter.sol:132-147` and `GhostPayPolicyRouter.sol:161-178`. The buffer has no fee, `maxBufferWei` is chosen by the caller, the metadata is checked only against the ERC-20 leg (`_checkMetadata(..., address(token), net)`), and `_sendNative(stealth, msg.value)` is not reflected anywhere in the announcement.
- PoC: `test_bufferNativeFeeBypass`.
  1. The payer deploys a throwaway token and calls `payERC20WithBuffer{value: 10 ether}(junk, stealth, gross=1, ...)`.
  2. The stealth address receives 10 ETH, and `FEE_RECIPIENT` gets 0. `payNative` would have charged 0.025 ETH.
  3. The Announcement has `caller == router`, and its metadata says "1 unit of junk".
- Impact:
  - (a) The F-PAY fee invariant does not hold for native value sent through the router. The fee is already avoidable by a direct transfer plus a direct announce (I-03/I-08), but in that case the `caller` is not the router. Here the payment carries the router's announcement.
  - (b) Any scanner or accounting that trusts metadata shows the wrong asset and amount. This is a spoofing variant of L-02.
- Fix:
  - Cap the buffer relative to the payment, or charge `FEE_BPS` on it.
  - Or encode the buffer in metadata: extend the layout and bump the marker.
  - At minimum, document it in FEE_SCHEDULE, and have scanners always read the real native balance delta.

### CONTRACTS-CORE-03 (Info): factory accepts a fee token with no code (carry-over C-06, still open)

- Code: `PolicyAccountFactory.sol:76-80`. This checks only `implementation_.code.length`. With `flatFee_ != 0` and `feeToken_` set to an EOA or a not-yet-deployed address, every `deploy` reverts at `balanceOf` (`:108`). That freezes funds already sent to counterfactual accounts, the same mechanism as M-03.
- Mitigated only off-chain: `script/DeployPolicy.s.sol:69` checks `FeeTokenHasNoCode`.
- Fix: add `if (flatFee_ != 0 && feeToken_.code.length == 0) revert` in the constructor.

### CONTRACTS-CORE-04 (Info): no scheme-2 post-deploy smoke check

- Code: `script/SmokeSepolia.s.sol:24-58` verifies only the router and the sweep relayer.
- There is no read-only check that:
  - a deployed `GhostPayPolicyRouter.FACTORY()` equals the manifest factory
  - `factory.IMPLEMENTATION()` has the expected codehash and `initialized() == true`
  - `FLAT_FEE`/`FEE_TOKEN` match the manifest
- `DeployPolicyRouter` pins are optional (`script/DeployPolicyRouter.s.sol:113-121`). This is related to C-09.
- Fix: add a `SmokePolicy` script and make the codehash pins mandatory on non-testnet chain ids.

## 4. Checked and found sound

- Reentrancy: every mutating external function in all five contracts is `nonReentrant`. `initialize` is one-shot and called atomically by the factory. Token hooks (`test/mocks/HookToken.sol`, `ReentrantToken.sol`) are covered by existing tests.
- Fee math: `fee = gross*25/10000` rounds down, `net > 0` for `gross > 0`, and overflow above `max/25` panics. No rounding gives value to anyone other than the payer.
- Permit griefing: a front-run permit is swallowed and the transfer still needs allowance. A copied router permit cannot be redirected (`from == msg.sender`). In the sweep, every field including `feeTo` is signed, so a searcher who copies the call pays the original `feeTo` (`GhostPaySweepRelayer.sol:94-109`).
- Signature domain: chain id plus verifying contract (each clone address), distinct typehashes, `ECDSA.recover` rejecting high-s, nonces consumed before external calls, and cancel ids that cannot repeat (nonce inside the id).
- CREATE2 init: only the deployer that derives `address(this)` from `(owner, policyHash)` can initialize it. The implementation locks itself in its constructor.
- Window: two consecutive buckets with `previous` reset unless the buckets are adjacent. No interval of length W exceeds `limit`.
- Token quirks: USDT-style no-return works through SafeERC20. Fee-on-transfer and rebasing tokens fail closed (exact deltas). Blacklisting is a DoS only (known M-01/M-03). A token address with no code reverts.
- Native transfers: assembly call with no return-data copy. Destinations are payer-chosen, owner-chosen or immutable.
- DeployAnnouncer: fails closed on a non-canonical address unless the operator opts in, and compares the codehash with a fresh local build.

## 5. Not reviewed or not verified

- Echidna harnesses (`test/echidna/*`): read, not run. Default-profile fuzz (10k runs) and invariant runs were not executed (dev profile only).
- Slither and mutation testing were not re-run. Gas measurements were not repeated.
- Behaviour of the vendored OZ 5.6.1 and forge-std was assumed from the version, not diffed against upstream.
- Off-chain consumers (scanner, relayer service, `policy-scheme`, `tx-review`) were only grepped for buffer usage.
- Chains with non-standard CREATE2 (zkSync and similar) and EIP-7702-delegated stealth EOAs were not analysed beyond noting that `ECDSA.recover` still binds the key.
- No on-chain deployment or announcer bytecode on any live network was checked.
