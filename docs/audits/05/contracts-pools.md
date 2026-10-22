# Audit 05: contracts-pools

Snapshot: commit `88de0018b86884d49d70d269c430bdcbb39a0b4f` (read-only worktree).
Area: `pool-contracts`, `pool-circuits`, `pool-prover`, `pool-sdk`, `pool-relayer`, `payer-hiding-contracts`,
`confidential-contracts`, `confidential-amounts`, `external-pools`, `external-pools-privacypools`,
`external-pools-railgun`, `payer-sponsor`.

**This is an AI-assisted review, not an independent professional audit.** Same-family model as the authors of the
earlier self-reviews. Treat "no finding" as "not found in the time spent", never as "safe".

## 1. Summary

Two new issues with working proofs of concept, both in the sponsored/relayed gas paths (not in the pool core):

- **CONTRACTS-POOLS-01 (high)**: the PH-4 verifying-paymaster signature is portable and its gas fields are
  attacker-chosen. Anyone who gets one paymaster signature from the sponsor service can call `EntryPoint.handleOps`
  themselves with `beneficiary = attacker` and be paid more ETH out of the paymaster deposit than the transaction
  cost. PoC: 0.00064 ETH real cost, 0.057 ETH received (89x); 18x with market-rate fees via inflated
  `preVerificationGas`.
- **CONTRACTS-POOLS-02 (medium)**: `pool-relayer` has no gas cap tied to the fee. A recipient contract that does a
  fixed amount of work makes the native-pool `withdraw` cost 3.65M gas against the 600k the fee is priced for. The
  relayer simulates, sets `gas = 1.2 x estimate` and pays.

The pool core (`GhostPayShieldedPool*`, registry, `PoolLeanIMT`, `ProofLib`) and the circuits: I re-derived the
main properties (nullifier single-use across withdraw and ragequit, context binding, root window, ASP grace logic,
LeanIMT port equivalence, range checks, non-canonical signals) and found **no new exploitable flaw given a sound
verifier**. Soundness still rests wholly on the INSECURE dev ceremony (known, C-1 / PC-01; unchanged, no
regression). Known open items re-checked and still present: L-1 root-window griefing, I-3 off-curve gas burn,
PS-04 verification on the event loop, PS-12 caller-supplied artifact hashes.

No regression of a previously fixed item was observed in the areas read.

## 2. Method

1. Read prior audits (`docs/audits/0*.md`, `docs/remote/privacy-specs/audit-{pool-contracts,pool-circuits,pool-sdk,payer-sponsor,external-pools,confidential-tokens}.md`, `docs/remote/round-audits/*`) to avoid re-reporting.
2. Full read of: `GhostPayShieldedPool.sol`, `...ERC20.sol`, `...Native.sol`, `GhostPayAssociationSetRegistry.sol`, `PoolLeanIMT.sol`, `ProofLib.sol`, `PoolConstants.sol`, `DeployPool.s.sol`; `withdraw.circom`, `merkleTree.circom`, `commitment.circom`, mains, `ceremony-dev.sh`, verifier head/tail; all of `pool-relayer/src` (non-test), `pool-prover/src/prover.ts`, `pool-sdk/src` (withdrawal, notes, store, recover, asp, sync, flows, inputs, wire, relayerClient, tree, field, chain); all five `payer-hiding-contracts/src` contracts and `RouterCall`; `payer-sponsor` service, http, keys, viemChain, userop, paymaster, routerTargets, fundingPlan; `GhostPayConfidentialRouter.sol`, token, `TestnetOnly`; `confidential-amounts` manifest, decrypt, zama-sdk; `external-pools` vault, manifest, codehash, planner, linter, viem-reader, manifest-data; `external-pools-privacypools` adapter and relayer; `external-pools-railgun` adapter.
3. Static reasoning against the threat model categories (authz, replay, reentrancy, ordering, fee binding, DoS, privacy, supply chain, failure modes).
4. Two Foundry PoCs written under the snapshot's scratch dirs (not committed to the live tree):
   - `packages/payer-hiding-contracts/test/audit05/PaymasterSelfBundle.t.sol` (real eth-infinitism EntryPoint v0.7.0, fetched with `npm pack @account-abstraction/contracts@0.7.0 --ignore-scripts` into the session scratchpad and remapped; no scripts run). Inherits the existing `GhostPayErc4337Test` fixture (its 22 existing tests also passed in that run).
   - `packages/pool-contracts/test/audit05/RelayerGasGrief.t.sol` (existing mock verifier model, native pool).
5. No JS executed. No existing full test suites re-run.

## 3. Findings

### CONTRACTS-POOLS-01 (high, confidence high): portable paymaster signature + attacker-chosen gas fields drain the paymaster deposit

- **Where**: `packages/payer-sponsor/src/sponsor/service.ts:283-293` (paymaster params and signing), `:430-437` (only cap), `packages/payer-hiding-contracts/src/GhostPayVerifyingPaymaster.sol:75-97, 109-128` (signed hash), `payer-sponsor/src/sponsor/service.ts:329` (beneficiary only set when the sponsor itself submits).
- **Issue**: `sponsorUserOp` (step 1) returns a `paymasterAndData` signature that is valid for anyone who submits the op, for the whole quote TTL. The signed hash covers `maxFeePerGas`, `maxPriorityFeePerGas`, `preVerificationGas`, gas limits, but nothing binds the bundler or `handleOps` `beneficiary`. The service's only gas check is `(vgl + cgl + preVerificationGas + 250_000) * maxFee <= 0.1 ETH` (default `maxOpCostWei`); it never compares `maxFeePerGas`/`maxPriorityFeePerGas` with the live gas price and never bounds `preVerificationGas` on its own. EntryPoint v0.7 pays the beneficiary `actualGasCost` computed at `min(maxFee, maxPriorityFee + basefee)` plus the full `preVerificationGas`, debited from the paymaster deposit.
- **Exploit**: attacker (no tokens beyond the quoted fee, own `owner` key) requests a quote, builds the expected 4-call batch for a fresh account with `maxPriorityFeePerGas = maxFeePerGas = 90 gwei`, `vgl = 500k`, `cgl = 200k`, `pvg = 50k` (cap product = 0.0900 ETH, passes), gets the paymaster signature from `/v1/sponsor-userop`, signs the op as owner, and instead of `/v1/submit` calls `EntryPoint.handleOps([op], attacker)` from any EOA. Variant with market-rate fees: `maxFee = 2 gwei`, `preVerificationGas = 5_000_000` (cap product 0.0113 ETH).
- **PoC** (`PaymasterSelfBundle.t.sol`, `forge test`, basefee 1 gwei, tx gas price 1 gwei): `attacker real tx cost 640392000000000 wei`, `attacker received 57027870000000000 wei`, `paymaster deposit lost 57027870000000000 wei` (89x). Variant: `real 640376000000000`, `received 11167286000000000` (17x). Both pass.
- **Impact**: the paymaster deposit (sponsor operator funds) can be drained at a profit per quote; loss budget and breaker (`LossBudget`, `GuardedBreaker`) are bypassed because the sponsor never sends the transaction. Rate limiting only bounds how many signatures are issued (5 open quotes per bucket, token bucket per masked IP). Testnet funds only, but nothing on-chain prevents it.
- **Recommendation**: (a) service: require `maxFeePerGas <= k x current gasPrice` and `maxPriorityFeePerGas <= small tip cap`, and `preVerificationGas <= calldata-derived bound (e.g. 21k + 16 x bytes + margin)`; (b) contract: add immutable caps in `validatePaymasterUserOp` (revert if `maxPriorityFeePerGas`, `maxFeePerGas` or `preVerificationGas` exceed them) so a stolen or sloppy signer cannot be abused either; (c) shorten the signature validity window to a few minutes; (d) consider a `postOp`-less design that pays the sponsor via the token fee only and refuses ops whose account cannot cover it (see -03).

### CONTRACTS-POOLS-02 (medium, confidence high): relayer gas griefing, no cap of gas against fee

- **Where**: `packages/pool-relayer/src/chain.ts:87-95` (`estimateContractGas`, limit `= 1.2 x estimate`), `service.ts:249-260` (simulate then send with that gas), `service.ts:223-227` and `config.ts:DEFAULTS.gasEstimate = 600_000` (fee priced for 600k gas), `packages/pool-contracts/src/GhostPayShieldedPoolNative.sol:28-37` (payout forwards all gas).
- **Issue**: the relayer never checks that the simulated gas is close to the `gasEstimate` its fee assumes. The `recipient` is withdrawer-chosen. A recipient contract that performs a fixed amount of work in `receive()` makes `estimateGas` converge on a large number; the simulation succeeds, the tx succeeds, the relayer pays all of it and receives a fee worth ~600k gas. Loss budget only charges mined reverts (`service.ts:285-287`), not expensive successes. ERC-20 pools are exposed through token hooks or a recipient that triggers expensive token logic, less directly.
- **PoC** (`RelayerGasGrief.t.sol`): recipient pushes 150 storage slots; `withdraw gas used 3652993` vs the assumed `600000` (6x; up to the block gas limit is possible with more work).
- **Exploit**: attacker with any valid note submits relays with such a recipient to a public relayer; each costs the hot key up to `maxGasPrice (200 gwei) x ~30M` in the limit; hot-key balance floor probe (0.01 ETH) eventually trips the breaker (denial of service for honest users).
- **Recommendation**: reject when `simulated gas > gasEstimate x (1 + slack)`; send with `gas = min(simulated x 1.2, cap)`; charge the loss budget by `gasUsed x price - fee` on every confirmed relay, not only on reverts; optionally forward a bounded gas stipend to recipients in the pool (changes contract semantics, trade-off with contract wallets).

### CONTRACTS-POOLS-03 (medium, confidence medium-high): PH-4 simulation cannot see inner-execution failure; no balance or allowance pre-check

- **Where**: `payer-sponsor/src/sponsor/service.ts:457-475` and `viemChain.ts:54-64` (`estimateGas` on `handleOps`), `service.ts:404-439` (`checkUserOp`: no `balanceOf(sender)` check).
- **Issue**: `handleOps` does not revert when the account's inner `executeBatch` reverts, so `simulate` returns ok for an op from an account that holds no tokens. The paymaster deposit is still debited for validation, deployment (`initCode`) and the failed execution; the sponsor fee is not paid. Accounting after the fact (`paidFee` check, loss budget charge `receipt.gasUsed x effectiveGasPrice`) is a bound per masked client bucket (`perKeyLimit 1e16` wei/hour, `globalLimit 1e17`) that a client with many IPv6 /64 or proxy IPs can multiply up to the global limit. (Prior audit note `audit-payer-sponsor.md` documents the loss accounting; the missing pre-check is not listed.)
- **Exploit**: request quote, craft a valid-looking batch for a fresh empty account, submit; sponsor pays ~deployment + validation gas from the deposit, receives nothing. Repeat across buckets.
- **Recommendation**: before signing the paymaster data and again before `handleOps`, read `token.balanceOf(counterfactual sender) >= gross + sponsorFee` (the account is fresh, the tokens must already be there) and simulate the inner call with `eth_call` from the sender through `EntryPoint.simulateHandleOp` or a trace of `UserOperationRevertReason`; treat inner failure as simulation failure. Subsumes the loss-budget workaround for this path.

### CONTRACTS-POOLS-04 (low, confidence high): relayer has no in-flight dedupe and an unbounded send-lane queue; per-request pairing check runs in the request path

- **Where**: `pool-relayer/src/service.ts:195-200` (`lane` promise chain, no length cap), `:231-236` (pre-lane checks pass for N identical copies of one valid request while the nullifier is unspent), `:235` (snarkjs verify per copy). Related known item PS-04.
- **Exploit**: one valid proof replayed from many source buckets (each bucket gets burst 20 / 5 tokens per relay) queues N verifications (CPU) and N simulations inside the serialized lane, delaying honest relays by N x RPC latency. Replays after the first mined one revert in simulation (cheap), but the queue and verification cost are unbounded.
- **Recommendation**: dedupe by `(pool, nullifierHash)` while in flight; cap the lane queue length and reject with 503; move verification to a worker thread (PS-04).

### CONTRACTS-POOLS-05 (low, confidence high): record-level rollback and deletion in the external-pools vault are not detected

- **Where**: `external-pools/src/vault.ts:148-150` (AAD = vaultId | logical key, no version or counter), `:315-321` (`init` treats a missing `scopes` record as "no scopes"), `:325-330` (`readIndex` treats a missing index as empty), `:344-351` (`putNote` regression guard exists only in the API).
- **Issue**: an adversary with write access to the storage backend (malicious extension on shared origin, disk) can replace a record with an older valid ciphertext of the same logical key (e.g. note state `exited` -> `confirmed`, causing a later exit attempt on a spent note or hiding the fact) or delete `scopes` / `idx:notes` (clearing `SCOPE_INCOMPLETE`, which then allows reuse of an already-taken deposit index; or hiding notes from `listNotes`). Not a confidentiality break.
- **Recommendation**: add a monotonic counter inside an authenticated header record (updated on every write) and verify it on open; fail if `idx:notes` is missing while the header says notes exist.

### CONTRACTS-POOLS-06 (low, confidence medium): Railgun adapter checks only the unshield leg of the SDK transaction; "verified" status pins proxy bytecode only

- **Where**: `external-pools-railgun/src/adapter.ts` `checkUnshieldTx` (filters `boundParams.unshield !== NONE`, ignores the other transactions in the batch, i.e. the broadcaster fee note recipient and any extra outputs), accounting check `unshieldValue + bf.feeAmount === depositedAmount`; `external-pools/src/codehash.ts:19-33` pins runtime code hash of each manifest contract only.
- **Issue**: (a) a compromised/buggy wallet SDK can send the `feeAmount` portion (bounded by `maxBroadcasterFeeBps`, default 100 bps) to a recipient other than the broadcaster; the adapter does not decode the fee transaction's commitment target. The SDK also holds the wallet keys (`openWallet(seed)`), so the adapter's check is defence in depth. (b) Railgun's `proxy` is upgradeable by governance (the adapter's own header says so); the code-hash of the proxy does not pin the implementation, so a hash match does not prove the logic is the reviewed one. Not exploitable by an outsider; relevant to the trust model the adapter advertises (EP-GEN-4).
- **Recommendation**: also read and pin the EIP-1967 implementation slot (and admin) in `verifyCodeHashes` for proxies; assert exactly the expected set of outputs in the batch.

### CONTRACTS-POOLS-07 (info, confidence high): relayer returns 500 for out-of-range `deadline`

- `pool-sdk/src/wire.ts:24-27` accepts decimal strings up to 78 digits (> 2^256); `pool-relayer/src/service.ts:229` calls `contextOf` which throws a viem `AbiEncodingError` (not a `RelayerError`), surfacing as HTTP 500 `internal_error`. No fund impact; noisy 5xx and miscounted error class. Fix: bound `deadline` and `relayerFee` to `uint256` in `parseWithdrawalWire`.

### CONTRACTS-POOLS-08 (info, confidence high): SDK fee guard looser than deployed pool

- `pool-sdk/src/flows.ts:319` defaults `maxFeeBps` to 1000 while `DeployPool.s.sol` defaults the pool cap to 500 and the relayer default cap is 500. A fee in (500, 1000] bps passes the client check, a proof is generated (tens of seconds), then the relayer or pool rejects it (`FeeTooHigh`). Wastes proofs and may leak timing. Fix: read `MAX_RELAYER_FEE_BPS` from the pool.

### CONTRACTS-POOLS-09 (info, re-verified known): dev ceremony keys are forgeable (C-1, PC-01)

- `pool-circuits/scripts/ceremony-dev.sh` uses a fixed public beacon (`0102...1f20`), no secret contribution; phase 1 `powersoftau new` with tau=1 plus beacon, phase 2 delta=1 plus beacon. Anyone can recompute toxic waste and forge `withdraw` / `ragequit` proofs that drain any pool using `verifiers/*.sol`. Still the only verifier in the repo. Mitigations remain `WrongChain` constructor guard (31337, 11155111, 84532) and `MAX_DEPOSIT`. Note the guard cannot tell an anvil/hardhat fork of a mainnet that is started with `--chain-id 31337` from a local chain, so "testnet only" is an operational rule, not an enforced one. Severity would be critical on any value-bearing chain.

## 4. Re-checked known items (still present, not re-scored)

- **L-1 root-window griefing** (`GhostPayShieldedPool.sol:325-329`): 64 inserts invalidate in-flight proofs; deposits of value 1 are allowed (`_checkDeposit`), refundable via ragequit.
- **I-3 / PC-15 verifier gas burn on malformed points**: relayer pre-verifies with snarkjs (`service.ts:235`), which rejects malformed points before sending.
- **PS-12 artifact hashes supplied by caller** (`pool-prover/src/prover.ts:133-140`).
- **ASP is optional** (`aspEnabled = 0` allowed): ASP exclusion cannot block withdrawal, only ragequit-free private exit with a publisher; matches N6.
- **Silent zero transfer** in `GhostPayConfidentialRouter.payConfidential` (documented item 7): the seller must decrypt to confirm.

## 5. Properties I checked and found to hold (given a sound verifier and sound circuit)

- Nullifier set is shared across `withdraw` and `ragequit`; proof malleability does not re-spend (`GhostPayShieldedPool.sol:177, 211, 332-335`).
- `context = keccak256(abi.encode(w, SCOPE)) % P` covers recipient, relayer, fee, feeTo, deadline, aspPublisher, announce; SDK `contextOf` (`withdrawal.ts:41-48`) uses the same dynamic-tuple encoding (offset word included).
- State changes precede transfers; all entry points `nonReentrant`; ERC-20 exact-delta checks on every pull and push; `depositWithPermit` nonce consumed before external calls, high-s rejected, fee recipient bound.
- `PoolLeanIMT.insert` equals zk-kit `_insert` (read diff); root window `size - sizeAtRoot < 64`; root 0 rejected; size-1 root = leaf matches circuit depth 0.
- Circuit: `Num2Bits(128)` on `withdrawnValue`, `existingValue`, `remainingValue` prevents field wrap; depth range-checked with `Num2Bits(6)` before `LessEqThan`; siblings above depth forced 0; empty sibling forces left child; ASP fields forced 0 when `aspEnabled = 0`; `aspEnabled` boolean; `existingNullifier != newNullifier`. A prover cannot present an internal LeanIMT node as a leaf without a Poseidon-3 / Poseidon-2 cross-width collision.
- Registry re-publication / supersede / grace logic consistent (checked all `publish` sequences by hand).
- PH-2/PH-3 `RouterCall.matches` compares full 32-byte words for token, stealth, gross; signatures bind payer/delegate, chain, router, nonce; nonces consumed before external calls; `address(this)` signer check makes the delegate inert at its own address.
- PH-4 account: only EntryPoint can validate/execute; paymaster `view` validation touches immutables only; hash includes chain id, paymaster address, validity window, all op fields except the paymaster signature.
- `payer-sponsor` PH-2/PH-3 paths revert in simulation when the payer lacks funds (unlike PH-4, see -03); stale 7702 authorisation handled by `paidFee`.

## 6. Not reviewed / limits

- No real ceremony exists; circuit soundness beyond reading (no circomspect, no fresh mutation run, no R1CS-level analysis, no re-compilation, did not re-derive the verification key from the zkey or diff `verifiers/*.sol` against a snarkjs export).
- Did not re-run the existing pool-contracts, circuits, SDK, relayer, e2e, Echidna or Slither suites; only the two PoCs above and the inherited ERC-4337 test file (22 existing tests passed alongside).
- `relayer-guard`, `secret-box`, `core-crypto`, `apps/relayer`, `apps/web` integration (the pool packages are not imported by `apps/*` at this commit).
- `external-pools-privacypools`: `sdk-crypto.ts`, `state.ts`, `derive.ts`, tests; upstream 0xbow contracts and circuits; `external-pools` mock adapter and ledger; `confidential-amounts` `ledger.ts`, cleartext backend, `zama.ts`, `calldata.ts`; Zama fhEVM ACL semantics, OZ `ERC7984ERC20Wrapper`, `finalizeUnwrap` flow, HCU limits, KMS/gateway trust (all third-party and mock-tested only).
- ERC-4337 ERC-7562 validation-scope rules against a real bundler (EXTCODESIZE on the not-yet-deployed sender in the factory, reputation of an unstaked paymaster); only reasoned about.
- Deploy scripts of `payer-hiding-contracts` and `confidential-contracts`, `pool-circuits/foundry` verifier tests, `.gas-snapshot` files, licence issues (GPL-3.0 verifiers/snarkjs in an `UNLICENSED` repo), `THIRD_PARTY.md`.
- Economic modelling of fee conversion (`rate`, `gasEstimate`) and quote slack beyond the gas-cap issue in -02.
- Browser/Worker behaviour, WASM loading, timing and side channels of the prover and SDK.
