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
