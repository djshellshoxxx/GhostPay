# Security audit: contracts (read-only, static)

- Repo: /home/user/ghostpay, branch claude/remote-extensions-1
- Scope: packages/contracts/src/{GhostPayRouter, GhostPaySweepRelayer, PolicyAccount, PolicyAccountFactory}.sol, their interfaces, and test/ names and structure. GhostPayPolicyRouter.sol excluded (in progress). Echidna files (untracked, being edited by others) not reviewed.
- Method: full manual read of in-scope source; read docs/SPEC_REVIEW.md, docs/CONTRACTS_SPEC.md, packages/contracts/DEVIATIONS.md, docs/audits/02-security-review-contracts.md. Checked OZ 5.6.1 EIP712/Clones/ReentrancyGuard in packages/contracts/lib.
- Not run: no forge build/test, no fuzzing, no Slither/Mythril, no network. Writes limited to this file (forge would write out/ and cache/).

## 1. Summary

| Severity | New (this audit) | Previously known (still open) |
|---|---|---|
| Critical | 0 | 0 |
| High | 0 | 0 |
| Medium | 1 (N-01) | 3 (M-01, M-02, M-03) |
| Low | 2 (N-02, N-03) | 4 open (L-02, L-03, L-05, L-06 partly) |
| Info | 4 (N-04..N-07) | I-01..I-08 |

No fund-theft, signature-replay, re-initialisation, timelock-bypass or reentrancy issue found in the in-scope code. Previously fixed items confirmed in code: L-01 (assembly native call, Router:241-249, PolicyAccount:203-209), L-04 (`limitLeafHash` signed and checked, PolicyAccount:157-161), I-02 (`MIN_DELAY` in factory, PolicyAccountFactory:33, :100).

## 2. New findings

### N-01 (Medium, privacy): policy commitment is unblinded and the deploy calldata discloses owner and destination
- Files: PolicyAccountFactory.sol:93 (`deploy(owner, destination, delay, limitsRoot)` takes plaintext arguments), :101 (salt), :143-149 (`policyHashOf` = plain `keccak256(abi.encode(destination, delaySeconds, limitsRoot))`); PolicyAccount.sol:115 and :123 (`initialize` repeats the plaintext arguments and recomputes the hash).
- Evidence: CONTRACTS_SPEC.md:65 states the policy hash "is part of the seller's scheme-2 meta-address (it does not reveal the destination)". The code does not meet that claim:
  1. Pre-deployment: `policyHash` is public in the meta-address and has no secret blinding term. For `limitsRoot == 0` (the default "no limits" case) the preimage space is `destination x delay`. Anyone who enumerates candidate destinations (for example all active EOAs or exchange deposit addresses) times a plausible delay set can test candidates offline with keccak and recover the destination linked to a given stealth account. This is analytic; not measured.
  2. At deployment: the `deploy` transaction input contains the owner (the stealth EOA) and the destination in plaintext, so the owner-to-destination link is public before any funds move. DEVIATIONS.md P12 only considers event privacy and misses calldata.
- Failing scenario: a payer publishes or pays a meta-address; an observer enumerates destinations and delays offline, learns the recipient's destination, and sees the link confirmed on-chain at `deploy`, even if the account is never withdrawn from.
- Fix (spec decision, not a code patch): add a secret blinding term to `policyHash` that the owner holds (for example `keccak256(destination, delay, limitsRoot, blind)`), and do not pass the destination to `deploy`; set it through a signed post-deploy step, or accept and document that destination is public at deployment. Until resolved, remove the "does not reveal the destination" sentence from CONTRACTS_SPEC.md:65 and add a P-item to DEVIATIONS.md.

### N-02 (Low): owner is never checked to be an EOA; a contract owner makes the account permanently unwithdrawable
- Files: PolicyAccountFactory.sol:98 (only zero check on owner), PolicyAccount.sol:119 (initialize, zero check only), :329-331 (`_checkOwner` uses `ECDSA.recover`, no ERC-1271).
- Evidence: any non-zero address is accepted as `owner`. Every state change needs an ECDSA signature from `owner`, and no ERC-1271 path exists. If `owner` is a contract (or has no private key), no withdraw, cancel or destination change can ever be authorised. Funds sent to the account are then frozen with no rescue.
- Failing scenario: a malformed or malicious meta-address supplies a contract address as `owner`; a payer sends funds to the derived account; they are never recoverable.
- Fix: require `owner.code.length == 0` in `deploy` (and in `initialize` for consistency), or document that owner must be an EOA and have clients enforce it. Note that this is a payer-side loss from a bad meta-address rather than a protocol-level exploit, so it is rated Low.

### N-03 (Low): `initialize` reverts `ZeroAddress` for `destination == address(this)`, which is misleading and not pre-checked by the factory
- Files: PolicyAccount.sol:119-120 (`destination_ == address(this)` reverts with `ZeroAddress`); PolicyAccountFactory.sol:98 (no equivalent check, so the revert surfaces from inside `initialize`).
- Evidence: the error name does not describe the condition. Because the factory does not pre-check, the failing address and reason are hidden behind the nested call.
- Failing scenario: a client mistakenly sets destination to the predicted account; `deploy` reverts with `ZeroAddress`, and the operator reads it as a missing argument.
- Fix: add a dedicated error (for example `InvalidDestination`, already declared for `proposeDestination` at PolicyAccount.sol:246-247) or reuse it here. Info-level in practice.

### N-04 (Info): withdrawal execution order among matured requests is caller-chosen and can delay other owner-signed requests
- Files: PolicyAccount.sol:190-196 (`executeWithdraw` is permissionless and `_consume` runs at execution), :342-360.
- Evidence: window budget is consumed in execution order. Anyone can execute matured requests in any order, so an observer can execute a large matured request first and push a smaller matured request into `WindowLimitExceeded` for up to two windows. Only delay is introduced; the owner's cap and destination are not affected. This follows from the documented P2 design and is consistent with I-06, so it is recorded here only as a clarification.
- Fix: none required; document that matured requests may execute in any order.

### N-05 (Info): build configuration points at a sandbox compiler path
- File: packages/contracts/foundry.toml:8 sets `solc = "/tmp/claude-0/tools/solc/solc"`. DEVIATIONS.md (Tooling) says the path is `/home/user/tools/solc`. The two documents disagree, and the compiler binary is not pinned by hash.
- Fix: CI must override with `solc_version = "0.8.28"` as stated in the comment on line 7. Make sure no release build inherits the local path. Dependency-integrity note.

### N-06 (Info): dependency pinning
- OZ 5.6.1 is vendored (lib/openzeppelin-contracts/package.json). I confirmed `EIP712` keeps name, version and cache in immutables (so clones get the correct domain), `Clones.predictDeterministicAddress` takes the deployer into account, and `ReentrancyGuard` accepts status 0 in clones. No hashes or checksums are recorded for the vendored tree.
- Fix: record the upstream commit or tarball hash of the vendored OZ and forge-std in DEVIATIONS.md.

### N-07 (Info): `payERC20WithPermit` accepts a hostile token that burns all gas inside `permit`
- File: GhostPayRouter.sol:102-104. This is the payer's own transaction. Relayer-side exposure is already L-03. Recorded for completeness only.

## 3. Previously known findings: status check against code

| ID | Status | Evidence |
|---|---|---|
| M-01 fee recipient single point of failure | Open (design) | GhostPayRouter.sol:57, :122, :185 |
| M-02 router announces scheme 1 only | Open (spec) | GhostPayRouter.sol:38 `SCHEME_ID = 1` |
| M-03 fee token freezes counterfactual accounts | Open | PolicyAccountFactory.sol:105-115 |
| L-01 return-data bomb | Fixed | GhostPayRouter.sol:245-247; PolicyAccount.sol:206-208 |
| L-02 announcement spoofing | Open (client) | GhostPayRouter.sol:216-236 |
| L-03 relayer gas/fee dodge | Open (service) | GhostPaySweepRelayer.sol:54-60, :80-115 |
| L-04 limit proof unsigned | Fixed | PolicyAccount.sol:157-161 and typehash line 54 |
| L-05 unrescuable tokens | Accepted | PolicyAccount.sol:206-220 |
| I-02 no minimum delay | Fixed in factory | PolicyAccountFactory.sol:33, :100 (account still allows 1 s by design) |

## 4. Verified safe (checked in code, no finding)

- Withdraw, CancelWithdraw, ProposeDestination and CancelDestination typehashes are distinct, and each `abi.encode` field order matches its type string (PolicyAccount.sol:53-66, :140-151, :230, :250, :283). A signature of one type cannot be replayed as another.
- Request ids are struct hashes that include the nonce, so duplicates need a nonce reuse, which `_useNonce` rejects (PolicyAccount.sol:149-153). Cancel signatures are bound to a unique id.
- Domain binds chain id and clone address through OZ EIP712's rebuild path (`_domainSeparatorV4`), so clone-to-clone and chain-to-chain replay fail.
- `initialize` authenticates by recomputing the CREATE2 address with `msg.sender` (PolicyAccount.sol:123-128). The factory salt and the account hash use the same encoding (factory :101 and :148; account :123-124).
- Timelock arithmetic: `executeAfter = now + delay` (:175) and destination change `now + 2*delay` (:256), with `pendingEffectiveAt` blocking overwrite (:249). No second path changes destination.
- Window math (PolicyAccount.sol:342-360): `previous` is kept only for an adjacent bucket, and `used > limit || amount > limit - used` cannot underflow.
- Relayer: nonce consumed before any transfer (:111-114); owner and destination fixed by signature; balance-delta checks cover owner, destination and feeTo (:139-143).
- Router: `nonReentrant` on all entry points; `_validate` rejects FEE_RECIPIENT, self and zero stealth (:212); `_pull` deltas (:196). A self-payment by the fee recipient or by the stealth address reverts closed.
- Native calls in the router and account forward all gas and check `ok`. No `tx.origin`, `delegatecall`, `selfdestruct` or unchecked blocks in scope (grep).
- No secrets, keys or logs in in-scope contracts. Events carry no owner in the factory (`AccountDeployed` only); account events carry destination and amount (known, P12).

## 5. Not verified

- No test was run. Test-suite claims (225 baseline, 42 audit tests) are from docs and were not reproduced.
- N-01 brute-force feasibility is analytic, not measured.
- Behaviour with real USDC, USDT, stETH or WETH bytecode, and with live announcers, was not checked.
- GhostPayPolicyRouter.sol and the Echidna harness were out of scope.
