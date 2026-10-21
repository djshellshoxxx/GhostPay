# Deep security audit: packages/policy-scheme

Scope: `packages/policy-scheme/src/*.ts` (derive, eip712, limits, policy, calldata, router, meta, types, errors; ABI files and tests only skimmed), `DEVIATIONS.md`, cross-read of `PolicyAccount.sol` (`requestWithdraw`, `executeWithdraw`, `cancel`, `_useNonce`, `_checkOwner`) and `GhostPayPolicyRouter.sol` (pay* entry points). Branch `claude/remote-extensions-1`, HEAD 748ae32. Findings only; nothing fixed, nothing committed. Probe files live outside the repo (scratchpad); no source changed.

Evidence tags: [RAN] executed here; [CODE] verified in code at file:line; [UNV] not verified.

Haiku reports in `docs/remote/audits/` were treated as unverified. Only `bugs-policyscheme.md` F1 concerns this package; it is re-verified below as F-05. Its F2 (anvil skipped) is re-verified as I-01. Its F3 (router factory not tied to chain) is [UNV] here (no solc; see I-02).

## 1. Threat model

Assets
- A1 Owner secret `k_owner = p_spend + h` (derive.ts:224, a spendable EOA key per payment). Compromise lets an attacker request withdrawals and propose/cancel destination changes on that one account.
- A2 Viewing secret `v` (derive.ts:177): reveals every payment to the recipient, not funds.
- A3 Payer funds in flight (router calldata, permit signature).
- A4 Recipient unlinkability (policy hash, destination, owner address).
- A5 Integrity of EIP-712 digests the owner signs.

Trust boundaries
- B1 Meta-address string from the payee (unauthenticated channel; derive.ts:90 documents it).
- B2 Deployment manifest (factory, implementation, router, fee recipient) supplied by the caller (policy.ts:547).
- B3 On-chain announcement fields (attacker-controlled bytes) entering the scanner (derive.ts:114).
- B4 Router calldata produced by an untrusted frontend and shown to a wallet (router.ts:329).
- B5 Typed-data objects passed to the signer (eip712.ts:337).
- B6 Limits tree / proof objects possibly deserialized from storage (limits.ts:371).

Adversaries
- X1 Malicious meta-address distributor or manifest supplier. X2 Spam announcer. X3 Malicious dapp/frontend calling this library or assembling calldata. X4 Passive chain observer. X5 Thief with a copy of one owner key. X6 Malicious relayer (only holds signatures).

Reentrancy: not applicable to this package (pure offline library, no calls). On-chain reentrancy is covered by `nonReentrant` on the contracts [CODE: PolicyAccount.sol:143,190,228; GhostPayPolicyRouter.sol:101,119,146,170] and by the contracts round audit, not here.

## 2. Verification run

- `npx vitest run` in packages/policy-scheme: 4 files passed, 1 skipped; 53 passed, 7 skipped [RAN].
- `npm audit --omit=dev` in the package: 0 vulnerabilities [RAN].
- `npm ls`: installed versions equal the exact pins in package.json (noble 2.4.0, viem 2.57.7) [RAN].
- `forge build` could not run: `solc` path `/home/user/tools/solc` missing in this environment [RAN: failed]. Contract/ABI drift checks are therefore textual only.
- Probe suite (8 tests, vitest, scratchpad) [RAN]: results quoted per finding.

## 3. Findings

Counts: Critical 0, High 0, Medium 3, Low 4, Info 5.

### M-01 Medium: `decodePolicyPaymentCalldata` cannot detect payee substitution; documented guarantee is misleading
- Evidence [CODE]: router.ts:327 says "a tampered `stealth` or `owner` is detected here". The function (router.ts:329-354) only checks internal consistency `predictAccountAddress(deployment, policy.owner, policy.policyHash) === stealth` (router.ts:343). It takes no expected payee/token/amount, and returns neither token, gross, minNet nor `msg.value`. `ephemeralPublicKey` and `metadata` are returned unvalidated (router.ts:351-352).
- Reproduction [RAN] (probe F-C): build a valid payment, then build another with `owner`, `policyHash`, `accountAddress` all replaced by attacker values (`0x..E5`, `0xabab..`). `decodePolicyPaymentCalldata(tampered, deployment)` returns normally with the attacker's stealth. Separately, replacing the 57-byte metadata with `ff`*57 in valid calldata also decodes without error.
- Impact: a wallet that uses this function as its integrity check approves a redirected payment (X3 swaps whole payee triple) or a payment the recipient can never find (corrupted R or view tag: funds sit in an account whose owner key the recipient cannot derive from the announcement; the metadata net amount is also unchecked against `value`/gross).
- Suggested fix: change the API to `decodePolicyPaymentCalldata(data, deployment, expected)` and compare against the payee's meta-address-derived `Scheme2Payment` (owner, policyHash, accountAddress, R, view tag), and return token, gross/value, minNet, deadline and parsed metadata (marker, asset, net) so a UI can display and cross-check them; validate `parseCompressedPoint(R)` and metadata structure. Reword the `@security` line.

### M-02 Medium: `policyHash` is a stable per-payee identifier in every payment and is unsalted (offline dictionary attack)
- Evidence [CODE]: policy.ts:471-478 `keccak256(abi.encode(destination, delay, limitsRoot))`, no blinding; router.ts:270 puts `PolicyRef{owner, policyHash}` into every router call; meta.ts:398 publishes `policyHash` in the meta-address.
- Reproduction [RAN] (probe F-G): two payments from one meta-address give identical `policyHash`, different `owner` and `stealth` (`same policyHash across payments: true`). An observer holding the meta-address (or just clustering calldata by `policyHash`) links every payment of the recipient with no viewing key, defeating the per-payment stealth property for the router path. Probe F-H: 140,000 candidate hashes (20,000 addresses x 7 delays) computed in 7.2 s through the public API (about 19,000/s, JS, unoptimised) [RAN]; with `limitsRoot = 0` the preimage is only an address and a delay in 3,600..2,592,000 s, so known exchange/ENS/wallet destinations are testable at GPU rates. The code comment (policy.ts:467-469) acknowledges guessability but not linkability.
- Cross-check: `docs/remote/security-specs/review-policy.md` F-02 reaches the same conclusion from the spec side; `THREAT_MODEL.md:292` (D6) says destination becomes public.
- Suggested fix: include a random 32-byte salt in the policy preimage (requires factory/account change), or accept and document that scheme 2 is linkable per payee and the destination is guessable; do not publish `policyHash` in `PolicyRef` of router calldata if a salted commitment can be used instead.

### M-03 Medium: signed withdrawals are not bound to a destination; TS layer documents this but cannot mitigate it
- Evidence [CODE]: eip712.ts:36 `Withdraw(token,amount,deadline,nonce,limitLeafHash)` has no destination; eip712.ts:212-213 documents "funds always go to the account's destination at execution time". On-chain, `executeWithdraw` reads current `destination` (PolicyAccount.sol:198) and has no expiry beyond `status == Pending`. A pending request outlives a destination change that becomes effective after it.
- Scenario: owner signs W (intended for D1); a key thief proposes D2 and waits `2*delay`; `executeDestinationChange` is permissionless; anyone then executes W and funds go to D2. Same finding as `review-policy.md` F-03; this report confirms the typed-data struct in the TS mirror has no destination field.
- TS-side gap: `buildWithdrawTypedData` / `encodeExecuteWithdraw` (calldata.ts:101) offer no helper that warns when a pending destination proposal exists or that the account's destination changed; callers cannot cheaply check.
- Suggested fix: contract change (bind destination into `Withdraw` or void pending requests on destination change); in this package, document the hazard in `buildWithdrawTypedData` and expose a pre-flight check helper.

### L-01 Low: `signPolicyTypedData` is a general EIP-712 signing oracle despite documenting otherwise
- Evidence [CODE]: eip712.ts:333-335 "Signing anything except a digest from these builders is impossible through this function." The function (eip712.ts:337-364) only checks `td.digest === hashTypedData(td.domain, td.types, td.primaryType, td.message)` (eip712.ts:342-343). `td` is a caller-supplied structural object, so `domain`, `types`, `primaryType` and `message` are arbitrary; the self-consistency check passes for anything.
- Reproduction [RAN] (probe F-A): signed `Transfer(address to,uint256 amt)` under domain `Evil` chain 1 with the real owner key; and signed a genuine `Withdraw` struct under a foreign `chainId 56` / `verifyingContract 0x..dEaD`. Both returned 65-byte signatures. `expectedOwner` is optional (eip712.ts:340), so also any key.
- Impact: low in isolation (the caller already holds the secret) but the stated invariant is false; a UI that passes a deserialized `td` from a dapp signs attacker-chosen typed data with the account owner key. Because the owner key is also a plain EOA key, signatures for other contracts are valid for that EOA.
- Suggested fix: recompute the digest from a validated `{kind, params}` description inside the signer, or at least reject `td` whose `types`/`primaryType`/`domain.name/version` are not those of `POLICY_TYPES`, and make `expectedOwner` mandatory.

### L-02 Low: limit data is trusted without recomputing the leaf (confirms haiku F1) and an inner node is accepted as a "leaf"
- Evidence [CODE]: eip712.ts:228-231 calls `verifyLimitProof(root, lp.leaf, lp.proof)` and compares `amount > lp.limit`, but never checks `limitLeafHash({token, limit, windowSeconds}) === lp.leaf`. `getLimitProof` (limits.ts:371-390) returns `entry.limit` from the (caller-supplied) `LimitsTree` object and `entry.leaf` without recomputing either (limits.ts:384-389), so a tree restored from JSON with edited `limit` yields a proof for the wrong cap.
- Reproduction [RAN] (probe F-B): tree of two tokens; `{...getLimitProof(tree,T1), limit: 10n**30n, windowSeconds: 1n}` is accepted by `buildWithdrawTypedData` for `amount = 1e20`; `encodeRequestWithdraw` then throws (calldata.ts:78), so nothing invalid reaches the chain. Also `proof = {leaf: tree.root, proof: []}` is accepted (`root-as-leaf accepted true`) because `verifyLimitProof` (limits.ts:403-407) treats any 32-byte word as a leaf (double-hash leaf domain separation exists only at build time).
- Impact: the "refuses amount > limit" promise (DEVIATIONS S3) is unauthenticated; the user may sign an order the contract will revert. No fund loss; the contract recomputes the leaf (PolicyAccount.sol:158-161).
- Suggested fix: in `buildWithdrawTypedData` and `getLimitProof`, recompute `limitLeafHash` from `(token, limit, windowSeconds)` and require equality with `leaf`.

### L-03 Low: viewing-secret copy not zeroized when later argument validation throws
- Evidence [CODE]: derive.ts:177 creates `viewing = secretScalarFromBytes(viewingSecret)`; derive.ts:178-179 (`bytes32(...)`, `nonZeroAddr(...)`) can throw and sit before the `try { ... } finally { zeroize(viewing) }` at derive.ts:180-194. Same shape for `parseCompressedPoint` at line 176 (before the copy, fine).
- Reproduction [RAN] (probe F-F): wrap `Uint8Array.prototype.fill`; `checkScheme2Announcement(ann, vk, sp, ['0xzz'], dep)` throws with 0 `fill` calls; the normal path performs 2 (digest and viewing copy).
- Impact: a 32-byte copy of the viewing key lingers until GC on a malformed-policyHash path (reachable from untrusted stored policy lists). Best-effort zeroization only, hence Low.
- Suggested fix: move lines 178-179 above line 177, or start the `try` before creating `viewing`.

### L-04 Low: no authentication or domain binding in the meta-address; a policy-hash swap strands funds
- Evidence [CODE]: meta.ts:370 format has no checksum, chain id, factory or signature (DEVIATIONS S1). `deriveScheme2Payment` (derive.ts:94-111) computes the address for whatever `policyHash` is in the string.
- Scenario: X1 changes only the `policyHash` to `H(attackerDest, delay, 0)`. The payer pays `A(owner_victim_key, H')`. The recipient scans only her own policy hashes (derive.ts:185) and never sees the payment; if she later learns H' she can only withdraw to the attacker's destination. A full meta-address swap (X1 replaces keys) is plain theft and is outside the library, as documented at derive.ts:90.
- Suggested fix: add a version byte + checksum/signature over `(spendPub, viewPub, policyHash, chainId, factory)`; document in README that the string is unauthenticated.

### I-01 Info: anvil cross-check silently skipped by default
- 7 tests skipped when router artifact missing [RAN: 53 passed, 7 skipped]; `anvil.test.ts` is the only on-chain parity check for CREATE2, EIP-712 and merkle proofs [CODE]. Without `REQUIRE_ANVIL=1` in CI, parity regressions go unseen.

### I-02 Info: router ABI pinned to commit 2058a57; contract changed later
- `git log` shows `5057460` (buffer-path policy check order) after `2058a57` [RAN]. Function signatures in `GhostPayPolicyRouter.sol:93-175` match the TS argument order for the four methods [CODE]. Byte-level ABI drift against a fresh build is [UNV] (no solc here). Regenerate ABI via `scripts/gen-abi.sh` before release.

### I-03 Info: scanner view-tag early reject is not early; per-announcement cost about 6 ms
- Evidence [CODE]: derive.ts:134-145 computes ECDH, then `Point.fromBytes(spend).add(BASE.multiply(h))` and keccak/checksum before `tag !== parsed.tag` is compared in derive.ts:184. Doc at derive.ts:151 claims "view-tag early reject first".
- Measured [RAN] (probe F-E): bad tag 6.9-9.7 ms, good tag 5.9-6.3 ms, ECDH alone 5.6 ms per announcement. The tag check would save about 1 ms (about 15%), ECDH dominates. A spammer posting valid-R announcements costs the scanner about 6 ms each per policy-independent step (policy loop at derive.ts:185 adds 3 keccak + checksum per hash).
- Suggested fix: compare `tag` before the second point multiplication; consider batching or a faster ECDH for large scans.

### I-04 Info: hex-length DoS refuted
- `HEX_RE` and `hexToBytes` on 1e6, 1e7, 5e7-char metadata took 23, 31, 136 ms and did not throw [RAN]. `checkScheme2Announcement` keeps its "never throws on malformed on-chain data" promise for this class. No finding.

### I-05 Info: smaller observations
- `sigHex` (calldata.ts:18-22) only checks length 132; it does not verify `v` in {27,28} or low-s. Contract `ECDSA.recover` rejects bad forms (PolicyAccount.sol:330), so impact is a wasted tx.
- `buildPolicyPaymentTx` does not cap `deadline` (router.ts:266); `now` is optional so a stale/zero check can be skipped. For the permit path the same `deadline` bounds the ERC-2612 permit, so a far-future deadline lengthens signature replay exposure. Not enforceable here without payer policy.
- `encodeRequestWithdraw` does not check that the signature recovers to the account owner or matches `td.digest` (calldata.ts:70-90).
- `validatePolicy` (policy.ts:493-498) cannot detect a `destination` that is a contract rejecting native value or equals router/token; withdrawals to such a destination would revert forever (no recovery path per ADR-0014).
- Dependency posture: exact pins, `private: true`, 0 audit advisories [RAN]. `@scopelift/stealth-address-sdk 1.0.0-beta.5` is a devDependency only (differential tests). `coverage/` is gitignored [CODE: .gitignore].

## 4. Reviewed with no finding
- CREATE2 prediction (policy.ts:535-557): strict checksum parsing via `addr`, zero-address rejection, clone bytecode constants match OZ 5.x; parity exercised by vectors/anvil per earlier reports (re-run of anvil [UNV]).
- EIP-712 domain/structs: `finish()` cross-checks the hand digest against viem (eip712.ts:170-181); chain id and verifying contract are in the domain, so cross-chain/cross-account replay is prevented [CODE]; Cancel types use distinct typehashes (eip712.ts:38,40).
- Nonce/replay: unordered nonce bitmap on-chain (PolicyAccount.sol:334-339); TS passes caller nonce; cancel signatures are id-bound and idempotent by design.
- Signing: RFC 6979 deterministic, low-s via noble, recovery self-check, key copy zeroized in `finally` (eip712.ts:344-355). `unsafeRevealSecret` returns a copy [CODE: core-crypto secret.ts:90-92], so zeroizing it does not corrupt the caller's secret.
- Error handling: `PolicySchemeError` messages are fixed strings plus package-chosen field names (errors.ts:469-483), no key/signature/user-value echo; META_RE errors do not include the input (meta.ts:413-415).
- Merkle: sorted leaves, double-hash leaf, commutative inner hash, duplicate tokens refused, one-leaf and empty-tree edge cases handled (limits.ts:338-359).
- Injection: no `eval`, shell, SQL or dynamic import; inputs are regex/strict-typed before encoding.

## 5. Not verified
- On-chain parity (anvil suite, forge tests) not run: no solc/artifacts in this environment.
- Router ABI vs current contract at byte level (I-02).
- Behaviour against real wallets' `eth_signTypedData_v4` UI, hardware wallets, or public networks.
- Independent timing/side-channel analysis of noble operations; JS bigint `h` is not wipeable.
