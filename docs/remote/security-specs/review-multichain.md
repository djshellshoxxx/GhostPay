# Review: docs/MULTICHAIN_SPEC.md + packages/btc-silent-payments + packages/chain-adapters docs vs code

Date: 2026-10-21. Branch: claude/remote-extensions-1. Read-only review; only this file written.
Scope: docs/MULTICHAIN_SPEC.md (MS), packages/btc-silent-payments/{README.md,DEVIATIONS.md} (BR, BD), packages/chain-adapters/{README.md,DEVIATIONS.md,TODO-VERIFY.md} (CR, CD, CT), vs code in those packages plus packages/invoice-schema.
Haiku audit reports in docs/remote/audits/ treated as unverified; not relied on.
Primary sources retrieved 2026-10-21 via raw.githubusercontent.com (bitcoin/bips, ethereum/ERCs). bips.dev and eips.ethereum.org were unreachable (DNS / proxy 403).
- BIP-352 `bip-0352.mediawiki` line 8: `Status: Complete`. https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki
- BIP-321 `bip-0321.mediawiki` line 6: `Status: Complete`. https://raw.githubusercontent.com/bitcoin/bips/master/bip-0321.mediawiki
- ERC-5564 `erc-5564.md`: `status: Final`; announcer at `0x55649E01B5Df198D18D95b5cc5051630cfD45564`, CREATE2 via deterministic deployer. https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md
- BIP-352 backup section (same file, ~line 375): labels SHOULD be included in backup; precompute large label set (e.g. 100k) when labels may have been used; change label m=0 always scanned.

Counts: HIGH 5, MEDIUM 15, LOW 10. Total 30.

## Verified OK (no finding)

- BIP-352 official vectors: `send_and_receive_test_vectors.json` holds 28 entries, 28 sending and 29 receiving vectors. Matches BR:15 and BD:3.
- BIP-352 and BIP-321 status claims in MS:28 are correct (Complete). MS:3 claim "Research checked 2026-10-21" is true for these two.
- `ChainAdapter` member names in MS:10-17 match `packages/chain-adapters/src/adapter.ts:106-114`.
- BTC fee enum: `BITCOIN_FEES` (`packages/btc-silent-payments/src/adapter.ts:36-40`) = not_enforceable on all lines, matches MS:44 Bitcoin row.
- BTC scan keeps scan secret local; tests assert only heights leave (`scan/blindbit.test.ts` "sends only heights").

## Findings

### F1 HIGH. Bitcoin invoices cannot be expressed; cross-chain binding absent
- Location: MS:34 (`chain: bitcoin-mainnet`); MS:14 (`"btc-mainnet"`); `packages/invoice-schema/src/schema.ts:46` (`chainId: number`), `:224` (`safeInt(..., 1, MAX_SAFE_INTEGER)`); `packages/invoice-schema/src/envelope.ts:111,153` (AAD = `"GPI1" || uint64 chainId || signer`); `packages/btc-silent-payments/src/adapter.ts:78` (`inv.chainId !== chainId` check on a string the schema cannot produce).
- Evidence: invoice schema accepts only numeric EVM chainId >= 1. The AAD that binds an invoice to its chain is a uint64. A Bitcoin invoice has no schema representation and no AAD binding. The only chain-mismatch guard is the adapter's own string compare on an unsigned, unencrypted-path object. MS:34 assumes `chain: bitcoin-mainnet` is a valid invoice field.
- Failure scenario: a Bitcoin invoice is produced by a path that bypasses the schema; it carries `chainId: 'btc-mainnet'` but is not bound by the signed envelope; a payer or relayer re-targets it to a different adapter or network.
- Proposed spec text (new MS 3.1 bullet): "Bitcoin invoices MUST be validated by invoice-schema under a versioned schema that includes `chain: 'btc-mainnet' | 'btc-testnet'`, and the envelope AAD MUST bind that chain string (e.g. `GPI1 || len-prefixed chain id || signer`). Adapters MUST reject an invoice whose chain string differs from `adapter.chainId` before any address is derived. Until implemented, Bitcoin invoices MUST NOT be created outside tests."

### F2 HIGH. Fee-recipient and contract verification is not a Tier 1 requirement
- Location: MS:24 (Tier 1 requirements list: announcer, router, relayer, allowlist, feeds, getLogs profile; no fee-recipient or code check). Code: `packages/chain-adapters/DEVIATIONS.md` item 2 ("Fee recipient is not verified from calldata ... a manifest-vs-chain check (`FEE_RECIPIENT()` / `ANNOUNCER()` / `FEE_BPS()` reads, code hash) is not implemented here and is a required release gate"). `docs/operators/chain-enablement-checklist.md:14,21` requires it.
- Evidence: MS:24 says "Fee enforcement: full (router)" but does not require on-chain confirmation that the router's immutable fee recipient, fee bps and announcer match the manifest. The release gate exists only in an operator checklist and a DEVIATIONS note. Manifest-only trust means a wrong or tampered manifest redirects fees silently.
- Proposed spec text (add to MS:24 requirements): "Before a chain is enabled, the deployment MUST be checked on-chain: `GhostPayRouter.FEE_RECIPIENT()`, `FEE_BPS()`, `ANNOUNCER()` and runtime code hash equal the manifest; the check is a CI or release gate with a test that fails on mismatch. Client display of fee recipient MUST come from this verified manifest."

### F3 HIGH. Light-client oracle trust and threat model missing
- Location: MS:35 ("BlindBit oracle ... tweak data per block"); `packages/btc-silent-payments/src/scan/scanner.ts:58-59` (only checks that tweak and output height/hash agree), `:67-75` (txid, vout, amountSats taken from oracle `meta`); `packages/btc-silent-payments/DEVIATIONS.md` (BlindBit section: tweak/utxo semantics, txid byte order unverified; "never run against a real oracle").
- Evidence: scanner validates only self-consistency between two oracle responses. It does not check block headers, prev-hash chain, or tweak/UTXO data against any independent source. A malicious or faulty oracle can (a) omit tweaks, so payments are silently not detected (liveness/censorship, no error), (b) lie about `amountSats` or `txid`, which feed spend construction (F6), (c) present a fake chain tip. MS has no threat entry for any of these and does not say which trust assumption the default mode makes.
- Proposed spec text (new MS 3.2 subsection "Oracle trust"): "The default scanner MUST treat tweak and UTXO data as untrusted. Detection completeness is guaranteed only against an own-node TweakSource or a documented second-oracle cross-check. Any oracle-supplied amount or outpoint MUST be re-verified against a full node before a spend is signed. Scanner output MUST be labelled with its trust source. Threat rows required: withheld tweaks, forged amounts, fake tip, IP and height leakage."

### F4 HIGH. Key storage, backup and label recovery requirements absent
- Location: MS:33-38 (no key lifecycle section). Code: `packages/btc-silent-payments/src/keys.ts:51` ("persist them only encrypted"); `keys.ts:53` `generateSilentPaymentKeys` uses random scalars, not a seed; `bip32.ts` seed path exists but is optional. BIP-352 backup section (bip-0352.mediawiki ~line 375): labels SHOULD be in backup; users who may have used labels SHOULD precompute ~100k labels to recover funds from seed only.
- Evidence: the spec says "generate keys from a fresh seed" (MS:33 item 1) but the default generator produces unseeded random keys. Nothing requires encrypted at-rest storage, a seed-backup format, or label backup. Loss of `b_scan`/`b_spend`/label set means loss of funds.
- Proposed spec text (new MS 3 subsection "Key lifecycle"): "Bitcoin receive keys MUST be derived from a seed (BIP-32 path per BIP-352 with coin_type per network) or the random-key mode MUST export an encrypted backup containing `b_scan`, `b_spend` and the used label set. Secrets MUST be encrypted at rest. Recovery MUST be tested: restore from seed plus label list reproduces all detected outputs in the vector set. Label count MUST be recorded and a recovery scan MUST cover at least 100k labels or the recorded maximum, whichever is larger."

### F5 HIGH. Reorg handling required for Bitcoin but explicitly out of scope
- Location: MS:57 ("scanner reorg handling on both families"); `packages/btc-silent-payments/DEVIATIONS.md` out-of-scope list ("reorg tracking across blocks (only a per-block height/hash consistency check exists)"); `scanner.ts:49` (default `toHeight` = tip, no confirmation depth). Contrast EVM `packages/chain-adapters/src/logs.ts:155-183` (hash check, rollback by `finalityDepth`).
- Evidence: MS:57 requires reorg tests on both families. The Bitcoin code has none. Scanning to tip means a shallow reorg can yield a payment credited to the seller and later removed. No finality depth is defined for Bitcoin anywhere in the code or spec.
- Proposed spec text (replace MS:57 reorg clause): "Bitcoin scanner MUST scan only to `tip - finalityDepth` by default (proposed 6; to be justified in an ADR) and MUST re-scan from the fork point on a hash mismatch against the last processed block. Credit to the seller MUST require the configured confirmation depth. Tests: deep reorg, shallow reorg, and tip-only scanning."

### F6 MEDIUM. Spend path does not require chain-verified input amounts or fee policy
- Location: `packages/btc-silent-payments/README.md:66-72` (`buildSpendTransaction` takes caller `amountSats`, `feeRate` "supplied by the caller"); `DEVIATIONS.md` Spending section (feerate capped at 10 000 sat/vB; no node or mempool fee estimation); MS:36 (spend "built minimal", no requirement).
- Evidence: the taproot sighash commits to input amounts, so a wrong amount yields an invalid or overpaying transaction. Fee is caller-chosen with no bound other than the cap. MS does not state either requirement.
- Proposed spec text (MS:36): "Spend inputs MUST carry amounts and outpoints verified against a full node. Fee rate MUST come from a node or mempool estimator with an absolute ceiling (e.g. 1000 sat/vB, to be justified). The sweep MUST show total fee in sats before signing."

### F7 LOW. Chain id string differs between spec and code
- Location: MS:14 (`"btc-mainnet"`) vs MS:34 (`chain: bitcoin-mainnet`); code uses `btc-mainnet` / `btc-testnet` (`packages/btc-silent-payments/src/adapter.ts:60`).
- Proposed spec text: change MS:34 to `chain: "btc-mainnet"` and add `"btc-testnet"`.

### F8 MEDIUM. Architecture claim contradicts code and chain-adapters README
- Location: MS:7 ("All chains plug in behind `ChainAdapter` (package `@ghostpay/chain-adapters`)"); `packages/chain-adapters/README.md:51` ("Bitcoin and Solana adapters are out of scope for this package version"); `packages/btc-silent-payments/src/adapter-types.ts:1-16` (copied interface, drift test instead of import); `packages/chain-adapters/DEVIATIONS.md` (EVM-shaped interface, follow-up not done).
- Proposed spec text (MS:7): "The `ChainAdapter` contract is defined in `@ghostpay/chain-adapters`. Bitcoin implements it from `@ghostpay/btc-silent-payments` via a discriminated union on `family`. Until that refactor lands, the Bitcoin copy is pinned by drift test `adapter-types.test.ts`, and the two MUST NOT diverge in member names."

### F9 MEDIUM. Bitshala differential-test claim contradicts DEVIATIONS
- Location: MS:37 (Bitshala "used as a differential-test reference only, not shipped"); `packages/btc-silent-payments/DEVIATIONS.md` last lines ("The Bitshala `silent-pay` differential reference (MULTICHAIN_SPEC 3.4) was **not** used (not installed)").
- Proposed spec text (MS:37): "Bitshala `silent-pay` is not used. Differential coverage for Bitcoin is the BIP-352 official vectors plus `@scure/bip32` BIP-32 vectors. A differential reference MAY be added later under its own test task."

### F10 LOW. "@scure/bip32-class primitives" claim does not match code
- Location: MS:33 item 1; `packages/btc-silent-payments/src/bip32.ts:1-7` (own BIP-32 on `@noble/*`); `packages/btc-silent-payments/package.json` (`@scure/bip32` only in devDependencies, used for tests).
- Proposed spec text (MS:33): "BIP-32 derivation is implemented in-package on `@noble/hashes` and `@noble/curves` and is verified against BIP-32 vectors and `@scure/bip32` (dev only)."

### F11 MEDIUM. Stale BlindBit and own-node claims
- Location: MS:35 ("HTTP API"; "optional own-node"); `packages/btc-silent-payments/DEVIATIONS.md` (block-data HTTP routes deprecated, gRPC not implemented, own-node `TweakSource` not implemented, `/filter` not implemented).
- Evidence: the only implemented oracle path is an HTTP route the oracle README marks deprecated. MS describes it as the default without caveat.
- Proposed spec text (MS:35): "Oracle transport: BlindBit HTTP (`/info`, `/tweaks`, `/utxos`) is implemented but deprecated upstream; gRPC is required before production. Own-node `TweakSource` is required before the default mode is considered complete."

### F12 MEDIUM. Oracle network is never checked against the wallet network
- Location: `DEVIATIONS.md` ("`getInfo` does not enforce that `network` matches"); `packages/btc-silent-payments/src/adapter.ts:109-117` (`scan` never calls `getInfo`).
- Failure scenario: a testnet wallet is pointed at a mainnet oracle; tweaks are scanned with testnet-derived keys and produce no matches, or a misconfigured client mixes networks silently.
- Proposed spec text (add to MS:35): "Scanner MUST call `/info` (or equivalent) once per session and fail closed if `network` does not match the adapter network, using the set of network strings verified against the oracle source."

### F13 LOW. Hardware-wallet "UI says so" has no UI
- Location: MS:36; `packages/btc-silent-payments/README.md:76` (out of scope). No UI in this repo for it.
- Proposed spec text (MS:36): "Spend is software-key only. Any surface that spends MUST display 'software signing only' before signing. Requirement is untestable until a UI exists; track as a follow-up."

### F14 MEDIUM. Bitcoin quote path lacks freshness rules
- Location: `packages/btc-silent-payments/src/adapter.ts:80` (`inv.amountSats ?? opts.quotedTokenAmount` used directly as sats); contrast `packages/chain-adapters/src/quote.ts` (staleness, round and future checks); MS:24 and MS:34 (fiat with quote; no source defined for Bitcoin).
- Proposed spec text (MS:34 item 1): "Fiat-denominated Bitcoin invoices MUST use a quote from a source with a maximum age (e.g. 60 s, to be justified), refused when stale or non-positive, and the quoted sats amount MUST be stored in the invoice before payment."

### F15 MEDIUM. flatSecurity status contradicts code
- Location: MS:44 (EVM "Enforced by `PolicyAccountFactory`"); `packages/chain-adapters/DEVIATIONS.md` item 6 (`flatSecurity` is `not_deployed`; manifest schema has no field).
- Proposed spec text (MS:44): "EVM flat security fee: `not_deployed` until `PolicyAccountFactory` is in the manifest schema and verified (see F2 gate)."

### F16 MEDIUM. Token allowlist stated as a Tier 1 fact; code and TODO-VERIFY say none verified on mainnet
- Location: MS:24 ("token allowlist (USDC, USDT, DAI, WETH, native)"); `packages/chain-adapters/src/config/tokens.ts:15-17` ("No mainnet token is listed yet") and `:19-23` (only Sepolia and Base Sepolia USDC); `packages/chain-adapters/TODO-VERIFY.md` (USDT, DAI, WETH, native unverified; all addresses from search snippets). DAI is `permit: false` by design, so gasless sweep is unavailable for it.
- Proposed spec text (MS:24): "Token allowlist: USDC on Sepolia and Base Sepolia only (verified-listed). Mainnet tokens are a release precondition, each needing an issuer-page check. DAI and any non-ERC-2612 token are payable but NOT sponsorable."

### F17 MEDIUM. Chain parameters presented as requirements but unverified
- Location: MS:24 ("`getLogs` range cap profile"); `packages/chain-adapters/src/config/chains.ts:34-42` (`getLogsMaxRange: 1000`, `finalityDepth` 12 to 250, `blockTimeMs` all engineering defaults); `TODO-VERIFY.md` lines on chain parameters ("not provider-verified").
- Proposed spec text (MS:24): "Per chain, `finalityDepth`, `getLogsMaxRange`, and `blockTimeMs` MUST be measured against the chosen RPC provider and recorded with date and source before enabling. Values in code are placeholders until then."

### F18 LOW. Quotes disabled but spec implies working price feeds
- Location: MS:24 ("Chainlink feed addresses for quotes"); `packages/chain-adapters/src/quote.ts:36` (`FEEDS` empty).
- Proposed spec text: "Chainlink feeds: none configured. Fiat-denominated EVM invoices are unavailable until feed addresses are verified per chain."

### F19 LOW. "Buffer math per chain" is not a per-chain parameter in code
- Location: MS:24; `packages/chain-adapters/src/fees.ts:102-114` (`calculateBuffer` takes gas and fee inputs; no chain parameter; native symbol not used).
- Proposed spec text: "Gas buffer is computed from caller-supplied `estimatedSweepGas` and `maxFeePerGas` for each chain's native unit; the native symbol is display-only."

### F20 LOW. Sweep destination/owner rules missing from spec
- Location: `packages/chain-adapters/DEVIATIONS.md` item 5 (sweep rejects destination == owner, feeTo == owner, feeTo == destination); MS silent.
- Proposed spec text (MS:24 sweep bullet): "Sweep MUST reject destination, fee recipient and owner equal to each other, because the contract's balance-delta checks revert on them."

### F21 MEDIUM. "Feature 5" is undefined in MS and overstated elsewhere
- Location: MS:30, MS:35 ("mirrors Feature 5"), MS:45 (paid hosted scanning as revenue). `docs/SPEC_REVIEW.md:41` (Feature 5 stage 1 "specified but not built"); `docs/audits/01-completeness-audit.md:10,24` (Feature 5 stages 2-3 specified only).
- Proposed spec text: define the reference ("Feature 5 = local-scanning privacy spec in docs/SPEC_REVIEW.md, stage 1 NOT built as of 2026-10-21") and state that no hosted scanning exists.

### F22 MEDIUM. Hosted scanning revenue line lacks a no-scan-key rule
- Location: MS:45 (paid hosted scanning, "requires the privacy trade-offs of Feature 5"); MS:30 (Frigate "discloses scan keys"); `packages/btc-silent-payments/DEVIATIONS.md` (Frigate `subscribe(scan_private_key, ...)` not implemented by design; key never to transport, tested).
- Proposed spec text (MS:45): "A hosted scanning service MUST NOT receive `b_scan` under any mode unless the user takes an explicit, separately consented action, and that mode is a distinct product with its own terms and threat model. The default and any revenue plan MUST keep `b_scan` local."

### F23 LOW. BIP-352 scan-skip rules not in spec test list
- Location: MS:57 (test requirements); `packages/btc-silent-payments/DEVIATIONS.md` item 6 (SegWit v2+ spends MUST NOT be scanned; no official vector covers it); `src/receiver.ts` `computeTransactionTweak` returns `null`.
- Proposed spec text (MS:57 add): "Negative vectors: transactions spending witness version >= 2, NUMS-only inputs, multisig-style inputs, and labelled-change (m = 0) recovery. Vectors MAY be self-generated and MUST be marked as such."

### F24 MEDIUM. Test requirements are not acceptance criteria
- Location: MS:55-57 ("round-trip across the adapter interface", "property tests", "reorg handling on both families", "amount unit tests").
- Evidence: no thresholds, property names, or pass conditions. Coverage gates exist in package scripts (95/90/95/95) but are not in the spec. Property test library is in devDependencies (`fast-check` 4.10.2) but no property test is named in the spec.
- Proposed spec text (MS:55-57): replace with numbered test IDs T-BTC-1..n, each with input, expected result and owning package. Example: "T-BTC-7: for each official receiving vector with outputs, `buildSpendTransaction` produces a signature that `verifyKeyPathSpend` accepts."

### F25 MEDIUM. No threat model or security requirement IDs
- Location: whole of MS (1-62); no section on adversaries. Related: `docs/threat-model/THREAT_MODEL.md:315` says Bitcoin tier is not integrated, so threat coverage of this tier is absent from the main model too.
- Missing threats: lying or withholding oracle (F3), oracle IP and height leakage (`packages/btc-silent-payments/DEVIATIONS.md` Light-client privacy), reorgs (F5), key loss (F4), fee redirection (F2), cross-chain invoice replay (F1), malicious announcer spam (EVM `logs.ts` skip path, undocumented in MS), compromised signing page (THREAT_MODEL row E).
- Proposed spec text: add section 7 "Threats and requirements" with one row per threat, the mitigation requirement ID, and the test ID from section 6.

### F26 LOW. Sources are secondary and the re-verify rule has no owner
- Location: MS:28 ("verified against BIP-352 status page and ecosystem articles"), MS:59-62 (d-central.tech, spark.money), MS:3 ("Re-verify ... before building each tier").
- Proposed spec text: cite primary sources only (bips.dev/352 and the raw bips repo, ERC-5564 `erc-5564.md`). Add: "Re-verification owner: the tier lead; trigger: before any tier starts."

### F27 LOW. Unsourced third-party claims in Tier 3 and out-of-scope lists
- Location: MS:50 (Wraith SDK, onyx-sdk, "Monero-style ed25519"), MS:51 ("no BIP-352 deployment in mainstream wallets verified"), MS:53 ("no stealth standard verified").
- Evidence: no source given; names not checked in this review. Marked unverified here.
- Proposed spec text: attach a source to each or mark "unverified (2026-10-21)".

### F28 LOW. Announcer address written as an abbreviation
- Location: MS:24 ("canonical ERC-5564 announcer at `0x5564...5564`").
- Evidence: `erc-5564.md` (retrieved 2026-10-21) gives `0x55649E01B5Df198D18D95b5cc5051630cfD45564`, deployed via CREATE2 deployer `0x4e59b44847b379578588920ca78fbf26c0b4956c`, salt `0xd0103a290d760f027c9ca72675f5121d725397fb2f618f05b6c44958b25b4447`.
- Proposed spec text (MS:24): "canonical ERC-5564 announcer `0x55649E01B5Df198D18D95b5cc5051630cfD45564` (ERC-5564 Final), verified on-chain per F2."

### F31 MEDIUM. FEE_SCHEDULE differential claim not executed (cross-spec)
- Location: `packages/chain-adapters/DEVIATIONS.md` item 13 (FEE_SCHEDULE section 4 promises a differential test against the compiled router; none exists). MS:24 "Fee enforcement: full (router)" depends on it.
- Proposed spec text (MS:24): "Fee math parity with the router is established by a differential execution test against the compiled contract, or the fee claim is stated as 'boundary-vector parity only'."

## Summary of spec edits to make (for the lead)

1. MS:7, :14, :34: fix architecture and chain id (F1, F7, F8).
2. MS:24: add on-chain manifest gate, mainnet token status, chain-parameter status, sweep rules, EVM fee parity wording (F2, F16, F17, F18, F19, F20, F28, F31).
3. MS:33-38: add key lifecycle, oracle trust, reorg depth, spend rules, fee policy; fix Bitshala, bip32, hardware UI wording (F4, F3, F5, F6, F9, F10, F13).
4. MS:35, :45: oracle transport, network check, hosted-scan key rule, Feature 5 definition (F11, F12, F21, F22).
5. MS:44: flatSecurity status (F15).
6. MS:55-57: numbered test IDs and negative vectors (F23, F24).
7. New section 7: threats and requirements (F25). Sources section: primary sources (F26, F27).

No code was changed. No git commit made.
