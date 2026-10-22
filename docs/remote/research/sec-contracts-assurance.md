# Research: contract security assurance beyond fuzz/mutation

Date: 2026-10-21. Branch: claude/remote-extensions-1. Research only: no source, test, config or other doc was edited.
Scope: `packages/contracts/src/{GhostPayRouter,GhostPaySweepRelayer,PolicyAccount,PolicyAccountFactory,GhostPayPolicyRouter}.sol` (1,801 lines incl. interfaces), deploy scripts, `deployments/`, CI.
Read first: README.md, `docs/remote/modules-needed.md` (rank 13), `docs/threat-model/THREAT_MODEL.md`, `docs/remote/security-specs/review-contracts.md`, `docs/remote/audits/*` (haiku output, unverified; not relied on), `docs/remote/contracts-assurance.md` (Echidna, 300k calls, all pass), `docs/remote/mutation-results-local.md` (gambit, 97.9%), `packages/contracts/DEVIATIONS.md`, `docs/DEPLOYMENT_MANIFEST.md`.

What already exists (baseline, not re-run here): Foundry unit, fuzz (10k runs) and 19 `invariant_*` functions; Echidna harnesses in `test/echidna/`; gambit mutation; Slither 0.11.6 in CI (`--fail-medium`); adversarial token mocks in `test/mocks/` (FeeOnTransfer, Blacklist, NoReturn, FalseReturn, Hook, Reentrant, Permit). Nothing below repeats those.

Labels: **[V]** = verified against a primary source fetched today or against repo code. **[U]** = unverified (host unreachable, from memory, or search-engine summary only).

## 0. Findings from this research that affect the code now

| # | Finding | Evidence | Severity for GhostPay |
|---|---|---|---|
| N1 | Pinned compiler `0.8.28` is listed as affected by 7 known solc bugs. Only two lack a `viaIR: true` condition: `YulOptimizerKnowledgeBaseStaleBookkeeping` (SOL-2026-7, low, condition `yulOptimizer: true`, fixed in 0.8.38) and `LostStorageArrayWriteOnSlotOverflow` (SOL-2025-1, low, fixed in 0.8.32). `MemoryByteArrayElementDeleteClearsWholeWord` (condition `viaIR: false`, fixed in 0.8.37) also applies to the legacy pipeline. | [V] `ethereum/solidity` develop `docs/bugs.json` and `docs/bugs_by_version.json`. The SOL-2026-7 blog link is dated 2026-10-22, and 0.8.38 is not yet in `bugs_by_version.json` (latest listed: 0.8.37). So the fix is announced but not yet released. | Low. `foundry.toml` uses the legacy pipeline with the optimizer on (no `via_ir`). bugs.json says the evmasm pipeline is exposed only through "inline assembly that does not refer to any Solidity variables or functions and compiler-generated Yul utility functions". Both `_sendNative` blocks refer to Solidity variables (`to`, `amount`, `ok`). That leaves the compiler utility functions, which cannot be ruled out by reading the source. No storage arrays and no `delete` of memory `bytes` elements were found in `src/`. Action: R-12. |
| N2 | `foundry.toml` sets `bytecode_hash = "none"` and `cbor_metadata = false`. Sourcify's "full" verification uses the metadata integrity hash in the CBOR section, so with these settings only a partial match is possible. | [V] Sourcify README (`argotorg/sourcify` staging): "leverages the Solidity metadata and its integrity hash to 'fully verify'". [V] solidity `docs/metadata.rst`: `--no-cbor-metadata` / `appendCBOR=false` drops the section. [U] The exact behaviour of a partial match for CBOR-less bytecode is on docs.sourcify.dev, which was unreachable. | Process. Owner decision, R-8. |
| N3 | The manifest has no `policyRouter` field. `bytecodeHashes` covers only `router` and `sweepRelayer` (+ policy implementation/factory). Nothing pins or reads back `GhostPayPolicyRouter`. | [V] `deployments/schema.json` (no `policyRouter`); `docs/DEPLOYMENT_MANIFEST.md:23-25`. | Medium before any policy-account deployment: a client could be pointed at an unpinned scheme-2 router. R-7. |
| N4 | `PolicyAccount.executeWithdraw` requires exact deltas (`PolicyAccount.sol` balance check after `safeTransfer`) and has no rescue path. Funds become permanently frozen in any account holding a token that later turns on a transfer fee, rebases with rounding (stETH-type 1-2 wei), or blacklists the account. weird-erc20 lists USDT and USDC as "do not currently charge a fee but may do so in the future" and as upgradable. | [V] code; [V] `d-xo/weird-erc20` readme.md lines 74-111. | Medium (design). Router, Sweep and Factory hold nothing, so for them a quirk only causes a revert. PolicyAccount is the only custody contract. R-10. |
| N5 | Polygon PoS (chainId 137) is in `chains.ts` (disabled). On Polygon, the native coin also exists as an ERC-20 at `0x…1010`. `PolicyAccount._consume` keys window limits by token address, so `token = address(0)` and `token = 0x…1010` are separate budgets for the same asset. This is a per-window cap bypass if both leaves are in the limits tree, or if the tree is empty (unlimited anyway). | [V] weird-erc20 "ERC-20 Representation of Native Currency" (Celo, Polygon POL `0x…1010`, zkSync); [V] `packages/chain-adapters/src/config/chains.ts:40`. | Low (owner-signed withdrawals only; the cap is defence against key theft). R-10. |

## 1. Formal verification and symbolic options

| Tool | What it is (source) | Fit for this repo | Cost / licence |
|---|---|---|---|
| **Halmos** (a16z) | Symbolic testing for EVM with a Foundry frontend. Tests are `check_<fn>_<behaviour>(params)`. Install: `uv tool install --python 3.12 halmos`. Use `vm.assume`, not `bound` [V `a16z/halmos` README + docs/getting-started.md]. Stateful/invariant mode exists in recent releases [U]. | Best first step. Reuses `test/*Base.t.sol` fixtures and runs offline, no service. Loop-free code: the only loop is the `MerkleProof` loop, so bound the proof length to 0-3. | Free, AGPL [U]. S-M |
| **hevm** (argotorg) | Symbolic EVM. `hevm test` symbolically runs Forge tests, and `hevm equivalence` proves two bytecodes equivalent; needs `z3` [V `ethereum/hevm` readme]. Also the engine behind Echidna `verification` mode [V echidna README]. | Equivalence checking between Router and a reference contract (section 3) and between optimizer-on and optimizer-off builds (N1). | Free, AGPL [U]. M |
| **SMTChecker** (solc built-in) | CHC/BMC engines; targets assert, overflow, underflow, divByZero, outOfBounds…; `settings.modelChecker.{engine,targets,contracts,extCalls:"trusted",timeout}`. "might happen here" means unknown, not proven. Trusted external calls are opt-in [V `ethereum/solidity` docs/smtchecker.rst]. | Narrow: pure arithmetic (`fee = gross*25/10_000`, `net = gross-fee`, `_consume` bucket math) in a test-only harness with `assert`s. Not for token-interaction properties. | Free, ships with solc. S |
| **Echidna advanced** | Modes `property`, `assertion`, `foundry` (runs `invariant_*`), `verification` (hevm-symbolic, single-tx, `check`/`prove` entry points), `optimization`, `exploration`; corpus dir with `covered.txt`; Slither-guided [V echidna README]. | Next step after the existing 300k-call runs. (a) Optimization mode: maximise router residue, fee extracted above `FEE_BPS`, and PolicyAccount spend inside a window. (b) Long multi-seed nightly runs with a committed corpus. (c) Slither installed (CI already has it). | Free. S |
| **Medusa** (crytic) | Parallel, coverage-guided, go-ethereum-based fuzzer inspired by Echidna; property and assertion tests; Go API still unstable [V `crytic/medusa` README]. | Second fuzzer on the same `test/echidna/*` harnesses; diverse engines find different bugs. | Free. S |
| **Kontrol** (Runtime Verification) | KEVM (K-framework formal EVM semantics) on Foundry tests; "reuse Foundry test suites"; `kup install kontrol`; first run 30-60 min [V `runtimeverification/kontrol` README]. | Full proofs of `prove_*` versions of the Halmos specs, including symbolic storage. Heaviest local setup. Worth it only after Halmos specs are stable. | Free [U licence]. M-L |
| **Certora Prover** | CVL rules/invariants. Now GPL-3.0, can be built locally (JDK 19+, Z3, CVC5, Rust) or used on Certora's cloud [V `Certora/CertoraProver` README, "Copyright (C) 2025 … GNU GPL v3"]. | Strongest for **parametric rules** ("for every method f, destination changes only via executeDestinationChange") and unbounded-sequence invariants over PolicyAccount storage. Bounded tools (Halmos invariant mode, fuzzers) only approximate these. | Tool free; cloud key / paid engagement [U]. M |

Recommendation: Halmos first (all four contracts), Certora CVL for PolicyAccount parametric rules, hevm equivalence for differential (section 3), SMTChecker only on an arithmetic harness. Skip Kontrol unless Certora is rejected.

## 2. Symbolic properties to write (new files only under `packages/contracts/test/formal/`)

Each property must hold for **all** inputs (symbolic), not just sampled ones. "Success" means the call did not revert. Mocks: `MockERC20` (standard), plus the existing quirk mocks as separate symbolic targets.

### GhostPayRouter / GhostPayPolicyRouter (`test/formal/Router.halmos.t.sol`)
- **RT-1 conservation**: success of `payERC20(token,stealth,gross,…)` ⇒ Δpayer = −gross, Δstealth = gross − ⌊gross·25/10⁴⌋, ΔFEE_RECIPIENT = ⌊gross·25/10⁴⌋, Δrouter = 0. Same for `payNative` (msg.value) and `payERC20WithBuffer` (ETH: Δstealth = msg.value ≤ maxBufferWei).
- **RT-2 metadata binding**: success ⇒ `metadata.length==57 ∧ metadata[1:5]==marker ∧ metadata[5:25]==asset ∧ uint(metadata[25:57])==net`. The announcer mock receives the same `(SCHEME_ID, stealth, key, metadata)`.
- **RT-3 forbidden recipients**: success ⇒ stealth ∉ {0, router, FEE_RECIPIENT}; ephemeral key[0] ∈ {02,03}.
- **RT-4 permit owner**: in `payERC20WithPermit`, the only `permit` the token sees has `owner == msg.sender ∧ spender == router`. This is the structural defence against the phantom-permit class (section 5). Token mock records arguments.
- **RT-5 call surface**: the only external calls are to `token` (`permit`/`transferFrom`/`balanceOf`), `ANNOUNCER.announce`, `FACTORY.predictAddress` (policy router only), and value-only calls to {FEE_RECIPIENT, stealth}. Halmos/hevm can check this by asserting on recorded call targets from a mock environment. Complement with the static check in R-4.
- **PR-1 policy binding (policy router)**: success ⇒ `stealth == FACTORY.predictAddress(policy.owner, policy.policyHash) ∧ policy.owner != 0`, for every entry point including the buffer path (audit `bugs-policyrouter.md` F1 says the buffer checks run first; that ordering is fine, but the binding must still be proven).

### GhostPaySweepRelayer (`test/formal/Sweep.halmos.t.sol`)
- **SW-1 authorisation**: success ⇒ `ECDSA.recover(digest(s), sig) == s.owner`, where `digest` covers all 8 fields + domain(chainid, address(this)). Variant: for a fixed key k and any `s' ≠ s` (symbolic, at least one field differs), the signature over `s` does not authorise `s'`. Halmos models `ecrecover` as uninterpreted, so this reduces to struct-hash injectivity, which is what matters [U on Halmos internals].
- **SW-2 nonce frame**: after success with `(owner,n)`, `nonceUsed(owner,n)` holds; `nonceUsed(o',n')` is unchanged for all `(o',n') ≠ (owner,n)`. A second success with `(owner,n)` is impossible. Fully symbolic n kills the `word & bit → word / bit` mutant class without hand-picked vectors.
- **SW-3 conservation**: success ⇒ Δowner = −amount, Δdestination = amount−fee, ΔfeeTo = fee, Δrelayer = 0, and `fee < amount`.
- **SW-4 no stranger griefing of nonces**: a call with an invalid signature leaves the bitmap unchanged (DEVIATIONS 10).

### PolicyAccount + PolicyAccountFactory (`test/formal/Policy.halmos.t.sol`; CVL `certora/specs/PolicyAccount.spec` if R-3 approved)
- **PA-1 (parametric)**: for every external `f`, `destination` changes only in `executeDestinationChange` and only when `block.timestamp ≥ pendingEffectiveAt`, where `pendingEffectiveAt = t_propose + 2·delay`.
- **PA-2 (parametric)**: `owner, delay, limitsRoot, policyHash, initialized` never change after `initialize`; `initialize` succeeds at most once and only when `address(this) == predictDeterministicAddress(IMPLEMENTATION, salt, msg.sender)`.
- **PA-3 request state machine**: status transitions are only `None→Pending` (request), `Pending→Executed` (execute, `now ≥ executeAfter`), `Pending→Cancelled` (owner sig). Executed and Cancelled are absorbing. `executeAfter == t_request + delay` is never altered.
- **PA-4 outflow destination**: every decrease of this account's balance of any token or ETH is matched by an equal increase at `destination` (current value at execution).
- **PA-5 window cap**: for each token with `limit < max`, `previous + current ≤ limit` after every `executeWithdraw`, and `bucket` is monotone. Halmos proves the single step; Certora/Kontrol prove it inductively (an invariant over all reachable states).
- **PA-6 cancel liveness**: while `status == Pending`, a valid owner `cancel` signature always succeeds, whatever any third party has done. This matters because anyone can call `executeWithdraw` (audit N-04): an owner who learns the destination is compromised must be able to cancel matured requests, and the proof shows there is no way to block it.
- **FA-1 factory**: `deploy` success ⇒ account code is the EIP-1167 runtime for `IMPLEMENTATION`, `account == predictAddress(owner, policyHashOf(dest,delay,root))`, the account's `policyHash` equals that hash, and ΔFEE_RECIPIENT = FLAT_FEE exactly.

### SMTChecker arithmetic harness (`test/formal/Arith.smt.sol`, compiled with a separate profile)
- `fee ≤ gross`, `fee·10⁴ ≤ gross·25 < (fee+1)·10⁴`, `net ≥ 1` for `0 < gross ≤ type(uint256).max/25`; `_consume` never overflows `s.current`, and `s.bucket + 1` never overflows for `window ≥ 1, timestamp < 2⁶⁴`.

## 3. Differential testing

| Pair | Method | Catches |
|---|---|---|
| `GhostPayRouter` vs `GhostPayPolicyRouter` | Foundry differential fuzz in a new test file: same `(token, gross, minNet, deadline, key, metadata)`, the stealth address set to a predicted account. Assert equal revert selector or equal balance deltas; announcement equal except `schemeId`. The two contracts have copy-pasted `_validate/_checkMetadata/_pull/_sendNative`. | Drift between the two copies in future edits; F1-style check-order bugs. |
| Router vs naive reference `test/formal/RouterSpec.sol` (same ABI, written for clarity: no assembly, explicit `require`s) | `hevm equivalence` on runtime bytecode [V hevm README], or differential fuzz if equivalence times out. | Errors in the assembly `_sendNative` or in metadata slicing. |
| optimizer on vs off, and solc 0.8.28 vs latest | Run the full suite under an extra profile `[profile.noopt] optimizer=false`; `hevm equivalence` between the two runtime builds of each contract. | Compiler/optimizer miscompilation classes such as SOL-2026-7 (N1). |
| TS `packages/chain-adapters` (`fees.ts`, `sweep.ts` EIP-712, policy leaf/hash builders) vs Solidity | Commit JSON vectors produced by the TS side (extend `test-vectors/generate*.mjs`), read them in forge with `vm.readFile`. Needs `fs_permissions = [{access="read", path="../../test-vectors"}]` (config change, owner OK). `ffi` stays false. | Client signs a digest the contract rejects (funds stuck at a stealth EOA without gas), or a counterfactual address mismatch (funds at an undeployable address, review-contracts F3). `fees.test.ts` today regex-checks only the constants. |
| Real token bytecode vs mocks | `vm.etch` vendored runtime code of WETH9 (phantom permit), USDT (no return, fee params), USDC FiatToken (blacklist, permit, upgradable), DAI (non-2612 permit), stETH (1-2 wei rounding). Offline, no RPC. Optional nightly mainnet-fork job (needs an RPC secret). | Gaps between the 9 hand-written mocks and real token behaviour. |

## 4. Deployment verification

Current state: deploy scripts pin the announcer address (`ALLOW_CUSTOM_ANNOUNCER` override) and optionally the announcer/factory codehash, and log the deployed codehashes [V `script/Deploy*.s.sol`]. The manifest `bytecodeHashes` are "format-checked only" and not comparable across chains because of immutables [V `DEPLOYMENT_MANIFEST.md:23,32`].

Recommendations:
1. **Immutable-aware runtime hash** (`scripts/verify-deployment.mjs`, new). Take `deployedBytecode.immutableReferences` from `out/*.json`, zero those byte ranges in both on-chain `eth_getCode` and local runtime, then compare keccaks. Separately assert each immutable's value: `ANNOUNCER`, `FEE_RECIPIENT`, `FACTORY`, `IMPLEMENTATION`, `FEE_TOKEN`, `FLAT_FEE`, plus OZ `EIP712` cached `_cachedChainId`, `_cachedThis`, `_hashedName`, `_hashedVersion`. Manifest field `bytecodeHashes.*` becomes "masked runtime hash", a value that is the same on every chain. Foundry's `forge verify-bytecode` does a similar comparison [U: Foundry book unreachable].
2. **Add `policyRouter` to `deployments/schema.json`** (address, masked hash, `deployTx`) and to the client read-back in DEPLOYMENT_MANIFEST 3.2 (N3).
3. **Clone check in the client**: before paying a counterfactual policy account, require `eth_getCode(acct)` to be empty or exactly the 45-byte EIP-1167 runtime `363d3d373d3d3d363d73<IMPLEMENTATION>5af43d82803e903d91602b57fd5bf3` [U: from EIP-1167 memory; eips.ethereum.org not tried]. Require the factory's masked hash to match the manifest on that chain.
4. **Deterministic CREATE2 deployment** via the widely used deterministic-deployment proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C` [U]. Publish `keccak256(initcode)` per contract in the release manifest (`scripts/gen-release-manifest.mjs`), so anyone can rebuild from the tagged source. Same factory/implementation addresses on every chain mean a payment to a policy account on the "wrong" chain can be recovered by deploying the same account there. Lesson: Wintermute/Optimism 2022, where 20M OP were sent to a Safe address that was not yet deployed on L2 and an attacker took the address by replaying a factory deployment [U: no primary reachable].
5. **Source verification**: Etherscan standard-JSON verify for every contract including the implementation (clones show "proxy"), plus Sourcify (open data, MIT). Prefer a full match (N2) and, if possible, a Verifier Alliance listing [V `verifier-alliance/database-specs` README exists; process U].
6. **Reproducible build gate**: CI job builds with `solc_version = "0.8.28"` from a clean container twice and diffs `out/*.json` `bytecode`/`deployedBytecode` (the sandbox `solc =` path in `foundry.toml` must go first; audit N-05).

## 5. Lessons from real incidents (router / permit / signature class)

All incidents below are listed with PoCs in `SunWeb3Sec/DeFiHackLabs` README [V, fetched]. Root-cause text comes from search summaries, because the primary post-mortems (li.fi, dedaub.com, halborn.com) were unreachable [U].

| Incident | Class | GhostPay position | Keep it true by |
|---|---|---|---|
| LI.FI 2024-07-16 (`GasZipFacet.depositToGasZipERC20`, ~$10M; same class as LI.FI 2022-03-20). A new facet passed user swap data to a low-level call and drained infinite approvals. The facet was deployed 5 days earlier. Socket/Bungee 2024-01-16 (route added 3 days earlier). SushiSwap RouteProcessor2 2023-04-09; Dexible 2023-02-17; Transit Swap 2022-10-02; Seneca 2024-02-28; Unizen 2024-03-09; Squid multicall 2026-04-07 | Arbitrary external call + standing approvals, usually in **newly added** code | No arbitrary call, no delegatecall, immutable, no admin [V code]. Web approves exact `amount` (`apps/web/src/lib/pay.ts:239`) [V]. | R-4 call-surface CI check + RT-5 proof. A future router migration (DEPLOYMENT_MANIFEST section 5) is "new code", so it needs a full re-audit and must never request unlimited approval. |
| Multichain/Anyswap 2022-01-18 ("phantom functions": WETH has no `permit`, and its `fallback` accepts the call, so `permit` "succeeds" as a no-op); recurrence AnyswapWETHPermit 2025-07-29 (200 WETH) | try/catch or unchecked `permit` while the owner of the pull is attacker-chosen | Router: permit owner and pull source are both `msg.sender`. Sweep: pull source `s.owner` is authenticated by the EIP-712 sweep sig [V code]. A no-op permit therefore cannot let anyone pull another user's funds. | RT-4 / SW-1 proofs; add a WETH9-style fallback mock regression test. Any future entry point taking `from != msg.sender` must have its own signature. |
| LegendaryMoneyMonNft 2026-05-28 (ecrecover returns address(0)); AROS 2026-05-30, TrustedVolumes 2026-05-07 (signature replay) | Signature soundness | OZ `ECDSA.recover` reverts on zero/high-s; `owner != 0`; nonce bitmap; domain binds chainid + address [V code; ERC-2612 text on domain/chain split, V]. | SW-1, SW-2, PA-2 proofs. Keep the EIP-712 domain dynamic (OZ rebuilds it when chainid changes) [V ERC-2612 security section]. |
| Uniswap v4 audit (OpenZeppelin): ERC-20 representation of native currency could drain native pools on Celo [V cited by weird-erc20; OZ blog U] | Native/ERC-20 aliasing | PolicyAccount window keyed per address (N5) | R-10 token/chain allowlist rule. |

## 6. Token-quirk and economic matrix

Source taxonomy: weird-erc20 [V] and Trail of Bits token-integration checklist (`crytic/building-secure-contracts`) [V].

| Quirk | Router / PolicyRouter | SweepRelayer | PolicyAccount | Factory fee |
|---|---|---|---|---|
| Fee-on-transfer / "transfer less than amount" (cUSDCv3 `max`) | Revert (exact delta) | Revert | **Frozen if enabled later** (N4) | Revert; deploy blocked (audit M-03 freezes counterfactuals) |
| Rebasing (stETH rounding, AMPL) | Likely revert on 1-2 wei | Likely revert | Frozen / balance drift | n/a |
| Blocklist (USDC, USDT) | FEE_RECIPIENT listed ⇒ all ERC-20 pay paths DoS (audit M-01) | Destination/feeTo listed ⇒ that sweep reverts | Account listed ⇒ frozen (inherent); destination listed ⇒ 2×delay to change | Fee recipient listed ⇒ deploy DoS |
| Pausable | Temporary DoS | Temporary DoS | Temporary; pending requests have no expiry, so they can be executed after unpause [V code] | Temporary |
| Upgradable (USDC, USDT) | Any of the above can appear later | same | same, and this is the only contract holding funds | same |
| No return / false return | SafeERC20 [V mocks exist] | same | same | same |
| Revert on zero transfer | `fee==0` branch skipped [V] | `fee==0` skipped [V] | `amount>0` enforced | `FLAT_FEE==0` skipped |
| Hooks / reentrancy (ERC-777-like) | `nonReentrant`; no state | `nonReentrant`; nonce consumed before calls | `nonReentrant`; status set before transfer [V] | `nonReentrant` |
| Permit variants: DAI (`allowed` bool), none (USDT), phantom (WETH) | Swallowed by try/catch; then pull needs a prior allowance | Same; USDT has no gasless sweep (functional gap, not a vulnerability) | n/a | n/a |
| Native ERC-20 alias (Polygon `0x…1010`, Celo, zkSync) | Two ways to pay, both correct | n/a for native | Limit bypass (N5) | n/a |
| Low decimals (GUSD 2) | Fee is 0 below 400 base units (= 3.99 GUSD) | n/a | n/a | n/a |

Economic notes: (a) **fee dodge by splitting**: payments under 400 base units pay no fee, but each split costs a tx plus an announcement, which costs more than 0.25%. Accept. (b) **Announcement spam**: anyone can call the canonical announcer directly or pay 1 base unit through the router, so scanners must rate-limit and filter dust (client work, D4). (c) **Hostile token gas-burn in `permit`** (audit N-07): only the payer is harmed, and only if the token is off the allowlist, which the client must enforce. (d) **PolicyAccount `executeWithdraw` is permissionless**: an attacker who stole the destination key but not the owner key gains nothing until matured requests run. PA-6 guarantees the owner can still cancel.

## 7. Recommendations

Each: threat; change; effort; residual; priority; owner decision / cost / service.

- **R-1 Halmos specs RT-1..5, PR-1, SW-1..4, FA-1.** Threat: logic bugs on input combinations that sampling never reaches (mutation survivors show sampling blind spots). Change: `packages/contracts/test/formal/*.halmos.t.sol`, a `halmos` job in `.github/workflows/nightly.yml` (pinned version via uv). Effort M. Residual: bounded proof length / loop unrolling; mocks stand in for real tokens. **P1**. No owner decision; free.
- **R-2 PolicyAccount Halmos specs PA-2..PA-6 (single-step) + Echidna optimization mode for PA-5.** Threat: timelock/limit bypass after key theft (the reason policy accounts exist). Change: `test/formal/Policy.halmos.t.sol`, `test/echidna/EchidnaPolicyOpt.sol`. Effort M. Residual: bounded sequences. **P1**. No decision.
- **R-3 Certora CVL for PA-1, PA-3, PA-5 (inductive/parametric).** Threat: same as R-2, over unbounded call sequences. Change: `packages/contracts/certora/{conf,specs}/`. Effort M. Residual: CVL summaries of token calls. **P2**. Needs owner decision: local GPL build vs cloud key / paid Certora engagement.
- **R-4 Call-surface guard.** Threat: arbitrary-call class (LI.FI/Socket). Change: `scripts/check-call-surface.sh` (grep plus a Slither printer over `src/`). It fails on `delegatecall`, `.call(` with non-empty calldata, `selfdestruct`, any new external interface, or approval-taking entry points without `from == msg.sender` or a signature. CI step. Effort S. Residual: grep evasion via assembly; the assembly allowlist is pinned by line. **P1**. No decision.
- **R-5 Differential tests** (section 3: Router vs PolicyRouter, Router vs RouterSpec via hevm, TS vectors into forge). Threat: copy drift; client/contract digest mismatch locking funds. Change: `test/formal/RouterDiff.t.sol`, `test/formal/RouterSpec.sol`, `test-vectors/generate*.mjs` outputs, `fs_permissions` read entry. Effort M. Residual: the reference can share the bug. **P1**. Small config decision (fs read permission).
- **R-6 Real-token bytecode tests via `vm.etch`** (WETH9, USDT, USDC FiatToken, DAI, stETH). Threat: mocks diverge from production tokens. Change: `test/tokens/` with vendored bytecode + provenance in THIRD_PARTY.md. Effort S-M. Residual: upgradable tokens change later. **P2**. Optional fork job needs an RPC secret (service).
- **R-7 Manifest + read-back completeness**: add `policyRouter`; masked runtime hashes; immutable value checks; EIP-1167 clone check (section 4 items 1-3). Threat: client pointed at wrong/unpinned contract (D7 path). Change: `deployments/schema.json`, `packages/chain-adapters/src/deployments.ts`, new `scripts/verify-deployment.mjs`. Effort M. Residual: manifest signing is separate (DEPLOYMENT_MANIFEST 3.3). **P1** (before any testnet manifest). Owner sign-off on schema change.
- **R-8 Restore CBOR metadata for full Sourcify match.** Threat: users and reviewers cannot independently tie bytecode to source. Change: `foundry.toml` `bytecode_hash = "ipfs"`, `cbor_metadata = true`; Sourcify + Etherscan verify in the release runbook. Effort S. Residual: metadata includes source paths, so builds must use identical layout and remappings. Changes bytecode, so the decision must come before the first deploy and the gas snapshot must be regenerated. **P2**. **Owner decision** (the reason for `none` is undocumented).
- **R-9 Deterministic CREATE2 deployment + initcode-hash publication.** Threat: per-chain address confusion, counterfactual-address capture (Wintermute-type), unverifiable deploys. Change: `script/Deploy*.s.sol` use the CREATE2 deployer with fixed salts; `scripts/gen-release-manifest.mjs` emits `initcodeHash`. Effort S-M. Residual: immutables that differ per chain (fee recipient) change addresses; keep them uniform. **P2**. Owner decision (uniform fee recipient across chains).
- **R-10 Custody-token policy for PolicyAccount.** Threat: N4 freeze, N5 cap bypass. Change, two options. (a) Contract: in `executeWithdraw` require `selfBefore − selfAfter == amount` and `toAfter − toBefore ≤ amount` (tolerate an outgoing fee; the window still counts `amount`). (b) No contract change: the client allowlist (`packages/chain-adapters/src/config/tokens.ts`) marks tokens "custody-safe", rejects policy-account payments in upgradable/fee-capable/rebasing tokens and native-alias addresses, and refuses limit trees containing both `address(0)` and the chain's native alias. Effort S (b) / M (a, plus re-test, re-mutate). Residual: (b) cannot prevent a third party paying in such a token; (a) weakens the "exact" invariant. **P1** decision before policy accounts are enabled. **Owner decision**.
- **R-11 Echidna/Medusa campaign upgrade.** Threat: shallow fuzzing (300k calls, no Slither, no corpus). Change: nightly Echidna with Slither, 5 seeds × 5M calls, committed corpus under `test/echidna/corpus/`, Medusa on the same harnesses (`medusa.json`), add hostile receiver / reentrant token actors and the factory to harnesses. Effort S. Residual: still probabilistic. **P2**. CI minutes cost.
- **R-12 Compiler pin hygiene.** Threat: N1 class miscompilation. Change: CI job reads `bugs_by_version.json` for the pinned solc and fails on a new non-`viaIR` bug. When 0.8.38 ships, re-run the suite, mutation, and hevm optimizer-on/off equivalence on 0.8.38, and pick the deploy compiler ≥2 weeks after release. Effort S. Residual: unknown bugs. **P2**. Owner decision on the compiler bump (it changes bytecode).
- **R-13 SMTChecker arithmetic harness.** Threat: overflow/rounding in fee and window math. Change: `test/formal/Arith.smt.sol` + `[profile.smt]` with `model_checker = {engine="chc", targets=["assert","overflow","underflow","divByZero"], timeout=…}` [U Foundry key names]. Effort S. Residual: CHC "unknown" results. **P3**.
- **R-14 Kontrol proofs** of R-1 specs as `prove_*`. Effort L. **P3**; only if Certora is rejected.
- **R-15 External review.** Threat: everything the team cannot see itself; README says "No independent third-party audit". Options [all U, sites unreachable: code4rena.com, cantina.xyz, immunefi.com, sherlock/codehawks not tried]: (i) private firm review (e.g. Trail of Bits, OpenZeppelin, ChainSecurity, Spearbit/Cantina, Zellic); about 1,000 nSLOC is small, so a short 2-reviewer engagement is plausible; (ii) competitive contest (Code4rena, Sherlock, Cantina, CodeHawks First Flights for small scopes); (iii) post-deploy bug bounty (Immunefi or self-hosted per `SECURITY.md`), sized to the funds at risk. Suggested order: freeze → private review → fix → contest (optional) → testnet → bounty live at mainnet. Effort L. **P1** before any mainnet. **Owner decision + cost + service**.
  Prepare: frozen commit hash; scope list with nSLOC (`src/` only, `interfaces/` included); build that works off-sandbox (remove the `solc =` path, audit N-05); one-command test run; this doc's properties as the stated invariants; `DEVIATIONS.md`, threat model, and a **known-issues list** (M-01 fee recipient SPOF, M-02, M-03, N-01 privacy, N4/N5 here, L-02 announcement spoofing) so reviewers do not re-report them; token allowlist and chain list in scope; deployment parameters and scripts in scope; the off-chain components that sign for the contracts (`packages/chain-adapters/src/sweep.ts`, policy leaf builders) marked in/out of scope explicitly.

## 8. Ranked roadmap

| Rank | Item | Effort | Priority | Needs owner / cost / service |
|---|---|---|---|---|
| 1 | R-10 custody-token policy for PolicyAccount (decide a vs b) | S/M | P1 | Owner decision |
| 2 | R-7 manifest `policyRouter` + masked hashes + immutable + clone read-back | M | P1 | Schema sign-off |
| 3 | R-4 call-surface CI guard | S | P1 | No |
| 4 | R-1 Halmos specs Router/PolicyRouter/Sweep/Factory | M | P1 | No |
| 5 | R-2 Halmos PolicyAccount + Echidna optimization | M | P1 | No |
| 6 | R-5 differential tests (PolicyRouter vs Router, RouterSpec/hevm, TS vectors) | M | P1 | fs read permission |
| 7 | R-15 external audit + contest + bounty (prepare package now) | L | P1 pre-mainnet | Owner, cost, service |
| 8 | R-8 CBOR metadata for full Sourcify match | S | P2 | Owner decision (pre-deploy) |
| 9 | R-9 deterministic CREATE2 + initcode hash in release manifest | S-M | P2 | Owner (uniform params) |
| 10 | R-3 Certora CVL parametric/inductive PolicyAccount rules | M | P2 | Owner (local vs cloud) |
| 11 | R-12 solc bug-list gate; move to 0.8.38 after release | S | P2 | Owner (bytecode change) |
| 12 | R-6 real-token bytecode tests via `vm.etch` | S-M | P2 | Optional RPC secret |
| 13 | R-11 Echidna long runs + Medusa + corpus | S | P2 | CI minutes |
| 14 | R-13 SMTChecker arithmetic harness | S | P3 | No |
| 15 | R-14 Kontrol proofs | L | P3 | No |

## 9. Sources (retrieved 2026-10-21)

Fetched and read [V]:
- https://raw.githubusercontent.com/a16z/halmos/main/README.md ; …/main/docs/getting-started.md
- https://raw.githubusercontent.com/runtimeverification/kontrol/master/README.md
- https://raw.githubusercontent.com/ethereum/solidity/develop/docs/smtchecker.rst ; …/docs/metadata.rst ; …/docs/bugs.json ; …/docs/bugs_by_version.json
- https://raw.githubusercontent.com/ethereum/hevm/main/readme.md
- https://raw.githubusercontent.com/crytic/echidna/master/README.md ; https://raw.githubusercontent.com/crytic/medusa/master/README.md
- https://raw.githubusercontent.com/Certora/CertoraProver/master/README.md
- https://raw.githubusercontent.com/d-xo/weird-erc20/master/readme.md
- https://raw.githubusercontent.com/crytic/building-secure-contracts/master/development-guidelines/token_integration.md
- https://raw.githubusercontent.com/SunWeb3Sec/DeFiHackLabs/main/README.md ; …/past/2025/README.md
- https://raw.githubusercontent.com/ethereum/ercs/master/ERCS/erc-2612.md ; …/erc-5564.md
- https://raw.githubusercontent.com/argotorg/sourcify/staging/README.md ; https://raw.githubusercontent.com/verifier-alliance/database-specs/master/README.md
- https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/contracts/token/ERC20/extensions/IERC20Permit.sol

Search-engine summaries only, primary not reachable [U]: LI.FI incident report (https://li.fi/knowledge-hub/incident-report-16th-july), Dedaub "phantom functions" (https://dedaub.com/blog/phantom-functions-and-the-billion-dollar-no-op), Halborn Socket write-up (https://www.halborn.com/blog/post/explained-the-socket-protocol-hack-january-2024).

Unreachable: docs.soliditylang.org, docs.sourcify.dev, docs.certora.com, docs.code4rena.com, li.fi, dedaub.com (DNS failure via fetch tool); code4rena.com, cantina.xyz, immunefi.com, rekt.news, docs.etherscan.io, docs.runtimeverification.com (proxy 403); GitHub API for d-xo/a16z/ethereum repos (not enabled for the session). Not tried: eips.ethereum.org, book.getfoundry.sh (the Foundry book repo path tried returned 404).
