# Solana implementation notes (packages/chain-solana)

Status: testnet proof of concept, unaudited, never run against a cluster. Companion to `solana.md`
(research/spec). Code: `packages/chain-solana`. Details, sources and the full unverified list:
`packages/chain-solana/DEVIATIONS.md`.

## What exists
- Dual-key ed25519 stealth (spec option B): keys `S = s·B`, `V = v·B`; sender `R = r·B`, `K = [8](r·V)`,
  `h = SHA-512(u8(len) ‖ "GhostPay/solana-stealth/v1/tweak" ‖ K ‖ R ‖ S) mod L` (zero rejected),
  `view_tag = SHA-512(… "GhostPay/solana-stealth/v1/view-tag" ‖ K)[0]`, `P = S + h·B` (identity rejected),
  address = base58(enc(P)). Receiver recomputes with `v`; spend scalar `x = s + h mod L` (zero rejected,
  `x·B == P` checked).
- Strict point validation for S, V, R: 32 bytes, RFC 8032 strict decoding (`y < p`, no negative zero),
  byte-identical re-encoding, not identity, torsion-free (all 8 small-order points and torsion-mixed points
  rejected). Cofactor clearing on the ECDH point is kept on top as defence in depth.
- Meta-address `gpsol:` + base58check(`0x01 ‖ S ‖ V`).
- Raw-scalar RFC 8032 signer (`signWithScalar`): deterministic nonce prefix
  `SHA-512(… "GhostPay/solana-stealth/v1/nonce-prefix" ‖ LE32(x) ‖ P)[0..32]`; the core reproduces RFC 8032
  section 7.1 signatures byte for byte when given the RFC expanded key; production signatures verify under
  noble strict, noble ZIP-215 and OpenSSL.
- Announcement codec: binary `0x01 ‖ R(32) ‖ view_tag(1) ‖ metadata(0..256)` for an announcer program, and
  SPL Memo text `gpst1:` + base64url-no-pad(binary). Strict decoders, fuzzed.
- PDA: `createProgramAddress`, `findProgramAddress` (bump 255..1 as in solana-program), ATA derivation for
  Token and Token-2022; program ids copied from SPL release-tag sources (file/line in DEVIATIONS.md section 4).
  4 external `create_program_address` vectors from solana-program `pubkey.rs` pass.
- `ChainAdapter`-shaped skeleton (`createSolanaAdapter`): `sol-devnet`/`sol-testnet` only; `parseRecipient`;
  `buildPaymentRequest` (zero fee, returns stealth address, ATA, announcement bytes and memo; no
  transaction); `scan` over an injected `AnnouncementSource` (no RPC), skipping malformed/foreign records;
  fees `not_enforceable` on every line.

## Decisions taken where `solana.md` left choices open
Hash binds `S` as well as `K, R`; length-prefixed domain tags; meta-address and memo encodings above;
announcement has a version byte instead of a scheme id; fee lines `not_enforceable` (spec said
`not_deployed`). All need the scheme ADR. Table: DEVIATIONS.md section 1.

## Test evidence (real numbers, 2026-10-21)
97 tests, coverage 98.71% statements / 97.77% branches / 98.3% functions / 99.61% lines (thresholds
95/90/95/95). External vectors: RFC 8032 section 7.1 (5 cases, via a third-party transcription
cross-checked by noble and OpenSSL), solana-program PDA (4 cases). Stealth vectors are
**self-generated** (3 cases) and recomputed by an independent BigInt + `node:crypto` implementation plus
a 25-case random differential; no external vector set exists for this scheme. Scan cost measured at about
214 announcements/s (4.7 ms each) in Node 22 with noble 2.4.0.

## Open items
Announcer and fee-split programs; transaction building and wallet integration; devnet run (spec section 13
devnet checklist); invoice-schema and `ChainAdapter` widening (discriminated unions on `family`); external
review of the formulas and the signer.
