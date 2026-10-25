# Architecture Decision Records

Format: Status / Context / Decision / Consequences. All ADRs below are **Accepted** unless noted.

## ADR-0001 Stealth scheme 1 derivation (pinned)
Context: ERC-5564 leaves `h()` implementation to the reference code. Decision: `S = p_eph · P_view` serialised as a 33-byte compressed SEC1 point; `s_h = keccak256(S)` (32 bytes); view tag = `s_h[0]`; `h = int(s_h) mod n` must be non-zero; `P_stealth = P_spend + h·G`; address = last 20 bytes of `keccak256(uncompressed_xy)`; `p_stealth = (p_spend + h) mod n`, reject zero. Matches `@scopelift/stealth-address-sdk@1.0.0-beta.5` (`getSharedSecret` default compressed output, `keccak256` of it). Consequence: differential tests against that package; test vectors regenerated from it and independently cross-checked by a second implementation inside the test suite (pure noble). A change of hash requires a new scheme id.

## ADR-0002 Invoice signing key
Decision: dedicated invoice-signing keypair (secp256k1 ECDSA via noble, EIP-191-style domain-separated digest over canonical CBOR-free JSON bytes), never the spend/view keys. The signature binds the payload; trust requires pinning the signer public key (merchant profile / embed). Bare links: integrity self-check only. UI wording must not say "verified seller".

## ADR-0003 No on-chain invoice id
Decision: no invoice id in any contract call or event. Single-use enforcement is client-side (nonce + expiry in the invoice, and the seller's local record). Consequence: a payer can pay the same invoice twice; sellers reconcile by amount/time from their scanner. Reduces fingerprinting.

## ADR-0004 Libraries and pinned versions
`viem` 2.x, `@noble/curves` 2.x, `@noble/hashes` 2.x, `@noble/ciphers` 2.x, `vite` 8.x, `react` 19.x, `vitest` 5.x, OpenZeppelin Contracts 5.x, Foundry 1.8.5, solc 0.8.28. Exact versions in lockfile and `THIRD_PARTY.md`. No other crypto library. Imports use explicit `.js` subpaths.

*Amendment 2026-10-21 (honest status):* the sentence "no other crypto library" holds for code written in this repository but **not for the installed dependency closure**. The pinned `viem` 2.57.7 depends on `@noble/curves` 1.9.1 and `@noble/hashes` 1.8.0, `ox` brings `@noble/*` 1.x including `@noble/ciphers` 1.3.0, and `@scure/bip32`/`@scure/bip39` bring more 1.x copies, so two major versions of noble are installed and viem's internal signing/hashing runs on the 1.x copies. `THIRD_PARTY.md` section 1 records the details and options (accept and amend, `overrides`, or wait for viem). No decision has been taken; this ADR stays Accepted for GhostPay's own code. Which 1.x modules end up in the web bundle has not been measured.

## ADR-0005 Envelope encryption
Decision: AES-256-GCM via Web Crypto, random 96-bit nonce, key random per invoice, AAD = `"GPI1" || chainId || signerPubKey`. Fragment form `#gpi=v1.<base64url>`. Label: bearer link, anyone holding it can read it.

## ADR-0006 No blocklist / no admin in contracts
Decision: contracts contain no sanctions list, admin, or pause. Sanctions/compliance policy, if any, is applied in the hosted frontend and relayer service (the parts the operator controls), documented in the Terms. Consequence: owner carries compliance responsibility for the services they run.

## ADR-0007 Owner wallet only via deployment manifest
Decision: `FEE_RECIPIENT` is a constructor argument. The UI reads recipient and contract addresses from `deployments/<chainId>.json` (signed in the release). No wallet address appears in source or config defaults. See FEE_SCHEDULE.md.

## ADR-0008 Multi-chain strategy
Decision: EVM first (identical contracts, CREATE2 deterministic addresses where feasible), then Bitcoin via BIP-352 Silent Payments, then others per MULTICHAIN_SPEC.md. Chain adapters are pluggable behind one interface; the EVM adapter stays the reference.

## ADR-0009 Sponsorship without ERC-4337 for MVP
Decision: gasless sweep uses ERC-2612 permit plus an EIP-712 sweep authorisation consumed by `GhostPaySweepRelayer`. ERC-4337 deferred to scheme `0x47500002`.

## ADR-0010 Invoice schema field shapes and signature coverage
Context: the first implementation (packages/invoice-schema) fixed shapes the specs left open. Decision: the signature covers the full canonical plaintext invoice (including private fields) and is verified after decryption; the AES-GCM tag and AAD bind the ciphertext separately. `amountPolicy`, `feePolicy`, `tax` shapes are those in `packages/invoice-schema/src/schema.ts` and are normative for v1. The meta-address decoder accepts only two distinct 33-byte keys (single-key/identical-key forms rejected as a key-reuse hazard). Address inputs must be lowercase hex (`/^0x[0-9a-f]{40}$/`, `packages/invoice-schema/src/schema.ts`); mixed-case and EIP-55 checksummed forms are **rejected**, so a client must lowercase before building an invoice. *(Corrected 2026-10-21: this ADR previously said "lowercase or strictly EIP-55", which the code never implemented; audit 01 section 5 item 5. Accepting EIP-55 would be a schema change and needs a new decision.)* An invalid signature does not throw in `parseFragment`; it returns `signatureValid:false` and the UI must block "verified" wording.

---

## ADR-0011 Supported chains and tokens policy
Status: Accepted (policy). **Nothing is enabled beyond testnets.**
Context: audit 01 G-24, G-27; MULTICHAIN_SPEC section 2 lists candidate chains but code and docs lacked a rule for when a chain or token may be enabled. `chains.ts` lists nine chains, two enabled (Ethereum Sepolia, Base Sepolia, both testnets, without any deployment). `tokens.ts` lists only Sepolia and Base Sepolia USDC, whose addresses came from search snippets rather than the issuer page (`TODO-VERIFY.md`).
Decision:
1. A chain is enabled only when every item of `docs/operators/chain-enablement-checklist.md` is complete and linked in the pull request. Mainnets additionally require an independent audit of the exact commit, an authenticated manifest (ADR-0015, DEPLOYMENT_MANIFEST.md) and an owner-approved fee recipient.
2. Chain and token tables live in code (`chain-adapters`) and change only by reviewed pull request. They are allowlists: an unknown chain or token fails closed (`CHAIN_DISABLED`, token not on allowlist).
3. A token may be listed only if its address is verified from the issuer's official documentation, it passes the router's balance-delta checks on a real deployment, its blacklist/pause/permit properties are documented, and (for relayed sweeps) it is a USD stablecoin with ERC-2612 `permit`. Fee-on-transfer, rebasing and ERC-777-style tokens are unsupported by design. DAI-style permit is unsupported. USDT has no permit and relies on the direct path or the gas buffer.
4. Tier-1 EVM chain candidates remain those in MULTICHAIN_SPEC (Base, OP, Arbitrum One, Polygon PoS, Ethereum, then BNB/Avalanche/Gnosis); Gnosis is not in the code. Bitcoin (BIP-352) and Solana remain planned (`packages/btc-silent-payments` exists but is not integrated).
Consequences: onboarding a chain is slow on purpose. The tables are tiny today and the app can only pay on testnets, and only once a manifest exists.

## ADR-0012 Quote rules (fiat-priced invoices disabled until feeds are verified)
Status: Accepted. Implementation state: code path exists, feature effectively off.
Context: invoices may price in fiat with a quote (DEVELOPER_SPECIFICATION Module C, Playbook Proposal 1). `quote.ts` reads Chainlink `latestRoundData` with positivity, staleness, round-integrity and decimals checks and fails closed, but `FEEDS` is an empty table because no feed address has been verified against docs.chain.link. The Create page still offers "Fiat price" with a warning (audit 01 G-03, W-06).
Decision:
1. **Fiat-priced (`fiat_quote`) invoices are disabled** on every chain until a feed is added to `FEEDS` after verification (address from the oracle provider's documentation, decimals, heartbeat; `maxAgeSeconds` derived from the heartbeat; tests against the real feed on a fork/testnet). Until then the Pay page refuses them with a plain message, and the Create page should hide or disable the option rather than only warn (audit G-03; the change was being made by the web agent when this was written and has not been verified).
2. A quote is a quote plus an explicit token amount, never "exact fiat settlement". The payer sees source, timestamp, token amount, fee and minimum net. Rounding favours the seller on the seller's side and the payer pays the rounded-up amount (`fiatToTokenAmount`), tested by property.
3. Quote adapters are allowlisted (`chainlink` only today; `uniswap-twap` is specified but not built). The app never silently switches source; a failed or stale read blocks payment.
4. Stale, zero, negative or oversized answers, decimals mismatches and L2 sequencer downtime (design not yet built) all block payment.
5. The relayer does not use an oracle: token price is fixed at 1.0 (USD stablecoins only) and the native price is an operator constant. This is acceptable on testnets and must be replaced before mainnet (audit R-03, G-26).
Consequences: the visible product today is token-priced invoices only.

## ADR-0013 Fee behaviour: bypass by direct payment, immutability trade-off, blacklist risk
Status: Accepted (restates FEE_SCHEDULE principles with the consequences found in audits 02 and 04).
Context: FEE_SCHEDULE makes the checkout fee (25 bps), the sponsor fee and the policy-account flat fee enforceable only where funds pass through GhostPay contracts. Recipient and rate are `immutable`; no admin, pause or rescue exists.
Decision and consequences, stated plainly:
1. **Direct payments bypass the fee.** A payer can send to the one-time address without the router. The fee cannot be enforced on direct transfers, forks of the client, or non-EVM tiers. The UI and docs say so and never promise otherwise. Direct payments also skip the router's metadata checks, so their announcements are unverified payer claims (audit S3-02).
2. **Immutability is a deliberate trade-off.** No admin means no rate change, no pause and no key that can be used to redirect fees; it also means a defect or a bad recipient can only be fixed by deploying a new router and shipping a new manifest and release. Old clients keep using the old router.
3. **Blacklist and ETH-rejection risk (audit D5, contracts M-01).** If a token issuer blacklists the fee recipient, or the recipient cannot receive ETH, every router payment of that asset at or above the dust threshold (400 base units) reverts with no on-chain remedy. Requirements for the recipient are in `docs/operators/deployment-runbook.md` section 2: accepts ETH, hardware wallet or multisig, not the deployer key, clean history. Mitigations are operational (monitoring, rehearsed migration); a pull-vault redesign was suggested by the contracts review and is **not adopted**, because it would make the router hold balances.
4. Dust payments below 400 base units pay no fee by rounding. The gas buffer carries no fee.
5. Compliance and tax consequences of collecting a percentage are the owner's responsibility (ADR-0006, FEE_SCHEDULE section 6); a terms page and sanctions-policy decision are still missing.
6. The fee recipient is never in source; it enters only through the deployment manifest (ADR-0007).

## ADR-0014 Policy-account scheme (`0x47500002`): status
Status: **Experimental, contracts only. Not enabled. Do not market as theft-proof.**
Context: `PolicyAccount` and `PolicyAccountFactory` exist with unit, fuzz and invariant tests, but: the router hard-codes scheme id 1 so nothing announces scheme `0x47500002` (contracts review M-02); `core-crypto`, `invoice-schema` (`schemeId: 1` literal) and `chain-adapters` have no derivation, ABI, scanner, vectors or UI; there is no guardian or recovery path, so a lost key locks funds and a stolen key can contest destination changes forever (design analysis D6, contracts DEVIATIONS); the factory's fee-token dependency can freeze counterfactual accounts (M-03); the destination becomes publicly linked after the first withdrawal (D1).
Decision:
1. The scheme stays out of the app, the relayer and every release until a follow-up ADR covers: announcement path (router change or a second router, public-contract change so CONTRACTS_SPEC first), TypeScript derivation with per-chain vectors, scanner and sweep UI, a recovery or guardian design, interoperability review, and an independent audit.
2. The manifest may carry the optional policy fields (the validator accepts them); the `flatSecurity` capability in `adapter.ts` now reports `available` (not `enforced`) when the manifest carries a policy section and `not_deployed` otherwise; audit A-17 recorded a hard-coded `not_deployed`, which has since changed.
3. Documentation describes it as "contracts only, experimental, recovery open". F-SECURE (flat fee) is specified but nothing in the UI can charge it.
Consequences: policy-account code is liability until the above is done; reviewers may reasonably propose deleting it from release builds.

## ADR-0015 Hosting gating
Status: Accepted. **Hosting is intentionally not configured.**
Context: a frontend compromise is total compromise (design analysis D7): a malicious bundle can derive attacker stealth addresses, sign sweeps without wallet confirmation and swap the manifest. At the audited commit the manifest is unauthenticated (S3-01), the in-app release-hash widget is self-attested (S3-04), no release is signed, no key fingerprint is published, and no legal review of the fee model has happened.
Decision: no public instance (Cloudflare Pages, GitHub Pages, IPFS/ENS, Tor, or any domain) and no hosted relayer is operated, advertised or linked from the README until all of these exist and are recorded:
1. Manifests authenticated: compiled into the hashed bundle and read back from the chain before payment is enabled (DEPLOYMENT_MANIFEST.md section 3).
2. Signed releases: signed tag, `SHA256SUMS`, SBOM, release manifest, reproducible build verified on a second machine, signing-key fingerprint published out of band (`docs/operators/release-and-verify.md`).
3. A deployed and smoke-tested testnet deployment with a manifest, recorded with transaction hashes.
4. Owner decisions: fee recipient, licence, terms and privacy notice, sanctions position, legal advice (ADR-0006, FEE_SCHEDULE section 6).
5. A host with header control as primary (Cloudflare Pages `_headers`); GitHub Pages only as a labelled degraded mirror; IPFS/Tor only with their stated limits (`docs/operators/mirror-hosting.md`).
The release workflow therefore stops at a draft GitHub release and contains a disabled publication stub; enabling it requires a new ADR.
Consequences: users cannot "just try it" on a project-run site. This is intended for a pre-audit financial tool.

## ADR-0025 Local invoice-to-payment matching and encrypted receipt archive (G-04)
Status: Accepted (web app only).
Context: on-chain data carries no invoice id (audit G-04). COMPLETION_PLAN 2c offered an invoice reference in announcement metadata (links every payment of a seller across invoices for any chain observer) or local matching (private, less exact).
Decision:
1. **No invoice reference on chain.** Announcements, metadata and payment calls are unchanged. Matching runs only in the seller's browser.
2. **Opt-in registration.** "Create invoice" offers an unchecked box to register the invoice. Only the digest, nonce, chain, asset, expected router net amount (computed from the fee policy) and validity window are stored; line items, memo, fiat totals, meta-address and signer key are not. Fiat-quoted invoices cannot be registered (paid amount unknown in advance).
3. **Storage.** Registrations and archived receipts live inside the existing encrypted reconciliation vault (viewing-key HKDF, AES-GCM, per seller and chain scope, CAS writes, stale-session guards). Document version 2 adds them; version 1 documents upgrade on the next write; older clients cannot read version 2. Bounds: 500 registrations and 500 receipts per scope, enforced on write, decrypt and import.
4. **Matching.** A verified, live, unlinked router-scan observation is a candidate for an open registered invoice with the same chain, asset and exact net amount, observed no earlier than invoice creation minus 5 minutes of clock skew. Result is `exact` only when the pairing is unique in both directions and the observation is not more than 7 days after expiry (scans record observation time, not block time); otherwise `ambiguous` or `none`. Imported or reorg-invalidated observations never take part; an invoice linked to an invalidated observation reopens.
5. **Confirmation.** Nothing is linked automatically. The seller confirms an `exact` proposal; the vault re-runs matching on the current decrypted document inside the CAS loop and refuses anything not still exact. Ambiguous cases can only be resolved by the existing manual annotation. Saturated (read-only) vaults refuse registration, confirmation and archiving; deletion stays available.
6. **Receipts.** Seller-issued receipts can be archived (signature verified on archive), exported as plaintext JSON after a confirmation, and deleted one by one or all at once. A receipt never counts as payment evidence and never feeds matching or links.
7. **Lifecycle.** Removing registrations or receipts never changes observations, links or reorg tombstones. Encrypted backups carry registrations and receipts; import merges by digest or signature, keeps the local entry on a nonce conflict and refuses to exceed the bounds.
Consequences: matching can miss payments made by other clients that compute a different gross, payments of identical amounts stay ambiguous, and late scans downgrade to ambiguous. The vault size and scope identifier remain visible to anyone with access to browser storage; plaintext receipt exports leak payment details if mishandled.
