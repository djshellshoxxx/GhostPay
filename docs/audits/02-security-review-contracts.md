# GhostPay independent security review: smart contracts and deployment

- Branch: `claude/inspiring-fermat-vxv689` (working tree clean at start)
- Scope: `packages/contracts/src/{GhostPayRouter,GhostPaySweepRelayer,PolicyAccount,PolicyAccountFactory}.sol`, `packages/contracts/script/{Deploy,DeployPolicy}.s.sol`, interfaces. Against `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` Section 2 ("Smart contracts and deployment", contract parts of "Relayer, bundler, and paymaster") and Section 3 contract checklist, `docs/CONTRACTS_SPEC.md`, `docs/FEE_SCHEDULE.md`, `docs/threat-model/THREAT_MODEL.md`, `packages/contracts/DEVIATIONS.md`.
- Out of scope: `apps/relayer` service code, TypeScript packages, the EntryPoint/paymaster (no ERC-4337 contract exists in this repo), vendored OpenZeppelin 5.6.1 and forge-std internals.
- Method: full manual read of all in-scope source; Slither (all findings triaged); Mythril 0.24.8 on runtime bytecode; 42 adversarial Foundry tests under `packages/contracts/test/audit/`; baseline suite re-run (225 tests pass). No source was modified; nothing committed.

## 1. Summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | |
| High | 0 | |
| Medium | 3 | M-01, M-02, M-03 |
| Low | 6 | L-01 .. L-06 |
| Info | 8 | I-01 .. I-08 |

No finding allows theft of user funds, bypass of the PolicyAccount timelock/destination binding, signature replay, or re-initialisation. The three Medium findings are availability / integration failures of immutable design choices (no recovery path once deployed). Test names starting `test_EXPLOIT_` assert that the weakness is real (the exploit succeeds).

Top findings:
1. M-01 Blacklisting (or any native-rejection of) the immutable `FEE_RECIPIENT` bricks every router payment of 400 base units or more, with no on-chain remedy.
2. M-03 The same fee-token dependency in `PolicyAccountFactory.deploy` freezes funds already sent to not-yet-deployed policy-account addresses.
3. M-02 The router hard-codes scheme id 1, so payments to policy accounts (scheme `0x47500002`) are announced under the wrong scheme.

## 2. Findings

### M-01 Immutable fee recipient is a single point of failure for all payments
- Severity: Medium. Impact is total loss of the core function (paying through the router) for payments >= 400 units; no funds lost; no on-chain recovery (immutable, no admin); realistic trigger (issuer blacklists the multisig/hardware address; recipient contract becomes unable to receive ETH, e.g. paused Safe module/proxy).
- Code: `GhostPayRouter.sol:122` (`_sendNative(FEE_RECIPIENT, fee)`), `:185` (`safeTransferFrom(msg.sender, feeRecipient, fee)`), `:57` (immutable), `:212` (also bars `stealth == FEE_RECIPIENT`).
- Scenario: Circle blacklists `FEE_RECIPIENT`; every `payERC20` with `gross >= 400` of USDC reverts. Only dust (fee rounds to 0) still works. Same for native when the recipient reverts on receive.
- PoC: `Router.audit.t.sol::test_EXPLOIT_feeRecipientBlacklisted_dosAllErc20Payments`, `::test_EXPLOIT_feeRecipientRejectsNative_dosNativePayments`.
- Fix: cannot be fixed in-contract without weakening "no custody/no admin". Operational mitigations: (a) runbook + deployment-manifest "deprecated router" flag so clients switch to a new router; (b) client does an `eth_call` simulation before presenting the payment; (c) monitor token blacklist/pause events for the recipient; (d) choose a recipient that is a plain multisig not exposed to sanctions exposure; (e) optionally accept a design change where the fee is accrued in a separate pull-vault so a bad recipient cannot block the payer (documented trade-off: the router would hold balances momentarily).
- Status: Open (needs owner decision; documented partially in DEVIATIONS item 2).

### M-02 Router cannot announce scheme `0x47500002`
- Severity: Medium (functional/spec gap; no funds at risk today because no scheme-2 scanner exists yet, but payments to policy accounts become undiscoverable by a scheme-2 scanner).
- Code: `GhostPayRouter.sol:38` (`SCHEME_ID = 1`) used at `:80,:106,:128,:146`; `CONTRACTS_SPEC.md` section 4 requires "Announcement: `schemeId = 0x47500002`, `stealthAddress = A_acct`"; `DEVIATIONS.md` (PolicyAccount spec observations) notes nothing in the new contracts announces. TS scanner (`packages/core-crypto/src/stealth.ts:56`, `packages/chain-adapters/src/logs.ts:171`) only handles scheme 1.
- Scenario: payer routes funds to `A_acct` via the router; the announcement is emitted under scheme 1 with a stealth address that is a CREATE2 clone, not the scheme-1 derived `A_owner`. A scheme-2 scanner filtering topic[1] = 0x47500002 never sees it; a scheme-1 scanner sees a mismatching address and discards it. Funds sit at `A_acct` unnoticed.
- PoC: none needed (static: constant `SCHEME_ID`).
- Fix: before enabling scheme 2, add a `schemeId` argument restricted to `{1, 0x47500002}` (public-contract change, so update CONTRACTS_SPEC first) or deploy a second router variant; update scanners and test vectors.
- Status: Open (spec decision).

### M-03 Fee-token failure freezes counterfactual policy accounts
- Severity: Medium (High if a freezable token such as USDC is the fee token and users have already funded undeployed accounts, since recovery depends on the issuer).
- Code: `PolicyAccountFactory.sol:98-108` (fee pulled in `deploy` with `FEE_TOKEN`, recipient-delta check); `PolicyAccount.sol:122` (only the exact CREATE2 deployer can initialise, so only this factory can ever create code at the address).
- Scenario: payers send assets to the predicted address of an undeployed account. Issuer blacklists/pauses `FEE_RECIPIENT` (or the token is paused/upgraded to something lossy). `deploy` reverts forever; no one else can deploy at that address; assets are frozen. Also bricked: deploying with a fee-on-transfer-after-upgrade token.
- PoC: `Policy.audit.t.sol::test_EXPLOIT_feeTokenBlacklistFreezesCounterfactualAccounts`.
- Fix options: deploy factories with `FLAT_FEE == 0` for chains where the fee token is freezable and charge the fee elsewhere; or add a second immutable "fee-free after N days" escape (new design); or require the first deposit to be made only after deployment (client rule: deploy account before publishing a meta-address, which defeats counterfactual UX). At minimum document the dependency and pin `FEE_RECIPIENT` not to be blacklistable.
- Status: Open.

### L-01 Unbounded return data copied from native `call` (return-data bomb)
- Severity: Low (callee is chosen by the payer in the router, by the owner in PolicyAccount; but `executeWithdraw` is permissionless so the executor pays the gas).
- Code: `GhostPayRouter.sol:242`, `PolicyAccount.sol:195` (`(bool ok,) = to.call{value: ...}("")` copies the full return buffer to memory).
- Measured: a payee returning 1,000,000 bytes costs 4,171,033 gas for `payNative` versus 107,073 for an empty return; `executeWithdraw` to such a destination costs 4,158,023 gas. Cost is quadratic; larger blobs exceed the block gas limit. An upgradeable destination contract could turn hostile and make native withdrawals unexecutable until the 2x-delay destination change.
- PoC: `Router.audit.t.sol::test_returnDataBomb_gasOverhead`, `Policy.audit.t.sol::test_returnDataBomb_destinationInflatesExecutorGas`.
- Fix: use `assembly { ok := call(gas(), to, amount, 0, 0, 0, 0) }` so no return data is copied. ERC-20 side is safe: OZ 5.6.1 SafeERC20 copies at most 32 bytes.
- Status: Open.

### L-02 Announcement content is largely unauthenticated; spoofing and dust griefing
- Severity: Low (inherent to ERC-5564; the router validates only metadata length/marker/asset/net, key length and prefix byte).
- Code: `GhostPayRouter.sol:202-236`.
- Facts verified:
  - Any token (including a contract named "USD Coin") can be paid to any victim stealth address and is announced with `caller == router` (and `net` mirrors reality). Victim wallets that trust "router-announced" payments show spoofed tokens.
  - View tag (byte 0) is free; the ephemeral key is only checked for 33 bytes and prefix 02/03, not on-curve or matching the stealth address. A payer mistake sends funds to an address the recipient can never discover (funds only recoverable by the holder of a key that does not exist).
  - A stealth address that is a contract can emit extra announcements before the router's (`test_EXPLOIT_stealthContractInjectsAnnouncementBeforeRouterAnnounce`).
  - The `caller` field cannot be forged (`test_callerFieldCannotBeForged`), but it is the router for everyone, so it authenticates nothing about the payer.
  - Flooding: anyone can emit unlimited announcements to any stealth address at gas cost; scanners pay per false-positive view tag (1/256).
- PoC: `Router.audit.t.sol::test_EXPLOIT_announcementSpoofing_fakeTokenOffCurveKeyWrongTag`.
- Fix: client side: scanner must verify the actual balance delta at the stealth address, apply a token allowlist/dust threshold, and never treat `caller == router` as proof. Optional contract hardening: reject ephemeral keys not on the curve (costly) and document that the payer UI must derive the key.
- Status: Open (client mitigation).

### L-03 Sweep relayer: fee dodge, gas waste and hostile tokens
- Severity: Low (relayer-side economic risk; no user funds at risk).
- Code: `GhostPaySweepRelayer.sol` (file lines) `:46-60`, `:80-115`, `:118-143`.
- Facts verified:
  - After the relayer's simulation succeeds, the owner (who only needs a little gas) can move the tokens away; the relayer's transaction reverts, gas is lost, no fee is paid (`Sweep.audit.t.sol::test_EXPLOIT_ownerDodgesFeeAndWastesRelayerGas`). There is no on-chain nonce invalidation either.
  - A hostile token's `permit()` can burn essentially all supplied gas and still be swallowed by `try/catch` (19.59M of 20M measured, `test_EXPLOIT_hostileTokenBurnsRelayerGas`).
  - A searcher copying the calldata only pays the relayer's own signed `feeTo`; value cannot be redirected (`test_frontRunCopy_paysOriginalFeeTo_noDiversion`).
- Fix (relayer service, `apps/relayer`): token allowlist, hard per-tx gas cap, simulate immediately before sending via a private channel, per-owner quotas, circuit breaker (already in the threat model; verify in the service review). Contract: optional, no change recommended.
- Status: Open (service-level).

### L-04 PolicyAccount limit proof is not bound by the owner's signature
- Severity: Low (needs a tree that violates the documented "each token at most once" rule; the submitter then selects the leaf).
- Code: `PolicyAccount.sol:137-164` (`lp` supplied by the caller, outside `WITHDRAW_TYPEHASH`), `:46-52`.
- Scenario: a limits tree holding two leaves for one token (e.g. cap 100/day and 900,000/day); a relayer submits the owner's signed `Withdraw(500)` with the permissive proof and 500 leaves the account despite the strict cap the owner thought applied. Conversely a hostile submitter can choose the stricter leaf to grief.
- PoC: `Policy.audit.t.sol::test_EXPLOIT_duplicateLeafSubmitterPicksPermissiveLimit`.
- Fix: bind `keccak256(limit, windowSeconds)` into the signed `Withdraw` struct, or have the client library refuse to create trees with duplicate tokens and CI-test that. The contract cannot detect duplicates.
- Status: Open (client validation; contract change optional).

### L-05 Assets that can never leave a PolicyAccount (no rescue by design)
- Severity: Low (documented as P10; realistic tokens affected).
- Code: `PolicyAccount.sol:198-207` (strict balance delta), `:152-157` (token without leaf when `limitsRoot != 0`), `:109` (`receive` only, no ERC-721/1155 hooks).
- Facts verified: a stETH-like token that moves 1 wei less per transfer can never be withdrawn (`test_EXPLOIT_lossyTokenPermanentlyStuck`); a token with no leaf in a non-zero root is stuck (`test_EXPLOIT_tokenWithoutLeafStuckForever`); NFTs cannot be safe-transferred in and cannot be moved out; ETH sent to the implementation is lost.
- Fix: UI warning and a mandatory unlimited leaf for every token the seller accepts; consider a `withdrawExact` mode that skips the delta check for allowlisted rebasing tokens (new design).
- Status: Accepted by design; keep in the user manual.

### L-06 Deployment-script gaps
- Severity: Low.
- Code: `script/Deploy.s.sol:36-49`, `script/DeployPolicy.s.sol:124-143`, `GhostPayRouter.sol:62-67`.
- Positive: no keys or addresses hard-coded; signing is delegated to `--account/--ledger/--trezor`; chain allowlist is fail-closed (testnets built in, mainnets require explicit `ALLOWED_CHAIN_IDS`); unset and empty env vars are treated identically; no `forge script`/broadcast appears in `.github/workflows`; `deployments/` contains only schema/README so no stale manifest.
- Gaps: (a) `ANNOUNCER` env override accepts any address with code on mainnet, no codehash/ABI check against the canonical announcer; the router constructor itself performs no code-length check; (b) `FLAT_FEE` has no sanity bound or decimals check (a 1e18 typo on a 6-decimals token makes every deployment unusable and, per M-03, freezes funds); (c) `FEE_RECIPIENT` not checked to be able to receive ETH or to differ from the broadcaster; (d) no post-deploy read-back asserting `router.FEE_RECIPIENT()/ANNOUNCER()` and factory immutables equal the inputs; (e) `vm.parseUint` on `ALLOWED_CHAIN_IDS` entries with spaces reverts (fail-safe, but confusing); (f) built-in allowlist includes 31337, which is also what a forked anvil reports.
- Fix: add canonical-announcer `codehash` pin per chain in the manifest, a `FLAT_FEE <= MAX` assertion, read-back assertions, and a check script run before signing.
- Status: Open.

### I-01 Key compromise is delayed/visible, not prevented (documented)
`PolicyAccount.sol:225-250`. A thief holding the owner key can request withdrawals (to the owner's destination only), cancel the owner's pending items and keep re-proposing destinations after each cancel; the owner can cancel each proposal but the struggle is unbounded and there is no key rotation or recovery. `test_stolenKey_destinationChangeNeedsTwoDelays_andIsCancellable` shows the 2x-delay guarantee holds and pending withdrawals pay the old destination until the change executes. Status: accepted (DEVIATIONS spec observations).

### I-02 Delay has no minimum
`PolicyAccount.sol:119`, factory `:83`: `delay` may be 1 second; the "timelock" is then meaningless (and block-timestamp drift matters). Enforce a UI/policy minimum (e.g. >= 1 hour) in client and docs. Slither "timestamp" findings are otherwise benign (see section 5).

### I-03 Fee can be avoided on dust and by direct transfer
`GhostPayRouter.sol:216`: floor rounding means gross < 400 pays 0; splitting a payment into 399-unit chunks pays no fee (`test_EXPLOIT_feeBypassBySplittingBelow400Units`: 20 x 399 units, fee 0 vs 19 owed). Economically negligible for realistic tokens (gas dominates) except very high-value, low-decimal tokens. Direct transfers bypass the router by design (FEE_SCHEDULE section 2).

### I-04 2300-gas senders cannot fund clones
EIP-1167 `delegatecall` to a cold implementation exceeds the stipend; `transfer()`/`send()` to a policy account reverts (`test_EXPLOIT_stipendTransferToClonefails`, documented as P14). Funds are not lost (revert).

### I-05 Signatures cannot be revoked before use; permit not bound to sweep
`GhostPaySweepRelayer`/`PolicyAccount` have no `invalidateNonce`. An unsubmitted signed Sweep, Withdraw or ProposeDestination stays valid until its deadline (a leaked ProposeDestination signature lets anyone start the 2x-delay clock; the owner can still cancel). `sweepWithPermit` leaves `permit.value - amount` allowance on the relayer (`test_residualAllowanceAfterPermitSweep`), harmless without a fresh owner signature. Keep deadlines short in the client.

### I-06 Two-bucket window lockout up to two windows
`PolicyAccount.sol:329-344`. After spending the full cap at the end of a bucket the next spend waits until two buckets later (`test_windowBoundary_lockoutUpToTwoWindows`); the cap is never exceeded over any `W` interval (fuzz-verified by the project and by `testFuzz_withdrawAmountsVsWindowCap`). `windowSeconds = 2^64-1` is a lifetime cap (`test_hugeWindowIsLifetimeCap`). Owner-chosen, documented.

### I-07 Self-transfer edge cases fail closed
Payer equal to `FEE_RECIPIENT` or to `stealth` cannot use the router (`UnexpectedBalanceDelta`); the fee recipient cannot deploy accounts with a non-zero fee; `destination == feeTo`, `destination == owner`, `feeTo == owner` revert in the relayer. All tested; none exploitable.

### I-08 F-SECURE and F-PAY fees only bind the official contracts
A third party can deploy its own factory around the public `PolicyAccount` implementation (different addresses, no fee) because `initialize` authenticates by CREATE2 re-derivation from `msg.sender` (`test_reinitAndForeignInitializeRejected`). Not a security issue for the official addresses; it is a revenue-model fact already stated in FEE_SCHEDULE.

## 3. Things checked and found safe

Reentrancy and external calls
- Router: all four entry points `nonReentrant`; no state besides the guard; external calls are token transfers, `balanceOf`, native `call` to stealth/fee recipient and the announcer. ERC-777-style hook (existing `HookToken`, `ReentrantToken`) cannot re-enter the router; hooks on payer/stealth only break the payer's own transaction.
- Relayer: nonce consumed after signature validation and before any external call (`_authorize`), `nonReentrant`; reentrant token cannot reuse a nonce.
- PolicyAccount: `executeWithdraw` sets `Executed` and consumes the window before the native/ERC-20 transfer; destination callback cannot re-enter any guarded function (`test_nativeWithdrawReentrancy_blocked`); `receive()` is unguarded but touches no state. Account has no `approve`, no `delegatecall`, no `selfdestruct`, no arbitrary call.
- Factory: `nonReentrant`; clone is created and initialised in one transaction (no front-run window).

Token behaviours
- Fee-on-transfer, rebasing, lossy tokens: rejected by exact balance deltas (router, relayer, account, factory fee).
- No-return and false-return tokens: SafeERC20. Return-data bombs from tokens: SafeERC20 5.6.1 uses a 32-byte return buffer; `try IERC20Permit.permit` with no return values does not copy data.
- Fake `permit()` that always succeeds and phantom-permit tokens (WETH fallback) cannot create an allowance, the following transfer reverts (`test_phantomAndFakePermit_cannotBypassAllowance`). Front-run permit consumption does not block payments (try/catch).
- Pausable/blacklistable tokens: revert atomically; nothing strands; consequences in M-01/M-03/L-05.
- Router and relayer hold no balances after any flow (`test_routerHoldsNothing`, existing invariants); forced ETH or direct token donations are unrecoverable by design and do not affect accounting (`test_forcedEth_doesNotBreakAccounting`).
- Arithmetic: `gross * 25` overflow reverts; `fee < gross`, so `net >= 1`; `s.amount - s.fee` safe after `amount > fee`; `block.timestamp + 2*delay` fits uint64; `s.current += amount` bounded by `limit`.

Signatures and EIP-712
- Domain includes chain id and verifying contract; OZ 5.6.1 `EIP712` rebuilds the separator when chain id or address differs (clones have distinct separators). Verified cross-relayer replay, cross-chain replay (`vm.chainId`) and cross-clone replay all revert (`test_crossRelayerAndCrossChainReplayRejected`, `test_crossCloneReplayRejected`). Struct typehashes differ between relayer and account so a signature of one type is not valid as another.
- OZ `ECDSA.recover` rejects high-s and returns an error instead of `address(0)` (`test_highS_rejected`, `test_garbageSignature_neverRecoversZero`, implementation with `owner == 0` cannot be driven with a garbage signature). EIP-2098 64-byte signatures are rejected (length check), so one encoding per signature (`test_eip2098CompactSignatureRejected`).
- Nonce bitmap: `1 << (nonce & 0xff)` is typed uint256 (literal shift rule since 0.7); nonce `2^256-1` works once in relayer and account (`test_nonceMaxUint_works_once`, `test_nonceMaxUint_policy`); operator precedence of `word & bit != 0` is correct in Solidity (AND binds tighter than `!=`).
- Relayer fields signed: token, owner, destination, feeTo, amount, fee, deadline, nonce. Relayer submitter cannot change any; searcher copy only helps the relayer.

PolicyAccount specifics
- Timelock: `executeAfter = request time + delay`, destination change `2 x delay`; destination is never part of a signature and payouts only go to `destination` (fuzz `testFuzz_executorCannotDivertFunds`). Stolen-key redirect before 2x-delay impossible; owner can cancel.
- Initialisation: `initialized` set on the implementation in its constructor; `initialize` authenticated by recomputing the CREATE2 address from `msg.sender`; re-init, foreign-deployer init and wrong-arguments init all revert (`test_reinitAndForeignInitializeRejected`, `test_implementationLockedAndUnusable`). Rogue clones from other deployers have different addresses and different domain separators.
- CREATE2 squatting: salt = `keccak256(owner, keccak256(destination, delay, limitsRoot))`, so a different policy cannot land on the same address; same-policy redeploy reverts `AlreadyDeployed` before the fee is taken (`test_squatting_differentPolicyDifferentAddress`).
- Merkle second preimage: leaves are double-hashed `H(H(96 bytes))`, internal nodes `H(64 bytes)`; no leaf can equal an internal node (`testFuzz_leafIsNeverAnInternalNode`, 10k runs). OZ `MerkleProof` uses sorted pairs.
- Window accounting: current and previous bucket sum never exceeds the cap; bucket jump of more than one resets `previous`; `WindowMismatch` guards inconsistent windows; no overflow found.
- No upgrade path, no admin, no pause, no delegatecall in any in-scope contract (grep of sources). Implementation cannot be self-destructed (no opcode).
- ETH forced via selfdestruct: no balance-based logic anywhere.

Deployment
- Compiler pinned `0.8.28`, optimizer 200, `cancun`; OZ vendored 5.6.1; CI has no broadcast step; scripts contain no secrets.

## 4. Static and dynamic tool results (real output)

- `forge test` baseline (before my tests): 225 passed, 0 failed (10k-run fuzz, 256x50 invariants).
- `forge test --match-path "test/audit/*"`: 42 tests pass (12 Router, 10 Sweep, 20 Policy).
- Slither (`slither . --solc /home/user/tools/solc --filter-paths "lib|test|script"`): 24 results across 5 detectors; triage in section 5.
- Mythril 0.24.8 (installed into `/home/user/tools/venv` with pip) on the runtime bytecode of each contract, `--execution-timeout 240 -t 3`: Router 2 issues, SweepRelayer 1, PolicyAccount 2, all SWC-116 "Dependence on predictable environment variable" (Low) = the deadline/timelock comparisons. PolicyAccountFactory 2 issues: SWC-123 "requirement violation" (Medium, bytecode offset 87) is a nested call reverting when the caller has no fee-token allowance or balance (the fee `transferFrom`), i.e. expected behaviour (false positive); SWC-107 "state access after external call" (Low, offset 1441) is the `ReentrancyGuard` status write on exit of `deploy`, which is the lock itself (false positive). Mythril ran on runtime bytecode without source mapping and with a 240 s timeout per contract, so absence of further issues is weak evidence.
- Not run: Echidna (not installable via pip), Certora/Halmos/SMT formal verification, mutation testing, Anvil scenario/fork tests (all PoCs run in the Foundry in-memory EVM, not on a node), any live-network or live-token test (no network), any real USDC/USDT/stETH/WETH bytecode.

## 5. Slither triage (every result)

| # | Detector | Location (file:line) | Verdict |
|---|---|---|---|
| 1-2 | arbitrary-send-erc20 | `GhostPaySweepRelayer.sol:127,128` `safeTransferFrom(s.owner,...)` | False positive: `from` is authenticated by the owner's EIP-712 signature over all fields; nonce single-use. |
| 3 | incorrect-equality | `PolicyAccount.sol:337` `bucket == s.bucket + 1` | Intentional integer comparison on a monotonically increasing bucket index; no balance equality. `s.bucket + 1` overflow is unreachable (bucket < 2^64 only with window 1 and year > 5e11). |
| 4-12 | timestamp (9 sites) | Router `:99,:211`; Relayer `:83`; Policy `:143,:187,:232,:257,:269,:336` | Deadline and timelock comparisons are the product semantics; second-level validator drift is only relevant for tiny delays (see I-02). |
| 13-14 | low-level-calls | Router `:242`; Policy `:195` | Reviewed: result checked; see L-01 (return-data bomb). |
| 15-24 | naming-convention (10) | immutables `ANNOUNCER`, `FEE_RECIPIENT`, `_IMPLEMENTATION`, `IMPLEMENTATION`, `FEE_TOKEN`, `FLAT_FEE`; `DOMAIN_SEPARATOR` | Style only (SCREAMING_CASE immutables and ERC-2612 name are intentional). |

Slither did not flag reentrancy, uninitialised state, `tx.origin`, `delegatecall`, `selfdestruct` or unchecked-transfer issues in the scoped sources.

## 6. Playbook Section 3 contract checklist

| Item | Result |
|---|---|
| No unchecked arithmetic without proof; fee math safe, rounding documented | Pass (checked arithmetic; floor rounding documented; I-03) |
| Token return values handled; unsupported semantics rejected | Pass (SafeERC20 + exact deltas) |
| Reentrancy/callback at each external call | Pass (section 3); L-01 gas only |
| No hidden admin/rescue/pause/upgrade/fee-change/arbitrary-call/delegatecall | Pass (no rescue is a stated design trade-off, L-05, M-03) |
| Immutable configuration matches deployment manifest | Not verifiable: no manifests committed; L-06 recommends read-back checks |
| Signature domain includes chain, contract, nonce, deadline, calldata binding | Pass for relayer; PolicyAccount signs token/amount/deadline/nonce but not the limit proof (L-04) |
| Announcer ABI/metadata match EIP-5564 | Pass (view tag byte 0, existing ABI test); scheme-2 gap M-02 |
| No PII / stable invoice id emitted | Pass (`FeeCollected`, `AccountDeployed` omit payer/owner/policy) |
| Reverts atomic, no assets strand | Pass for payment paths; stranding scenarios M-03, L-05 |
| NatSpec | Present on all in-scope public items (not re-audited line by line; `scripts/check-natspec.sh` exists) |

## 7. Honest limitations

- This is a single reviewer's manual review plus Slither, Mythril and targeted tests. No formal verification, no Echidna, no differential test against production USDC/WETH/stETH/DAI bytecode.
- The relayer/paymaster service (`apps/relayer`) and any ERC-4337 paymaster are outside this contract review; L-03 lists what that service must enforce.
- Findings M-01, M-03 and L-06 depend on deployment choices (fee token, recipient, chain) that are not yet fixed in the repo.
- Gas figures come from Foundry's in-memory EVM with Cancun rules; they are indicative, not measurements on a live network.
