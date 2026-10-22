# Audit: GhostPayPolicyRouter (scheme 0x47500002)

Scope: `packages/contracts/src/GhostPayPolicyRouter.sol`, `src/interfaces/IGhostPayPolicyRouter.sol`, `test/GhostPayPolicyRouter*.sol`, `test/PolicyRouterBase.t.sol`, `test/DeployPolicyRouter.t.sol`, `script/DeployPolicyRouter.s.sol`. Compared to `GhostPayRouter.sol`, `docs/CONTRACTS_SPEC.md`, `packages/contracts/DEVIATIONS.md`. Read-only, static review only.

Summary: no Critical/High/Medium. Core checks match the spec (fee 25 bps floor, 57-byte metadata, ephemeral key, SafeERC20 + exact deltas, nonReentrant, reverting receive/fallback, policy binding via `predictAddress`). Findings are doc/order drift, spec gap, script hardening, and test gaps.

## Findings

### F1 LOW: buffer checks run before policy binding (doc/code mismatch)
- Code: `GhostPayPolicyRouter.sol:171-174`. `payERC20WithBuffer` does `BufferRequired` and `BufferTooLarge` checks, then `_checkPolicyAccount` (line 174).
- Contradicts: `GhostPayPolicyRouter.sol:234-235` (`_checkPolicyAccount` "Runs first in every entry point ... before any other check"), and `DEVIATIONS.md:189-190` (R4: policy binding runs "before the buffer checks").
- Scenario: `payERC20WithBuffer{value: 0}(wrongStealth, ...)` reverts `BufferRequired`, not `NotPolicyAccount`. `payERC20WithBuffer{value: 2}` with `maxBufferWei = 1` and wrong stealth reverts `BufferTooLarge`. No funds or token calls at risk, since both revert before any external call.
- Fix: move `_checkPolicyAccount(stealth, policy);` above the two buffer checks, or change the NatSpec and R4 to say buffer checks come first. Add a test that a wrong recipient with a bad buffer reports `NotPolicyAccount`.

### F2 LOW: NatSpec says router "modifies no state of its own"
- `GhostPayPolicyRouter.sol:30`. Every `nonReentrant` entry writes the OZ `ReentrancyGuard` `_status` slot (storage, per `DEVIATIONS.md:176-178` R1 and the import at line 7).
- Fix: "writes only its reentrancy-lock slot". The scheme-1 `GhostPayRouter.sol:21-22` wording is qualified ("beyond the reentrancy lock"); the scheme-2 text is not.

### F3 LOW: normative spec has no scheme-2 router section
- `docs/CONTRACTS_SPEC.md` section 4 (lines 61-69) covers accounts and the announcement. It does not define the four router entry points, their ABI, the `PolicyRef`/`PermitSig` structs, the `FeeCollected` event, the 25 bps fee, the `NotPolicyAccount`/`FactoryHasNoCode` errors, or the check order.
- Section 4 "Fee: F-SECURE flat fee" refers to account deployment. The router's 25 bps fee is only in `DEVIATIONS.md` R1 and NatSpec. Section 1 rules cover scheme 1 only.
- Impact: the contract's conformance rules are not in the normative spec. Spec-derived tests or client builders cannot check against it.
- Fix: add a section 4b with the ABI (the `DEVIATIONS.md` R3 signatures), rules, errors, and check order, and state the router fee explicitly.

### F4 LOW: deploy script read-back and factory identity checks are incomplete
- `script/DeployPolicyRouter.s.sol:69-74`: read-back omits `NATIVE()` (a client-facing constant used in metadata and `FeeCollected`) and `BPS()`. The comment says "every immutable and constant that clients depend on".
- `:114`: `_factory()` only checks that `IMPLEMENTATION()` has code. Any contract exposing that selector passes.
- `:117-121`: `EXPECTED_POLICY_FACTORY_CODEHASH` is optional. Without it, a wrong `POLICY_FACTORY` address is accepted silently. The router's factory is immutable, so the router then accepts the wrong predicted addresses (the M-02-style "undiscoverable funds" risk in `docs/audits/02-security-review-contracts.md`).
- Fix: read back `NATIVE()` and `BPS()`. Require the codehash pin on non-local chains, or print it and require a confirm. Check that `factory.predictAddress(owner, h)` matches a `Clones` derivation from `IMPLEMENTATION()` for a probe pair.

### F5 LOW test gap: buffer ordering is untested
- `test/GhostPayPolicyRouter.t.sol:1050-1066` (`test_buffer_revertsPolicyMismatch`) passes a valid buffer (`value: 1`, `maxBufferWei: 1`), so it does not exercise the order in F1.
- `test/GhostPayPolicyRouter.fuzz.t.sol:76-125` (`testFuzz_wrongRecipientRejected`) also uses `value: 1`, `maxBuffer: 1`.
- `test/GhostPayPolicyRouter.fuzz.t.sol:170-185` (`testFuzz_bufferBounds`) only uses the valid stealth, so no fuzz case mixes a wrong stealth with a bad buffer.
- Fix: add a test with `value: 0` and with `value > maxBufferWei`, each with a wrong stealth, asserting the intended error.

### F6 INFO test gap: post-broadcast fee-recipient check is not exercised
- `script/DeployPolicyRouter.s.sol:63-64` (`vm.readCallers()` signer check after `startBroadcast`).
- `test/DeployPolicyRouter.t.sol:46-50` only hits the pre-broadcast check (`_feeRecipient(msg.sender)`, where `msg.sender` is the test contract). No scenario reaches line 64.
- Fix: a harness path that makes the signer equal `FEE_RECIPIENT` while the pre-check passes (or a test double for `vm.readCallers`). `DEVIATIONS.md` A4 already says this is untested on real broadcast.

### F7 INFO test gap: selector parity covers 5 of 12 shared errors
- `test/GhostPayPolicyRouter.t.sol:144-158` asserts `ZeroAddress`, `InvalidStealth`, `InvalidMetadata`, `UnexpectedBalanceDelta`, `FeeCollected`. The shared set in `IGhostPayPolicyRouter.sol:8-12` also includes `Expired`, `ZeroAmount`, `SlippageExceeded`, `InvalidEphemeralKey`, `NativeTransferFailed`, `BufferTooLarge`, `BufferRequired`, `NoDirectETH`.
- Selectors match by construction today (same name, no params). The test would not catch a future divergence in those eight.
- Fix: loop over all shared errors, or assert `keccak256` of each canonical signature.

## Verified OK (no finding)
- Fee: `fee = gross*25/10000` floors; zero below 400; `gross == 0` reverts `ZeroAmount` (`GhostPayPolicyRouter.sol:33-34, 261-264`).
- Metadata: 57 bytes, marker/asset/net checks, view tag unconstrained (`:272-282`), matching `CONTRACTS_SPEC.md` section 1.
- Policy binding: `predictAddress` (`PolicyAccountFactory.sol:128-136`) uses the same salt and implementation as `deploy` (`:101-118`). Zero owner reverts `ZeroAddress`. `stealth == 0` reports `NotPolicyAccount` (test at `GhostPayPolicyRouter.t.sol:244`).
- `payERC20WithPermit` checks policy before the permit, so a wrong recipient does not consume the nonce (test at `:860-882`).
- Scheme-1 calldata hits `fallback` and reverts `NoDirectETH` (test at `:1104-1126`).
- Error names in `IGhostPayPolicyRouter` match the contract. `FactoryHasNoCode` and `NotPolicyAccount` are the only additions.
- `PolicyAccount.receive()` is empty (`PolicyAccount.sol:112`), so native payouts to accounts do not revert.
- Invariant handler includes the fee-on-transfer token (index 4), so `invariant_feeOnTransferNeverSucceeds` is not vacuous.
- Deploy script rejects fee recipient == pre-broadcast sender, custom announcer without flag, and bad chain IDs (covered by `DeployPolicyRouter.t.sol`).

## Not verified
- No build, `forge test`, coverage, Slither, or gas snapshot was run. Claims in `DEVIATIONS.md` R7 (Slither clean), R8 (100% branch coverage), and `.gas-snapshot` are unverified.
- Compiled ABI in `out-b/` and `cache-*` was not compared to the source selectors. The selector test in `GhostPayPolicyRouter.t.sol:1145-1175` only checks the source.
- Client code (`packages/policy-scheme/src/router.ts`, `packages/chain-adapters`) was only grepped, not audited. Its `payERC20WithBuffer` argument order (router.ts:134-135) matches the ABI, but I did not check the generated ABI file.
- `deployments/schema.json` `policyRouter` absence (DEVIATIONS R9) was not confirmed.
- Canonical-announcer event ABI test (spec section 5) is not present for scheme 2; the tests use the vendored `ERC5564Announcer`. `DEVIATIONS.md` documents this.
