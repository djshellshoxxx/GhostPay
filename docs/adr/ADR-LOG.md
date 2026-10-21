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
