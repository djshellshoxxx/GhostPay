# Deep code audit: contracts (Router, SweepRelayer, PolicyAccount, PolicyAccountFactory)

Branch: claude/remote-extensions-1. Read-only audit. No source, test or config edited. GhostPayPolicyRouter excluded (in progress).
Date: 2026-10-21.

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 2 |
| Info | 3 |

No new correctness or fund-loss defect found in the four in-scope contracts. Every behaviour I probed matches `docs/CONTRACTS_SPEC.md` section 1, 2, 4 and the accepted items in `packages/contracts/DEVIATIONS.md` (P1-P19, items 1-12, A1-A6) and `packages/contracts/README.md` "Audit follow-ups".

## Scope and method

- Read: `src/GhostPayRouter.sol`, `src/GhostPaySweepRelayer.sol`, `src/PolicyAccount.sol`, `src/PolicyAccountFactory.sol`, `src/interfaces/{IGhostPayRouter,IGhostPaySweepRelayer,IPolicyAccount}.sol`.
- Read specs and accepted items first: `docs/SPEC_REVIEW.md`, `docs/CONTRACTS_SPEC.md`, `packages/contracts/DEVIATIONS.md`, `packages/contracts/README.md`, `docs/audits/02-security-review-contracts.md`. Findings below exclude every item already listed there.
- Tests: inventoried test function names in `test/*.t.sol`, `test/audit/*`, invariant and fuzz files. Did not run them.
- Verified: OpenZeppelin pinned at 5.6.1 (`lib/openzeppelin-contracts/package.json`); `ReentrancyGuard` is storage-based (`lib/.../ReentrancyGuard.sol:32-59`), so clone status 0 is accepted.

## What I actually ran

- `solc` 0.8.28 (`/tmp/claude-0/tools/solc/solc`, cancun, optimizer 200) on the four in-scope sources, output to stdout only. Result: no warnings, no errors. No artifacts written.
- Scratch check in `/tmp/claude-0/-home-user-ghostpay/4744cac5-02a8-54bc-995d-381350474572/scratchpad/shift/`: compiled `1 << (nonce & 0xff)` and called it on a local anvil (port 8557, stopped afterwards). Result: the expression is `uint256`-typed (nonce 256 gives bit 1, nonce 255 gives 2^255). The bitmap shift in `GhostPaySweepRelayer.sol:70,111` and `PolicyAccount.sol:303,335` is correct. Not a finding.
- Not run: `forge test`, fuzz/invariant runs, Echidna, Slither, gas snapshot. Test-quality statements below are from reading test names and bodies only.

## Findings

### L-1 (low) `PolicyAccount.windowState` returns stale bucket snapshot; NatSpec says "current"

- File: `packages/contracts/src/PolicyAccount.sol:306-319` (view), vs NatSpec `:308-311`.
- Evidence: `windowState` returns the raw `_windows[token]` slot. `bucket`, `current` and `previous` are only rewritten inside `_consume` (`:349-356`). NatSpec says `bucket` is "Index (`timestamp / window`) of the current bucket" and `current`/`previous` are the amounts in the current/previous bucket. That holds only at the last write. `test_window_secondWithdrawalAboveCap_reverts_thenWorksLater` (`test/PolicyAccount.t.sol:657-661`) already asserts the stored bucket, not the time-adjusted one.
- Failing scenario: limit 600e6, window W. At bucket k the owner executes a withdrawal of 600e6 (`current=600e6`, `bucket=k`). No further writes. At bucket k+2 an integrator calls `windowState(token)` and gets `(bucket=k, current=600e6, previous=0)`. It computes remaining = limit - (current + previous) = 0 and refuses to submit. The on-chain check would allow a full 600e6 at k+2, because `previous` is cleared when `bucket != s.bucket + 1`.
- Fix: either (a) make `windowState` mirror `_consume`'s rollover against `block.timestamp` and return effective values, or (b) change NatSpec to "as of the last write" and document that clients must apply the rule themselves. Add a test that reads `windowState` after a `vm.warp` with no writes, at +1 and +2 buckets.

### L-2 (low) Owner is not checked to be signable; contract owners permanently lock funds

- Files: `packages/contracts/src/PolicyAccountFactory.sol:93-99` (`deploy`), `packages/contracts/src/PolicyAccount.sol:115-122` (`initialize`), `:329-331` (`_checkOwner`).
- Evidence: the only owner check is `owner_ == address(0)`. `_checkOwner` uses `ECDSA.recover` only, with no ERC-1271 path. The spec says "stealth EOA" (`CONTRACTS_SPEC.md` section 4), and `DEVIATIONS.md` P8 covers only `owner == destination`. Nothing covers an owner that cannot sign.
- Failing scenario: a sender derives a meta-address whose `owner` is a Safe proxy, or the counterfactual clone's own address (`owner_ == address(this)` is also unchecked). Tokens are sent to the derived clone. `requestWithdraw`, `cancel`, `proposeDestination` and `cancelDestination` all require an ECDSA signature by `owner`, so no withdrawal can ever be authorised. Funds are stuck with no rescue (`L-05`).
- Fix: document it as a client-side validation requirement in `CONTRACTS_SPEC.md` section 4 and in the scheme-2 meta-address rules. Optionally reject `owner_ == address(this)` in `initialize`. Do NOT use a plain `owner.code.length == 0` check: EIP-7702-delegated EOAs carry a 23-byte `0xef0100` code prefix and would be wrongly rejected. Any on-chain check should allow that form.

### I-1 (info) Malformed owner signatures surface OZ ECDSA errors, not `InvalidSignature`

- File: `packages/contracts/src/PolicyAccount.sol:329-331`; `src/interfaces/IPolicyAccount.sol:106` declares `InvalidSignature`.
- Evidence: `ECDSA.recover` reverts with `ECDSAInvalidSignatureLength`/`ECDSAInvalidSignature`/`...S` before the `!= owner` comparison. Only a wrong-but-valid signer hits `InvalidSignature`. `test_request_badSignatureLength_reverts` (`test/PolicyAccount.t.sol:282-287`) asserts the OZ selector. The relayer's equivalent is documented (`DEVIATIONS.md` item 8), but the PolicyAccount behaviour is not listed.
- Impact: clients that map error selectors to `InvalidSignature` will miss malformed-signature cases. No fund impact.
- Fix: either document it in `DEVIATIONS.md` (new item) or use `ECDSA.tryRecover` and revert `InvalidSignature` on error. The latter also makes the behaviour match `GhostPaySweepRelayer`'s documented one.

### I-2 (info) Duplicated low-level logic across contracts (maintainability)

- Nonce bitmap is implemented twice: `GhostPaySweepRelayer.sol:40,69-71` and `:111-114` (inline in `_authorize`), vs `PolicyAccount.sol:103,302-304` and `_useNonce` at `:334-339`. Relayer `_authorize` does not call a shared helper.
- Balance-delta check pattern repeated in four places: `GhostPayRouter.sol:179-199`, `GhostPaySweepRelayer.sol:118-143`, `PolicyAccount.sol:211-221`, `PolicyAccountFactory.sol:105-115`.
- Native send is written twice: `GhostPayRouter.sol:241-249` (`_sendNative`) and `PolicyAccount.sol:203-209` (inline in `executeWithdraw`). Both are the same assembly `call` with the same `NativeTransferFailed` revert, so they must stay in sync.
- Suggested fix: one small internal library (nonce bitmap, `_pullExact`/balance-delta helper, native send). Reduces divergence risk for future contracts. No behaviour change needed. Not urgent.

### I-3 (info) Test-quality gaps

- Entry-point wiring for `payERC20WithPermit` and `payERC20WithBuffer` is tested for expiry, zero token and buffer bounds only (`test/GhostPayRouter.t.sol:578-700`, `:880-935`). Negative cases for `InvalidStealth`, `SlippageExceeded`, `InvalidEphemeralKey` and `InvalidMetadata` are covered only through `payERC20` / `payNative`. The shared `_validate`/`_checkMetadata` helpers make a regression unlikely, but a future refactor that bypasses them on one entry point would not be caught by the unit suite. Suggest adding one negative test per helper per entry point.
- `windowState` has no time-adjusted test (see L-1).
- `PolicyAccount.invariant.t.sol` invariants depend on handler counters (`windowViolations`, `badSigAccepted`, `earliestViolation`). I did not read the handler; whether those counters actually recompute the window rule independently could not be verified without reading `test/PolicyAccount.invariant.t.sol` handler code in full.

## Known and accepted (cross-referenced, not re-reported)

- Destination read at execution time, pending requests follow destination change (`PolicyAccount.sol:198`, `DEVIATIONS.md` P3). Pending requests have no execution expiry (P5).
- Duplicate-token merkle trees let the key holder choose the looser leaf; `WindowMismatch` on mixed windows (P1, `docs/audits` L-04 remediation).
- Relayer: owner, destination, feeTo aliasing reverts `UnexpectedBalanceDelta` (`DEVIATIONS.md` item 9). I confirmed the fail-closed behaviour by reading `_execute` (`GhostPaySweepRelayer.sol:139-143`); no fund risk.
- Relayer permit deadline not signed (I-05 / `CONTRACTS_SPEC` note); permit try/catch (`:54-58`); residual allowance after permit sweep (`test_residualAllowanceAfterPermitSweep`).
- Router payer equal to stealth or fee recipient reverts (`test_payERC20_revertsWhenPayerIsStealth`), by design.
- ETH forced to router / clone; 2300-gas senders (I-04); fee recipient single point of failure (M-01/M-03); announcements unauthenticated (L-02); two-bucket window conservatism (P2, I-06).

## Could not verify

- Behaviour under a real chain or live tokens (fee-on-transfer, rebasing, EIP-7702 owners): reasoned from code only.
- Whether all invariant handler counters in `PolicyAccount.invariant.t.sol` and `GhostPayRouter.invariant.t.sol` compute the spec rule independently (handler code not fully read).
- Whether the current test suite is green: I did not run it.
- Gas claims (return-data bomb bounds, `test_returnDataBomb_*`): not measured.
