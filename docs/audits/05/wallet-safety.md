# Audit 05 - wallet-safety

AI-assisted review, not an independent professional audit. Snapshot: commit 88de0018b86884d49d70d269c430bdcbb39a0b4f (read-only worktree). Static review only; no code executed, no forge PoC written.

## Summary

Scope: `packages/tx-review`, `packages/address-safety`, `apps/web/src/lib/{sweep,wallet,txGuard,pay,payExec,displayText}.ts`, `apps/web/src/views/Sweep.tsx`, `apps/web/src/features/registry`, `packages/chain-adapters/src/registry.ts`.

No decoder bypass found in `tx-review`: closed selector table, canonical re-encode check, zero-address and value rules, exact-type EIP-712 matching, fail-closed `review`. The weaknesses are in how the libraries are wired and what they are compared against:

- The address-poisoning control in the sweep flow compares the destination only with the stealth address and GhostPay contracts. The user's own addresses are never supplied. `fingerprint`, `describeDestination` and `classifyDestination` are unused. (01)
- `metaAddressFingerprint` imports `node:crypto` and is called from the browser Pay view. (02)
- The registry lookup accepts non-checksummed mixed-case addresses and shows no fingerprint, while telling the user the entry is authentic. (03)
- Most `guardTx`/`guardTypedData` calls compare bytes with an intent built from the same variables, so only the policy half is independent. The simulation fails open. (04, 05)

Findings: 0 critical, 0 high, 3 medium, 8 low, 1 info. Some line numbers in 04 and 06 are approximate (marked with ~ or ranges).

## Method

Read all of `tx-review` and `address-safety` source plus their DEVIATIONS.md. Traced each call site in `apps/web` (grep for every export). Read prior audits `docs/audits/03` (S3-09, S3-12, S3-19, S3-22), `docs/remote/round-audits/guards.md` and the threat model. Hand-checked decoder edge cases (dirty padding, trailing bytes, value on non-payable, zero address, buffer method, typed-data type/field order). Checked whether each reviewed value originates independently of the "expected" intent.

Prior items status:
- S3-09 (direct sweep target/fee caps): fixed in code via `guardTx` and `reviewPolicy`; residual in 06.
- S3-12 (bidi in invoice text): fixed in `displayText.ts`; residual gaps in 09.
- S3-19 (approve above gross): fixed (`APPROVE_EXCEEDS_GROSS`).
- S3-22 (wallet-name spoofing): NOT fixed, restated as 08. The address-safety README confirms the wallet-name sanitising is "not wired".

## Findings

### WALLET-SAFETY-01 (medium) Sweep destination poisoning check compares against nothing the user owns
- `apps/web/src/views/Sweep.tsx:87,96,106` call `checkDestination(destination, target.owner, loaded)` without the `known` argument (`apps/web/src/lib/sweep.ts:55`, default `[]`). `trusted` at `sweep.ts:63` is therefore only `[owner, router, sweepRelayer, announcer, feeRecipient]`.
- `describeDestination` (`sweep.ts:71`) and `fingerprint()` have no call sites. No saved-destination store exists. The Sweep view never echoes the normalised destination, and the button signs immediately (`Sweep.tsx:106`). The relayer quote panel shows fee and `feeTo`, not the destination.
- Exploit: attacker sends 0-value dust from a vanity address matching the first and last 4 hex digits of the victim's wallet; the victim copies it from history into the destination field. `parseStrictAddress` passes; `findLookalikes` finds nothing; sweep proceeds. The whole balance goes to the attacker.
- Fix: before signing, require a connected-wallet account or a user-saved address and compare against it. Show `fingerprint(dest)` in a confirmation step. Wire `describeDestination` so the "new address" linkability warning appears.
- Confidence: high on code facts; exploit assumes the user pastes a poisoned address.

### WALLET-SAFETY-02 (medium) `metaAddressFingerprint` uses `node:crypto` in the browser app
- `packages/address-safety/src/meta.ts:1` imports `createHash` from `node:crypto`. `apps/web/src/lib/displayText.ts:1,37` re-exports it. `apps/web/src/views/Pay.tsx:396` calls it unguarded in render. `apps/web/vite.config.ts` has no polyfill or alias. `packages/address-safety/README.md` states "Nothing here has been run in a browser".
- Expected effect: `vite build` externalises `node:crypto`, so `createHash` is missing. The result is a build error or a runtime TypeError in the Pay review view. I did not build, so which of the two is unverified.
- Impact: the only out-of-band payee check on the pay page (seller fingerprint) is unusable. The meta-address is shown truncated by `shortHex(…,18,8)` at `Pay.tsx:394`, so nothing else lets the payer compare. If an error boundary swallows the throw, payments are blocked; otherwise the fingerprint line is silently lost.
- Fix: use `@noble/hashes` sha256 (already a dependency of chain-adapters). Add a browser test.
- Confidence: medium.

### WALLET-SAFETY-03 (medium) Registry lookup: weak address parsing, no fingerprint, overstated assurance
- `packages/chain-adapters/src/registry.ts` `buildLookupCall` uses `isAddress(registrant, {strict:false})`, so a mixed-case address with a wrong checksum is accepted. `RegistryView.tsx:142` does not use `parseStrictAddress` or any lookalike check.
- `RegistryView.tsx:223` shows "Registered by the owner of that address ... Only the wallet itself ... can set this entry". It displays the full meta-address but no `metaAddressFingerprint`. The answer comes from a single user-configured RPC with no proof.
- Exploit: attacker registers their own meta-address under a vanity lookalike of the payee address and poisons the victim's clipboard or history. Or a hostile RPC returns an attacker meta-address. The victim sees an authentic-looking "registered by the owner" result and copies it into later payments.
- Fix: strict checksum parsing, lookalike check against saved payees, show the fingerprint, and reword the notice to say the answer is only as trustworthy as the RPC.
- Confidence: medium.

### WALLET-SAFETY-04 (low) Most pre-sign guards are tautological for the intent half
- `sweep.ts:144-162` builds both `td` and `expected` from the same `order`. `sweep.ts:255-269` (directSweep guard) and `txGuard.ts:guardApprove` do the same. The permit guard takes `nonce` from the typed data itself (`sweep.ts:~187`). Only the policy half of `review` (allowlist, caps, router, deadline) is independent. This is acknowledged as D7 in `review.ts` but is not visible in the UI or docs for these flows.
- `sweep.ts:144` sets `policy.feeRecipient` to the relayer's own `quote.feeTo`, so `FEE_RECIPIENT_MISMATCH` can never fire. The relayer can pick any `feeTo` and take up to `SPONSOR_CAP_BPS` (3%). `getSweepQuote` only rejects `feeTo` equal to owner or destination. By design, but the guard gives a false sense of coverage.
- For wallet payments the app does not sign. `eth_sendTransaction` bytes are built by the wallet, and detection is post-hoc (`verifySubmission`) and only when an RPC is configured.

### WALLET-SAFETY-05 (low) Simulation fails open and is RPC-trusted
- `txGuard.ts:108-112`: any non-revert RPC error or malformed result returns `'unavailable'`, and callers continue (`sweep.ts:282`, `payExec.ts:sendPayment`). A revert is detected by regex on the error message (`REVERT_TEXT`). A hostile RPC simply answers `ok`. The simulation is advisory only and should not be described as a safety control. No state-diff (balance or allowance change) is checked.

### WALLET-SAFETY-06 (low) Direct-sweep fee fields derived from untrusted `eth_gasPrice`
- `sweep.ts:227-230`: `maxFeePerGas = 2*gasPrice`, `priority = gasPrice/10`. The caps are 1000 gwei and 300k gas (`txGuard.ts`). A lying or colluding RPC (which also receives the raw tx) can set `gasPrice` near 500 gwei, giving a priority tip near 50 gwei.
- Native sweeps are limited by the 10% worst-case-fee check, which is computed on `maxFeePerGas`. ERC-20 sweeps have no share cap: up to about 300k x 50 gwei = 0.015 native is spendable as tip from the stealth address's gas balance, to whoever includes the tx (for example a builder the RPC operator routes it to).
- Limited impact; fix by bounding `priority` independently (for example a fixed small gwei ceiling) and not deriving it from `gasPrice`.

### WALLET-SAFETY-07 (low) Destination policy inconsistent across paths
- `review.ts:policyReasons` applies `DESTINATION_IS_PROTOCOL_CONTRACT` only to `direct_sweep`. `relayed_sweep_sig` has no destination rule and `feeRecipient` is excluded in `review` (only `checkDestination` blocks it, `sweep.ts:60`). Neither path blocks a destination equal to the swept token's own contract (ERC-20 `transfer` to the token is a burn) or other allowlisted tokens. The zero address is blocked only incidentally by the decoder (`INVALID_TX_FIELD`), after the user clicked.
- Exploit: user typo or poisoned value equal to a token contract address; funds are unrecoverable.

### WALLET-SAFETY-08 (low) Wallet picker names unsanitised (S3-22, still open)
- `wallet.ts:30-34` `cleanText` strips only C0/C1 controls. Bidi controls, zero-width characters and homoglyphs pass. `rdns` is not verified against the name. Names render at `Pay.tsx:507,515` and `RegistryView.tsx:190`. `sanitizeDisplayText` was written for this ("EIP-6963 wallet names") but is not wired.
- A hostile page script or extension can announce a provider named like a trusted wallet. It already controls the provider it announces, so the impact is picker spoofing and confusion between installed wallets.

### WALLET-SAFETY-09 (low) Display sanitiser coverage gaps
- `text.ts:25,64-72`: mixed-script detection is Latin vs Cyrillic/Greek per whitespace token only. A wholly Cyrillic lookalike word, other scripts (Armenian, Cherokee), and fullwidth Latin (Script=Latin, not NFC-folded) are not flagged. U+2028/U+2029 and the Cf characters U+FFF9-FFFB are not rejected.
- `displayText.ts:30-33`: in the fallback branch (hostile characters present) the mixed-script marker is not applied. Only the code-point markers are.
- Impact is limited to seller-controlled memo and line-item text.

### WALLET-SAFETY-10 (low) Coverage gaps in tx-review integration
- Payer permit typed data is signed via `signTypedDataViaWallet(session, typedDataJson(td))` (`payExec.ts:115`) without `guardTypedData`. Only the sweep permit is guarded.
- Buffer payments return `'skipped-buffer'` (`txGuard.ts:169`), so deadline, fee-share and token-allowlist policy are skipped. The fallback is the preview-vs-calldata check in `assertReadyToSend`. The buffer amount is capped at 0.01 native but derived from the RPC `eth_gasPrice` (`pay.ts:quoteBuffer`).
- Registry transactions are not decoded or reviewed by tx-review at all; the preview is built by the same function as the calldata (`RegistryView.tsx:14-36`).

### WALLET-SAFETY-11 (low) `verifySubmission` does not compare tx type, gas or authorization list
- `wallet.ts:verifySubmission` compares hash, from, to, input, value and chainId. It does not look at type, `authorizationList` (EIP-7702) or fee fields. A wallet or provider that attaches a 7702 delegation or an unrelated authorization in the same tx is not noticed. The receipt check (`pollReceipt`) trusts the RPC status and does not verify logs. Consistent with the documented trust model, but the "network saw exactly the previewed transaction" message (`Pay.tsx:538`) overstates it.

### WALLET-SAFETY-12 (info) Public linkage warning misses retroactive invoice linkage; no code-hash pin
- `RegistryView.tsx:166-170` warns that the wallet and meta-address are linked and that it is permanent. It does not say that every invoice already issued with that meta-address (and `payeeFingerprint`) becomes linkable to the wallet, or that sweeping to the same wallet joins the stealth addresses to it. `assertRegistryDeployed` checks only that code exists, with no code-hash pin (documented in the function comment). The static message that the registry address is "taken from the text of EIP-6538" is not verified by the app at runtime.
- Also: `decodeTypedData`/`decodeTx` documentation says "Never throws", but `Object.keys(undefined)` in `decode.ts:sameTypes/exactKeys` throws on malformed containers. It fails closed (the caller's `refuse` rethrows a raw TypeError), so it is only a robustness point.

## Not reviewed

- Whether `vite build` really fails or breaks at runtime for 02 (not built, not run).
- `packages/chain-adapters` beyond `registry.ts`, `fees.ts`, `router.ts:decodePaymentCalldata` and `sweep.ts:buildSweepTypedData` (permit domain construction, `signSweep`/`signPermit`).
- `GhostPaySweepRelayer`, router and registry contracts (on-chain semantics, whether the relayer contract enforces the signed order as the threat model claims).
- `apps/relayer` quote/submit server behaviour; `relayerClient.ts` beyond quote parsing.
- BTC feature (`apps/web/src/features/btc`), Settings RPC verification (`getRpc`), CSP, keystore and session handling.
- Behaviour with real wallets (MetaMask, Rabby) and EIP-6963 in real browsers; no browser tests run.
- Dynamic testing of any kind (no forge PoC, no fuzzing, no test suite execution).
