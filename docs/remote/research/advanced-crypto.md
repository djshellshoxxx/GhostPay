# Research: advanced cryptographic privacy for GhostPay (EVM + Bitcoin stealth payments)

**Status:** research only, findings not decisions. No source, test, config or other doc was changed. Branch `claude/remote-extensions-1`, written 2026-10-21. Companion docs (not duplicated here): `docs/remote/anonymization-research.md` (pools, CoinJoin, PayJoin, legal), `docs/remote/privacy-specs/network-privacy.md` (Tor/I2P/Nym/OHTTP transport, two-server PIR roadmap, Helios).

## 0. Evidence rules and reachability

| Tag | Meaning |
|---|---|
| **[P]** | Primary text fetched this session from `raw.githubusercontent.com` (spec repos, BIP/ERC repos, project READMEs/LICENSE files) on 2026-10-21 and grepped. Quoted facts are from that text. |
| **[R]** | This repository's code, read this session (file:line). |
| **[U]** | Unverified: recalled, inferred, or the authoritative page was unreachable. Re-check before relying on it. |

**Reachable:** `raw.githubusercontent.com` only. **Unreachable (HTTP 403 at CONNECT, tested 2026-10-21):** `eprint.iacr.org`, `arxiv.org`, `www.rfc-editor.org`, `datatracker.ietf.org`, `docs.zama.ai`, `github.com` web UI. `gh api` is not enabled for these repos. Consequences: every **RFC number** below is [U] (the IETF repos only give the `-latest` draft source, not publication state); paper claims are taken from the authors' own READMEs that quote their abstracts, not from the papers; the CFRG BBS and RSA-blind-signature draft repos returned 404 at the guessed paths, so BBS and RFC 9474 statements are [U]. All URLs below: retrieved 2026-10-21.

## 1. Baseline: what GhostPay already does that these ideas would touch [R]

- EVM scanning downloads **every** announcement for the announcer + scheme topic, not a per-user query: `packages/chain-adapters/src/logs.ts:207` (`getLogs({ address: o.announcer, topics: [ANNOUNCEMENT_TOPIC, schemeTopic(schemeId)], ... })`). The RPC therefore learns the block range and client IP, not which announcement matched. Matching is local via the 1-byte view tag: `packages/core-crypto/src/stealth.ts:148` (`checkAnnouncement`), comment at `:144` ("the view tag leaks one byte of shared-secret hash by design").
- Bitcoin: BIP-352 receiver primitives exist (`packages/btc-silent-payments/src/receiver.ts:67` `computeTransactionTweak`, `:107` `scanOutputsForTweak`, `:194` `scanTransaction`), not wired to the app (README "Package map").
- Relayer abuse control is **IP-based** plus per-owner: `apps/relayer/src/server.ts:243` (`ipLimiter.take(this.clientIp(req))`), `apps/relayer/src/service.ts:271` (`ownerLimiter.take(s.owner.toLowerCase())`); keys HMAC'd with a rotating in-memory salt (`apps/relayer/src/limiter.ts:42-71`). Defaults `ipPerMinute 30`, `ownerPerMinute 6` (`apps/relayer/src/config.ts:286-288`).

Implication used in the ranking: on EVM, scan **query privacy is already obtained by downloading everything**; PIR/OMR/FMD only buy bandwidth or delegated scanning. The relayer IP limiter is where anonymous-credential crypto has an immediate, concrete job (Tor/OHTTP users share exit IPs, so per-IP buckets either throttle honest users together or are evaded by rotating circuits) [U: operational inference].

## 2. Ranked ideas

Scales. **Fit**: how directly it fixes a GhostPay leak/risk. **Effort**: S (<1 wk), M (2-6 wk), L (1-3 mo), XL (>3 mo or external dependency). **Risk**: security/trust/legal/licensing. **Maturity**: Std (published standard + multiple impls), Draft (spec draft + impl), Proto (research prototype), Exp (explicitly "not for production").

### Rank 1. Privacy Pass tokens for relayer rate limiting (blind RSA / VOPRF)

- **What:** client obtains unlinkable tokens from an issuer (after an attester check), redeems one per relayer quote/submit. Replaces or complements `ipLimiter` (`server.ts:243`).
- **Evidence:** IETF WG drafts `draft-ietf-privacypass-architecture` (category info) and `draft-ietf-privacypass-protocol` (category std; "two variants: one that is privately verifiable ... publicly verifiable") [P] https://raw.githubusercontent.com/ietf-wg-privacypass/base-drafts/main/draft-ietf-privacypass-protocol.md , .../draft-ietf-privacypass-architecture.md . Implementations table: `cloudflare/privacypass-ts` TypeScript, Blind RSA (SHA-384, 2048-bit) type 0x0002, draft-11; `raphaelrobert/privacypass` Rust VOPRF+Blind RSA, draft-06 [P] https://raw.githubusercontent.com/ietf-wg-privacypass/base-drafts/main/README.md . `privacypass-ts` and `blindrsa-ts` are Apache-2.0 [P] (LICENSE.txt in each repo). VOPRF draft source present [P] https://raw.githubusercontent.com/cfrg/draft-irtf-cfrg-voprf/main/draft-irtf-cfrg-voprf.md . Published as RFC 9576/9577/9578 (Privacy Pass), RFC 9474 (blind RSA), RFC 9497 (OPRF) [U: rfc-editor unreachable].
- **Fit:** high. Keeps abuse control when clients arrive via Tor/OHTTP; publicly-verifiable type 0x0002 lets the relayer verify without holding the issuer key.
- **Hard part:** the *attester*. Options: on-chain proof the requester owns a stealth address with a pending sweep (links token issuance to that address, so issuance and redemption must be separated in time and by issuer), PoW, or a third-party attester. The unlinkability only holds if issuer and origin do not collude on timing [P: architecture draft "Privacy Considerations" section, line ~1007].
- **Effort:** M (TS lib exists; issuer service + client flow + tests). **Risk:** low crypto risk, medium design risk (attester linkage, issuer key rotation as a tagging channel). **Maturity:** Std [U] / Draft [P].

### Rank 2. BIP-374 DLEQ proofs + BIP-375 PSBT for silent-payment sending

- **What:** let a hardware signer or a second party produce the BIP-352 ECDH share with a DLEQ proof so the coordinator can verify it, per BIP-375 PSBT fields.
- **Evidence:** BIP-374 "Discrete Log Equality Proofs", Status: Draft [P] https://raw.githubusercontent.com/bitcoin/bips/master/bip-0374.mediawiki ; BIP-375 Status: Draft [P] https://raw.githubusercontent.com/bitcoin/bips/master/bip-0375.mediawiki ; BIP-352 Status: Complete, and its footnote on MuSig/FROST senders: "would require participants to perform the ECDH step collaboratively ... it may be necessary for the participants to provide a DLEQ proof", "we do not recommend it due to lack of a security proof (except if all participants are trusted or are the same entity)" [P] https://raw.githubusercontent.com/bitcoin/bips/master/bip-0352.mediawiki line 245.
- **Fit:** medium-high for `packages/btc-silent-payments` (already has sender ECDH `src/sender.ts:82`); prerequisite for any external-signer support.
- **Effort:** S-M (secp256k1 Chaum-Pedersen with BIP-374 tagged hashes + vectors). **Risk:** low (small, vector-checked primitive). **Maturity:** Draft.

### Rank 3. Verifying light clients for RPC integrity (Helios, Colibri)

- **What:** verify `eth_getLogs`/receipts against the sync committee instead of trusting the RPC, so a malicious RPC cannot hide or forge announcements (integrity, **not** query privacy).
- **Evidence:** Helios: MIT [P] LICENSE; `npm install @a16z/helios`, "WASM initialization is handled automatically" [P] https://raw.githubusercontent.com/a16z/helios/master/helios-ts/README.md ; disclaimer "It has not been audited"; checkpoints older than two weeks open "theoretical attacks" [P] https://raw.githubusercontent.com/a16z/helios/master/README.md . Colibri Stateless: MIT, JS/TS bindings, "verifier checks them against BLS signatures", verifies historical data older than ~27h/8192 blocks via `historical_summaries` [P] https://raw.githubusercontent.com/corpus-core/colibri-stateless/main/README.md . Kohaku `@kohaku-eth/provider` abstracts ethers/viem/helios/colibri, marked "UNAUDITED CODE" [P] https://raw.githubusercontent.com/ethereum/kohaku/master/README.md .
- **Fit:** medium. Scanning ranges are historical (`logs.ts:169` pages back through blocks), which Helios handles poorly and Colibri claims to handle [P claim, unverified in practice].
- **Effort:** M. **Risk:** medium (unaudited, bundle size, checkpoint trust bootstrap). **Maturity:** Proto-to-Draft (shipping npm packages, no audit).

### Rank 4. Light-client silent-payment scanning: tweak index + BIP-158 filters, later PIR

- **What:** a server publishes 33-byte per-tx tweak data per block (BIP-352 Appendix A); client downloads all tweaks for a block (query-private), computes candidate outputs, tests them against BIP-158 compact filters, then fetches only matching blocks/txs.
- **Evidence:** BIP-352 Appendix A: "33 bytes per silent payment eligible transaction", sourcing them trustlessly "is still an open question" [P] bip-0352 lines 99, 459-467. BIP-158 Status: Deployed [P] https://raw.githubusercontent.com/bitcoin/bips/master/bip-0158.mediawiki . BlindBit Oracle (tweak index server), MIT [P] https://raw.githubusercontent.com/setavenger/blindbit-oracle/master/README.md and LICENSE.
- **Leak:** the final fetch of matching blocks/outputs reveals interest to the server; mitigate by fetching whole blocks, via Tor, or by PIR (Rank 7). Tweak data integrity is trusted to the index server [P: "open question"].
- **Fit:** high *if* Bitcoin receiving is wired up (today it is not). **Effort:** M. **Risk:** medium (server trust for tweak correctness: a lying server can hide payments, not steal). **Maturity:** Draft/Proto.

### Rank 5. Threshold custody of the spend key (FROST for BTC, threshold ECDSA for EVM)

- **What:** split the seller's spend secret across devices; stealth/silent-payment one-time keys are additive tweaks of it, so threshold signing with a public tweak works for Schnorr; for ECDSA it requires library support for additive key derivation.
- **Evidence (Schnorr):** FROST CFRG draft source [P] https://raw.githubusercontent.com/cfrg/draft-irtf-cfrg-frost/master/draft-irtf-cfrg-frost.md (RFC 9591 [U]). ZF `frost` crates include `frost-secp256k1-tr` (Taproot) and `frost-rerandomized`; NCC audit covered ed25519/secp256k1/ristretto255 and "does not include frost-secp256k1-tr and rerandomized FROST" [P] https://raw.githubusercontent.com/ZcashFoundation/frost/main/README.md . ChillDKG `BIP: ?` "Status: Draft" [P] https://raw.githubusercontent.com/BlockstreamResearch/bip-frost-dkg/master/README.md . BIP-327 MuSig2 Status: Deployed [P].
- **Evidence (ECDSA):** `coinbase/cb-mpc` MIT [P] LICENSE.md; provides 2-party HD derivation "not BIP32-compliant, but is indistinguishable from it" and threshold ECDSA with EC-DKG; native C++ with C API [P] https://raw.githubusercontent.com/coinbase/cb-mpc/master/README.md . `bnb-chain/tss-lib` MIT, Kudelski audit Oct 2019 [P]. `silence-laboratories/dkls23`: audited by Trail of Bits but licensed "NON-COMMERCIAL USE LICENSE AGREEMENT" [P] LICENSE, i.e. **not licensable** for GhostPay without a commercial deal. `ZenGo-X/multi-party-ecdsa` GPL-3.0 [P] (copyleft, conflicts with a permissive static app [U]).
- **Fit:** medium: a security gain (no single device holds `b_spend`), no direct privacy gain. Receiver-side only; BIP-352 discourages threshold *senders*.
- **Effort:** L (BTC) / XL (EVM, needs WASM build of a C++/Go lib and an interactive multi-device UX). **Risk:** high (MPC implementation bugs are key-loss bugs; tweak handling outside audited paths). **Maturity:** Std/Draft (FROST), production libs exist for ECDSA.

### Rank 6. Anonymous credentials for merchant attributes (BBS, Semaphore-style membership)

- **What:** seller proves "verified merchant" / "member of allowlist" to a payer or relayer without a stable identifier; or a payer proves eligibility without revealing which credential.
- **Evidence:** CFRG BBS draft repo unreachable at tried paths (404) [U]. Implementations: `mattrglobal/pairing_crypto` Apache-2.0, "has not undergone an independent implementation audit" [P] README + LICENSE; `docknetwork/crypto` Apache-2.0 [P] LICENSE. `w3f/ring-proof` (Plonk-based ring/one-of-many proof over a committed key list) MIT, "The code has not been audited" [P] https://raw.githubusercontent.com/w3f/ring-proof/master/README.md . Semaphore covered in `anonymization-research.md` §5.5.
- **Fit:** low-medium; no current GhostPay feature needs attribute proofs. BBS uses BLS12-381 pairings, verifiable on EVM only via a ZK wrapper or EIP-2537 precompiles [U].
- **Effort:** L. **Risk:** medium (unaudited libs, draft churn). **Maturity:** Draft/Proto.

### Rank 7. Single-server PIR for scanning (SimplePIR/DoublePIR, YPIR, Respire, FrodoPIR)

- **Evidence:** SimplePIR README (abstract): 10 GB/s/core server; 1 GB DB needs a 121 MB client hint then 242 KB per query; DoublePIR 16 MB hint, 345 KB/query; "**Warning**: This code is a research prototype"; MIT [P] https://raw.githubusercontent.com/ahenzinger/simplepir/main/README.md . YPIR (USENIX Security, eprint 2024/270), MIT [P] https://raw.githubusercontent.com/menonsamir/ypir/main/README.md . Respire (eprint 2024/1165, small records) [P] README. FrodoPIR MPL-2.0, "research prototype. Do not use it in production" [P]. Spiral MIT [P].
- **Fit:** low for EVM today (full download already query-private, §1); medium for Bitcoin Rank 4's last step and for mobile clients with long offline gaps. Two-server PIR is already on the network-privacy roadmap (requires non-collusion).
- **Effort:** L (server + WASM client). **Risk:** medium (prototype code, hint sizes on mobile). **Maturity:** Proto.

### Rank 8. Delegated detection: Fuzzy Message Detection and Oblivious Message Retrieval

- **Evidence:** Penumbra protocol docs on S-FMD (sender-set false-positive rate; cites Beck-Len-Miers-Green eprint 2021/089) [P] https://raw.githubusercontent.com/penumbra-zone/penumbra/main/docs/protocol/src/crypto/fmd.md . OMR (Liu, Tromer), MIT; detector ~0.021-0.030 s/msg single-thread with/without Intel-HEXL in one config, ~0.065-0.25 s/msg in others; "<5 bit/msg digest ... compared to 926 bit/msg for the current solution used by Zcash" [P] https://raw.githubusercontent.com/ZeyuThomasLiu/ObliviousMessageRetrieval/master/README.md . ZIP-307 (Zcash light client protocol) [P] https://raw.githubusercontent.com/zcash/zips/main/zips/zip-0307.rst .
- **Fit:** low. Needs a new announcement field (FMD clue / OMR clue) emitted by the router, i.e. a contract and ERC-5564 metadata change; ERC-5564 only fixes byte 0 as the view tag [P] erc-5564.md line 115, so extra bytes are allowed but nobody else would read them [U]. FMD leaks statistically to the detector; OMR server cost is ~0.02-0.2 CPU-s per announcement.
- **Effort:** XL. **Risk:** medium-high. **Maturity:** Proto (Penumbra-deployed FMD variant [U]).

### Rank 9. FHE confidential amounts (ERC-7984 on Zama fhEVM / Fhenix CoFHE)

- **What:** stealth addresses hide *who*; ERC-7984 hides *how much*. Paying a stealth address with a confidential token would hide amount and recipient together.
- **Evidence:** ERC-7984 "Confidential Fungible Token", status: Draft, created 2025-07-03; amounts are `bytes32` pointers whose "resolution and manipulation ... are implementation specific"; defines `AmountDisclosed` [P] https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-7984.md . OZ `openzeppelin-confidential-contracts` MIT, "An experimental library for developing on the Zama fhEVM", contracts "must set the coprocessor configuration" [P]. Zama fhEVM: BSD-3-Clause-Clear with "NO EXPRESS OR IMPLIED LICENSES TO ANY PARTY'S PATENT RIGHTS"; README: free "only for development, research, prototyping, and experimentation purposes ... for any commercial use ... companies must purchase Zama's commercial patent license", "all Zama's technologies are patented" [P] https://raw.githubusercontent.com/zama-ai/fhevm/main/README.md , LICENSE; same license on `tfhe-rs` [P]. Trust: decryption via a threshold MPC KMS; whitepaper table "KMS: At least 2/3 are honest" (fraction garbled in text extraction as "23") [P/U] https://raw.githubusercontent.com/zama-ai/fhevm/main/fhevm-whitepaper.pdf . Fhenix `cofhe-contracts` MIT (contracts only; backend license not checked) [P/U]. Inco: repo path 404 [U].
- **Fit:** conceptually medium, practically low: needs the token itself to be confidential (USDC/ETH are not), a host chain with the coprocessor, and a KMS committee trusted for confidentiality forever (ciphertexts are on-chain; a future KMS compromise decrypts history [U: inference from threshold-decryption design]).
- **Effort:** XL. **Risk:** high (patent licence for commercial use, external committee trust, Draft ERC churn). **Maturity:** Draft/Exp.

### Rank 10. Blind-signature ecash (Cashu, Fedimint) as an alternative payment rail

- **Evidence:** Cashu NUT-00 Blind Diffie-Hellman key exchange (`B_ = Y + rG`) [P] https://raw.githubusercontent.com/cashubtc/nuts/main/00.md ; NUT-12 DLEQ proofs so users verify mint signatures [P] .../12.md . Fedimint MIT [P].
- **Fit:** low: custodial mint, Lightning-centric, a different product. Legal exposure of operating or fee-taking on a mint is in the class flagged by `anonymization-research.md` §12 [U here].
- **Effort:** XL. **Risk:** high (custody, legal). **Maturity:** Draft (community NUTs), deployed mints.

### Rank 11. zk light clients / cross-chain verification (SP1-Helios, ZeroSync, BitVM)

- **Evidence:** SP1-Helios verifies source-chain consensus in a destination-chain contract; proofs via the Succinct Prover Network; execution-header mode "+~45k gas per successful operator update" [P] https://raw.githubusercontent.com/succinctlabs/sp1-helios/main/README.md (LICENSE path 404 [U]). ZeroSync: "WARNING: THIS CODE IS STILL FULL OF CRITICAL SECURITY BUGS!" [P]. BitVM: "DO NOT USE IN PRODUCTION!" [P].
- **Fit:** low: GhostPay has no cross-chain feature; client-side verification is served better by Rank 3.
- **Effort:** XL. **Risk:** high. **Maturity:** Exp (Bitcoin side), Proto (Ethereum side).

### Not recommended / out of scope

- **Ring signatures on EVM (Monero-style CLSAG/FCMP++):** no EVM-native deployment found; on EVM "one of many" is done with SNARK Merkle membership (Privacy Pools/Semaphore, see companion doc). `kayabaNerve/fcmp-plus-plus` README is a stub [P].
- **Generic MPC (MP-SPDZ, BSD-3 from CSIRO [P] License.txt):** no GhostPay workflow needs joint computation between mutually distrusting parties.
- **EIP-7503 zero-knowledge wormholes:** status Stagnant [P] https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-7503.md .
- **Bulletproofs (dalek):** MIT; README flags the R1CS feature "UNSTABLE AND UNSUITABLE FOR DEPLOYMENT" [P]; no EVM verifier path without a SNARK wrapper.
- **Noir:** MIT/Apache, "not been reviewed or audited. It is not suitable to be used in production" [P] (README text; may lag releases [U]).

## 3. Comparison table

| # | Idea | Leak/risk addressed | Fit | Effort | Risk | Maturity | Licensable (permissive?) |
|---|---|---|---|---|---|---|---|
| 1 | Privacy Pass tokens for relayer | IP-based limiter vs Tor/OHTTP users (`server.ts:243`) | High | M | Low-Med | Std[U]/Draft | Yes, Apache-2.0 (`privacypass-ts`, `blindrsa-ts`) |
| 2 | BIP-374 DLEQ + BIP-375 PSBT | external/HW signer for BIP-352 sends | Med-High | S-M | Low | Draft | Spec only; implement in-house |
| 3 | Helios / Colibri verified RPC | RPC integrity (hidden/forged announcements) | Med | M | Med | Proto/Draft | Yes, MIT |
| 4 | SP tweak index + BIP-158 | BTC light-client receive | High (when BTC wired) | M | Med | Draft/Proto | Yes, MIT (BlindBit) |
| 5 | Threshold spend key (FROST / tECDSA) | single-device key compromise | Med | L / XL | High | Std/Draft | FROST yes; cb-mpc MIT; tss-lib MIT; DKLs23 **no** (non-commercial); ZenGo GPL-3 |
| 6 | BBS / ring-proof credentials | attribute disclosure | Low-Med | L | Med | Draft/Proto | Apache-2.0 / MIT, unaudited |
| 7 | Single-server PIR | bandwidth; BTC block-fetch leak | Low (EVM) / Med (BTC) | L | Med | Proto | MIT (SimplePIR, YPIR, Spiral), MPL-2.0 (FrodoPIR) |
| 8 | FMD / OMR | delegated scanning | Low | XL | Med-High | Proto | MIT (OMR) |
| 9 | FHE confidential tokens (ERC-7984) | amount visibility | Low (practical) | XL | High | Draft/Exp | **No for commercial use without Zama patent licence**; OZ lib MIT |
| 10 | Blind-sig ecash | off-chain unlinkability | Low | XL | High | Draft | MIT (Fedimint) |
| 11 | zk light clients / BitVM | cross-chain trust | Low | XL | High | Exp/Proto | MIT (BitVM); SP1-Helios licence [U] |

## 4. Suggested sequencing (findings, not decisions)

1. Rank 1 design note: choose attester; specify token type 0x0002; keep `ownerLimiter` (`service.ts:271`) as the per-address control.
2. Rank 2 in `packages/btc-silent-payments` with BIP-374 vectors, independent of app wiring.
3. Rank 3 as an optional verification mode behind the existing RPC abstraction; measure bundle size and historical-range behaviour.
4. Ranks 4/7 only after Bitcoin receive is wired into `apps/web`.
5. Ranks 5, 9 require owner decisions (custody UX; Zama licence/committee trust). Ranks 8, 10, 11: monitor only.

## 5. Unverified items to re-check when the sites are reachable

- RFC numbers and publication state: 9474, 9497, 9576-9578, 9591, 9458 (rfc-editor/datatracker blocked).
- CFRG BBS draft current version and status (repo path 404).
- Zama whitepaper KMS fraction ("23" in extraction read as 2/3) and current host-chain deployments (docs.zama.ai blocked).
- SP1-Helios, Umbra, Kohaku, cashu-ts licence files (404 at tried paths).
- Whether `frost-secp256k1-tr` supports arbitrary additive tweaks needed for BIP-352 spend keys (not read in code).
- Colibri historical-log verification claim (README only, not exercised).
