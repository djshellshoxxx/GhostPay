# Solana port (research and spec, not built)

**Status:** research note, 2026-10-21. Proposed package: `packages/chain-solana` (`@ghostpay/chain-solana`, does not exist yet). Base spec: `docs/MULTICHAIN_SPEC.md` (Tier 3), interface `packages/chain-adapters/src/adapter.ts`.
**Network access during research:** only `raw.githubusercontent.com` and `registry.npmjs.org` were used (session constraint). solana.com docs, docs.rs, crates.io, explorers, RPC endpoints, faucets and any non-raw GitHub pages are blocked and were not fetched. Everything that needs them is marked **unverified** and listed in the last section. Primary sources actually read are in Sources.

## 1. Feasibility verdict

**Feasible. Crypto PoC is S, full port with an on-chain program and audit is L.** Unlike Bitcoin BIP-352, the payer signs a transaction that the GhostPay web app builds, so an ordinary Solana wallet can pay and the app can derive the one-time address itself. Nothing needs payer keys.

Hard facts that shape everything:

1. A Solana account address *is* an ed25519 public key. A stealth address must therefore be an ed25519 point `P` whose discrete log the recipient (and only the recipient) knows. Scheme 1 (secp256k1, keccak, 20-byte addresses) cannot be reused as is.
2. The derived secret `p = k_spend + h (mod L)` is a bare scalar, not a seed. No standard Solana wallet or keypair file can hold it (a 64-byte Solana secret key is seed plus public key, and the signer re-derives the scalar by hashing the seed). Spending needs a custom signer (section 2.4) inside GhostPay software. Hardware-wallet spending is out of scope (unverified that any device exposes an additive-tweak signing path).
3. There is no ratified Solana stealth standard. ERC-5564 defines only secp256k1 scheme 1 and says a new scheme must declare its own scheme id (erc-5564.md, retrieved). Community designs exist (section 8) and none that I could read is audited or safe to adopt as is.
4. Fee enforcement needs an on-chain program (section 4). Without it the fee is `not_deployed` / `not_enforceable` exactly as on Bitcoin.

Recommendation (detail in section 2.5): **ed25519 dual-key, Monero-style cofactor-cleared ECDH on the Edwards curve, SHA-512 domain-separated hash-to-scalar, one-byte view tag, 32-byte ephemeral key R, canonical-and-torsion-free input validation, raw-scalar deterministic-nonce signer.** Announce through a stateless GhostPay announcer program (self-CPI event), paid through a GhostPay router program that splits fee and net. PoC covers derive/scan/spend only, no program, no deployment.

## 2. Scheme

### 2.1 Options considered

| Option | Shape | Verdict |
|---|---|---|
| A. Wraith-style | ed25519 keys; ECDH via Edwards-to-Montgomery X25519; `h = SHA-256("wraith:scalar:" ‖ ss) mod L`; `P = K_spend + h·G`; view tag `SHA-256("wraith:tag:" ‖ ss)[0]` | Right shape; details weak (section 8): no torsion/small-order checks seen, 256-bit reduction, no R in the hash. Use as design input, not as a dependency. |
| B. Monero-style (**recommended**) | `shared = [8]·(r·K_view)` on Edwards, `h = H_s("…" ‖ shared ‖ R) mod L` (wide 512-bit reduction), `P = K_spend + h·G`, `p = k_spend + h` | Same algebra as A with the cofactor handled the way Monero does (`ge_mul8` in `crypto.cpp`, `derive_public_key` = base + `Hs(derivation, index)`·G; read from monero-project/monero master). |
| C. secp256k1 meta-address, ed25519 address from a hash (Nokto / `sol-stealth-sdk`) | `stealthSeed = SHA-256(combinedSecpPubkey)`, `Keypair.fromSeed(seed)` | **Rejected.** The seed depends only on the stealth secp256k1 *public* point, which the sender computes (the SDK even returns `stealthSeed` to the sender), so the sender holds the spend key. This is my reading of `dist/index.mjs` v0.2.0, not run. A stealth address the payer can spend defeats the purpose. |
| D. Any scheme whose ed25519 seed is a function of the shared secret only | same flaw as C | Rejected for the same reason. |
| E. Vault/PDA mode: funds sit in a program-derived account keyed by R, withdrawal needs an ed25519 signature by `P` checked through the ed25519 precompile and the instructions sysvar | no "address = pubkey" requirement | Not for v1: extra account rent, extra tx, and a new on-chain verification path to audit. Keep as a fallback if the address-is-pubkey constraint ever hurts (for example exchanges that reject unusual addresses). Unverified feasibility details. |
| F. Umbra-style mixer / ZK (`@umbra-privacy/sdk` 4.0.0) | on-chain mixer, Groth16 claims, third-party indexer | Different product and threat model, not a stealth-address scheme. Out of scope. |

### 2.2 Notation

Edwards25519 group has order `8·L`, base point `B` has prime order `L = 2^252 + 27742317777372353535851937790883648493`. Points decoded from untrusted bytes may carry a torsion (order dividing 8) component. Scalars are integers mod `L`. `H512(tag, …)` is SHA-512 over `tag ‖ …` with ASCII domain-separation tags; `H_s(x) = int_le(H512(x)) mod L` (64-byte wide reduction, bias about 2^-250, negligible; Wraith's 32-byte reduction is not wrong but wide reduction is the standard remedy).

### 2.3 Algorithm (proposed, scheme id TBD by ADR; placeholder `0x47500003`)

Seller keys (any generation procedure, for example HKDF-SHA512 of a seed, reduced mod L, rejecting 0): `k_spend`, `k_view` ∈ [1, L-1]; `K_spend = k_spend·B`, `K_view = k_view·B`. Because `k·B` always lies in the prime-order subgroup, seller public keys are torsion-free by construction. Clamping is **not** needed for these scalars; clamping only matters to fix the cofactor and bit positions when a scalar is derived from a hash for ECDH.

Meta-address: `st:sol:<hex(K_spend)><hex(K_view)>` (64 bytes) as Wraith does, plus a version tag; final encoding is an ADR. Decoder MUST reject (a) non-canonical encodings (y ≥ p), (b) points not on the curve, (c) the identity and any small-order point, (d) points not torsion-free (`isTorsionFree()` in `@noble/curves` 2.4.0 `abstract/edwards.d.ts`, together with `isSmallOrder()` and `clearCofactor()`), (e) `K_spend == K_view`.

Sender (payer's browser):
1. `r` random in [1, L-1]; `R = r·B`.
2. `shared = [8]·(r·K_view)` (equivalently `[8r]·K_view`); reject identity (cannot occur for validated `K_view`).
3. `h = H_s("GhostPay/sol/v1/h" ‖ enc(shared) ‖ enc(R))`; reject 0.
4. `tag = H512("GhostPay/sol/v1/tag" ‖ enc(shared))[0]`.
5. `P = K_spend + h·B`; address = base58(enc(P)). Reject identity/small order (impossible for torsion-free `K_spend`, kept as a defensive check).
6. Announce `(scheme, P, R, tag, metadata)`.

Receiver (scanner):
1. Decode `R` leniently: invalid, non-canonical, small-order or non-torsion-free `R` means "not mine, skip", never an exception (a hostile announcement must not halt the scan; same rule as `checkAnnouncement` in `packages/core-crypto/src/stealth.ts`).
2. `shared = [8]·(k_view·R)`; reject identity; compute `tag`; compare with the announced tag (about 255/256 early reject).
3. Only on tag match: `h`, `P' = K_spend + h·B`, compare with the announced address in constant-form. Match means the payment is for this seller.

Spend scalar: `p = (k_spend + h) mod L`, reject 0. Before returning, check `p·B == P` and that it equals the announced address (same discipline as `deriveStealthSecret`: never sign with an unverified key).

Cofactor reasoning: multiplying by 8 on both sides sends any torsion component of `R` to the identity, so a hostile `R` cannot make sender and receiver derive different secrets and cannot leak information through the low-order part. Checking torsion-freeness of the *seller* keys matters for a second reason: if `K_spend` had torsion then `P` would too, `p·B ≠ P`, and whether a signature by `p` verifies would depend on whether the verifier is cofactor-less (strict) or cofactored (ZIP-215 style). The Solana SDK source I read currently verifies through `verify_dalek` and carries a comment that SIMD-0376 cleanup will move `verify` to the ZIP-215 (zebra) path (anza-xyz/solana-sdk `signature/src/lib.rs`). So rules are in flux; the PoC produces signatures that verify under **both** (canonical `S < L`, canonical `R`, torsion-free `A`). That is a test requirement (section 13). The SIMD-0376 text itself was not retrieved: unverified.

### 2.4 Raw-scalar signing

Standard Ed25519 derives `(a, prefix)` from `SHA-512(seed)`. The stealth key has no seed. A signature over message `M` (for Solana: the exact serialized transaction message bytes, not a pre-hash; Wraith's docs call the argument a "transaction hash", wording I could not reconcile and which should not be copied) is:

1. `A = enc(P)`.
2. `nonce_prefix = H512("GhostPay/sol/v1/nonce" ‖ le32(p))[0..32]` (a PRF of the secret scalar only; optionally mix 32 fresh random bytes with `M` for hedging, but never reuse a nonce across two different messages).
3. `r_n = int_le(H512(nonce_prefix ‖ M)) mod L`; `R_sig = enc(r_n·B)`.
4. `k = int_le(H512(R_sig ‖ A ‖ M)) mod L`.
5. `S = (r_n + k·p) mod L`, little-endian 32 bytes (canonical, `S < L`). Signature = `R_sig ‖ S`.

No clamping is applied to `p`; a verifier only checks `[S]B = R_sig + [k]A` (or the cofactored form) and never sees how `p` was produced. Wraith's `signWithScalar` uses the same structure with `SHA-256(scalarBytes)` as nonce prefix (dist read from the npm tarball). `@noble/curves` 2.4.0 exposes `Point`, `Fn` arithmetic and `ed25519.verify(sig, msg, pk, { zip215 })`, which is enough to implement this without a new crypto library (ADR-0004: noble only). Self-test: every produced signature must verify with noble `zip215: true`, `zip215: false`, and with `node:crypto` Ed25519 (an independent implementation) in the test suite.

Consequences: stealth keys cannot be imported into Phantom/Solflare/Ledger; the seller sweeps with GhostPay software. A sweep transaction can use the seller's main wallet as fee payer (first signer) while the stealth key signs as authority, so the stealth address never needs SOL for fees. That links stealth address and main wallet on chain in that transaction (same privacy cost as an EVM sweep); the relayer-paid variant avoids it.

### 2.5 Recommendation

Option B with the exact hardening in 2.3. Rationale: same algebra as the community Wraith scheme (so ecosystem scanners can be compared), Monero-proven cofactor handling, domain-separated wide hashing consistent with ADR-0001's "any hash change needs a new scheme id" rule, small PoC surface that fits in `@noble` only. The scheme id and meta-address encoding need an ADR before any release.

## 3. Announcement mechanism

| Mechanism | How the recipient finds it | Problems |
|---|---|---|
| SPL Memo instruction (program is a UTF-8 log writer; source read: logs `Memo (len N)` then the memo, validated as UTF-8 by the `sol_log_` syscall, accepts optional signer accounts) | Needs "all transactions that invoke the Memo program" | Memo is used by arbitrary apps (volume **unverified**), has no way to reference the non-signer stealth address, so there is no per-recipient index. Binary data must be hex/base64 (R plus tag is about 44-70 chars). Only viable as a fallback tag inside an otherwise ordinary transfer. |
| **Custom stateless announcer program** (recommended) | `getSignaturesForAddress(announcerProgramId)` then fetch each transaction and read the event | Needs one program (small audit scope). Event via `emit!` is a log line `Program data: <base64>` (read in anchor `lang/attribute/event`); logs can be truncated, so use `emit_cpi!` (self-CPI, data stored in transaction metadata, which Anchor's own docs call more reliable because RPCs are less likely to truncate CPI information). |
| Account-less event inside the router program | same, with the router id as the scan target | Fuses fee split and announcement. Recommended shape: router **CPIs the announcer**, so there is one scan target (parity with the EVM router calling the canonical announcer) and direct payers can call the announcer alone. |
| Announcement PDA per payment | `getProgramAccounts` filters | Rent per announcement, state growth, memcmp scans are heavy. Rejected. |

Proposed announcer interface (proposal only, no code deployed): `announce(scheme_id: u32, stealth: Pubkey, ephemeral: [u8; 32], metadata: Vec<u8>)`; emits event `{ scheme_id, stealth, caller, ephemeral, metadata }`; `metadata[0]` = view tag; no storage, no authority, no CPI out except the self-CPI event. Router path metadata, parallel to the EVM 57-byte layout: `tag(1) ‖ kind(1: 0 SOL, 1 SPL) ‖ mint(32, zero for SOL) ‖ net(u64 LE, 8)` = 42 bytes. As on EVM, a direct payer can announce anything, so announcements from non-router callers are unverified payer claims; the scanner marks `viaRouter` by checking the program id of the invoking instruction in the transaction (parity with `DetectedPayment.viaRouter`).

Wraith's published announcer works the same way (stateless `emit!`; its sender program transfers and announces atomically); its SDK reads logs for program data with an 8-byte discriminator (npm tarball and `wraith-protocol/contracts` README read). Anchor IDs and deployments in that SDK were **not** checked on chain.

## 4. Fee-split program design (Anchor, proposal only)

Goal: parity with `GhostPayRouter` (`docs/CONTRACTS_SPEC.md` section 1): `fee = gross·25/10_000` rounded down, `net = gross - fee`, `net >= min_net && net > 0`, exact balance deltas, atomic announce. Immutable fee recipient from the manifest (ADR-0007), no admin, no pause.

Instructions (names illustrative):
- `pay_spl(gross: u64, min_net: u64, scheme_id: u32, ephemeral: [u8;32], metadata: Vec<u8>)`
- `pay_sol(gross: u64, min_net: u64, scheme_id: u32, ephemeral: [u8;32], metadata: Vec<u8>)`

`pay_spl` accounts: `payer` (signer), `payer_token` (mut), `mint`, `fee_token` (must equal the ATA of the fixed `FEE_RECIPIENT` for `mint` and the given token program, enforced by address constraint), `stealth_owner` (the stealth public key as `UncheckedAccount`; the program requires it to be on the ed25519 curve so a PDA/off-curve address can never receive funds nobody can sign for), `stealth_token` (ATA of `stealth_owner`, created with the associated-token program's idempotent create, payer pays), `token_program` (Token or Token-2022 through the interface), `associated_token_program`, `system_program`, `announcer` (CPI target).

Flow: validate arithmetic in `u128`; CPI `transfer_checked(payer_token → fee_token, fee)` and `transfer_checked(payer_token → stealth_token, net)` with `payer` as authority (the router never holds funds, so no vault PDA and no CPI signing seeds, which removes the "router must hold zero balance" invariant class); **reload both destination accounts and require the observed deltas to equal `fee` and `net` exactly** (rejects transfer-fee mints and anything that moves a different amount); CPI `announce`. `pay_sol` does `system_program::transfer` for fee and net; it must enforce `net >= rent-exempt minimum for a 0-data account`, because a transfer that would leave a fresh system account below rent exemption is rejected by the runtime (the exact lamport figure, about 890,880 for 0 bytes, is from memory: **unverified**; read it from `getMinimumBalanceForRentExemption` at build time, never hardcode).

Rent. Every payment creates a fresh stealth ATA per mint. A classic 165-byte token account needs about 0.00204 SOL rent-exempt (from memory, **unverified**; Token-2022 accounts carry extra extension bytes, and ATAs for Token-2022 mints are, as I recall, created with an immutable-owner extension, so they cost more; **unverified**). The payer funds it; it is **not** part of the 25 bps fee and the UI must show it separately. The seller recovers it at sweep by `CloseAccount` into the seller's wallet, so the payer effectively donates the rent to the seller. If sellers are expected to receive many tiny payments, rent can exceed the payment: add a minimum-payment rule in the invoice layer.

Upgradeability. Solana programs are upgradeable by default through an upgrade authority; the "no owner, no upgrade" invariant holds only after the authority is set to none (final). Mechanism, and whether tooling also leaves an IDL authority, is from memory: **unverified**. A program that stays upgradeable cannot honestly be described with the EVM claims in `docs/CONTRACTS_SPEC.md`. Mainnet needs an independent audit (ADR-0011 rule 1) plus verifiable build and a recorded program-data hash in the signed manifest (ADR-0015).

Direct payments bypass the fee, exactly as ADR-0013 point 1: a payer can send to the stealth address and call the announcer alone. Nokto's program charges a flat per-announcement lamport fee to a hardcoded recipient (read in `programs/sol-eip5564/src/lib.rs`, `ANNOUNCEMENT_FEE = 2_000_000`); it is likewise bypassable by transferring directly, and a flat per-announcement fee is a different product from a percentage on payments.

## 5. Token-2022 interplay

Extension set verified from `solana-program/token-2022` `program/src/extension/mod.rs` (main): confidential transfer, confidential transfer fee, CPI guard, default account state, group (member) pointer, immutable owner, interest-bearing mint, memo transfer, metadata pointer, mint close authority, non-transferable, pausable, permanent delegate, permissioned burn, scaled UI amount, token group, token metadata, transfer fee, transfer hook, confidential mint-burn. Behaviour notes below are from general knowledge unless stated.

| Extension | Effect on GhostPay | Policy |
|---|---|---|
| Transfer fee | Mint skims a fee on every transfer (struct with `epoch`, `maximum_fee`, `transfer_fee_basis_points`; helpers `calculate_fee`, `calculate_pre_fee_amount` read in the repo). Stealth receives less than `net`. | **Unsupported v1** (exact-delta check rejects it; ADR-0011 rule 3 treats fee-on-transfer as unsupported). A gross-up mode using `calculate_pre_fee_amount` could be a later ADR. |
| Transfer hook | Runs an arbitrary program on every transfer with extra accounts. Breaks "no arbitrary external call" and adds reentrancy surface. | **Reject** at the program (read mint extension types) and in the client allowlist. |
| Confidential transfer | Hides amounts only through ElGamal-encrypted balances; the recipient account must be configured by its owner, which the sender cannot do. Addresses stay public. | Plain public transfers only. Confidential balances **do not** hide the stealth link and cannot be set up by the payer. |
| Permanent delegate, pausable, non-transferable, default account state (frozen) | Issuer can move or freeze funds, pause transfers, or the new stealth ATA may be created frozen, locking funds. | Document per mint. Reject non-transferable and default-frozen mints; permanent delegate and pausable are issuer-risk flags in the token matrix. |
| CPI guard (account-level) | Can block owner-authorised transfers made through CPI from an account that enabled it (semantics from memory, **unverified**). | A payer with CPI guard on cannot pay through the router unless the app uses a delegate flow; test on devnet. |
| Memo transfer (account-level) | Destination can require a preceding memo. | Fresh ATAs do not enable it; no action. |
| Interest-bearing, scaled UI amount | UI-only scaling, raw amounts unchanged. | Display risk only; use raw amounts in invoices. |

Policy mirrors ADR-0011: token allowlist lives in `chain-solana` config, an unknown mint fails closed; the on-chain denylist of extension types is defence in depth. Which production mints (for example USD stablecoins) use classic SPL Token versus Token-2022, and their extensions, are **unverified** here and need the issuer's documentation per ADR-0011 rule 3.

## 6. Scanning cost

- Discovery: `getSignaturesForAddress(announcerProgramId, { before, until, limit })`, newest first, with a stored cursor (`until` = last processed signature). Wraith's SDK calls it with `limit: 1000` and no pagination cursor (read in its dist), so it silently misses history beyond the newest 1000; a GhostPay scanner must page with `before`. Hard maximum per call and rate limits: **unverified**.
- Detail: one `getTransaction` per signature (no server-side event filter), so cost is O(announcements) RPC calls, not O(your payments). JSON-RPC batching and block-level fetch (`getBlock`) reduce round trips; both unverified for limits. Skip entries whose `err` is non-null.
- CPU per announcement: one variable-base scalar multiplication (`k_view·R`) plus a cofactor multiply and two hashes; the view tag then rejects about 255/256, so the second scalar multiplication and point add happen only on tag hits. Unlike ECDH on EVM nothing is cheaper than the single scalar mult; the PoC should record a measured throughput (noble, Node 22, and browser) rather than quoting numbers.
- Spam: the announcer is permissionless, so an attacker can inflate scan work at the cost of a base transaction fee per spam announcement (fee size from memory, **unverified**). Mitigations: the cursor bounds cost to new data; per-signer rate heuristics in the client; optional hosted scanner/indexer (the Feature-5 privacy trade-offs in `MULTICHAIN_SPEC`: serving *all* announcements to a client-side scanner leaks nothing about the viewing key, while sending the viewing key or address-specific queries does).
- History retention: standard RPC nodes may not keep full ledger history; a seller restoring from seed years later needs an archival RPC or indexer (retention policy **unverified**). This is a real recovery risk to disclose.
- After a hit: balances come from `getBalance` / `getTokenAccountsByOwner(stealth)`. Treat the announcement as a claim and trust the observed balance (ADR-0013: announcements from direct payers are unverified).

## 7. Reorg and finality

Commitment levels `processed` < `confirmed` < `finalized` (names and the meaning "voted by a supermajority / rooted" are from general knowledge; slot counts and time to finality **unverified**).
- UI "pending": the transaction landed at `processed`/`confirmed`. Never mark an invoice paid or release goods on these.
- Credit and sweep eligibility: `finalized` only. Scanner passes `commitment: "finalized"` for ledger reads.
- Dropped transactions: a transaction whose blockhash expires before inclusion simply never lands; the payer app tracks `lastValidBlockHeight` and rebuilds with a **fresh ephemeral key** (do not resubmit the same R after expiry: a stale announcement is harmless but wastes the address).
- Forks/skipped slots: a `confirmed` transaction can still disappear before `finalized`; the scanner dedupes by `(signature)`, keeps unfinalized sightings in a separate tentative set and re-reads at `finalized`.
- Atomicity: because transfer and announce are in one transaction, a payment either lands with its announcement or not at all. Direct payers who announce separately can leave transfers without announcements, which are undetectable by design.

## 8. Community designs found (npm registry and raw GitHub only)

Searched the npm registry for `wraith stealth solana`, `onyx-sdk`, `solana stealth address`, `ed25519 stealth address`, `sol stealth`, `eip-5564 solana`, `umbra`. GitHub code search is not available through the allowed hosts, so absence from this list does not mean absence in the wild.

1. **Wraith Protocol** (`@wraith-protocol/sdk` 1.4.5, npm; repo `wraith-protocol/sdk` and `wraith-protocol/contracts` on GitHub; LICENSE read: MIT, "Copyright (c) 2026 Wraith Protocol"; the npm manifest has no license or repository field). Solana entry `chains/solana`: ed25519 DKSAP as in option A; key derivation by signing a fixed message with the wallet and hashing the signature (`wraith:spending:` / `wraith:viewing:`); meta-address `st:sol:<spend32><view32>`; Anchor programs `wraith-announcer`, `wraith-sender`, `wraith-names` (README read, and `wraith-sender/src/lib.rs` read: `send_sol` and `send_spl` transfer and `emit!` an `AnnouncementEvent`; SPL path uses the classic token program interface and takes the stealth token account as an argument). Observations from reading the code (not run): no torsion/small-order check beyond point decoding; `h` from a 32-byte hash reduced mod L; `R` not in the hash; announcement fetch limited to 1000 signatures with no `before` paging; keys depend on the wallet producing a deterministic signature for the fixed message (true for RFC 8032 signers, **unverified** for every wallet) and that signature is effectively a master secret. SDK embeds devnet program ids (not verified on chain). No audit report was found in what I could read; I make no claim either way.
2. **onyx-sdk** (npm `onyx-sdk` 1.0.0, MIT, repo `drexthealpha/OnyX`): I extracted the tarball and searched. The only stealth mention is a doc comment in `src/privacy.ts` that delegates "shield/unshield" to the separate **Umbra** SDK (`@umbra-privacy/sdk`, a mixer/ZK product). **No stealth-address derivation exists in onyx-sdk.** It is not a design to adopt for this scheme.
3. **Nokto / `sol-stealth-sdk`** 0.2.0 (npm, MIT, repo `BOBER3r/nokto-protocol`): "EIP-5564 for Solana"; secp256k1 meta-address `st:sol:1:<02/03…>:<02/03…>`, Anchor program with `register_stealth_meta_address`, `announce`, `stealth_transfer_sol`, `stealth_transfer_token` (Token interface), flat 0.002 SOL announcement fee to a hardcoded recipient, program id claimed for mainnet and devnet (not verified on chain). Spend-key design is flawed (option C: sender can derive the stealth keypair). Worth studying for the program surface, not for the key scheme.
4. **Umbra** (`@umbra-privacy/sdk` 4.0.0): encrypted balances plus mixer; different threat model; out of scope.
5. **Monero** (CryptoNote one-time addresses): the cryptographic ancestor of option B; no Solana relevance beyond the algebra.
6. No Solana-specific ERC/SIMD/SPL stealth standard was found through the allowed hosts. **Not found, not claimed to be nonexistent.**

## 9. Adapter fit

`ChainFamily` in `adapter.ts` already contains `'solana'`; `chainId` strings are `"sol-mainnet"` per `MULTICHAIN_SPEC` (propose `"sol-devnet"`, `"sol-testnet"`). The interface members otherwise assume EVM/secp256k1, so the Solana adapter needs a **side interface in its own package** (as `packages/btc-silent-payments/src/adapter-types.ts` does, with a test pinning member names to the real source) until an ADR widens the shared types. Mismatches in `adapter.ts` / `core-crypto`:

- `RecipientAddress.spendingPublicKey/viewingPublicKey: CompressedPoint` is a branded 33-byte secp256k1 point (`secret.ts`); Solana keys are 32-byte Edwards points.
- `PaymentRequest.router` / `feeRecipient: Address` and `DetectedPayment.stealthAddress: Address` are `0x` hex EVM addresses; Solana uses base58 32-byte keys.
- `PaymentRequest.build(opts: BuildOptions): BuiltPayment` returns an EVM `PaymentTx`; Solana needs a list of instructions plus a recent blockhash and `lastValidBlockHeight`. `BuildOptions.deadline`, `permitSignature`, `buffer` have no Solana meaning.
- `ScanRange { fromBlock: bigint }`: Solana scans by slot or by signature cursor; recommend an opaque cursor plus a slot hint.
- `ViewCapability.viewingSecret: SecretScalar` (secp256k1 range check) must become a scheme-tagged secret.
- `invoice-schema` has numeric EVM `chainId`, `schemeId: 1` literal and EVM `token` addresses (ADR-0010), so Solana invoices need a schema version bump and an ADR. `chain-adapters` `ChainConfig.nativeDecimals: 18` literal type cannot describe SOL (9 decimals).
- Recommendation: a discriminated union on `family` for `RecipientAddress`, `PaymentRequest`, `DetectedPayment`, decided by a follow-up ADR. The PoC package exports no `ChainAdapter` and edits no existing package.

## 10. Fee capability (what is honestly enforceable)

| Line | PoC (no program) | After audited router program | Notes |
|---|---|---|---|
| `checkout` | `not_deployed` | `enforced`, 25 bps, **routed payments only** | Direct transfers bypass (ADR-0013). Not enforceable for wallets or payers that skip the router. |
| `gasSponsorship` | `not_deployed` | `enforced` only for relayer-co-signed sweeps, by relayer-side transaction inspection | Solana fee payer is just the first signer, so a relayer can pay fees natively; the relayer should refuse to sign any sweep that lacks its fee instruction. This is policy in the relayer (like `relayer-guard`), not an on-chain guarantee; state it that way. |
| `flatSecurity` | `not_deployed` | `not_deployed` | No policy-account analogue planned. |

Never advertise the fee until a program is deployed from a verified manifest.

## 11. Effort

| Work | Size |
|---|---|
| `chain-solana` crypto PoC: keys, derive, scan, raw-scalar sign, vectors, tests | S (about 1-2 weeks) |
| Scanner against a mock/recorded RPC with cursor, finality, dedupe | S-M |
| Announcer + router Anchor programs, tests (devnet/local validator), IDLs | M |
| Adapter side-interface and ADRs (scheme id, meta-address, invoice schema) | S |
| Relayer sweep path (fee payer, fee instruction) | M |
| Independent audit of programs and the signer | M-L |
| **Total** | **L** (crypto PoC alone is S) |

## 12. Risks

1. Custom crypto: a hand-written signer and additive key scheme without an ecosystem standard. Mitigation: noble only, two independent implementations in tests, strict-and-ZIP-215 verification, external review before mainnet.
2. Verifier rule drift (strict vs cofactored ZIP-215; SIMD-0376 mentioned in source). Torsion-free validation and canonical signatures neutralise it; keep a regression test.
3. Program risk: upgradeable by default, so immutability claims must wait for a finalised authority; any bug in the router can lock fee or net flows (ADR-0013 point 2 applies).
4. Rent and minimum balances make small payments uneconomic and add payer cost not covered by the fee.
5. Spend is software-only (no wallet or hardware import). Key loss or theft is total, same as EVM scheme 1 but with fewer recovery tools.
6. History retention and RPC dependence for scanning; third-party RPC sees query patterns.
7. Announcement spam and unverified direct announcements.
8. Token-2022 extension surface (hooks, fees, freeze, permanent delegate) needs a per-mint matrix; blacklisting of the fee recipient's ATA mirrors the EVM blacklist risk (ADR-0013 point 3).
9. Key-derivation-from-wallet-signature (Wraith pattern) is not adopted here; if a future GhostPay UX wants it, wallet determinism must be tested per wallet.
10. Regulatory profile of privacy tooling on Solana (business risk, out of scope).

## 13. PoC acceptance criteria (devnet/localnet only, no deployment)

Offline (CI, no network):
- [ ] `deriveStealthPayment(meta)` then `checkAnnouncement` round-trips for 1,000 random keys; `p·B` equals the announced address.
- [ ] Meta-address decoder rejects: non-canonical y, off-curve, identity, every small-order point (all 8 torsion encodings plus their non-canonical variants), torsion-mixed points, `K_spend == K_view`, wrong length/prefix.
- [ ] Hostile `R` in announcements (each of the above) yields `{ matches: false }` and never throws.
- [ ] Second, independent implementation of the scheme inside the test suite (plain BigInt RFC 8032 arithmetic, no noble) produces identical addresses and tags on fixed seeds; vectors committed under `test-vectors/` with provenance (no official vectors exist).
- [ ] Raw-scalar signer: signatures verify with noble `zip215: true`, `zip215: false` and `node:crypto` Ed25519 for 10,000 random messages, including `p` values with high bits set and unclamped; `S < L` and canonical `R` asserted; same message gives same signature (determinism) and different messages never reuse a nonce.
- [ ] Property tests: view-tag false-positive rate about 1/256 over 100,000 random announcements; wide reduction never yields 0.
- [ ] Benchmark script records scan throughput (announcements/second) in Node; numbers go in the PR, not hard-coded.
- [ ] Coverage thresholds match sibling packages (95/90/95/95); lint, typecheck clean; no `any`.

Devnet (needs network access outside this session; **unverified until run**):
- [ ] Send SOL (above rent minimum) to a derived stealth address with a plain system transfer plus an announcement carried in a Memo instruction (no custom program); scanner finds it at `finalized`; sweep signed with the raw scalar is accepted by the cluster and the stealth address ends at zero balance.
- [ ] Same for an SPL token (create the stealth ATA idempotently, transfer, sweep, `CloseAccount`, rent returns to the seller).
- [ ] A transaction signed by the PoC signer verifies under the cluster's verifier for several random keys (shows the strict/ZIP-215 assumptions hold today).
- [ ] No mainnet key, RPC URL or transaction anywhere; devnet RPC URL injected via env and absent from source.

Out of scope for the PoC: any program build or deployment, relayer, UI, invoice schema changes, hardware wallets.

## 14. Package ownership

New package `packages/chain-solana` (`@ghostpay/chain-solana`), owned by the chain-port work stream; no edits to `core-crypto`, `chain-adapters`, `invoice-schema` or other existing packages (changes go through ADRs). Layout mirrors `packages/btc-silent-payments`: `src/ed25519.ts` (point/scalar helpers, torsion checks), `src/keys.ts` (seller keys, meta-address codec), `src/derive.ts` (sender), `src/scan.ts` (receiver, cursor-agnostic), `src/spend.ts` (spend scalar and raw-scalar signer), `src/errors.ts`, `src/secret.ts`, `src/rng.ts`, tests and `test-vectors/`. Dependencies pinned to the repo's existing set: `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, `@scure/base` 1.2.6 (base58); dev-only extras (vitest, fast-check) as in siblings. No `@solana/*` runtime dependency in the PoC (a devnet integration test may use `@solana/kit` 8.5.0 as a devDependency, **unverified** API for attaching an externally computed signature). Not built here: `packages/chain-solana-programs` (Anchor announcer and router), a separate future package with its own audit.

## Sources (retrieved 2026-10-21)

Registry and package contents (registry.npmjs.org):
- Wraith SDK 1.4.5 tarball and manifest: https://registry.npmjs.org/@wraith-protocol/sdk/-/sdk-1.4.5.tgz (dist files read: `chains/solana/index.js`, `index.d.ts`, shared chunk with scalar/signing code)
- onyx-sdk 1.0.0: https://registry.npmjs.org/onyx-sdk/-/onyx-sdk-1.0.0.tgz
- sol-stealth-sdk 0.2.0: https://registry.npmjs.org/sol-stealth-sdk/-/sol-stealth-sdk-0.2.0.tgz
- @umbra-privacy/sdk 4.0.0: https://registry.npmjs.org/@umbra-privacy/sdk/-/sdk-4.0.0.tgz
- @noble/curves 2.4.0 (API types for `isTorsionFree`, `isSmallOrder`, `clearCofactor`, `zip215`): https://registry.npmjs.org/@noble/curves/-/curves-2.4.0.tgz
- Version lookups (latest at retrieval): `@solana/kit` 8.5.0, `@solana/web3.js` 3.1.1, `@solana-program/token-2022` 0.20.0, `@solana-program/memo` 0.16.0, `@coral-xyz/anchor` 0.32.1 via https://registry.npmjs.org/<name>/latest

Raw GitHub:
- Wraith SDK README, LICENSE: https://raw.githubusercontent.com/wraith-protocol/sdk/main/README.md , https://raw.githubusercontent.com/wraith-protocol/sdk/main/LICENSE
- Wraith contracts README: https://raw.githubusercontent.com/wraith-protocol/contracts/main/README.md
- Wraith Solana sender program: https://raw.githubusercontent.com/wraith-protocol/contracts/main/solana/programs/wraith-sender/src/lib.rs
- Nokto README and program: https://raw.githubusercontent.com/BOBER3r/nokto-protocol/main/README.md , https://raw.githubusercontent.com/BOBER3r/nokto-protocol/main/programs/sol-eip5564/src/lib.rs
- Token-2022 README and extension list: https://raw.githubusercontent.com/solana-program/token-2022/main/README.md , https://raw.githubusercontent.com/solana-program/token-2022/main/program/src/extension/mod.rs , https://raw.githubusercontent.com/solana-program/token-2022/main/interface/src/extension/transfer_fee/mod.rs
- SPL Memo: https://raw.githubusercontent.com/solana-program/memo/main/program/src/entrypoint.rs , https://raw.githubusercontent.com/solana-program/memo/main/program/src/lib.rs
- Anchor events (`emit!`, `emit_cpi!`): https://raw.githubusercontent.com/coral-xyz/anchor/master/lang/attribute/event/src/lib.rs
- Solana signature verification (dalek vs ZIP-215, SIMD-0376 comment): https://raw.githubusercontent.com/anza-xyz/solana-sdk/master/signature/src/lib.rs ; https://raw.githubusercontent.com/anza-xyz/agave/master/perf/src/sigverify.rs
- Monero `crypto.cpp` (`ge_mul8`, `derive_public_key`): https://raw.githubusercontent.com/monero-project/monero/master/src/crypto/crypto.cpp
- ERC-5564: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-5564.md
- Repo: `docs/MULTICHAIN_SPEC.md`, `docs/CONTRACTS_SPEC.md`, `docs/adr/ADR-LOG.md`, `packages/chain-adapters/src/adapter.ts`, `packages/core-crypto/src/stealth.ts`, `packages/core-crypto/src/secret.ts`, `packages/btc-silent-payments/src/adapter-types.ts`

Blocked by session constraints (not fetched): solana.com / docs.solana.com, docs.rs, crates.io, explorer.solana.com, Anchor and Solana RPC endpoints, faucets, GitHub web UI and code search.

## Unverified (needs live docs, a node or a run)

- Rent-exempt minimums (0-byte system account, 165-byte token account, Token-2022 sizes); base fee per signature.
- Commitment-level semantics in slots/seconds; `getSignaturesForAddress` max `limit` and `commitment` options; RPC log truncation limits; ledger retention of public RPCs; transaction size limit (1232 bytes) and compute-unit costs of two `transfer_checked` plus announce CPI.
- Memo program transaction volume; whether memo can carry the announcement usefully.
- Upgrade-authority finalisation mechanics, IDL authority, verifiable-build tooling.
- CPI-guard behaviour with router CPIs; whether any production stablecoin mint uses Token-2022 extensions that the policy rejects.
- Which verifier rule (strict vs ZIP-215) each cluster and validator client applies today; SIMD-0376 content.
- Wraith/Nokto on-chain program ids and deployments; whether Wraith has been audited.
- Wallet determinism of `signMessage` (relevant only if the Wraith key-derivation pattern is ever adopted).
- Hardware-wallet ability to sign with an additively tweaked key.
- Throughput of noble ed25519 scalar multiplication in the browser (to be measured by the PoC).
- Exact `@solana/kit` 8.x API for attaching an externally computed signature.
