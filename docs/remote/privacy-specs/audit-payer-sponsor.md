# Self security review: payer-sponsor (TypeScript) and payer-hiding-contracts

Date 2026-10-21. Scope: `packages/payer-sponsor`, `packages/payer-hiding-contracts` (`GhostPayPayRelay`, `GhostPayPayerDelegate`, `GhostPayPayerAccount`, `GhostPayPayerAccountFactory`, `GhostPayVerifyingPaymaster`, `ChainGuard`, `RouterCall`, deploy script). Spec: [`payer-hiding.md`](payer-hiding.md). Wiring: [`wiring/payer-sponsor.md`](wiring/payer-sponsor.md).

**This is an AI-assisted self review, not an independent audit.** The contracts are unaudited, undeployed and testnet-only. The brief asked for an adversarial review by a separate Opus worker; **no sub-agent tool was available in this run, so none was spawned and none of the findings below comes from a second reviewer.** The adversarial pass was done by the author of the code (same model family) and is therefore weaker than independent review. An EIP-7702 delegate or a smart account that is wrong can mean total loss of the payer's assets (EIP-7702 security considerations); treat the code accordingly.

Evidence tags: **[RAN]** executed here; **[P]** primary source read; **[U]** unverified.

## 1. What was run

| Check | Command (from the package) | Result |
|---|---|---|
| Foundry build | `FOUNDRY_SOLC=/home/user/tools/solc forge build` (solc 0.8.28, `evm_version = "prague"`, `deny = "warnings"`) | success, zero compiler and zero `forge lint` warnings **[RAN]** |
| Prague support in solc 0.8.28 | `solc --evm-version prague`; `forge build` with `FOUNDRY_EVM_VERSION=cancun` vs `prague`, runtime bytecode hashes of four contracts compared | accepted; identical bytecode **[RAN]** |
| Foundry tests | `forge test` (10 000 fuzz runs, invariants 256 x 50) | 99 passed, 0 failed (section 1.1) **[RAN]** |
| Format, NatSpec | `forge fmt --check`, `bash scripts/check-natspec.sh` | clean; 5 contracts OK **[RAN]** |
| Slither 0.11.6 | `slither . --ignore-compile --filter-paths "test\|script\|\.vendor" --exclude-dependencies --fail-medium --exclude-informational --exclude-low` after `forge build --build-info --skip "test/**" --skip "script/**"` | 0 results at the CI gate (the command of `contracts-slither`); 16 low/informational results with all 102 detectors, triaged in section 4. Tool limitation: it cannot build IR for OpenZeppelin `ReentrancyGuardTransient` functions (`'NoneType' object has no attribute 'parameters'`), so the delegate's guard internals are not analysed **[RAN]** |
| Echidna 2.3.1 | `echidna test/echidna/EchidnaRelay.sol --contract EchidnaRelay --config echidna.yaml --test-limit 150000` | 150 061 calls; `relay_never_holds_tokens`, `no_tampered_or_replayed_success`, `conservation`, `no_residual_allowance` passing; `canary_pay_reachable` failed as designed (proves the success path is reached) **[RAN]**. Relay only; no harness for delegate, account, paymaster |
| Hand-made mutants | 7 single-line mutations (relay: nonce never consumed, sponsor fee transfer skipped, router-calldata check removed; delegate: signer check inverted, nonce never stored, sponsor fee sent to a fixed address, allowance check removed) | all killed by the unit tests and/or invariants **[RAN]**; not a systematic mutation run (no gambit) |
| Cross-language vectors | `GoldenVectors.t.sol` recomputes `ph-vectors.json` with the real relay, delegate, paymaster and EntryPoint v0.7; `vectors.test.ts` asserts the same file from TypeScript | agree: relay and delegate EIP-712 digests, router calldata, `executeBatch` calldata, `initCode`, `getUserOpHash`, paymaster signed hash **[RAN]** |
| TypeScript | `npm run typecheck`, `npm run lint`, `npm test` in `packages/payer-sponsor` | clean; see 1.1 **[RAN]** |
| Anvil e2e | `REQUIRE_ANVIL=1 npx vitest run src/e2e.anvil.test.ts` (anvil 1.8.5, real contracts, real type-4 transaction, real EntryPoint v0.7) | 4 tests pass: PH-2, PH-3 (including clearing authorization), PH-3 stale-authorization grief, PH-4 **[RAN]** |
| Deploy script | `forge script script/DeployPayerHiding.s.sol` against a local anvil with an EntryPoint, no `--broadcast` | simulation completes; a wrong `EXPECTED_ENTRY_POINT_CODEHASH` reverts with `EntryPointCodehashMismatch` **[RAN]**; nothing broadcast anywhere else |

### 1.1 Counts (final run)

Last full runs **[RAN]**, 2026-10-21:

- Foundry (`packages/payer-hiding-contracts`, default profile, 10 000 fuzz runs, invariants 256 runs x depth 50): **99 tests passed in 6 suites, 0 failed** (relay 40 incl. 3 fuzz, delegate 28 incl. 2 fuzz, ERC-4337 23 incl. 2 fuzz, golden vectors 6, relay invariants 5 properties, delegate invariants 6 properties). `forge snapshot` regenerated `.gas-snapshot`.
- TypeScript (`packages/payer-sponsor`): **129 tests in 13 files passed** (including the 4 anvil e2e tests); coverage statements 99.23 %, branches 98.23 %, functions 100 %, lines 99.38 % (thresholds 95/90/95/95 unchanged). `tsc --noEmit` and ESLint clean.

## 2. Contract bar (CONTRACTS bar of the brief)

| Requirement | Status |
|---|---|
| Immutable, no owner/pause/upgrade/`delegatecall` | Relay, delegate, account, factory: none. Paymaster: one immutable `SPONSOR_ADMIN` (deposit/stake only; cannot move user funds, cannot change the signer). Documented in the contract and README. |
| Constructor refuses non-testnet chain ids | `ChainGuard` in all five constructors; tested for 31337, 11155111, 84532 and 1, 10, 8453, 42161 **[RAN]**. Deployed runtime code carries no gating. |
| NatSpec complete | `check-natspec.sh` OK **[RAN]** |
| Unit + fuzz + invariant tests | yes (counts in section 1.1); relay and delegate have invariant suites; account/paymaster/factory have unit and fuzz tests against the real EntryPoint |
| `forge fmt`, zero build warnings | yes **[RAN]** |
| Slither clean or triaged | clean at the CI gate; rest triaged (section 4) |
| Echidna harness | written and run for the relay; none for the rest (stated above) |

## 3. Findings

Severity is for a testnet proof of concept and assumes the code were ever used with real value unless stated. Status: **fixed**, **mitigated**, **accepted** (by design, documented), **open**.

### C-01 (Medium, TypeScript sponsor, PH-3): a stale EIP-7702 authorization makes the sponsored transaction a no-op that still costs the sponsor gas. Status: **mitigated**

Evidence: EIP-7702 skips authorization tuples whose nonce no longer equals the signer's account nonce and still executes the transaction **[P: EIP-7702 text]**. If the payer's nonce moved (or the tuple names a wrong nonce), the delegate code is not installed, the call to the code-less EOA succeeds and does nothing, `eth_estimateGas` succeeds, and the sponsor pays for a transaction that neither pays the fee nor transfers tokens. The e2e test `PH-3 grief` reproduces it on anvil: the type-4 transaction succeeds, the payer's balance is unchanged, the payer is not delegated **[RAN]**.
Remediation implemented: `SponsorService.execute` requires an ERC-20 `Transfer(_, sponsorFeeTo, >= fee)` log from the signed token in the receipt; otherwise it charges the loss budget to the client bucket and treats the result as a mined revert (neutral for the breaker). The same check covers PH-4, where a failed inner execution still burns the paymaster deposit without paying the fee (seven log-shape variants are unit tested).
Residual: the first wasted transaction per attempt is unavoidable (the stale state appears between simulation and inclusion); damage is bounded by the loss budget and the per-client rate limit. Not fixable on chain.

### C-02 (Medium as a user-facing risk, design): the router is chosen by the signed order, not pinned by the contract. Status: **accepted**

`GhostPayPayRelay` and `GhostPayPayerDelegate` call whatever `router` address the payer signed (restricted to the two `payERC20` selectors and to calldata that repeats the signed token, stealth and gross). A phishing page that obtains the payer's EIP-712 signature for a hostile "router" lets that contract take exactly `gross` (never more, approval is cleared) to itself. Evidence: `test_hostileRouterCanTakeExactlyGrossAndNoMore` **[RAN]**. The impact equals signing a token transfer to an attacker, because the stealth address is signed data too, so pinning routers in the contract would add little; it would block non-GhostPay "routers" but not a wrong stealth address.
Remediation: the wallet UI must show the router against the verified manifest and the decoded call before signing (wiring doc, sections 2 and 3); the sponsor refuses routers outside its allowlist (`BAD_REQUEST`, tested). A v2 could take immutable router addresses at construction.

### C-03 (Low, griefing): a payer can invalidate a signed order before inclusion; anyone can submit it first. Status: **accepted**

Payer spends or revokes the allowance (or consumes the permit nonce when a permit was needed) after the sponsor's simulation: the sponsor's transaction reverts and the gas is lost. Evidence: `test_payerCanInvalidateOrderBeforeInclusion`. A front-runner can submit the same order: the fee still goes to the signed `sponsorFeeTo`, and the sponsor's own transaction reverts with `NonceUsed`: `test_frontRunnerSubmittingTheOrderStillPaysTheSponsor` **[RAN]**.
Mitigation: loss budget, per-client bucket, breaker (revert classified as neutral), quote single use. A private submission endpoint would help (spec `MH-REL-1`, not built).

### C-04 (Low): tokens sent to the relay are unrecoverable. Status: **accepted**

The relay has no sweep function by design (no owner). Accounting is by balance delta so a donation cannot block payments (`test_donationDoesNotBlockPayments`, invariant `relayHoldsOnlyDonations`) **[RAN]**.

### C-05 (Low/Info): an EOA already carrying EIP-7702 delegation code cannot be a PH-2 payer. Status: **accepted**

OpenZeppelin `SignatureChecker.isValidSignatureNow` branches on `signer.code.length`: for a delegated EOA it calls ERC-1271 on the delegate, which has no `isValidSignature`. `test_delegatedEoaCannotBeAPh2Payer` reverts with `BadSignature` **[RAN]**. Fresh one-shot payers do not hit this. The account contract (PH-4) is likewise not an ERC-1271 signer.

### C-06 (Info): persistent fingerprints and delegation. Status: **accepted (spec N4, Q6)**

The delegate leaves `0xef0100 || delegate` on the payer address; relay, factory, account code and the paymaster are public labels. A clearing authorization (`address = 0x0`) exists (`buildClearingAuthorization`, e2e verified that the code is removed **[RAN]**); nonces persist across re-delegation (`test_clearDelegation_thenOldIntentIsDead`).

### C-07 (Info): paymaster trust. Status: **accepted**

A stolen verifying-signer key can spend the paymaster deposit on gas (per-operation caps are enforced only by the sponsor service, `maxOpCostWei`, not by the contract; the signed gas fields bound each operation). A lost `SPONSOR_ADMIN` key strands the deposit. Testnet only; documented as the single privileged role.

### C-08 (Info): `ChainGuard._chainId()` is `internal virtual` in production bytecode. Status: **accepted**

Used only by the Echidna harness subclass (Echidna's EVM reports chain id 1). It cannot be called externally; a subclass that overrides it is a different contract.

### C-09 (Medium, unverified): behaviour on a public bundler and on public RPCs. Status: **open**

Nothing ran against a real bundler or a public RPC. `validatePaymasterUserOp` reads only immutables, `block.chainid` and calldata; whether ERC-7562 validation rules, paymaster staking and reputation accept it, and whether public Sepolia / Base Sepolia RPCs accept `eth_estimateGas` / `eth_call` with `authorizationList`, is **[U]**. EntryPoint v0.8 is not supported (different `getUserOpHash`).

### C-10 (Medium, process): unaudited custody-adjacent code. Status: **open**

No independent review, no formal verification, no systematic mutation testing, no contract line-coverage figure (`forge coverage` aborts in this layout, see `DEVIATIONS.md`). Do not use with real funds.

### C-11 (Low, TypeScript): sponsor state is in process memory and quote table can be crowded. Status: **mitigated**

Quotes, limiter, breaker and loss budget are per process (restart resets budgets). A single client bucket is capped at 5 open quotes (`maxQuotesPerBucket`) and the table at `maxQuotes`; many buckets (IPv6 rotation beyond /64, many IPv4) can still crowd it for one TTL. Use a shared store for more than one instance.

### C-12 (Info, TypeScript): key handling. Status: **accepted**

`derivePayerKey` returns a `SecretBox`; the transient hex string used to compute the address and viem's internal copies cannot be wiped from the JS heap (best effort, as `secret-box` documents). The paymaster signer reads the key inside `use()` per signature; the tx-sending hot key lives in the operator's viem wallet client.

### Checks that produced no finding

- Replay: nonce bitmap consumed before any state-changing external call (relay, delegate); invariants and mutants cover it. Cross-contract and cross-chain replay: EIP-712 domains differ by name, chain id and verifying contract (relay: relay address; delegate: payer address); tested with other chain, other relay and other payer.
- Delegate called directly on the implementation cannot move funds (no key for `address(this)`); no `execute`, `initialize`, `delegatecall`, fallback; unknown selectors revert **[RAN]**.
- Reentrancy: hook token and hostile router cannot re-enter `pay` (relay `ReentrancyGuard`, delegate transient guard) **[RAN]**.
- Router calldata: selector allowlist, token/stealth/gross equality, dirty-address-bit rejection, short calldata, policy-router layout (`gross` at head word 4) **[RAN]**.
- Return-data bomb from the router: the low-level call copies no return data.
- Storage collision of the delegate with other delegates: ERC-7201 namespace recomputed independently in a test; classic slots 0-3 stay zero; reentrancy lock is transient **[RAN]**.
- Account/paymaster: only the EntryPoint can call `validateUserOp`, `executeBatch`, `validatePaymasterUserOp`; high-s signatures rejected by OZ `ECDSA`; paymaster signature binds sender, nonce, `initCode`, `callData`, gas limits, fees, paymaster gas limits, chain id, paymaster address and the validity window (fuzzed); `validUntil == 0` refused **[RAN]**.
- EIP-7702 security text: delegate binds replay protection (nonce), target (router) and calldata (hash) but not `gas` or `value` (no native value is ever sent; a low gas limit only fails the sponsor's own transaction); no initializer to front-run; authorization chain id is never 0 in `buildDelegatePayIntent` / `buildClearingAuthorization` **[P: EIP-7702 text, RAN: tests]**.

## 4. Slither triage (all 102 detectors, `--exclude-dependencies`)

| Result | Where | Verdict |
|---|---|---|
| `calls-loop` (Low) | `GhostPayPayerAccount.executeBatch` | by design: a batch executor; every call is owner-signed through `userOpHash`; any failing call reverts the batch |
| `assembly`, `low-level-calls` (Info) | account prefund `call`, `_callRouter` | by design; return data not copied; targets bound by signatures |
| `unused-return` (Medium) on `ECDSA.tryRecover` third value | account, paymaster, delegate | false positive; inline `slither-disable-next-line unused-return` with reason |
| `pragma` (6 versions), `naming-convention` (immutables in SCREAMING_CASE, `DOMAIN_SEPARATOR`), `too-many-digits`, `dead-code` for `_chainId`, `unused-state` for `PM_GAS_OFFSET` (it is used in a slice) | various | false positives or style (repository convention uses upper-case immutables) |
| `unimplemented-functions` (Info) on relay and delegate | | false positive: the contracts compile (solc would reject an abstract contract), and every function is exercised by tests |
| `timestamp` (Low) | `GhostPayRouter` (imported, not edited) | out of scope; relay and delegate deadline checks carry a `forge-lint` justification |

## 5. Unverified (consolidated)

1. Any public-testnet behaviour (Sepolia, Base Sepolia): EIP-7702 availability was read from the go-ethereum chain spec (`pragueTime 1741159776`) and the OP Stack Isthmus spec / superchain config (`isthmus_time 1744905600`); Base Sepolia-specific activation and RPC support not checked; no transaction sent.
2. Real ERC-4337 bundler, ERC-7562 rules, paymaster staking, ERC-7677 (not implemented).
3. `eth_estimateGas` / `eth_call` with `authorizationList` on public RPCs (works on anvil 1.8.5).
4. ERC-2612 tokens other than the repository mock; DAI-style permit is unsupported.
5. Contract line coverage (tool aborts); Echidna beyond the relay; systematic mutation testing.
6. Gas numbers are Foundry-EVM numbers.
7. Fee model, price source, gas-unit constants: placeholders; pricing is an owner decision (spec Q4). Legal questions are deferred by the owner (spec Q7) and not analysed here.
8. Licensing: the EntryPoint test source has `GPL-3.0` file headers (npm metadata says MIT); it is fetched for tests only and never committed or imported by production code. **OWNER DECISION** (see `docs/remote/third-party-additions.md`).

## 6. Recommended next steps

Independent review of the three custody-relevant contracts (delegate, account, relay) before any non-testnet discussion; a Base Sepolia / Sepolia smoke run of PH-3 with a throw-away key; a shared store for the sponsor; router pinning (C-02) and a private submission path (C-03) as v2 items; an Echidna harness for the account and paymaster using the real EntryPoint.

## 7. Independent AI review (opus)

Date 2026-10-21. **This is a second AI review (a separate Opus worker, adversarial brief), not a professional audit.** Scope: `packages/payer-hiding-contracts/src` only (TypeScript sponsor not re-reviewed). Same model family as the author, so correlated blind spots are possible.

Method: line-by-line read of all seven sources against EIP-712, EIP-7702, ERC-4337 v0.7 and OpenZeppelin 5.6.1 (`SignatureChecker`, `ECDSA`, `EIP712`, `SafeERC20`, `ReentrancyGuardTransient`); recomputed the ERC-7201 slot (`cast`, matches `0x9d70...6200`) **[RAN]**; checked the router ABI head layouts used by `RouterCall` (plain: gross at word 2; policy: `PolicyRef{address,bytes32}` is static and inlined, gross at word 4) **[P]**. PoCs: `test/IndependentReview.t.sol`, 4 tests, all pass; full suite 103/103 with `FOUNDRY_PROFILE=dev`; `forge fmt --check` clean **[RAN]**. No source file was changed.

### Findings

**IR-01 (Low): no on-chain order cancellation; "soft cancels" are silently revived.** Neither relay nor delegate exposes a nonce-invalidation function (DEVIATIONS item 6). A payer who wants to withdraw a signed, unexpired order can only revoke the relay allowance (PH-2) or clear the 7702 delegation / move funds (PH-3). Both are reversible side effects, not cancellations: a later re-approval or re-delegation (e.g. for the next payment) makes the old order executable by anyone until its deadline. PoCs: `test_IR01_relay_revokedOrderRevivesAfterReApproval`, `test_IR01_delegate_clearedOrderRevivesAfterReDelegation` **[RAN]**. Funds go only where the payer signed, so impact is "payment the payer believed cancelled". Recommendation: keep order deadlines short (the sponsor already does); document that cancellation = wait for deadline; optionally add `invalidateNonces(word, mask)` callable by the payer (relay: `msg.sender == payer`; delegate: `msg.sender == address(this)` or a signed cancel). Not fixed: changes the audited surface and golden vectors.

**IR-02 (Info): the delegate overwrites the payer's existing allowance to the router.** `_execute` does `forceApprove(router, gross)` and requires the allowance to be zero afterwards, so a standing payer -> router approval is wiped. Harmless for fresh one-shot payers; surprising for a reused EOA. PoC: `test_IR02_delegate_wipesPreexistingRouterAllowance` **[RAN]**. Document it.

**IR-03 (Info): a delegated payer EOA cannot receive ERC-721/1155 safe transfers** and fails every ERC-1271 check (extends C-05 to Permit2, Seaport etc.): the delegate has code but no `onERC721Received`/`onERC1155Received`/`isValidSignature`. PoC: `test_IR03_delegatedPayerRejectsSafeNftTransfer` **[RAN]**. Further reason to clear delegation after use.

**IR-04 (Info, upgrade hazard): delegate replay protection depends on the storage namespace staying fixed.** The EIP-712 domain of the delegate is `("GhostPayPayerDelegate", "1", chainId, payer)` and does not include the implementation address. A future delegate that reuses name, version and type hash but a different ERC-7201 namespace would see every previously used nonce as fresh and accept all old signatures again. Any v2 must change the EIP-712 `version` (or the type hash) whenever it changes `STORAGE_NAMESPACE`. Redeploying the identical code at another address is safe (same namespace).

### Hunted, nothing found

- Signature replay: cross-chain (chain id in both domains; paymaster hash includes `block.chainid`), cross-contract (relay domain = relay address; delegate domain = payer address; distinct type hashes and names), cross-payer (`payer` in the relay struct), nonce (checked before and set before any external call; reverted calls roll back). Signature malleability is irrelevant because nonces, not signatures, are consumed; OZ rejects high-s anyway.
- OZ `EIP712` under delegation: `_cachedThis` is the implementation, so the domain is rebuilt with `address(this) = payer`; name/version are short strings, so the `_nameFallback`/`_versionFallback` storage slots are never read from the payer's storage.
- Permit: unsigned `PermitSig` cannot widen anything (allowance still needed, `value >= total`); front-run permits and "phantom permit" tokens (fallback that accepts `permit`) only fall through to `transferFrom`. Residual relay allowance (when `value > total`) is usable only with a further payer signature.
- Delegate takeover: no initializer, `execute`, `delegatecall` or fallback; direct calls on the implementation need a signature by a contract address. Prior delegates can at most set nonce bits in the namespace (self-DoS by the key holder).
- Router abuse: router == token / payer / no-op contract is caught by `ResidualAllowance`; a router cannot take more than `gross` (exact deltas, allowance zero check); reentrancy blocked in relay (`ReentrancyGuard`) and delegate (transient lock per payer; another payer's `pay` still needs that payer's signature).
- Token edge cases: fee-on-transfer, rebasing, refunding routers, `stealth == payer` all revert via exact deltas; USDT-style approve handled by `forceApprove`; infinite-allowance tokens with `gross == max` only revert (DoS by the payer's own choice).
- Paymaster: exact `paymasterAndData` length; hash binds every op field except the account signature, the paymaster gas limits, chain id, paymaster address and window; `validUntil == 0` refused; empty context so `postOp` is never called (no postOp drain). Remaining drain vector is the known C-01/C-07 one (failed inner execution, stolen signer key).
- Account/factory: EntryPoint-only `validateUserOp`/`executeBatch`; owner immutable; CREATE2 address bound to `(entryPoint, owner, saltNonce)`, front-running `createAccount` is harmless (idempotent).
- 7702 stale auth: confirmed C-01 analysis; additionally a mempool observer can lift the payer's authorization tuple into its own type-4 transaction; the sponsor's tuple then becomes stale but the code is already installed, so the outcome reduces to C-03 (sponsor gas lost, fee still to `sponsorFeeTo`).

Not covered: TypeScript sponsor, real bundler/RPC behaviour (C-09), formal verification, systematic mutation testing.
