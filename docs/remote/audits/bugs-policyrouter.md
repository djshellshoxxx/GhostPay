# Bug hunt: GhostPayPolicyRouter (scheme 0x47500002)

Scope: `packages/contracts/src/GhostPayPolicyRouter.sol`, `src/interfaces/IGhostPayPolicyRouter.sol`,
`test/GhostPayPolicyRouter*.sol`, `script/DeployPolicyRouter.s.sol`, compared with `src/GhostPayRouter.sol`
and `packages/contracts/DEVIATIONS.md` (R1-R9). Read-only on source, tests and config.

## Runs performed
- `forge test --match-path "test/GhostPayPolicyRouter*.sol" --no-match-test "fuzz|invariant"`: 82 passed, 0 failed.
- `forge test --match-path test/GhostPayPolicyRouter.fuzz.t.sol`: 9 fuzz tests passed (10k runs each).
- `forge test --match-path test/DeployPolicyRouter.t.sol`: 1 passed.
- Invariant suite and `forge coverage` were not run.

## Verified findings

### F1. Low (doc/code mismatch): buffer entry point checks run before policy binding
- Code: `GhostPayPolicyRouter.sol:172-174` (`BufferRequired`, `BufferTooLarge`) precede
  `_checkPolicyAccount(stealth, policy)` at line 174.
- Spec: `DEVIATIONS.md` R4 (line 189-191) says policy binding "runs **first** in every entry point (before the buffer
  checks, ...)". The contract's own NatSpec does not state an order.
- Scenario: `payERC20WithBuffer{value: 0}(token, wrongStealth, ...)` reverts `BufferRequired`, not
  `NotPolicyAccount(expected)`. With `msg.value > maxBufferWei` and a wrong stealth, the revert is `BufferTooLarge`.
  No funds at risk (both revert before any transfer). No test covers the value-0 plus mismatch case (the
  `test_buffer_revertsPolicyMismatch` test uses `value: 1`).
- Fix: either move `_checkPolicyAccount` above line 172, or correct R4 to "after the buffer checks". Prefer the code
  change so the error reported for a wrong recipient is always `NotPolicyAccount`, which matches R2/R4 and the
  `policyCheckedBeforeToken` claim. Add a test for `value: 0` plus wrong stealth.

### F2. Info: ERC-20 payments by the fee recipient always revert
- Code: `_pull` (`GhostPayPolicyRouter.sol:216`): `safeTransferFrom(msg.sender, feeRecipient, fee)` with
  `msg.sender == FEE_RECIPIENT` leaves the fee balance unchanged, so line 227 reverts `UnexpectedBalanceDelta`.
- Same behaviour as scheme-1 `GhostPayRouter._pull`. Not documented for the policy router; the scheme-1 audit tests
  cover it (`test/audit/Router.audit.t.sol:212`), the policy test file has no equivalent.
- Native payments by the fee recipient are unaffected. Fix: none required; add a policy-router test or note it in R1.

### F3. Info: accepted policy hashes can name an account that can never be deployed
- Code: `PolicyAccountFactory.predictAddress` (`src/PolicyAccountFactory.sol:128-136`) performs no validation. The
  router only sees `(owner, policyHash)`, so an address for `destination == 0`, `delay == 0` or `delay < MIN_DELAY`
  (all rejected by `deploy`, lines 98-100) is accepted by `_checkPolicyAccount` and funds sent there are permanently
  unreachable.
- Consistent with R5 (the router cannot see the pre-image). Not a router defect; the risk belongs in client
  validation of the meta-address. Fix: none on-chain without changing the commitment scheme.

### F4. Info: deploy script leaves the factory code hash unpinned by default
- Code: `script/DeployPolicyRouter.s.sol:_factory()` only checks `EXPECTED_POLICY_FACTORY_CODEHASH` when set. Omitting
  it means any contract with a valid `IMPLEMENTATION()` is accepted and immutably wired into the router.
- Fix: require the code hash in non-local runs, consistent with the R6 pinning advice.

## Checked, no defect found
- Fee rounding: `fee = gross * 25 / 10_000` (line 262). Floor, `fee < gross` for `gross > 0`, `400` is the first
  fee-bearing amount, `gross > type(uint256).max / 25` panics (checked arithmetic). Matches R1 and the fuzz test.
- Deadline: `block.timestamp > deadline` is inclusive in every path (`_validate` line 256; permit path line 125).
- `minNet`: `net < minNet` reverts, so `net == minNet` passes.
- Struct and selector encoding: `PolicyRef` (address, bytes32) and `PermitSig` (uint8, bytes32, bytes32) are static
  and inline in the ABI. The selector strings in `test/GhostPayPolicyRouter.t.sol:1145-1170` match the signatures.
- Metadata: exact 57 bytes, marker, asset and net checked with the same offsets as scheme-1.
- Native path: fee then net via assembly `call` with all gas; reentrancy blocked by `nonReentrant`.
- Permit path: deadline checked before the permit; a failed permit is swallowed and the transfer reverts unless
  allowance suffices. A token with no code reverts at the high-level call's extcodesize check, outside the try. The
  whole call still reverts.
- Immutables: `FEE_RECIPIENT`, `ANNOUNCER`, `FACTORY` are read back in the deploy script; the constructor rejects
  zero, self and codeless-factory inputs.

## Could not verify
- Live deployment, real announcer, real token behaviours beyond the mocks.
- Coverage figures in R8 and the Slither results in R7.
- F1 is verified by reading the code; no reproduction test was run (test files are read-only for this task).
