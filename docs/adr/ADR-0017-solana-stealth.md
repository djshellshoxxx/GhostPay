# ADR-0017: Solana stealth payments (dual-key ed25519)

Status: Proposed (proof of concept). Date: 2026-10-21. Gap: M-03 (MULTICHAIN_SPEC section 5). Package: `packages/solana-stealth`.

**Not audited.** No external review of the scheme or code has happened. Mainnet is refused by the adapter unless `allowMainnet: true`.

## 1. Context

EIP-5564 / ERC-6538 are secp256k1 and EVM-specific. Solana accounts are ed25519 public keys and there is no ratified stealth standard. Community designs (Monero-style dual-key, DKSAP over ed25519) exist but none is a standard. We need a scheme that lets a payer send SOL or SPL tokens to a fresh, unlinkable address that only the recipient can find and spend, using nothing but existing on-chain programs.

## 2. Decision summary

- Dual-key stealth address protocol (DKSAP) over the ed25519 prime-order subgroup, with domain-separated hashing, strict point validation and a 1-byte view tag.
- Announcements go in an **SPL Memo** instruction in the same transaction as the transfer. A dedicated announcer program is specified (section 6) but not built.
- Transactions are built with `@solana/kit@8.4.0` (maintained successor of `@solana/web3.js` 1.x). The System, Token and ATA instructions are encoded in this package (5 tiny layouts, pinned by tests and independently re-parsed in Python). The `@solana-program/*` clients are not used because they need kit `^8.5.0`, published less than two weeks ago.
- Curve and hash primitives: `@noble/curves@2.4.0` and `@noble/hashes@2.4.0`, the same major versions the repo already uses.
- Stealth spend keys are raw scalars, so they are signed with a scalar-based ed25519 signer (section 4). The signatures verify under standard RFC 8032 verification, which is what the Solana runtime uses.

## 3. Cryptographic scheme (v1)

Notation: `G` is the ed25519 base point, `L = 2^252 + 27742317777372353535851937790883648493`, points use 32-byte RFC 8032 encoding, scalars are 32 bytes little-endian.

`dst(label) = len(tag) || tag`, where `tag = "GhostPay/solana-stealth/v1/" + label` in ASCII. The length prefix keeps tags injective.

| Step | Definition |
|---|---|
| Keys | spend `s`, view `v` in [1, L-1]; `S = sG`, `V = vG`. Random: 64 CSPRNG bytes mod L (bias < 2^-259). From seed (32-64 bytes): `s = SHA-512(dst("spend-key") ‖ seed) mod L`, `v = SHA-512(dst("view-key") ‖ seed) mod L` |
| Point validation | Applies to every `S`, `V` and `R`. Rejects: non-canonical encodings (y >= p, -0), the identity, all 8 small-order points, and every point with a torsion component (`L·P != O`). Because of this, no cofactor multiplication is needed |
| Sender | `r` is fresh and random, `R = rG`, `Z = rV`, `h = SHA-512(dst("shared") ‖ R ‖ Z ‖ S) mod L` (h = 0 is rejected), `P = S + hG` (identity is rejected) |
| View tag | `SHA-256(dst("view-tag") ‖ R ‖ Z)[0]` |
| Scanner | `Z = vR`, then checks the tag, recomputes `h` and `P`, and requires that `P` was actually credited in the same transaction |
| Spend key | `p = s + h mod L`, enforced to satisfy `pG == P` |

`R` and `S` are bound into `h`, so an announcement cannot be replayed against a different recipient key. The view tag lets a scanner skip about 255/256 of foreign announcements after one scalar multiplication. As with EIP-5564, the tag leaks 8 bits of the shared secret.

### Meta-address

The format is `st:sol:` + base58(`0x01` version ‖ cluster byte ‖ `S` ‖ `V` ‖ checksum4).

- Cluster bytes: mainnet 0, devnet 1, testnet 2, localnet 3.
- `checksum4 = SHA-256(dst("checksum") ‖ version ‖ cluster ‖ S ‖ V)[0..4]`.
- Decoding is strict: it checks the prefix, length, checksum, version, cluster and both points, and optionally that the cluster is the expected one.

## 4. Signing with a scalar

RFC 8032 `sign(seed, msg)` hashes and clamps a seed. A stealth key `p` is a scalar, so feeding it to such an API would sign for a different key. We sign as follows:

1. `nonceKey = SHA-512(dst("nonce") ‖ p)[0..32]`
2. `k = SHA-512(nonceKey ‖ aux32 ‖ M) mod L`
3. `R = kG`, `c = SHA-512(R ‖ A ‖ M) mod L`, `S = k + c·p mod L`

`aux32` is fresh CSPRNG output by default, which gives hedged signatures. An all-zero `aux32` gives deterministic signatures and is used only for test vectors. Every signature is self-verified before it is returned. The same construction is used by Monero-style and other tweaked-key ed25519 wallets. Note: standard Solana wallets cannot sign for `P`. The recipient's GhostPay software signs, and a normal wallet can act as the fee sponsor.

## 5. Transactions

Payments use legacy messages and are never sent by this package.

| Flow | Instructions | Signers |
|---|---|---|
| SOL payment | `System.Transfer(payer→P, lamports)`, `Memo("gpst1:"+base58(R‖tag))` | fee payer, then payer |
| SPL payment | `ATA.CreateIdempotent(feePayer, ATA(P), P, mint, tokenProgram)`, `Token.TransferChecked(src→ATA(P), payer, amount, decimals)`, `Memo` | fee payer, then payer |
| SPL sweep | `ATA.CreateIdempotent(feePayer, ATA(dest))`, `TransferChecked(ATA(P)→ATA(dest), P)`, optional `CloseAccount(ATA(P)→rentDestination, P)` | fee payer, then `P` |
| SOL sweep | `System.Transfer(P→dest)` | fee payer (default `P`), then `P` |

Rules enforced by the builder:

- The SOL amount must be at least `getMinimumBalanceForRentExemption(0)`. Otherwise the runtime rejects creating `P`.
- Only the classic Token and Token-2022 programs are accepted. Token-2022 extensions (transfer fee, transfer hook, confidential transfer, non-transferable) are **not handled**. Callers must only offer mints without extensions.
- The wire size must stay at or below 1232 bytes.

The sponsored fee payer is an option in the transaction. No relayer service exists, so the adapter reports `gasSponsorship: not_deployed`.

## 6. Announcer program interface (specified, out of scope)

Scanning the global memo program (`getSignaturesForAddress(Memo)`) works for the PoC but costs O(all memos) on mainnet. A future minimal program `gp_announcer` would work as follows:

- Instruction `Announce { version: u8 = 1, ephemeral: [u8;32], view_tag: u8, scheme_id: u16 }` with accounts `[stealth (readonly), token_mint? (readonly)]` and no signer requirement.
- It validates nothing on chain beyond lengths (point validation stays client-side) and emits `sol_log_data(["gpst1", ephemeral, view_tag, stealth])`.
- Scanners page `getSignaturesForAddress(gp_announcer)`. That traffic is GhostPay-only, so a scanner reveals only that it uses GhostPay.
- It needs its own audit, an upgrade-authority policy (immutable preferred) and a deployment ADR. Until then `announcementIndexAddress` defaults to the memo program.

## 7. Threat model and known privacy limits

| Leak / risk | Effect | Mitigation in PoC |
|---|---|---|
| Public ATA creation | Every SPL payment creates `ATA(P)` in plain view. The memo and the ATA mark the transaction as a GhostPay stealth payment | None: inherent in Solana token accounts. The anonymity set is "all GhostPay payments" |
| Rent leak | ATA rent (about 0.002 SOL; read it from RPC, do not hard-code) is paid by the fee payer, and `CloseAccount` sends it somewhere. Sending rent to the final destination links `P` to it | Sweep defaults the rent destination to the fee payer (sponsor) |
| Fee-payer linkability | `P` holds no SOL for SPL receipts. If the recipient funds `P` from a known wallet, `P` becomes linked. A shared sponsor links all sponsored sweeps to that sponsor (but not to each other beyond timing) | Sponsor option. A real deployment needs a relayer with batching and delay (not built) |
| Payer is public | The payer wallet and amount are fully visible. Only the recipient is hidden | Out of scope (mixers / confidential transfers) |
| Amount and timing correlation | A sweep of exactly the received amount soon after receipt is linkable | Recipient-side policy, not enforced |
| RPC operator | Sees scanner IP and all fetched signatures, and can withhold or forge responses | No default RPC; strict response parsing; `getTransaction` slot and signature consistency checks; credit check prevents spoofed "payments". A malicious RPC can still hide payments (liveness) |
| Spoofed announcements | Anyone who knows `V` can publish matching memos | A detection is reported only when `P` was credited in the same transaction |
| View key compromise | Breaks privacy of all past and future payments. Funds stay safe | Separate `v` and `s`. Watch-only scanning needs only `v` and `S` |
| Spend key compromise | Loss of funds | Standard key custody (out of scope) |
| Torsion / small-subgroup attacks on `v` | Blocked by strict point validation before any secret math | Tested with all 8 small-order points and a mixed-order point |
| JS side channels | No constant-time guarantee in JavaScript/bigint | Documented. Scanning should run on trusted hosts |
| Token-2022 extensions | A transfer hook or fee could redirect or skim funds or fail the transfer | Not supported; callers must reject such mints |
| Quantum | DH and ed25519 are broken by a CRQC | Out of scope |

## 8. Verification done

- `test-vectors/solana-stealth.json`: 6 key/payment/signature cases, 12 invalid points and 3 full transaction messages.
- Independently recomputed by `packages/solana-stealth/scripts/crosscheck_vectors.py`. It shares no code with the TS: it uses pure-Python RFC 8032 arithmetic, hand-written base58, a legacy message parser and a PDA derivation. Signatures are also verified by OpenSSL through Python `cryptography` and through `node:crypto`.
- Unit and mock-RPC tests cover the full payment → scan → spend-key → signed sweep cycle.
- `solana-test-validator` could not be obtained in the build sandbox (release.anza.xyz is blocked by the proxy and GitHub release access is not enabled), so no local-validator execution test was run.

## 9. Consequences

- Solana moves from "research only" to a working, unaudited PoC library and adapter. It is not wired into apps.
- No fee can be enforced (`checkout: not_deployed`) until an audited fee-split program exists.
- USDC and USDT mint addresses are **not** hard-coded. They could not be verified from issuer pages in this environment (see docs/chains/solana.md). The mint is a caller input.
