# Round audit: packages/contracts/src + script + scripts

Branch claude/remote-extensions-1. Read-only audit; no source, test or config edited; nothing committed. Scope: GhostPayRouter, GhostPaySweepRelayer, PolicyAccount, PolicyAccountFactory, GhostPayPolicyRouter, interfaces, script/*.s.sol, scripts/*.sh. Solc 0.8.28, OZ 5.6.1 (lib/openzeppelin-contracts/package.json).

## 1. Counts

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 4 (C-01..C-04) |
| Low | 6 (C-05..C-10) |
| Info | 5 (I-01..I-05) |

No fund-theft, replay, re-initialisation, reentrancy or timelock-bypass defect found in the in-scope contracts. All Medium items are privacy/availability/design limits, three of them already known to the repo.

## 2. What was run

- `forge test` (all 23 suites, own out/cache dirs, FUZZ_RUNS=500, INVARIANT_RUNS=32): 377 passed, 0 failed.
- Slither 0.11.6 on src (`--filter-paths lib`, `--ignore-compile`): 21 results, only detectors `timestamp`, `assembly`, `naming-convention`. No reentrancy, arbitrary-send, unchecked-transfer or access-control finding.
- Scratch PoC project (symlinks to repo src/lib, copied PolicyBase, outside repo): 4 tests PASS (C-01 dictionary, C-02/C-03 unrevocable and non-expiring request, C-04 blacklist freeze, C-05 fee-on-transfer lock). Path: /tmp/claude-0/-home-user-ghostpay/4744cac5-02a8-54bc-995d-381350474572/scratchpad/poc/test/Poc.t.sol. Reproduce: copy that dir, `forge test --match-path test/Poc.t.sol -vv`.
- Not run: Echidna, mutation, fork tests against real tokens/announcer, EIP-7702 behaviour, coverage.

## 3. Threat model

Assets: (1) funds in stealth EOAs and PolicyAccount clones; (2) payer funds in flight inside a router call (router and relayer hold none by design); (3) fee stream to immutable FEE_RECIPIENT; (4) recipient privacy (owner/destination/policy unlinkability); (5) integrity of what a payer is told to pay (router, factory, policyHash).

Trust boundaries: payer EOA/wallet -> router -> {token, announcer, stealth}; relayer/any submitter -> SweepRelayer/PolicyAccount (permissionless, signature-gated); owner key (stealth EOA) -> PolicyAccount; deployer -> factory/router immutables; deploy scripts/env.

Adversaries and capability: (a) malicious payer (calldata fully attacker-chosen: metadata, ephemeral key, stealth, token); (b) hostile token (reentrancy hooks, fee-on-transfer, blocklist, return-data bomb, permit that burns gas); (c) hostile stealth/destination contract (reverting or gas-burning receiver); (d) mempool front-runner/relayer (can replay or reorder any public signature, cannot alter it); (e) holder of a copied owner key (thief) while honest owner still holds the same key; (f) chain observer (calldata, events, storage getters); (g) hostile or mistaken deployer/config (wrong token/announcer/factory, immutable); (h) malicious meta-address publisher (policyHash chosen to point to attacker destination; contract cannot see pre-image).

## 4. Findings

### C-01 Medium (privacy): policyHash is an unsalted commitment and a stable per-payee identifier; destination and owner are public at deploy and in storage
- Evidence: PolicyAccountFactory.sol:93 `deploy(owner, destination, delay, limitsRoot)` takes plaintext calldata; :143-149 `policyHashOf = keccak256(abi.encode(destination, delaySeconds, limitsRoot))`, no blinding term. GhostPayPolicyRouter.sol `PolicyRef{owner, policyHash}` is calldata of every payment (interface IGhostPayPolicyRouter.sol:18-21). PolicyAccount.sol public getters `owner`, `destination`, `delay`, `limitsRoot`, `policyHash` (:72-82). CONTRACTS_SPEC.md:65 claims the hash "does not reveal the destination".
- PoC (PASS): `test_B_policyHashDictionary`: with `limitsRoot==0` the observed hash is matched against a candidate destination x {1h,1d,7d,30d} list; 12000 keccak evaluations recovered the destination. Cost scales linearly with candidate list size (exchange deposit addresses, known EOAs).
- Impact: (i) offline destination recovery for the default no-limits policy; (ii) if the same policyHash is reused across a payee's stealth owners (as the meta-address design implies; unverified here, depends on scheme-2 derivation in packages/policy-scheme) every payment to that payee shares one visible value in router calldata, linking them without any key; (iii) deploy calldata publishes owner->destination before any withdrawal; (iv) `WithdrawExecuted` and `DestinationProposed` events publish destination again. Matches docs/remote/security-specs/review-policy.md F-02 and THREAT_MODEL D6 ("destination becomes public"), which is the sharper statement; CONTRACTS_SPEC.md:65 is still false.
- Fix: per-account random blinding in the commitment (`keccak256(destination, delay, limitsRoot, salt)` with salt known to owner), or accept and delete the spec claim and mark scheme 2 as not unlinkable. Do not market scheme 2 as private.

### C-02 Medium (design): pending withdrawals follow a later destination change; destination is not bound to the signed Withdraw
- Evidence: PolicyAccount.sol:54 WITHDRAW_TYPEHASH has no destination; :190-225 `executeWithdraw` reads current `destination` (`address to = destination`); :266-278 `executeDestinationChange` is permissionless. Existing test `PolicyAccount.t.sol:1011 test_attack_changeAppliesAfterTwiceDelay_pendingWithdrawalsFollowNewDestination` passes in the 377-test run and demonstrates it.
- Scenario: owner requests W (to D1). Thief with the copied key proposes D2; owner does not cancel within 2*delay; any account executes the change and W. This adds nothing to what the thief gets from the destination change itself (all future funds already follow D2), so impact is limited to ordering/intent; severity Medium only because review-policy.md F-03 rated it High and the spec does not state it.
- Fix: either bind destination in the signed request and revert on mismatch, or invalidate pending requests on `executeDestinationChange`; otherwise document in CONTRACTS_SPEC section 4.

### C-03 Low: a signed but unsubmitted Withdraw cannot be revoked; requests never expire; deadline is unbounded
- Evidence: PolicyAccount.sol:146 only checks `block.timestamp > w.deadline`; :228-235 `cancel` requires `Status.Pending` so it cannot touch an id that was never submitted; there is no nonce-invalidation function; `executeWithdraw` has no expiry (:190-196).
- PoC (PASS): `test_A_unrevocableSignedWithdraw_and_noExpiry`: Withdraw signed with `deadline = type(uint256).max`; `cancel` reverts `NotPending`; 10 years later any address submits it; executes 10 years after that to the then-current destination.
- Impact: bounded to funds going to `destination` (so low), but owner cannot retract intent after, e.g., a mistaken signature handed to a relayer; combined with C-02 the recipient is whatever destination is current at execution.
- Fix: add `invalidateNonce(nonce, sig)` or allow `cancel` on an unsubmitted id; cap `deadline - now` (for example 7 days) and give requests an `expiresAt`.

### C-04 Medium (availability, known as audit-02 M-03 / review-policy F-04): fee-token failure in `deploy` freezes funds already sent to the counterfactual account
- Evidence: PolicyAccountFactory.sol deploy pulls `FLAT_FEE` before `cloneDeterministic` (`safeTransferFrom(msg.sender, FEE_RECIPIENT, fee)`); GhostPayPolicyRouter.sol accepts undeployed `stealth` (`_checkPolicyAccount` only compares to `FACTORY.predictAddress`, :236) and sends native/ERC-20 there; FEE_TOKEN, FEE_RECIPIENT, FLAT_FEE are immutable (:36-42).
- PoC (PASS): `test_D_feeTokenBlacklist_freezesCounterfactualFunds`: 5 ETH sent to predicted address; fee recipient blacklisted on a USDC-style fee token; `deploy` reverts; address keeps 5 ETH with no code. Recovers only if the blocklist is lifted, token unpaused, or the fee token is replaced (not possible: immutable).
- Fix: allow deploy with fee skipped for the account owner after a grace period, or decouple fee from deploy (collect fee in router), or accept and publish operator runbook; scripts should refuse a `FEE_RECIPIENT` that is blocklistable on `FEE_TOKEN`.

### C-05 Low: tokens that violate exact-delta (fee-on-transfer, rebasing, transfer-blocking destination) are permanently locked in PolicyAccount; no rescue
- Evidence: PolicyAccount.sol executeWithdraw ERC-20 branch: exact `selfBefore`/`toBefore` deltas else `UnexpectedBalanceDelta`; no admin/rescue by design (header NatSpec).
- PoC (PASS): `test_C_feeOnTransferLocked` (deployed `FeeOnTransferToken` balance cannot be withdrawn: `UnexpectedBalanceDelta`). Anyone can also push such a token into any account (airdrop), harmless for others but unrecoverable.
- Fix: none without a rescue path; document; consider allowing the owner to withdraw the actual received delta with a flagged request.

### C-06 Low: factory constructor accepts a fee token with no code
- Evidence: PolicyAccountFactory.sol constructor reverts only on zero addresses/implementation without code; `FEE_TOKEN.code.length` is never checked. A wrong `FEE_TOKEN` makes every `deploy` revert and, being immutable, bricks the factory (and any router bound to it, which is also immutable). Script DeployPolicy.s.sol checks `feeToken.code.length` before broadcast, so only a hand deployment is exposed. Re-verified by code reading, not re-run (haiku BUG-C1 claimed a PoC).
- Fix: `if (flatFee_ != 0 && feeToken_.code.length == 0) revert ZeroAddress();` in the constructor.

### C-07 Low: owner can be a contract; destination can be the implementation/factory/token; funds irrecoverable
- Evidence: PolicyAccount.sol:115-121 `initialize` rejects only zero owner/destination and destination==address(this); factory deploy (:93-100) same. `_checkOwner` uses ECDSA only (no ERC-1271), so a contract owner can never sign. Destination equal to implementation, factory or a token strands funds (native sent to implementation `receive()` is accepted). Code-verified; haiku PoC not re-run. Note EIP-7702-delegated EOAs have code, so a `code.length==0` owner check would wrongly reject them (unverified).
- Fix: factory rejects `destination` in {IMPLEMENTATION, address(this), FEE_RECIPIENT}; owner validation stays in client (document).

### C-08 Low: stolen-key contest is symmetric; no priority for the honest owner
- Evidence: every action is signed by the same key (PolicyAccount.sol `_checkOwner`); `proposeDestination` blocks a second proposal while one is pending (:249); `cancel`/`cancelDestination` work for the thief too (:228-235, :281-290). The thief can cancel the owner's legitimate requests, squat `ProposalPending`, and re-propose after each cancel. Protection holds only if the honest owner (or a watcher with a pre-signed cancel) acts within 2*delay (factory floor 1 hour => 2 h). This is THREAT_MODEL D6; recorded because CONTRACTS_SPEC.md:63 ("a stolen stealth key cannot redirect funds") is overstated (review-policy F-01).
- Fix: spec wording; optionally a guardian-signed cancel path (changes the trust model).

### C-09 Low (script): DeployPolicyRouter does not require code-hash pins and validates the factory only by `IMPLEMENTATION()` having code
- Evidence: script/DeployPolicyRouter.s.sol `_factory()` pins `EXPECTED_POLICY_FACTORY_CODEHASH` only when set; any contract with a non-empty `IMPLEMENTATION()` is accepted and wired immutably into the router. `_announcer()` same for `EXPECTED_ANNOUNCER_CODEHASH` (canonical address is default; custom needs ALLOW_CUSTOM_ANNOUNCER=1, so that part is mitigated). FEE_RECIPIENT ETH-acceptance is warned, not tested (all three scripts). Re-confirms haiku bugs-policyrouter F4.
- Fix: make pins mandatory unless ALLOW_LOCAL; read `factory.IMPLEMENTATION().codehash` against an expected hash; static-call-send 1 wei check is impossible without broadcast, so keep as runbook step.

### C-10 Low (dependency/build hygiene): checked-in foundry.toml points at a sandbox solc path
- Evidence: `git ls-files packages/contracts/foundry.toml` is tracked and committed (last commit 307d7fe) with `solc = "/tmp/claude-0/tools/solc/solc"` (line 8). CI/release/nightly rewrite it with `sed` (ci.yml:42,101; release.yml:59; nightly.yml:38). Any build outside those jobs fails or, worse, uses an unpinned local compiler. The vendored OZ and forge-std trees (git-tracked, 228 OZ files) record no upstream hash (OZ commit visible via `git -C lib/openzeppelin-contracts log`: 09f3548548d8384ada0f36fe00acefd5b623a97f; pin it in DEVIATIONS.md).
- Fix: commit `solc_version = "0.8.28"` and keep the local path in an untracked `foundry.local.toml`/env override.

### Info
- I-01 Router metadata/announcement spoof: ephemeral key is format-checked only (GhostPayRouter.sol:216-223), view tag free, announcer callable by anyone (audit-02 L-02, THREAT_MODEL 151/164). Accepted; client must verify.
- I-02 `payERC20WithPermit` swallows permit failures via try/catch (GhostPayRouter.sol:102-104; PolicyRouter ~125-131; Relayer :50-57). Safe because transfer reverts without allowance; a hostile token burning all gas in `permit` only costs the payer/relayer (audit-02 L-03).
- I-03 Timestamp comparisons (slither `timestamp`) are deadlines/timelocks of 1h+ granularity; no manipulation risk beyond seconds.
- I-04 `fee = gross*25/10000` floors to zero below 400 base units (fee-free dust); `gross > max/25` panics (checked arithmetic). Documented.
- I-05 Executing matured requests in any order can consume the window budget first-come (PolicyAccount `_consume`, :342-360); delay-only effect, funds still go to destination.

## 5. Verified safe (code-checked, with evidence)

- Auth/replay (Relayer): EIP-712 digest binds token, owner, destination, feeTo, amount, fee, deadline, nonce plus chainid and verifyingContract (GhostPaySweepRelayer.sol:84-108); OZ `ECDSA.recover` (rejects high-s, zero address); nonce bitmap consumed before any external call (:109-114). `1 << (n & 0xff)` is uint256 (Solidity >=0.7 literal-shift rule); boundary nonces tested in the suite. Permit is outside the signature but only the owner's own valid permit can create allowance.
- Auth/replay (PolicyAccount): four typehashes distinct and field order matches type strings (PolicyAccount.sol:53-66, :143-146, :250); domain rebuilt per clone because `_cachedThis != address(this)` (OZ EIP712), covering clone-to-clone and chain-to-chain replay; `initialize` authenticates by recomputing CREATE2 with `msg.sender` (:115-130) and the salt formula equals the factory's (factory `keccak256(abi.encode(owner, policyHashOf(...)))`); implementation locks itself (`initialized = true` in constructor).
- Reentrancy: every state-changing entry point of all five contracts is `nonReentrant`; `initialize` is single-use; native sends use assembly `call` with zero return-data copy (return-data bomb mitigated: GhostPayRouter.sol:241-249, PolicyAccount.sol:206-208); `Executed` is set before payout (:197) and `_consume` reverts roll back.
- Merkle limits: double-hashed leaves block second-preimage; signed `limitLeafHash` must equal the leaf recomputed from the supplied limit (L-04 fix present, :157-161); `used > limit || amount > limit - used` cannot underflow; two-bucket guarantee holds for any interval of length W.
- Router: stealth != 0/this/FEE_RECIPIENT (:211-214), metadata 57-byte layout checked before slicing, exact balance deltas for stealth and fee recipient, no state, no owner, no delegatecall. PolicyRouter: `_checkPolicyAccount` now runs first in all four entry points (GhostPayPolicyRouter.sol:103,120,145,172), so haiku bugs-policyrouter F1 (buffer checks before policy binding) is STALE/refuted in this tree.
- Scripts: `DeployBase._parseChainId` is strict decimal; testnet/ALLOWED_CHAIN_IDS allowlist; FEE_RECIPIENT != broadcaster re-checked via `vm.readCallers`; FLAT_FEE bounded by required MAX_FLAT_FEE; every immutable read back. `scripts/pre-deploy-check.sh`: no private key read; environment values reach `cast` only as quoted arguments (no `eval`); `scripts/check-natspec.sh` runs `python3 -I` on forge JSON only.
- Key/secret handling: no key, mnemonic or RPC secret in src or scripts; RPC_URL is masked in the printed config.

## 6. Cross-check of earlier reports (docs/remote/audits, security-specs)

| Claim | Status |
|---|---|
| security-contracts N-01 (unblinded policyHash, plaintext deploy) | CONFIRMED + PoC (C-01) |
| security-contracts N-02 / bugs-contracts BUG-C2 (contract owner, bad destination) | CONFIRMED by code (C-07), PoC not re-run |
| security-contracts N-03 (ZeroAddress for destination==this) | CONFIRMED PolicyAccount.sol:119-121, cosmetic |
| security-contracts N-05 (sandbox solc path) | CONFIRMED and tracked in git (C-10) |
| bugs-contracts BUG-C1 (no code check on fee token) | CONFIRMED by code (C-06) |
| bugs-policyrouter F1 (buffer checks precede policy check) | REFUTED for current tree |
| bugs-policyrouter F4 (no codehash pin by default) | CONFIRMED (C-09) |
| review-policy F-03 (pending withdrawals follow destination) | CONFIRMED, test exists (C-02) |
| review-policy F-02, F-04 | CONFIRMED (C-01, C-04) |
| review-contracts F22 | CONFIRMED (C-06) |
| bugs-policyscheme F1 (TS builder trusts limit values) | Out of scope (TypeScript), not checked |

## 7. Not verified

- Behaviour against real USDC/USDT/stETH/DAI, the canonical announcer, and EIP-7702 delegated owners.
- Whether the scheme-2 derivation reuses one policyHash across a payee's stealth accounts (C-01 ii): requires reading packages/policy-scheme, out of scope.
- Echidna/mutation results (docs/remote/mutation-results-local.md) not re-run; fuzz run counts reduced to 500/32 in my run.
