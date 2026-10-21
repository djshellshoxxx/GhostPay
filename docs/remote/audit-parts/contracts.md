# Contracts security audit (independent re-review)

Scope: `packages/contracts/src/{GhostPayRouter,GhostPaySweepRelayer,PolicyAccount,PolicyAccountFactory,GhostPayPolicyRouter}.sol` + interfaces, at HEAD `3524033`.
Inputs read: `docs/CONTRACTS_SPEC.md`, `packages/contracts/DEVIATIONS.md`, `docs/audits/02-security-review-contracts.md`, `docs/audits/00-slither-triage.md`.
Method: full manual read; re-ran the prior audit suite (`forge test --match-path "test/audit/*"`: 43/43 pass, forge 1.8.5); new PoCs in
`/tmp/claude-0/audit-poc/test/AuditPoC.t.sol` (a scratch Foundry project symlinking the repo `src`, `lib`, `test`; run with
`cd /tmp/claude-0/audit-poc && FOUNDRY_OUT=/tmp/claude-0/out-audit-poc FOUNDRY_CACHE_PATH=/tmp/claude-0/cache-audit-poc /opt/tools/forge test`; 3/3 pass).
No repo source was modified.

Overall: no fund-theft, signature-replay, timelock-bypass or re-initialisation issue found. One new Medium privacy issue in the scheme-2 router (N-01).

## 1. Verification of prior findings (audit 02)

| ID | Prior sev. | Verdict | Evidence |
|---|---|---|---|
| M-01 fee recipient SPOF | Medium | CONFIRMED (open) | `GhostPayRouter.sol:122,185`; same in `GhostPayPolicyRouter.sol:151,216`. `Router.audit.t.sol::test_EXPLOIT_feeRecipientBlacklisted_*`, `..._RejectsNative_*` pass. Not mitigated in code; the new policy router inherits it. |
| M-02 router cannot announce 0x47500002 | Medium | FIXED-IN-CODE | New `GhostPayPolicyRouter.sol:46` `SCHEME_ID = 0x47500002`, used at `:105,:133,:157,:177`; scheme-1 router unchanged. (But see N-01: the fix introduces a privacy leak.) |
| M-03 fee token freezes counterfactual accounts | Medium | CONFIRMED (open) | `PolicyAccountFactory.sol:105-115` fee pull precedes `cloneDeterministic`; `PolicyAccount.sol:125` only that factory can initialise. `test_EXPLOIT_feeTokenBlacklistFreezesCounterfactualAccounts` passes. |
| L-01 return-data bomb | Low | FIXED-IN-CODE | Assembly `call(gas(),to,amount,0,0,0,0)` at `GhostPayRouter.sol:245-247`, `PolicyAccount.sol:206-208`, `GhostPayPolicyRouter.sol:293-295`. Bounded-gas regression tests pass (1 MB blob: 2.07M gas, ~= payee's own cost). |
| L-02 announcement spoofing | Low | CONFIRMED (inherent, client mitigation) | `_validate/_checkMetadata` only check length/prefix/marker/asset/net (`GhostPayRouter.sol:202-236`). Test passes. |
| L-03 sweep relayer gas/fee dodge | Low | CONFIRMED (service-level) | `GhostPaySweepRelayer.sol:54-58` unbounded-gas `permit` in try/catch; owner can move tokens after simulation. Tests pass. |
| L-04 limit proof not signed | Low | FIXED-IN-CODE | `WITHDRAW_TYPEHASH` includes `limitLeafHash` (`PolicyAccount.sol:53-55`), id commits to it (`:149-151`), leaf must equal it (`:161`). `test_duplicateLeafSubmitterCannotPickPermissiveLimit` passes. |
| L-05 assets that can never leave | Low | CONFIRMED (by design) | Strict deltas `PolicyAccount.sol:217-220`; no-leaf lock-in `:157-164`; no ERC-721/1155 hooks. Tests pass. |
| L-06 deploy-script gaps | Low | FIXED-IN-CODE (scripts) | `script/DeployBase.s.sol` (31337 opt-in `ALLOW_LOCAL`), `Deploy.s.sol:49-67` (custom announcer gate, codehash pin, `readCallers` broadcaster check), `DeployPolicy.s.sol:55` (`MAX_FLAT_FEE`). Live `--ledger` broadcast behaviour not verified. |
| I-01 key theft delayed, not prevented | Info | CONFIRMED | `PolicyAccount.sol:228-290`; unbounded propose/cancel race. |
| I-02 no minimum delay | Info | FIXED-IN-CODE (factory only) | `PolicyAccountFactory.sol:33,100` `MIN_DELAY = 1 hours`; `PolicyAccount.initialize` still accepts >= 1 s (foreign deployers only). |
| I-03 fee dodge by splitting < 400 units | Info | CONFIRMED | Floor rounding `GhostPayRouter.sol:216`, `GhostPayPolicyRouter.sol:262`. |
| I-04 2300-gas senders cannot fund clones | Info | CONFIRMED | Test passes. |
| I-05 no nonce invalidation; residual permit allowance | Info | CONFIRMED | No `invalidateNonce` in relayer/account; `test_residualAllowanceAfterPermitSweep` passes. Residual allowance usable only with a fresh owner sweep signature (verified by reading `_authorize`). |
| I-06 two-bucket lockout | Info | CONFIRMED; cap proof re-derived | `PolicyAccount.sol:342-360`. Any half-open interval of length W touches at most buckets b,b+1; the last spend in b+1 is checked against `sum(b)+sum(b+1)`, so the cap holds. Bucket gap > 1 zeroes `previous`; first use with `bucket==1` sets previous to 0 (current is 0). |
| I-07 self-transfer edge cases | Info | CONFIRMED (fail closed) | Tests pass. |
| I-08 fees bind only official contracts | Info | CONFIRMED | `initialize` CREATE2 re-derivation `PolicyAccount.sol:123-128`. |
| Slither triage (00) | - | CONFIRMED | Both suppressions are correct: `from` in `GhostPaySweepRelayer.sol:130,133` is the recovered signer; `PolicyAccount.sol:353` compares bucket indices. |

## 2. New findings

### N-01 Scheme-2 router publishes the seller-constant `policyHash`, linking every payment to the seller's meta-address
- Severity: **Medium** (privacy; recipient unlinkability is the core product property. Scheme 2 is marked experimental, ADR-0014, which limits current exposure.)
- Status: **CONFIRMED**
- Location: `packages/contracts/src/GhostPayPolicyRouter.sol:96,112,139,164` (`PolicyRef calldata policy` argument), `:236-242` (`_checkPolicyAccount`); `src/interfaces/IGhostPayPolicyRouter.sol:18` (`PolicyRef {owner; policyHash}`); spec claim `docs/CONTRACTS_SPEC.md:65` ("does not reveal the destination"); meta-address format `packages/policy-scheme/src/meta.ts:29` (`st:eth:gp2:0x<spend><view><policyHash>`).
- Evidence: every router payment must carry the real `policyHash` in plaintext calldata (any other value reverts `NotPolicyAccount`). `policyHash` is identical for all payments to one seller and is a field of the seller's public scheme-2 meta-address. So any observer who has seen the meta-address (it is handed to every payer) can attribute every scheme-2 payment to that seller in real time, before any deploy or withdrawal, and anyone can cluster all payments to one seller even without it. With `limitsRoot == 0`, `policyHash` also reveals the destination: for a candidate destination the delay is brute-forced over the factory's 1 h..30 d range (720 hashes at 1 h steps; the full range at 1 s steps is ~2.6M hashes, still trivial). The scheme-1 router has no such field. Not documented in DEVIATIONS R1-R9, audit 02 or 04.
  Separately (inherent, should be documented): `PolicyAccountFactory.deploy(owner, destination, delay, limitsRoot)` calldata (`PolicyAccountFactory.sol:93`) reveals the full policy pre-image, so the first deploy of any account de-anonymises the `policyHash`, and through it every account of that seller.
- PoC: `/tmp/claude-0/audit-poc/test/AuditPoC.t.sol::N01_PolicyHashLinkage.test_N01_policyHashPublishedAndLinksPayments` (two payments to two distinct accounts share the calldata word; a blinded value is rejected; destination+delay recovered by brute force).
- Fix: have the router take the per-payment `salt` (`keccak256(abi.encode(owner, policyHash))`, unique per payment because `owner` is) instead of `PolicyRef`, and check `stealth == Clones.predictDeterministicAddress(FACTORY.IMPLEMENTATION(), salt, address(FACTORY))` (or a new `FACTORY.predictAddressFromSalt(salt)`). This keeps the "is a clone slot of this factory" client-bug check and leaks nothing seller-constant. Update `packages/policy-scheme/src/router.ts` and the spec. Document the deploy-time leak, and correct the spec's "does not reveal the destination" (true only with a high-entropy `limitsRoot`).

### N-02 Pending withdrawal requests never expire and follow later destination changes
- Severity: Info (Low if users are expected to "forget" requests)
- Status: CONFIRMED
- Location: `PolicyAccount.sol:176-183` (no expiry field in `Request`), `:190-198` (anyone executes any `Pending` request at any later time to the current `destination`).
- Evidence: `w.deadline` bounds only submission. A request filed and never executed (or filed by a key thief with an amount above what the owner intends) stays executable indefinitely by anyone and pays whatever `destination` is current at execution, including one set years later. It is consistent with P3, but the owner must enumerate and cancel stale requests (via `WithdrawRequested` logs) before rotating to a destination they trust less, or after a suspected key leak.
- PoC: `/tmp/claude-0/audit-poc/test/AuditPoC.t.sol::N02_N03_Policy.test_N02_staleRequestExecutableForeverAfterDestinationChange`.
- Fix: optional `executeBefore` (for example `executeAfter + delay`, or a signed `executeDeadline` in `Withdraw`) after which the request is void; at least document it and have the client show pending requests before any destination change.

### N-03 `PolicyAccountFactory.deploy` can be front-run (gas griefing only)
- Severity: Info
- Status: CONFIRMED
- Location: `PolicyAccountFactory.sol:93-103`.
- Evidence: deploy is permissionless and deterministic. A front-runner with identical arguments pays the fee and creates the correct account. The victim's transaction reverts `AlreadyDeployed` before any fee is taken, so the victim only loses gas. Clients that treat the revert as fatal can mis-report.
- PoC: `/tmp/claude-0/audit-poc/test/AuditPoC.t.sol::N02_N03_Policy.test_N03_deployFrontRunGriefsVictimTx`.
- Fix: client treats `AlreadyDeployed(predicted)` (or `code.length != 0` before sending) as success. No contract change needed.

### N-04 Per-address limits can be doubled on chains where the native coin has an ERC-20 alias
- Severity: Info (chain-specific; no such chain is in `docs/MULTICHAIN_SPEC.md` today)
- Status: PLAUSIBLE (no PoC: requires chain-specific native-token precompiles)
- Location: `PolicyAccount.sol:157-171,342-345` (limits and windows keyed by token address).
- Evidence: on chains such as Celo, the native balance can also be moved through an ERC-20 contract (`GoldToken`). A policy that caps `address(0)` and also lists that ERC-20 has two independent windows over the same balance. The strict balance-delta check passes because `balanceOf` reports the native balance.
- Fix: per-chain client rule. Never put both the native sentinel and its ERC-20 alias in a limits tree; refuse the alias in `buildLimitsTree` for such chains.

### N-05 Scheme id and announcement shape single out policy-account payments
- Severity: Info (inherent)
- Status: CONFIRMED (by reading)
- Location: `GhostPayPolicyRouter.sol:46`; account events `IPolicyAccount.sol:68-89`.
- Evidence: the `0x47500002` topic and the fact that the stealth address is a factory clone shrink the anonymity set to scheme-2 users. Account events expose destination, token and amounts (as do the token transfers).
- Fix: document; no contract change.

## 3. Areas checked, nothing found
- Reentrancy: every state-changing entry point is `nonReentrant` (router x4, policy router x4, relayer x2, account x6, factory). The account sets `Executed` and books the window before paying. The unguarded `receive()` touches no state. In clones, `ReentrancyGuard`'s slot starts at 0, which OZ 5.6.1 accepts (only `ENTERED = 2` blocks).
- EIP-712: domains carry chainId and verifyingContract (the clone address; OZ rebuilds the separator when `address(this) != _cachedThis`). Typehashes are distinct across Withdraw, CancelWithdraw, ProposeDestination, CancelDestination and Sweep. Request and proposal ids are struct hashes containing a nonce, so ECDSA malleability cannot create a second id (and OZ rejects high-s and 64-byte signatures anyway). Cancels are bound to ids that can be pending only once.
- Nonce bitmap: `1 << (nonce & 0xff)` is uint256; precedence of `word & bit != 0` is correct; nonce is consumed only after a valid signature and before external calls.
- Permit: try/catch in both routers and the relayer. A front-run permit cannot block payment. The routers always pull from `msg.sender`, so a stolen or residual allowance is unusable by third parties. The relayer pulls from the signer only.
- Merkle: leaves are double-hashed 96-byte pre-images and nodes are 64 bytes, so no second pre-image. The leaf is computed on-chain and must equal the signed `limitLeafHash`.
- Factory/CREATE2: the salt binds owner and the full policy. `initialize` re-derives the address from `msg.sender`; clone creation and init happen in one transaction; the implementation is locked in its constructor.
- Rounding/overflow: `fee < gross`, so `net >= 1`; `gross*25` overflow reverts; `uint64` timestamp casts are bounded; `s.current += amount <= limit`.
- Token quirks: no-return and false-return tokens (SafeERC20); fee-on-transfer, rebasing and lossy tokens (exact deltas, fail closed); a no-code "token" reverts (OZ code-length check and `balanceOf` decode).
