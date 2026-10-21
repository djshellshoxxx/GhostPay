# Bug hunt: packages/contracts (Router, SweepRelayer, PolicyAccount, PolicyAccountFactory)

Scope: `packages/contracts/src/{GhostPayRouter,GhostPaySweepRelayer,PolicyAccount,PolicyAccountFactory}.sol` and their interfaces, plus `test/` and `test/audit/`. `GhostPayPolicyRouter` excluded (in progress). Read-only: no source, test or config changed. PoC tests lived in a scratch copy, not in the repo.

Read first: `packages/contracts/DEVIATIONS.md` (items 1-12, P1-P19, A1-A6, R1-R9), `docs/audits/02-security-review-contracts.md` (M-01..I-08), `docs/CONTRACTS_SPEC.md` sections 1, 2, 4, `docs/SPEC_REVIEW.md`. Items below that are already in those documents are not re-reported.

## Summary

| Severity | Count |
|---|---|
| critical | 0 |
| high | 0 |
| med | 0 |
| low | 2 |
| info | 3 |

No new critical, high or medium defect verified. Two low findings, both about missing deploy-time or input validation that is not documented as a deliberate choice. The rest is checked-and-correct behaviour, recorded so nobody re-audits it.

## Findings

### BUG-C1 (low): factory accepts a fee token with no code; every `deploy` then reverts

- Where: `src/PolicyAccountFactory.sol:76-79` (constructor checks only `feeToken_ == 0` when `flatFee_ != 0`), `:105-108` (`token.balanceOf(FEE_RECIPIENT)` on the fee token).
- Evidence: scratch PoC `test_poc_feeTokenNoCode_constructorAccepts_deployReverts` PASS. Constructor with `feeToken = 0xFEE7` (EOA), `flatFee = 1e6` succeeds; `deploy(...)` reverts.
- Scenario: a deployer sets `FEE_TOKEN` to a wrong or not-yet-deployed address on a chain. Every account deployment on that factory reverts. `FEE_TOKEN` and `FLAT_FEE` are immutable, so the fix is a new factory and new `policyFactory` / `A_acct` addresses. `DeployPolicy.s.sol` is said to check this (DEVIATIONS P16), but the contract itself does not.
- Fix: `if (flatFee_ != 0 && (feeToken_ == address(0) || feeToken_.code.length == 0)) revert ZeroAddress();` (or a dedicated `FeeTokenHasNoCode` error), mirroring `ImplementationHasNoCode`.
- Status: not in `docs/audits/02` (L-06 covers only the scripts). Not documented as deliberate.

### BUG-C2 (low): no validation that `owner` can sign or that `destination` is a plausible payee

- Where: `src/PolicyAccountFactory.sol:98` (only zero checks on `owner`/`destination`); `src/PolicyAccount.sol:119-121` (`initialize`: zero and `address(this)` only).
- Evidence: scratch PoC `test_poc_unsignableOwnerAndImplDestinationAccepted` PASS. `deploy(owner = IMPLEMENTATION, ...)` succeeds; `deploy(owner = ..., destination = IMPLEMENTATION)` succeeds and `destination()` returns the implementation.
- Scenario A (owner): `owner` is a contract (for example a multisig, the implementation, the factory, or a token). `PolicyAccount._checkOwner` uses `ECDSA.recover`, which yields only EOA keys. No `requestWithdraw`, `cancel`, or `proposeDestination` can ever verify, so value sent to the counterfactual address, and the flat fee, are locked with no recovery path. Caveat for any fix: an EIP-7702-delegated EOA has code (`0xef0100...`), so a plain `code.length != 0` rule would wrongly reject a valid owner. Any fix must special-case the 7702 delegation prefix or rely on client validation.
- Scenario B (destination): `destination` = implementation, factory, or an ERC-20 token. Native withdrawals to the implementation succeed (its `receive()` accepts ETH) and the ETH is unrecoverable. ERC-20 sent to the implementation has no path out. One mistyped address in a timelocked policy is therefore permanent loss. `destination` is part of `policyHash`, so it cannot be changed without a new account.
- Fix: reject `destination_` equal to `_IMPLEMENTATION` and the factory address (both knowable in `initialize` via `msg.sender` and `_IMPLEMENTATION`); keep owner validation in the client and document it, or add a 7702-aware EOA check.
- Status: DEVIATIONS P8 covers `owner == destination` and says client software must validate. The implementation/factory/token destination and contract-owner cases are not mentioned.

### BUG-C3 (info): stealth or destination equal to the token contract is accepted (router and account)

- Where: `src/GhostPayRouter.sol:212` (checks only zero, `this`, `FEE_RECIPIENT`); same class in `PolicyAccount.sol:119`.
- Evidence: existing test `test_stealthEqualsTokenAccepted_payerFootgun` (PASS), so this is known to the suite. Not a new defect.
- Note: an ERC-20 transfer to the token contract strands the tokens. Client validation is the only guard. Already recorded as a payer footgun; listed for completeness, no action required beyond the client check.

### BUG-C4 (info): router announces with no code check on `ANNOUNCER`

- Where: `src/GhostPayRouter.sol:62-67`.
- Evidence: constructor checks only zero. A non-contract announcer makes every `announce` call revert, so every payment reverts. Known: `docs/audits/02` L-06(a). Deploy-time misconfiguration, not a runtime bug.

### BUG-C5 (info): DEVIATIONS item 9 wording re `feeTo == destination` verified correct

- Where: `src/GhostPaySweepRelayer.sol:139-143`.
- Evidence: scratch PoC `test_poc_feeToEqualsDestination_feeZero` reverts `UnexpectedBalanceDelta` even with `fee == 0` (the shared balance is measured twice, so the fee-side delta check fails). `test_poc_feeToEqualsDestination_feeNonZero` reverts as well. DEVIATIONS item 9 is accurate. Not a bug; recorded so it is not reported again.

## Checked and found correct (no finding)

- Window accounting `PolicyAccount._consume` (`:341-360`): two-bucket rule holds for any interval of length W (pairs of consecutive buckets are bounded by the check at each insertion). Bucket jump of 2 or more zeroes `previous`. `used > limit ||` short-circuit prevents underflow in `limit - used`. `window == 0` only reachable with unlimited limit, which skips `_consume`.
- Timelock and deadline boundaries: `executeAfter = now + delay`, `executeWithdraw` requires `now >= executeAfter`; deadlines inclusive (`now > deadline` reverts) in all four contracts. `proposeDestination` effective at `now + 2*delay`, matches spec.
- Nonce bitmaps: `nonce >> 8` word, `1 << (nonce & 0xff)` bit, consistent between `_authorize`/`_useNonce` and `nonceUsed`. Boundary nonces 255, 256, `type(uint256).max` covered by `PolicyAccount.t.sol:260-263` and `test_nonceMaxUint_works_once`.
- Consumption order: nonce consumed before external calls (relayer `_authorize`, account `_useNonce` after signature check). `executeWithdraw` sets `Executed` before payout and `_consume` reverts roll everything back.
- EIP-712 for clones: `EIP712` in OZ 5.6.1 keeps `_name`/`_version` as immutable `ShortString` (baked into implementation code), and `_domainSeparatorV4` rebuilds when `address(this)` differs from the cached implementation address. Clone domain binds clone address and chain id. Cross-clone and cross-chain replay covered by `test_crossCloneReplayRejected`, `test_crossRelayerAndCrossChainReplayRejected`.
- CREATE2 salt equivalence: factory `keccak256(abi.encode(owner, policyHashOf(...)))` (`PolicyAccountFactory.sol:101`) equals `initialize`'s `keccak256(abi.encode(owner_, keccak256(abi.encode(destination_, delay_, limitsRoot_))))` (`PolicyAccount.sol:123-124`). `predictAddress` uses the same deployer (factory). Front-running initialisation impossible (create and initialise in one tx).
- Metadata encoding (`GhostPayRouter.sol:227-236`): length checked before any slice (short-circuit), `bytes4`/`bytes20`/`bytes32` slices are exact widths, net compared big-endian. Ephemeral key prefix check only (documented; on-chain point validity not checked, same as spec).
- Overflow: `gross * FEE_BPS` checked (panic for huge gross, documented). `net = gross - fee` safe. Relayer `s.amount - s.fee` safe after `amount > fee`. `_consume` `s.current += amount` bounded by `limit - used`. `block.timestamp + delay` and `2*delay` fit uint64 for realistic times.
- Merkle leaves double-hashed (`bytes.concat(keccak256(...))`): internal-node-as-leaf blocked (`testFuzz_leafIsNeverAnInternalNode` PASS).
- Native sends: router and account use `call` with all gas, `nonReentrant` on every entry point; `receive()`/`fallback()` on router revert. Return-data bomb fixed (A1) and covered.
- Spec match: error names in CONTRACTS_SPEC section 1 match `IGhostPayRouter`; relayer domain name/version match section 2; relayer `Swept` event shape matches interface.

## Test runs (actually executed)

- `forge test` in `packages/contracts`, excluding `*PolicyRouter*` and the `EXPLOIT` test names, with `FOUNDRY_FUZZ_RUNS=256 FOUNDRY_INVARIANT_RUNS=32`, output redirected to scratch: 14 suites, 263 tests, 0 failed.
- `forge test --match-path 'test/audit/*'` (includes EXPLOIT tests, default fuzz runs overridden to 256): 3 suites, 43 tests, 0 failed.
- Scratch PoCs (`/tmp/claude-0/-home-user-ghostpay/4744cac5-02a8-54bc-995d-381350474572/scratchpad/bughunt/poc/test/poc/`): `Poc.t.sol` (2 tests), `Poc2.t.sol` (2 tests). All four as reported above.
- Output directories were redirected to scratch (`FOUNDRY_OUT`, `FOUNDRY_CACHE_PATH`), so the repo `out/` and `cache/` were not touched.

## Not verified / limits

- Not run: Slither, Echidna, the default 10,000-run fuzz and invariant profiles (overridden to 256/32), coverage, gas snapshot, `GhostPayPolicyRouter` (out of scope).
- Not verified on a live chain or fork: real token behaviour (USDC v2.2 permit, USDT no-return, rebasing tokens), canonical announcer address, EIP-7702 owner behaviour (BUG-C2 caveat is reasoned, not tested).
- Not verified: OpenZeppelin 5.6.1 `ECDSA`/`MerkleProof`/`Clones` internals beyond the lines read; the `1 << n` literal typing in bitmap code is exercised by the nonce-boundary tests but not separately proven.
- Relayer permit `deadline` not signed (DEVIATIONS and `docs/audits/02` I-05) and gas griefing via hostile `permit` (L-03) are known and not re-tested.
- Reasoning-only (no PoC): window-accounting guarantee for all interval positions; the claim that a payer equal to `FEE_RECIPIENT` or `stealth` reverts (already tested per I-07).
