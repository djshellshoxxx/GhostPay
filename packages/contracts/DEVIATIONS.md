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
- **P3. Signatures never contain the destination; payout goes to the destination at execution time.** Pending requests therefore follow a destination change
  (a rotated-away cold wallet should not still receive funds). The EIP-712 domain (name `GhostPayPolicyAccount`, version `1`, chain id, clone address)
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
- **P15. Timestamps are stored as `uint64`.** `block.timestamp + 2 * 30 days` fits for any realistic date; casts carry `forge-lint` justifications.
- **P16. `DeployPolicy.s.sol` reads configuration through a virtual `_env()`** so its test can inject values; the shared process environment cannot be used because
  `DeployTest` runs in parallel and expects `FEE_RECIPIENT` unset. `FEE_TOKEN` and `FEE_RECIPIENT` must be non-zero; `FLAT_FEE=0` is accepted only when set explicitly.
  `FEE_TOKEN` must have code on the target chain.
- **P17. `deployments/schema.json` additions are optional and additive:** `policyImplementation`, `policyFactory`, `policyFeeToken`, `policyFlatFee` (decimal string),
  `policyFeeRecipient`, and optional `deployTx` / `bytecodeHashes` entries; `dependentRequired` makes the five policy fields all-or-nothing. Manifests without them validate as before.
- **P18. `scripts/check-natspec.sh`** now checks the two new contracts and ignores two more third-party errors (`InsufficientBalance`, `FailedDeployment`, from OpenZeppelin `Clones`/`Create2`).
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
- **"Delay" is one number for both the withdrawal timer and (doubled) the destination timelock**, as specified; there is no separate configuration.
