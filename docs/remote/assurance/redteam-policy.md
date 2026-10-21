# Red-team: on-chain policy system (packages/contracts)

Attacker model: full control of anvil (arbitrary accounts, arbitrary contracts, arbitrary tokens),
ability to sign EIP-712 payloads only with keys the attacker holds, and — where the threat model
names it — possession of a *stolen owner key*. Method: exploit attempts written as Foundry tests
and run under Foundry's cancun EVM (revm, identical semantics to anvil). Toolchain: forge 1.8.5,
solc 0.8.28 (`/tmp/claude-0/tools/solc/solc`), own `FOUNDRY_OUT`/`FOUNDRY_CACHE_PATH`.

Scratch (repo copied out, unmodified): `/tmp/claude-0/assure-policy/exploit/`
(`test/RedTeam.t.sol`, `test/Extra.t.sol`, `test/Mocks.sol`).
Repro all: `export PATH=/root/.local/bin:$PATH FOUNDRY_OUT=/tmp/claude-0/assure-policy/out
FOUNDRY_CACHE_PATH=/tmp/claude-0/assure-policy/cache; cd /tmp/claude-0/assure-policy/exploit &&
forge test`  → **19 passed, 0 failed**. Each test is a hostile action; a PASS means the exploit was
defended (the attempt reverts / changes nothing / cannot double-spend).

## Result

No exploitable vulnerability found. Every attempted vector is blocked by an existing control.
Four observations below are LOW/INFO footguns, none attacker-exploitable.

## Attempted-and-failed exploit vectors (defenses confirmed)

PolicyAccount
- Signature replay across clones/chains — `test_PA_sigReplayAcrossClones`. Per-clone domain
  separator (chain id + clone address) makes a clone-A signature `InvalidSignature` on clone B.
- Nonce replay within a clone — `test_PA_nonceReplay`. Second use of a nonce reverts
  `NonceAlreadyUsed` (bitmap consumed before any external call).
- Timelock bypass — `test_PA_timelockBypass`. `executeWithdraw` before `executeAfter` reverts
  `TimelockActive`.
- Stolen-key destination redirect / cancel race — `test_PA_destChange_requires2Delay_and_cancelable`
  + `test_PA_queuedWithdraw_followsLiveDestination_after2Delay`. Redirect needs the full `2*delay`;
  the honest owner (same key) cancels in-window; a withdraw queued to the old destination cannot
  reach a new one before `2*delay` elapses (confirms no acceleration; `executeWithdraw` reads live
  `destination` by design).
- Rolling-window gaming — `test_PA_windowGaming`. Spending the full limit late in bucket k, then a
  second full-limit spend at the start of the adjacent bucket, reverts `WindowLimitExceeded`
  (two-bucket `previous+current<=limit` holds any window-length interval to `limit`).
- Reentrancy via hostile native destination — `test_PA_reentrancy_nativeDest`. A destination that
  reenters `executeWithdraw` is blocked by `nonReentrant`; the inner failure propagates `!ok` and
  the outer payout reverts. No double-spend.
- Fee-on-transfer / rebasing token — `test_PA_feeOnTransfer`. Exact balance-delta check reverts
  `UnexpectedBalanceDelta`.
- Unauthorized / re-initialization — `test_PA_initializeAuth`. An attacker can only self-deploy a
  clone at an address derived from *their own* deployer+params, which is not the factory-predicted
  address (so routers never pay it); factory-deployed clones reject re-init `AlreadyInitialized`.

Factory
- CREATE2 squatting — `test_Factory_noSquatWithDifferentParams`. The salt commits to
  `(owner, policyHash=hash(destination,delay,limitsRoot))`; attacker params yield a different
  address, and deploying the victim's exact params only builds the account the victim wanted (and
  the attacker pays the fee). Address prediction matches across factory/router/`initialize`.
- Fee-on-transfer fee token — `test_Factory_feeOnTransferFee`. Reverts `UnexpectedFeeDelta`.
- Fee-pull reentrancy — `test_Factory_feeReentrancyBlocked`. A fee token reentering `deploy` is
  stopped by `nonReentrant` (reentrant call reverts; outer deploy unaffected).

SweepRelayer
- Nonce replay / third-party submission — `test_Sweep_nonceReplay_and_thirdPartySubmit`. Any
  submitter may relay, but only to the owner-signed `destination`/`feeTo`; replay reverts
  `NonceAlreadyUsed`.
- Fee-on-transfer — `test_Sweep_feeOnTransferRejected`. Reverts `UnexpectedBalanceDelta`.
- Degenerate fee — `test_Sweep_amountLeFeeRejected`. `amount <= fee` reverts `InvalidAmount`.

Routers (GhostPayRouter / GhostPayPolicyRouter)
- Token-hook reentrancy — `test_Router_reentrancyViaHook`. An ERC-777-style hook reentering
  `payERC20` is rejected by `nonReentrant`; even when the malicious token swallows the inner
  revert, no double-payment and no second announcement occur.
- Announcer cannot be bypassed — `test_Router_announcerRevertBlocksPay`. A reverting announcer
  reverts the whole payment (no silent pay without announcement).
- Policy binding — `test_PolicyRouter_rejectsNonPolicyAddress`. Paying any non-factory-predicted
  stealth reverts `NotPolicyAccount` before any transfer; the correct counterfactual address is
  payable.

## Observations (LOW / INFO — not attacker-exploitable)

- INFO-1 (contract owner lockout) — `test_PA_contractOwner_locksFunds`. PolicyAccount verifies the
  owner only via `ECDSA.recover` (no ERC-1271); the factory cannot check the counterfactual owner is
  an EOA. If a stealth address is accidentally a smart-contract wallet, the account can never
  authorize and funds lock. Self-inflicted; the stealth model assumes EOAs. Fix (optional):
  document prominently / add an off-chain EOA-codesize guard in the SDK.
- INFO-2 (no on-chain fee cap) — SweepRelayer/routers carry no fee ceiling; the fee is owner-signed,
  so on-chain this is sound. Off-chain relayer griefing is out of scope here (see
  `redteam-relayer.md`).
- INFO-3 (duplicate merkle leaves) — if a `limitsRoot` tree lists one token twice, the owner can
  sign whichever leaf grants the higher limit, or trigger a one-leaf `WindowMismatch` DoS. Owner-
  constructed tree footgun, already called out in `PolicyAccount` NatSpec ("each token at most
  once"). No cross-submitter exploit: the signed `limitLeafHash` pins the leaf.
- INFO-4 (live destination on payout) — `executeWithdraw` pays the current `destination`, so a
  queued withdraw follows a later destination change. Confirmed this does not shorten the `2*delay`
  redirect window (INFO covered by the dest-change test); by design and documented.

## Not run / limitations

- ERC-2612 permit front-running on SweepRelayer/routers was assessed by inspection only (requires a
  full EIP-2612 permit mock): the `try/catch` around `permit` plus the subsequent allowance-gated
  `transferFrom` make a front-run permit a no-op, which matches the in-code rationale and existing
  repo fuzz tests. No PoC written.
- Invariant/fuzz campaigns were not re-run here (owned by the repo's own suites); this pass is
  targeted adversarial PoCs only.
- Tests run on Foundry's cancun EVM (revm), not a live anvil RPC; EVM semantics are identical, so
  results transfer. anvil binary present (`/root/.local/bin/anvil`) if an RPC run is later wanted.
