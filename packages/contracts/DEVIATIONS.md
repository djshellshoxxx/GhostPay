# Deviations from, and findings about, docs/CONTRACTS_SPEC.md

Every item below is a deliberate choice where the spec was silent, ambiguous, or where the safest reading
differs from a literal one. The lead should confirm or reject each.

## Deviations (behaviour)

1. **Router permit is wrapped in try/catch.** Spec section 1 only says the function calls ERC-2612 `permit`. A bare
   call lets anyone front-run the permit signature and make the payer's transaction revert (griefing). Now a failed
   `permit` is ignored and the following `safeTransferFrom` reverts unless allowance is sufficient. Same rationale
   the spec itself gives for the relayer.
2. **`FeeCollected` is emitted only when `fee > 0`**, and the native fee `call` is skipped when `fee == 0`
   (spec: "skipped if fee == 0" is stated for ERC-20 only). Avoids zero-amount noise and lets dust payments
   succeed even if the fee recipient cannot receive ETH. Off-chain indexers must not assume one `FeeCollected` per payment.
3. **`net > 0` check is not coded as a separate branch.** For every `gross > 0`, `fee = gross*25/10_000 < gross`, so
   `net >= 1` always holds after the `gross > 0` check; the extra branch would be dead code. `ZeroAmount` is raised for `gross == 0`.
4. **`receive()`/`fallback()` exist only to revert with `NoDirectETH`.** The spec says "no receive/fallback" and also
   lists a `NoDirectETH` error; a reverting `receive()`/`fallback()` is the only way to emit that error and reject plain transfers cleanly.
5. **Check order** (spec silent): zero token -> deadline -> stealth -> gross -> minNet/net -> ephemeral key -> metadata -> transfers.
   For `payERC20WithBuffer`: `BufferRequired`, `BufferTooLarge` precede all other checks.
6. **Constructor** reverts `ZeroAddress` for a zero announcer/fee recipient and `InvalidStealth` when `feeRecipient == address(this)`
   (spec named no error for the latter).
7. **Extra public constants** on the router: `SCHEME_ID = 1` and `NATIVE = 0xEeee...EEeE`; on the relayer: `SWEEP_TYPEHASH`.
8. **Relayer custom errors were not named in the spec.** Chosen: `ZeroAddress`, `SelfAddress` (destination/feeTo/owner/token == relayer),
   `Expired`, `InvalidAmount` (`amount <= fee`), `InvalidSignature` (recovered signer != owner), `NonceAlreadyUsed`,
   `PermitValueTooLow`, `UnexpectedBalanceDelta`. Malformed signatures revert with OpenZeppelin's `ECDSAInvalid*` errors.
9. **Relayer balance-delta check also covers the owner** (`owner` balance must fall by exactly `amount`) in addition to
   destination and feeTo. Consequence: `destination == owner`, `feeTo == owner` or `feeTo == destination` revert with `UnexpectedBalanceDelta`.
10. **Relayer check order:** deadline -> `amount > fee` -> zero/self addresses -> signature -> nonce consumption -> `permit.value` -> permit (try/catch) -> transfers.
    The nonce is only consumed after a valid signature so strangers cannot burn an owner's nonces; it is consumed before any external call.
11. **Base `ReentrancyGuard` (storage), not `ReentrancyGuardTransient`,** for portability to chains without Cancun transient storage; `evm_version = cancun` is still set per spec.
12. **Interface vendoring.** `src/interfaces/IERC5564Announcer.sol` is the CC0 reference interface with the pragma relaxed from `0.8.23` to `^0.8.23`
    (and `forge fmt` whitespace); the reference `ERC5564Announcer.sol` is vendored the same way under `test/utils` (test only). ABI/event signature unchanged and asserted in tests.

## Tooling deviations

- Profiles: the **default** profile already uses 10 000 fuzz runs (the spec's "ci" level) and invariants 256 runs x depth 50; the **dev** profile
  uses 256 fuzz runs. A separate `ci` profile name was not created because the default is what CI invokes.
- `solc = "/home/user/tools/solc"` is a sandbox-only setting (see README); CI must use `solc_version = "0.8.28"`.
- Coverage needs `--ir-minimum` (stack-too-deep in the unoptimized test build otherwise).
- OpenZeppelin is vendored at **5.6.1** (latest 5.x at packaging time) by copying the npm package's `contracts/` tree; no git submodule.
- forge-std vendored from `foundry-rs/forge-std` commit `b013eff2ac4fce26f34d789e6f5c49021c5ee817` with `.git` removed.
- The "fork-style" test uses the locally compiled CC0 reference announcer, not a live-network fork (no network access).

## Spec observations / possible spec bugs

- **CONTRACTS_SPEC section 1 vs FEE_SCHEDULE section 3:** the schedule mentions "gas stipend limits documented in the contract" for native
  transfers; section 1 says plain `call`. Implemented as plain `call` with all remaining gas (documented in README limitations). If a stipend
  cap is wanted it must be specified, and it would break Safe-multisig fee recipients.
- **Spec section 5 "fee + net == gross" and "net receipt equals metadata amount" invariants** are tested as ghost-accounting invariants plus
  per-call checks; "router token balance is 0" is checked only after calls (a token callback could observe a non-zero balance mid-call, which
  the reentrancy lock makes harmless).
- **Metadata `net` is attacker-independent but view tag and ephemeral key are not verifiable on-chain** (stated in the spec); documented in README.
- **Spec section 2 does not say who may be `destination`.** A destination that is a blacklisted address on the token, or the fee recipient, is allowed;
  the sweep simply reverts for blacklisted ones.
- **Sweep `PermitSig.deadline` is not covered by the sweep signature.** Not exploitable (the permit is itself signed by the owner, and a stale
  deadline only makes `permit` fail, which is swallowed), but worth knowing when reasoning about griefing.
- **`FEE_RECIPIENT == stealth` is rejected** (`InvalidStealth`); a payer paying the fee recipient's own stealth address must pay directly.

# PolicyAccount / PolicyAccountFactory (CONTRACTS_SPEC section 4)

Choices where section 4 is silent, ambiguous or where the safest reading differs from a literal one. Items are numbered P1-P19.
The lead should confirm or reject each.

## Design decisions the spec left open

- **P1. Per-token limit representation = merkle root (`limitsRoot`).** `policyHash = keccak256(abi.encode(destination, delaySeconds, limitsRoot))`
  commits to a merkle root over leaves `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))` (OpenZeppelin double-hash
  leaves, sorted-pair `MerkleProof`). The owner (or any relayer) supplies the leaf data and proof at `requestWithdraw`; the verified `limit` and
  `windowSeconds` are stored with the request. `token == address(0)` is the native coin. `limit == type(uint256).max` means "unlimited" (window ignored).
  `limitsRoot == bytes32(0)` means **no limits at all** (every token unlimited, proof ignored). With a non-zero root, **a token without a leaf can never be
  withdrawn** (lock-in); clients must add an unlimited leaf for every token they accept. Trees MUST contain each token once: with duplicate leaves the
  holder of the key may pick the more permissive one (the account enforces one window length per token via `WindowMismatch`, and `WindowLimitExceeded`
  if a later proof has a lower cap than what was already used). Limits are immutable after init (the spec has no limits-change path).
  Alternatives rejected: uniform limit at init (cannot satisfy a `limitsRoot` commitment without revealing it on deploy), per-token override
  through a timelocked path (more state and attack surface).
- **P2. Window = two fixed buckets of `windowSeconds`, accounted at execution.** Amount paid in the current bucket plus the previous bucket must stay `<= limit`. This guarantees that
  no interval of length `windowSeconds` ever sees more than `limit` leave (proved by the fuzz test against a reference model and an invariant), but it is
  conservative: after spending the full cap, the next spend can be delayed by up to two windows (a true sliding log would need unbounded storage and an
  attacker-controlled loop). Accounting is at `executeWithdraw`, not `requestWithdraw`, so several requests can be pending at once and each is checked when it matures.
  `amount > limit` is rejected at request time (it could never execute).
- **P3. Signatures never contain the destination; payout goes to the destination at execution time, which must equal the destination at request time.**
  *Changed in round 3b (R14):* pending requests used to follow a destination change; now `requestWithdraw` records the then-current destination and
  `executeWithdraw` reverts `DestinationChangedSinceRequest(requested, current)` while they differ, so neither a rotated-away cold wallet nor a newly set
  (possibly attacker-set) destination receives a request made before the change. The EIP-712 domain (name `GhostPayPolicyAccount`, version `1`, chain id, clone address)
  binds chain and account. Types: `Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce)`, `CancelWithdraw(bytes32 id)`,
  `ProposeDestination(address newDestination,uint256 deadline,uint256 nonce)`, `CancelDestination(bytes32 id)`. `id` = the struct hash of the signed
  {Withdraw}/{ProposeDestination}, so it is unique per nonce. Cancel signatures need no nonce (bound to a unique id, effect is idempotent) and a cancel
  signature of one type cannot be used as another.
- **P4. `requestWithdraw` takes structs: `requestWithdraw(Withdraw w, LimitProof lp, bytes sig) returns (bytes32 id)`** instead of the flat
  `(token, amount, deadline, nonce, sig)`, because the merkle data of P1 has to travel with it. `proposeDestination(newDestination, deadline, nonce, sig)`,
  `executeDestinationChange()`, `cancelDestination(id, sig)`, `executeWithdraw(id)`, `cancel(id, sig)`.
- **P5. One pending destination proposal at a time** (`ProposalPending`); it must be cancelled first. A new proposal after cancel restarts the full `2 * delay`.
  `deadline` bounds only the submission of a signed order, never execution.
- **P6. Initialisation is authenticated by CREATE2 re-derivation, not by an immutable factory address.** The implementation cannot know the factory (the factory is
  constructed with the implementation address), so `initialize(owner, destination, delay, limitsRoot)` recomputes
  `Clones.predictDeterministicAddress(implementation, keccak256(abi.encode(owner, policyHash)), msg.sender)` and requires it to equal `address(this)`.
  Only the exact CREATE2 deployer, with the exact arguments, can initialise a clone, once. The implementation locks itself in its constructor.
  Because the factory initialises in the same transaction as the clone creation, front-running initialisation is impossible.
- **P7. The factory is the only place with fee logic.** Constructor: zero `implementation` or `feeRecipient` revert `ZeroAddress`; zero `feeToken` reverts only if
  `flatFee != 0`; `implementation` without code reverts `ImplementationHasNoCode`. `deploy` reverts `AlreadyDeployed(account)` **before** pulling the fee, then pulls
  `flatFee` with `safeTransferFrom(msg.sender -> feeRecipient)` and requires the recipient balance to rise by exactly `flatFee` (`UnexpectedFeeDelta`; a payer that
  is the fee recipient therefore cannot deploy with a non-zero fee). Only the recipient delta is checked (the payer's balance cannot fall by less than the transfer
  without the recipient's also being short). `deploy` is `nonReentrant`.
- **P8. Account-level argument validation duplicates the factory's** (zero owner/destination, `destination == address(this)`, delay in `[1, 30 days]`) so that
  a foreign deployer cannot create a weaker account from the same implementation. `owner == destination` is **allowed** (it only defeats the product, and rejecting
  it would make an already published counterfactual address undeployable and its funds unreachable); client software must validate it before publishing a
  meta-address.
- **P9. Base `ReentrancyGuard` (storage).** In a clone its status slot starts at 0, which the guard accepts (only the value 2 means "entered"); no initialiser is needed.
- **P10. Native path:** `executeWithdraw` with `token == address(0)` uses a checked `call{value}` with all remaining gas to `destination` (`NativeTransferFailed` on
  failure, request stays pending). A destination that always reverts blocks native payouts until the destination is changed (needs `2 * delay`). ERC-20 payouts use
  SafeERC20 plus exact balance deltas of account and destination (fee-on-transfer/rebasing tokens revert `UnexpectedBalanceDelta` and cannot be withdrawn; there is deliberately no rescue).
- **P11. Extra public surface:** `owner`, `delay`, `initialized`, `destination`, `limitsRoot`, `policyHash` (policy at deployment, never updated), `pendingDestination`,
  `pendingEffectiveAt`, `pendingProposalId`, `requests(id)`, `nonceUsed(n)`, `windowState(token)`, `DOMAIN_SEPARATOR()`, `eip712Domain()`, `MAX_DELAY`, the four `*_TYPEHASH` constants.
  Interface and error names were not specified; see `src/interfaces/IPolicyAccount.sol`.
- **P12. Event privacy:** the factory emits only `AccountDeployed(address indexed account)`. Account events (`WithdrawRequested`, `WithdrawExecuted`, `WithdrawCancelled`,
  `DestinationProposed`, `DestinationChangeCancelled`, `DestinationChanged`) necessarily show the destination; they carry no owner.
- **P13. `receive()` is empty** (no event) so that sends do not depend on logging. There is no `fallback`. No `delegatecall`, `selfdestruct`, `approve`, generic call or admin exists.
- **P14. Native sends with a 2300-gas stipend (`transfer`/`send`) to a clone are expected to fail** because the EIP-1167 proxy `delegatecall`s a cold implementation
  (2600 gas under EIP-2929). The router sends native value with all gas and is unaffected. Not verified on a live network; only analysed.
- **P15. Timestamps are stored as `uint64`.** `block.timestamp + 2 * 30 days` fits for any realistic date. Since round 3b (R15) `executeAfter` and
  `pendingEffectiveAt` are narrowed with OpenZeppelin `SafeCast.toUint64`, so past `2^64 - 2 * delay` seconds the call reverts instead of wrapping to a small
  value (which would have bypassed the timelock; unreachable in practice, about 5.8e11 years away). The `_consume` bucket cast keeps its justification.
- **P16. `DeployPolicy.s.sol` reads configuration through a virtual `_env()`** so its test can inject values; the shared process environment cannot be used because
  `DeployTest` runs in parallel and expects `FEE_RECIPIENT` unset. `FEE_TOKEN` and `FEE_RECIPIENT` must be non-zero; `FLAT_FEE=0` is accepted only when set explicitly.
  `FEE_TOKEN` must have code on the target chain.
- **P17. `deployments/schema.json` additions are optional and additive:** `policyImplementation`, `policyFactory`, `policyFeeToken`, `policyFlatFee` (decimal string),
  `policyFeeRecipient`, and optional `deployTx` / `bytecodeHashes` entries; `dependentRequired` makes the five policy fields all-or-nothing. Manifests without them validate as before.
- **P18. `scripts/check-natspec.sh`** now checks the two new contracts and ignores two more third-party errors (`InsufficientBalance`, `FailedDeployment`, from OpenZeppelin `Clones`/`Create2`), and since round 3b `SafeCastOverflowedUintDowncast` (OpenZeppelin `SafeCast`, R15).
- **P19. Tests use `vm.getBlockTimestamp()`** instead of `block.timestamp` after `vm.warp` to keep `forge build` at zero lint warnings.

## Spec observations / possible spec bugs

- **Key theft is not prevented, only delayed and made visible.** The thief holds the same key as the owner, so he can request withdrawals (to the owner's destination), cancel the
  owner's pending actions, and propose a destination; the owner can cancel the thief's proposal within `2 * delay`, but the thief can propose again and the
  struggle is unbounded (each re-proposal restarts the timer; relayers cannot break the tie). The product value is: funds cannot be redirected faster than `2 * delay`
  without the real owner having a window to react through an out-of-band channel (e.g. moving future payments). Guardians/recovery paths from the Playbook ("recovery path", "threshold/guardian")
  are not specified and **not implemented**: there is no recovery from a lost key.
- **Spec says `deploy` "checks `policyHash`".** The factory API takes the pre-image `(owner, destination, delay, limitsRoot)` and derives the hash itself; there is nothing to check.
- **F-SECURE is "USD 3.00 equivalent" but `flatFee` is an immutable base-unit amount.** Stablecoin decimals differ by chain (6 vs 18); each deployment must set its own amount
  (`3_000_000` for 6 decimals). The fee is paid in whatever `FEE_TOKEN` is, which can depeg; there is no oracle by design.
- **The factory address and the implementation are inputs of every counterfactual address.** Redeploying either changes `A_acct` for all meta-addresses; manifests, scanners and the
  scheme-2 derivation vectors must pin `(chainId, factory, implementation codehash)`.
- **Section 4 says the announcement uses `stealthAddress = A_acct` but assigns no contract to emit it.** The existing router can announce for `A_acct` unchanged (it only requires a
  non-zero address); nothing in the new contracts announces.

  > **Correction (2026-10-21):** the claim that the existing router "can announce for `A_acct` unchanged" is incomplete. `GhostPayRouter` hard-codes `SCHEME_ID = 1` (`GhostPayRouter.sol:38`), so announcing `A_acct` through it emits scheme 1, not the `0x47500002` required by `CONTRACTS_SPEC.md` section 4. Scheme-1 router cannot announce scheme `0x47500002`; use `GhostPayPolicyRouter` (`SCHEME_ID = 0x47500002`, see "GhostPayPolicyRouter" below and `CONTRACTS_SPEC.md` section 4.1).
- **"Delay" is one number for both the withdrawal timer and (doubled) the destination timelock**, as specified; there is no separate configuration.

# Audit remediation (docs/audits/02-security-review-contracts.md)

Changes made after the independent review. Items A1-A6 change code; the remaining findings are documented in `README.md` ("Audit follow-ups").

- **A1. L-01 (return-data bomb).** `GhostPayRouter._sendNative` and the native branch of `PolicyAccount.executeWithdraw` use `assembly { ok := call(gas(), to, amount, 0, 0, 0, 0) }`.
  Behaviour is otherwise identical (all gas forwarded, `NativeTransferFailed` on failure). The old gas-overhead tests are now regression tests with gas bounds (a 1 MB-returning payee
  costs the payee's own ~2.04M intrinsic gas, versus 4.17M before the fix).
- **A2. L-04 (limit leaf bound by the signature).** *Public ABI change, listed in the remediation scope:* `IPolicyAccount.Withdraw` gained a last field `bytes32 limitLeafHash`, and
  `WITHDRAW_TYPEHASH` is now `Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce,bytes32 limitLeafHash)`. `limitLeafHash` is exactly the merkle leaf
  `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))`; when `limitsRoot != 0` the supplied `LimitProof` must produce that leaf, otherwise `requestWithdraw` reverts with the new error
  `LimitLeafMismatch()` (before the merkle check, so a valid-but-different leaf of the same tree is rejected). The request id (struct hash) now also commits to the leaf. When `limitsRoot == 0` the field is signed but ignored
  (clients should use zero). Duplicate-token trees remain a policy-author mistake, but a submitter can no longer pick the permissive leaf. The one-line `CONTRACTS_SPEC.md` section 4 edit
  is limited to the `requestWithdraw`/typehash sentence. `packages/chain-adapters` ABIs and every client that builds `Withdraw` must be regenerated and sign the new field.
- **A3. I-02 (minimum delay).** `PolicyAccountFactory.MIN_DELAY = 1 hours`; `deploy` reverts `DelayTooShort(delay)` for `0 < delay < MIN_DELAY` (`delay == 0` and `> MAX_DELAY` keep `InvalidDelay`). `MAX_DELAY` stays 30 days.
  The minimum is enforced in the factory only, not in `PolicyAccount.initialize`, to keep the account's accepted range (and P8) unchanged; accounts cloned by a foreign deployer can still use shorter delays (I-08: they are not official accounts).
- **A4. L-06 (deploy scripts).** New `script/DeployBase.s.sol` (shared helpers). `Deploy`: custom `ANNOUNCER` needs `ALLOW_CUSTOM_ANNOUNCER=1`; announcer codehash is printed and optionally pinned (`EXPECTED_ANNOUNCER_CODEHASH`);
  `DeployPolicy` has no announcer input (the factory does not use one), so the announcer rule applies to `Deploy` only. Both: `FEE_RECIPIENT != broadcaster` (checked against `msg.sender` and the account reported by `vm.readCallers()` after `startBroadcast`),
  warning when the recipient has code, post-deployment read-back `require`s for every immutable, strict `ALLOWED_CHAIN_IDS` parsing (whitespace trimmed, `InvalidChainIdEntry` for empty/non-numeric entries), chain id 31337 only with `ALLOW_LOCAL=1`.
  `DeployPolicy`: required `MAX_FLAT_FEE` (no default; `FlatFeeAboveMax`), `FEE_TOKEN.decimals()` printed (a token without `decimals()` only warns). `Deploy` now uses the same virtual `_env()` as `DeployPolicy` (test injection).
  `scripts/pre-deploy-check.sh router|policy` prints the effective configuration and runs the same static checks plus optional read-only `cast` queries (`RPC_URL`); `DRY_RUN=1` runs `forge script` without `--broadcast`. It never needs a key.
  Not verified: the behaviour of `--account`/`--ledger` senders with `vm.readCallers()` on a real broadcast (only simulated in tests).
- **A5. Slither.** The two CI exclusions (`arbitrary-send-erc20`, `incorrect-equality`) are replaced by inline `// slither-disable-next-line` comments with rationale at the three sites
  (`GhostPaySweepRelayer._execute` x2, `PolicyAccount._consume`); Slither passes with `--fail-medium --exclude-informational --exclude-low` and no `--exclude`.
- **A6. Audit tests.** `test_returnDataBomb_gasOverhead`/`..._destinationInflatesExecutorGas` became `test_returnDataBomb_*Bounded`; `test_EXPLOIT_duplicateLeafSubmitterPicksPermissiveLimit` became
  `test_duplicateLeafSubmitterCannotPickPermissiveLimit`. All other `test_EXPLOIT_*` tests (M-01, M-03, L-02, L-03, L-05, I-03, I-04) are unchanged and document the residual behaviour.
  The test helper `PolicyBase._w` fills `limitLeafHash` with the fixture tree leaf of the token; `_wFor` binds it to an explicit proof.

# GhostPayPolicyRouter (scheme 0x47500002, audit 02 M-02)

New contract `src/GhostPayPolicyRouter.sol` (+ `src/interfaces/IGhostPayPolicyRouter.sol`, `script/DeployPolicyRouter.s.sol`). Chosen over a `schemeId`
argument on `GhostPayRouter` (the audit's other option) so the audited scheme-1 router and its ABI stay unchanged. Items R1-R9; the lead should confirm or reject each.

- **R1. Separate router, same economics.** Same `FEE_BPS = 25`, floor rounding, 57-byte metadata layout, ephemeral-key rule, SafeERC20 + exact balance deltas,
  `nonReentrant`, try/catch permit, `FeeCollected` only when `fee > 0`, assembly native `call` without return-data copy (A1), reverting `receive`/`fallback`,
  no admin. `SCHEME_ID = 0x47500002`. Every error shared with `IGhostPayRouter` has the same name and therefore the same selector.
- **R2. Policy binding.** Immutable `FACTORY` (`PolicyAccountFactory`, must be non-zero and have code: `ZeroAddress` / new `FactoryHasNoCode`). Each payment passes
  `PolicyRef {address owner; bytes32 policyHash;}` and the router requires `stealth == FACTORY.predictAddress(owner, policyHash)` (staticcall to the trusted immutable factory),
  else new error `NotPolicyAccount(address expected)`; `owner == address(0)` reverts `ZeroAddress` (the factory could never deploy that account). `stealth` stays an explicit
  argument so a client bug in the derivation reverts instead of paying a different address. Deployed and counterfactual accounts are both accepted.
- **R3. ABI shape differs from the scheme-1 router.** `(owner, policyHash)` is a struct and the permit signature is `PermitSig {uint8 v; bytes32 r; bytes32 s;}`, because the flat
  argument lists exceed the legacy codegen's stack in the ABI decoder (`via_ir` is not used by this package). Signatures:
  `payERC20(address,address,(address,bytes32),uint256,uint256,uint256,bytes,bytes)`,
  `payERC20WithPermit(address,address,(address,bytes32),uint256,uint256,uint256,bytes,bytes,(uint8,bytes32,bytes32))`,
  `payNative(address,(address,bytes32),uint256,uint256,bytes,bytes)`,
  `payERC20WithBuffer(address,address,(address,bytes32),uint256,uint256,uint256,uint256,bytes,bytes)`. Scheme-1 calldata hits the reverting fallback (`NoDirectETH`).
- **R4. Check order:** policy binding (`ZeroAddress` owner, `NotPolicyAccount`) runs **first** in every entry point (before the buffer checks, the token-zero check, the deadline and
  the permit), then the scheme-1 order of DEVIATIONS item 5. Consequences: a wrong recipient never touches the token or consumes a permit nonce; `stealth == 0` reports
  `NotPolicyAccount`, not `InvalidStealth`. `InvalidStealth` is still reachable when the fee recipient is itself the predicted account (rejected, like scheme 1).
- **R5. What the binding does not prove.** It proves the address is a clone slot of this factory for `(owner, policyHash)`; it cannot prove `policyHash` has a sensible pre-image or that
  `owner` is the payee's stealth key (both come from the meta-address/derivation off-chain). Funds paid to an account whose policy pre-image nobody knows are stuck, as with any wrong stealth address.
- **R6. Factory/implementation pinning.** Redeploying the factory requires a new router; manifests and scanners must pin `(chainId, policyRouter, factory, implementation codehash)`.
- **R7. Slither:** zero results for the new files at **all** severities (no `--exclude*` flags), using inline `slither-disable` start/end or next-line comments with rationale
  for `timestamp` (deadline), `assembly` (A1) and `naming-convention` (upper-case immutables, same as scheme 1). CI's medium+ run is unchanged and still passes.
- **R8. Coverage:** `forge coverage --ir-minimum` for `src/GhostPayPolicyRouter.sol`: branches 100 %, functions 100 %, lines 84/85; the uncovered "line" is the assembly `call` (same
  instrumentation artefact as A1). `scripts/check-natspec.sh` was not edited; the same check run with `CONTRACTS=(GhostPayPolicyRouter)` passes.
- **R9. `DeployPolicyRouter.s.sol`** follows `DeployBase` conventions: required `FEE_RECIPIENT` (not the broadcaster), required `POLICY_FACTORY` (code at the factory and its `IMPLEMENTATION`;
  optional `EXPECTED_POLICY_FACTORY_CODEHASH`), the `Deploy` announcer rules duplicated (`ANNOUNCER`, `ALLOW_CUSTOM_ANNOUNCER=1`, `EXPECTED_ANNOUNCER_CODEHASH`) because they live in
  `Deploy` rather than `DeployBase`, chain allowlist, and read-back of every immutable plus `SCHEME_ID`. The `deployments/schema.json` manifest has no `policyRouter` field yet (not changed here).
  `.gas-snapshot` gained the new non-fuzz tests only (merged, sorted).

# Round-3 audit remediation (docs/remote/audit-parts/contracts.md)

- **R10. N-01: the policy router takes the per-payment CREATE2 `salt`, not `PolicyRef(owner, policyHash)`.** *Public ABI change of the
  (experimental, not yet deployed) scheme-2 router.* Every payment used to carry the seller-constant `policyHash` in plaintext calldata, which linked all
  payments to the seller's public scheme-2 meta-address (and, with `limitsRoot == 0`, revealed the destination by brute force over the delay range).
  The struct is removed and each entry point takes `bytes32 salt` in its place, where `salt = keccak256(abi.encode(owner, policyHash))`; it is unique per payment
  because `owner` is. The router checks `stealth == Clones.predictDeterministicAddress(IMPLEMENTATION, salt, FACTORY)`, with `IMPLEMENTATION = FACTORY.IMPLEMENTATION()`
  cached as a private immutable in the constructor, so there is no external call per payment any more. The salt reveals nothing the address does not:
  it is the CREATE2 pre-image of the address, and its own pre-image contains the stealth owner, which stays secret until it signs. New signatures:
  `payERC20(address,address,bytes32,uint256,uint256,uint256,bytes,bytes)`, `payERC20WithPermit(address,address,bytes32,uint256,uint256,uint256,bytes,bytes,(uint8,bytes32,bytes32))`,
  `payNative(address,bytes32,uint256,uint256,bytes,bytes)`, `payERC20WithBuffer(address,address,bytes32,uint256,uint256,uint256,uint256,bytes,bytes)` (supersedes R3's list).
  Consequences: (a) the router can no longer reject a zero `owner` (R2): it sees only the salt. An account with a zero owner can never be deployed, so funds paid to it are stuck,
  as with any wrong stealth address. `@ghostpay/policy-scheme` refuses a zero owner before it builds the salt. `test_policy_zeroOwnerSaltNotDetectable` pins this.
  (b) R4's check order is unchanged (binding first); a zero-owner salt for another account now reports `NotPolicyAccount(expected)` instead of `ZeroAddress`.
  (c) R5 still applies. Regression: `test_policy_calldataDoesNotLinkPaymentsToSeller` (the policyHash appears at no byte offset of two same-seller calldatas,
  their salts differ, and a cross-used salt is rejected) and the policy-scheme unit test "calldata never carries the seller-constant policyHash".
  **Residual (inherent, documented):** `PolicyAccountFactory.deploy(owner, destination, delay, limitsRoot)` calldata publishes the full policy pre-image. The first
  deployment of any of a seller's accounts therefore reveals the `policyHash` (and the destination) of that meta-address, and links every *deployed* account of the
  seller from then on (the `PolicyAccount.policyHash()` getter is public anyway). Undeployed, router-paid accounts stay unlinkable. CONTRACTS_SPEC section 4's
  "does not reveal the destination" holds only before any deployment and only with a high-entropy `limitsRoot`: with `limitsRoot == 0` a candidate
  destination is confirmed from the `policyHash` (which the meta-address carries) by trying the factory's 1 h .. 30 d delay range.
- **R11. M-03: fee waiver in `PolicyAccountFactory.deploy`.** The fee is now pulled with `SafeERC20.trySafeTransferFrom`. If the transfer fails although
  `balanceOf(msg.sender) >= FLAT_FEE` and `allowance(msg.sender, factory) >= FLAT_FEE`, the failure is attributable to the fee token or the recipient (issuer blacklist or pause of
  `FEE_RECIPIENT`, token paused), and the account is deployed **without** the fee: new event `FeeWaived(address indexed account)`, emitted before `AccountDeployed`.
  If either the balance or the allowance is short, it reverts with the new error `FeeTransferFailed()`. Previously that case bubbled the token's own error. A transfer that succeeds with a wrong recipient delta
  still reverts `UnexpectedFeeDelta`, so a token upgraded to fee-on-transfer still freezes deployments. That case is not fixable without trusting the token. Gas starvation cannot buy a waiver:
  after an out-of-gas fee call only 1/64 of the gas remains, far less than the clone and initialisation need (`test_deploy_gasStarvationCannotTriggerWaiver` sweeps gas
  limits and asserts that every successful deployment paid). Accepted edge: a caller that the token itself blacklists, but that holds balance and allowance, deploys fee-free (a USD 3 loss
  per account). This changes CONTRACTS_SPEC section 4's "pulls `flatFee`" into "pulls `flatFee`, or waives it when the token refuses a caller who can pay"; the spec line is updated.
  The P7 order is unchanged: `AlreadyDeployed` is checked before any fee. The audit test `test_EXPLOIT_feeTokenBlacklistFreezesCounterfactualAccounts` became the regression test
  `test_feeTokenBlacklistNoLongerFreezesCounterfactualAccounts`. Happy-path `deploy` costs about 230 more gas.
- **R12. M-01 (fee recipient SPOF in both routers): not changed.** Any in-router waiver breaks the spec section 5 invariant `fee + net == gross`, which is pinned. A waiver would either
  leave the fee with the payer, or forward it to the stealth address, which breaks the metadata `net` binding. A pull-vault breaks "the router never keeps funds".
  Both need an owner decision. The operational mitigations stay in README "Audit follow-ups". The `test_EXPLOIT_feeRecipient*` tests keep asserting the residual behaviour.
- **R13. Info items, documented only.** N-02: pending withdrawal requests never expire and pay the destination current at execution time (P3). An expiry
  (`executeBefore`, or a signed execute deadline) would change the `Withdraw` typehash pinned in CONTRACTS_SPEC section 4 and P3's semantics, so it is not implemented.
  Clients must list pending `WithdrawRequested` ids that are not yet executed or cancelled, and offer to cancel them before any destination change and after a suspected key leak.
  N-03: `deploy` can be front-run with identical arguments; the victim's call reverts `AlreadyDeployed(predicted)` before any fee is taken, and clients must treat that
  revert (or `code.length != 0`) as success. N-04: on chains whose native coin has an ERC-20 alias (for example Celo's `GoldToken`), a limits tree must not contain both
  `address(0)` and the alias, because that would double the cap. N-05: scheme id `0x47500002` and factory-clone recipients shrink the anonymity set to scheme-2 users (inherent).

# Round-3b remediation (docs/remote/fixes-round3b-contracts.md)

- **R14. Pending withdrawals are bound to the destination at request time (round audit C-02, review-policy F-03).** `PolicyAccount` stores the
  current `destination` with each request, packed into the storage slot of `windowSeconds` (an internal `StoredRequest`; the external
  `requests(id)` getter and the `Request` struct are unchanged). `executeWithdraw` reverts `DestinationChangedSinceRequest(requested, current)`
  before any state change while the two differ; the request stays `Pending` and can be cancelled, or becomes executable again if the destination is
  changed back. New view `requestDestination(id)`. No typehash, signature or `requests` ABI change; the ABI gains one error and one view
  (regenerate `packages/policy-scheme/src/abi` with `scripts/gen-abi.sh`). Consequence for clients: after a destination change, pending requests
  must be re-signed (one more `delay`). Gas: up to about +3k per `requestWithdraw` (the `windowSeconds` slot is now always non-zero), a few hundred on `executeWithdraw` (`.gas-snapshot` diff).
  Tests: `test_attack_changeAppliesAfterTwiceDelay_pendingWithdrawalsDoNotFollowNewDestination`, `test_pendingWithdrawDoesNotFollowDestinationChange`,
  invariant `invariant_pendingRequestsPayOnlyTheirBoundDestination` (kills the mutant that drops the check). This supersedes R13's N-02 note on the
  destination; requests still never expire.
- **R15. `SafeCast.toUint64` for timelock timestamps (stress F-3).** See P15. Test `test_item6_timestampNearUint64Max_revertsInsteadOfWrapping`.
- **R16. Unsalted `policyHash` (round audit C-01): documented, not changed (owner decision).** A salted commitment
  `keccak256(abi.encode(destination, delay, limitsRoot, policySalt))` would change `policyHashOf`, `deploy`, `initialize`, the CREATE2 salt input,
  the CONTRACTS_SPEC section 4 formula and the `@ghostpay/policy-scheme` `computePolicyHash` vectors together; it also protects only until the first
  deploy, whose calldata and getters publish the pre-image anyway. A no-contract-change mitigation exists: a limits tree with a secret random
  blinding leaf (any unused token address) makes `limitsRoot` high entropy (`test_item1_blindingLeafWorkaround_defeatsDictionary_andStillWithdraws`);
  it requires an explicit leaf for every token the owner wants to withdraw (P1). Design note in docs/remote/fixes-round3b-contracts.md.
- **R17. Stolen-key wording.** The `PolicyAccount` NatSpec now states that a stolen key is only delayed (`2 * delay`) and that protection lasts only while
  the honest owner cancels every hostile proposal in time (the contest is symmetric and unbounded; see "Spec observations").
