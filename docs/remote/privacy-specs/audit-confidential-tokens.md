# Self security review: confidential amounts (CT-1 PoC)

**AI-assisted self review by the author of the code. This is not an independent audit.** Date 2026-10-21. Scope: `packages/confidential-contracts` (`GhostPayConfidentialRouter`, `GhostPayTestConfidentialToken`, `TestnetOnly`, mocks) and `packages/confidential-amounts` (TypeScript). Out of scope and not reviewed: OpenZeppelin Confidential Contracts 0.5.3, `@fhevm/solidity` 0.11.1, the Zama protocol contracts/KMS/relayer, `@zama-fhe/sdk` 3.7.0. Evidence tags: **[E]** executed here, **[code]** established by reading code only, **[U]** unverified. Nothing was run against Sepolia or any real relayer.

## Summary

| Sev | Count | IDs |
|---|---|---|
| Critical | 0 | |
| High | 0 | |
| Medium | 5 | CT-01 (fixed), CT-02 (fixed), CT-03, CT-04, CT-05 |
| Low | 7 | CT-06 .. CT-12 |
| Info | 5 | CT-13 .. CT-17 |

Two issues were found and fixed during the build (CT-01, CT-02). The residual risks are mostly inherent to the design (operator trust, fee-aggregation limits, decrypt relayer) and to what could not be verified without a live network.

## Findings

### CT-01 Medium, fixed: caller-chosen token receives ACL rights on router-computed handles
- **Evidence [code]**: the spec's `payConfidential(IERC7984 token, ...)` accepts any address. The router calls `FHE.allowTransient(net, token)` and passes handles derived from its own encrypted fee balance. A malicious "token" contract can pass the router a handle the router is allowed on (for example another token's fee-balance handle) as the transferred amount `t`, receive transient access to `net = t - t/400`, and (whether a transient grant is enough to call `FHE.allow` was not checked [U]) persist it with `FHE.allow(net, attacker)`; it then decrypts the router's accumulated fee balance. Exploit not run (needs a malicious-token PoC under the mock).
- **Impact**: disclosure of aggregated fee totals at any time (not individual payments); defeats the epoch aggregation property only partially. No fund loss: the malicious token cannot move balances of legitimate tokens.
- **Fix**: accepted tokens are fixed at construction (`isTokenAllowed`, 1..8 tokens); every entry point checks it. **Status: fixed**, covered by `reverts TokenNotAllowed...` and constructor tests [E]. Residual: a token in the list is trusted completely.

### CT-02 Medium, fixed: single payment's fee flushable right after an idle period
- **Evidence [code]**: with the spec's `lastFlush` (time of the last flush), after more than 7 idle days the next payment could be flushed in the same block by anyone, giving the fee recipient decrypt rights on that single fee (gross within 400 base units). The old design was not re-run; a regression test `a payment after an idle period cannot be flushed on its own` now passes with `epochStart` [E].
- **Fix**: epoch starts at the first unflushed payment (`epochStart`, reset by `flushFees`). **Status: fixed.** Residual: see CT-03.

### CT-03 Medium, open (accepted for PoC): low traffic still reveals fees
- **Evidence [code]**: if only one payment happens in an epoch, the flushed sum is that payment's fee; the fee recipient (or whoever controls its key) decrypts it and recovers the gross within 400 units. Also, anyone who knows all payments of an epoch from other channels learns each fee from differences. Spec R-4.
- **Remediation**: longer or traffic-adaptive epoch, minimum payment count (needs an encrypted counter), or a fee recipient that is a contract without a decrypting key. **Status: open.**

### CT-04 Medium, open: operator approval is a standing pull right
- **Evidence [code]**: `setOperator(router, until)` lets the router move any amount of the payer's confidential balance until `until`. The contract does not cap `until`; the 900 s cap (CT-PAY-2) exists only in the TypeScript (`assertOperatorWindow`) and a user can bypass it with another wallet. The router only ever pulls from `msg.sender`, so one user's approval cannot be used by another [E: `a third party cannot spend...`].
- **Remediation**: UI must show and enforce the window; consider a router-side check `until <= block.timestamp + 15 min` is impossible (the approval is on the token), so keep client enforcement and reviewable calldata. **Status: open.**

### CT-05 Medium, open: silent zero transfers and announcement spam
- **Evidence [E]**: a payment with insufficient balance succeeds and announces a handle that decrypts to 0 (tests T2, CT-M). Anyone can create such announcements for any stealth address they can derive (they need the public meta-address only).
- **Impact**: fake "paid" signals if the seller trusts announcements; a seller who decrypts every announcement can be forced into many relayer requests (privacy cost and DoS, since each decrypt goes through a hosted relayer).
- **Mitigation present**: `classifyPayment` never reports paid before decryption; scheduler bounds the queue (256). **Remediation**: decrypt only matches whose view tag and invoice context match; rate limit; show "unconfirmed". **Status: open (client policy).**

### CT-06 Low, open: plaintext ETH gas buffer in the payment
The buffer is forwarded in plaintext and its size can fingerprint the payer's wallet or the invoice (L9). Same as the plaintext router. Accept; apply buffer rounding from `hygiene.md`.

### CT-07 Low, open: decrypt relayer sees stealth address, handle, IP, time
Spec 2.5 / R-7. The glue disables SDK telemetry headers and persistence; `DecryptScheduler` randomises timing; per-job transport isolation is **not** implementable through the SDK 3.7.0 options [R] (package DEVIATIONS 5) and needs process-level Tor circuits. **Status: open.**

### CT-08 Low, open: manifest code hashes are not pinned
CT-PAY-4 is implemented (`verifyManifestOnChain`) but all `codeHashes` are `null` (no RPC here). Default strict mode refuses real chains until pinned, which fails safe. A wrong pin or a pin taken from an untrusted RPC would defeat the check. **Status: open until the first reviewed Sepolia deployment.**

### CT-09 Low, open: two implementations of the same rules
`CleartextLedger` (TS) and the Solidity router/wrapper implement the same semantics separately; drift is possible. Mitigation: ABI selectors cross-checked in a test [E]; same fee/zero-transfer vectors. No test runs the TypeScript client against the Solidity contracts [U].

### CT-10 Low, open: mock-only evidence
All contract tests run on `@fhevm/mock-utils` (plaintext coprocessor). They show that the logic and ACL grants are right under the mock's semantics, not that real ciphertext operations, the Sepolia ACL contract, HCU limits or gateway behaviour match. The Hardhat plugin also rewrites `ZamaConfig.sol` at compile time (contracts DEVIATIONS 4): compile for deployment without it. **Status: open until T9.**

### CT-11 Low, open: HCU margin unknown
Measured in the mock: `payConfidential` global HCU 2,049,128, depth 1,453,000; `flushFees` 586,064 / 369,000. The real per-transaction limit was not read from a primary source [U]; if it is lower than recalled (20,000,000 global, 5,000,000 depth) the router may not fit.

### CT-12 Low, open: the testnet guard is a safety net, not access control
`TestnetOnly` checks `block.chainid`; a fork reporting 31337 or 11155111 passes. Nothing prevents an owner-free contract from being deployed on a fork. Accept.

### CT-13 Info: no reentrancy path found
`payConfidential` and `flushFees` are `nonReentrant`; the only external calls are to the allow-listed token, the immutable announcer and the stealth address (ETH forward, covered by `ReentrantStealth`) [E]. ETH is never held (the buffer is forwarded in full; `receive`/`fallback` revert).

### CT-14 Info: ACL grants verified under the mock
Per payment: `t` allowed to router (and payer, token); `netSent` allowed to router, stealth, payer, token; the fee recipient is allowed on no per-payment handle [E: `never allows the fee recipient...`, uses the ACL contract's `isAllowed`]. The fee balance handle is allowed to the router only. No event or topic of a payment equals the gross, net or fee (word-aligned and packed scan) [E].

### CT-15 Info: draft standard and pre-1.0 dependencies
ERC-7984 is a Draft ERC; OpenZeppelin Confidential Contracts is 0.5.x; `@zama-fhe/relayer-sdk` is deprecated but required by the Hardhat plugin; the audit of OZ 0.3.0 is cited in the spec from a search result only [S]. Pins are exact; the adapter isolates the ABI.

### CT-16 Info: licensing, owner decision
Zama code is BSD-3-Clause-Clear and its README requires a separate patent licence for commercial use; repo is UNLICENSED; the new contracts link BSD-3-Clause-Clear and MIT code. Legal is handled by the owner elsewhere; noted once.

### CT-17 Info: stealth key is handed to the SDK as a hex string
`StealthSigner.withKey` passes `0x...` to viem, which JavaScript cannot wipe. The key lives only for one session; the guardrail is `@ghostpay/secret-box` scoping, not a boundary.

## What was checked and held (tests [E])
Fee split `fee == t/400`, `fee + net == t` for 11 boundary values and 1000 random amounts including insufficient balances; conservation of encrypted balances over random wrap/pay/flush sequences; operator expiry at the boundary; input proofs bound to the sender; chain guard refusing chain ids 1, 10, 137, 8453, 42161, 84532, 11155420 on real deployments (throw-away anvil); metadata byte layout; TypeScript chain guard on every entry point; scheduler gap bounds; copy has no forbidden wording.

## Tool runs
- **Slither 0.11.6** (direct solc, because the Hardhat build breaks source maps): `slither contracts/GhostPayConfidentialRouter.sol --compile-force-framework solc --solc <solc-0.8.28> --solc-remaps "@fhevm/solidity=<nm>/@fhevm/solidity @openzeppelin/contracts=<nm>/@openzeppelin/contracts @openzeppelin/confidential-contracts=<nm>/@openzeppelin/confidential-contracts encrypted-types=<nm>/encrypted-types" --solc-args "--allow-paths <nm>,. --evm-version cancun --optimize --optimize-runs 200" --filter-paths "node_modules|@openzeppelin|@fhevm|encrypted-types"` (with `foundry.toml` temporarily moved aside). Router: 4 results, all Informational/Low: `timestamp` x2 (deadline and epoch, intended), `naming-convention` x2 (immutable names in caps). Suppressed inline with justification: `unused-return` on `FHE.allow*` (return values are the handle itself), `missing-zero-check` on the ETH forward (checked in `_validate`), `low-level-calls`. Token and `MockERC20`: 0 results. Mocks not analysed. [E]
- **Echidna 2.3.1**: obtained and run, but the router cannot be deployed under Echidna (chain id 1 is refused by the constructor; FHE host contracts absent). Harness `echidna/EchidnaConfidentialRouter.sol` compiles; **unrun** for its properties. [E for the failure, harness unrun]
- `forge fmt --check contracts`: clean. Solidity build: 0 warnings. `tsc --noEmit` and `eslint` clean for both packages. [E]

## Not verified [U]
Live Sepolia behaviour (T9), relayer acceptance of a fresh EOA (S-2), real HCU limits, Zama KMS threshold, whether the ACL contract emits per-allow events (Q1), `@zama-fhe/sdk` runtime (WASM, key download, permit signing with a stealth key), bundle size and CSP needs, `finalizeUnwrap` latency, equivalence of the TypeScript ledger with the contracts beyond the ABI and shared vectors, Fhenix/Inco adapters (spikes S-3, S-4 not done).
