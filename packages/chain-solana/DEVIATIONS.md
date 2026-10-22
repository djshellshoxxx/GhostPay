# Deviations, verification status and threat notes (chain-solana)

Status (2026-10-21): typecheck, lint and tests pass; 97 tests; coverage 98.71% statements, 97.77% branches,
98.3% functions, 99.61% lines. **Proof of concept: not audited, never run against a cluster.**

## 1. Differences from `docs/remote/chain-ports/solana.md` (research spec, section 2.3 / 2.4)

The spec labels its constants "proposed, scheme id TBD by ADR". This package fixes concrete values. Each
difference below needs ratifying (or reverting) by that ADR. A change to any hash input or tag is a new scheme.

| # | Spec | This package | Reason |
|---|---|---|---|
| 1 | `h = H_s("GhostPay/sol/v1/h" ‖ shared ‖ R)` | `h = H("GhostPay/solana-stealth/v1/tweak", K, R, S)` | Also binds the recipient spend key `S`, so a given `(K, R)` cannot be reinterpreted against another meta-address. No security loss. |
| 2 | `H512(tag ‖ …)` | `SHA-512(u8(len(tag)) ‖ tag ‖ …)` | Length-prefixed tag is prefix-free regardless of future tag choices. All parts are fixed 32 bytes. |
| 3 | Tag names `GhostPay/sol/v1/{h,tag,nonce}` | `GhostPay/solana-stealth/v1/{tweak,view-tag,nonce-prefix}` | Naming only. |
| 4 | Nonce prefix `H512(tag ‖ le32(p))[0..32]` | `H(tag, LE32(x), enc(P))[0..32]` | Same PRF of the secret; `P` added as in RFC 8032's binding of prefix to the key pair. No hedging randomness (fully deterministic). |
| 5 | Meta-address `st:sol:<hex S><hex V>` + version, encoding left to an ADR | `gpsol:` + base58check(`0x01 ‖ S ‖ V`) | Checksummed, versioned, about 100 chars. Decoder also requires byte-identical re-encoding. |
| 6 | Receiver: hostile R is "not mine", never an exception | Implemented in `checkAnnouncement` (returns `null`). The binary/memo **decoders** do throw `INVALID_ANNOUNCEMENT`; the adapter's `scan` catches it and skips. Caller-owned inputs (own `S`, `v`, a malformed `expectedAddress`) still throw. | Codec strictness and scan robustness are separate concerns. |
| 7 | Announcer event `{scheme_id, stealth, caller, ephemeral, metadata}`, `metadata[0]` = view tag | Payload `0x01 ‖ R ‖ view_tag ‖ metadata(0..256)`; no scheme id field (the version byte plays that role); stealth address is not in the payload (it is the funded account of the same transaction, passed to `scan` as `destination`) | No program exists yet; this is the minimal byte layout an announcer or a Memo can carry. When the announcer program is specified, its event should embed exactly these bytes. |
| 8 | Fee lines `not_deployed` in the PoC (spec section 10) | `not_enforceable` on all three lines | The coordinator brief for this package requires `not_enforceable` until an on-program fee split exists. Both statuses mean "do not charge"; reconcile in the ADR. |
| 9 | Spec section 14 file layout (`ed25519.ts`, `derive.ts`, `scan.ts`, `spend.ts`) | `point.ts`, `stealth.ts` (derive + scan + spend scalar), `sign.ts`, `announcement.ts`, `pda.ts`, `adapter*.ts` | Organisation only. |
| 10 | Acceptance: 1,000 round trips, 10,000 signer messages, 100,000 view-tag trials | 60 round trips + 25 differential + 2000 signer cases + 2048 view-tag trials (seeded) | CI time (the suite already takes about 35 s with coverage). Raise locally if needed. |
| 11 | Second implementation "plain BigInt RFC 8032 arithmetic, no noble" | Done (`src/reference.testutil.ts`, BigInt edwards25519 + `node:crypto` hashes + own base58). | — |

### Cofactor handling

`K = [8](r·V)` on the sender and `K = [8](v·R)` on the receiver (`sharedSecretPoint`, Monero `ge_mul8`
style), **and** every input point is required to be torsion-free and canonical. For validated inputs the
multiplication by 8 is a bijection on the prime-order subgroup and changes nothing about security; it is
defence in depth so that a future relaxation of validation cannot let a torsion component in a hostile `R`
desynchronise sender and receiver (tested: `[8](k(Q+T)) == [8](kQ)`, and pure torsion maps to the identity,
which is rejected). No other cofactor multiplication is used: `P = S + h·B` and `x·B` stay in the subgroup
because `S` is torsion-free, so signatures verify identically under cofactorless (strict) and cofactored
(ZIP-215) verifiers.

## 2. Why signing without a seed is OK

RFC 8032 derives `(a, prefix)` from `SHA-512(seed)`; the verifier only checks `[S]B = R + [k]A` (or the
cofactored form) and never sees the seed. The stealth spend key `x = s + h` has no seed, so:

- `signExpanded(a, prefix, M)` implements RFC 8032 section 5.1.6 steps 2-6 verbatim. Fed the RFC's own
  expanded key it reproduces all five section 7.1 signatures **byte for byte** (`rfc8032.test.ts`).
- `signWithScalar(x, M)` uses the same code with `prefix = H(tag, LE32(x), enc(P))[0..32]`. The nonce
  `r = SHA-512(prefix ‖ M) mod L` is then a deterministic PRF of the secret `x` and the message, which is
  the property that makes RFC 8032 nonces safe: distinct messages get independent nonces, the same message
  gets the same signature, and no RNG failure can cause nonce reuse.
- No clamping is applied to `x`. Clamping exists to fix X25519 cofactor/bit-length issues; for a scalar
  already reduced mod `L` and used only against the prime-order base point it is irrelevant. Signatures
  with arbitrary (unclamped, high-bit) scalars verify under noble strict, noble ZIP-215 and OpenSSL
  (`properties.test.ts`, 2000 cases). `S < L` is asserted (strict verifiers reject `S >= L`).
- **Not tested:** that the bytes we sign equal what a Solana wallet or the runtime treats as the message
  (the serialized transaction message). That is a transaction-building concern outside this package.

Risk: `x` must be handled as a secret everywhere the seed normally would be; there is no seed to back it
up, and it cannot be imported into standard wallets (spec section 2.4).

## 3. Threat notes

- **Sender learns nothing spendable.** `P`'s discrete log needs `s`; the sender only knows `r`, `S`, `V`.
  (Contrast option C in the spec, where the sender could derive the key.)
- **View key holder** can detect payments and compute `h` (returned as a redacting `SecretScalar`), but
  not spend. `h` links a payment to its meta-address; treat it as sensitive.
- **Hostile announcements** (invalid / torsion / non-canonical R, junk payloads, bad destinations) never
  halt `scan`; they are skipped. Spam costs the scanner about 4.7 ms per announcement in Node 22 (214/s,
  measured with noble 2.4.0, one variable-base multiplication, one torsion check, one cofactor clear).
  Torsion check on R is a full multiplication by `L`; it is kept for strictness although `[8]` makes it
  redundant for correctness.
- **View-tag collisions** (1/256): without `expectedAddress`, `checkAnnouncement` returns an unfunded `P`.
  The adapter passes the record's `destination`; callers that do not must confirm balances.
- **Ephemeral reuse** links payments. `r` is fresh per `deriveStealthPayment` and zeroed after use
  (best effort; bigint copies cannot be wiped in JavaScript).
- **Timing:** secret-scalar multiplications use noble's constant-time `multiply`. Bigint arithmetic in
  `s + h mod L` and in `S = r + k·x mod L` is not guaranteed constant time (same caveat as the rest of the
  repo). The `r = 0` branch in `signExpanded` (probability 2^-252) is not covered by tests.
- **Announcements are payer claims.** Anyone can announce anything; only the funded account matters.
- **Mainnet is disabled** in `createSolanaAdapter`.

## 4. Program ids and PDA rules: what is verified

Retrieved 2026-10-21 from `raw.githubusercontent.com` (the SPL monorepo `master` no longer contains the
programs; its README points to the `solana-program/*` repos, so the last release tags of the monorepo were used):

| Constant | Source (file, line) |
|---|---|
| `TOKEN_PROGRAM_ID = TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | `solana-labs/solana-program-library` tag `token-v3.4.0`, `token/program/src/lib.rs` line 79 (`declare_id!`) |
| `TOKEN_2022_PROGRAM_ID = TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | same repo, tag `token-2022-v1.0.0`, `token/program-2022/src/lib.rs` line 98 |
| `ASSOCIATED_TOKEN_PROGRAM_ID = ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` | same repo, tag `associated-token-account-v1.1.0`, `associated-token-account/program/src/lib.rs` line 19 |
| ATA seeds `[wallet, token_program_id, mint]` | same file, lines 62-75 (`get_associated_token_address_and_bump_seed_internal`) |
| `MEMO_PROGRAM_ID = MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` | same repo, tag `memo-v3.0.0`, `memo/program/src/lib.rs` line 16; UTF-8 requirement: `memo/program/src/processor.rs` line 28 |
| `MAX_SEED_LEN = 32`, `MAX_SEEDS = 16`, marker `"ProgramDerivedAddress"` | `solana-labs/solana` tag `v1.18.26`, `sdk/program/src/pubkey.rs` lines 20, 22, 26 |
| `create_program_address` = SHA-256(seeds ‖ program_id ‖ marker), error if on curve | same file, lines 581-610 |
| `find_program_address` loop: bump 255 down to 1, 255 iterations (bump 0 never tried) | same file, lines 498-517 (`for _ in 0..std::u8::MAX`) |
| "On curve" = dalek `CompressedEdwardsY::decompress().is_some()` | same file, lines 163-171 |
| PDA test vectors (4) | same file, lines 885-925 (`test_create_program_address`) — reproduced in `pda.test.ts` |

The program ids were verified as source-code constants only, **not** against a live cluster. The current
`solana-program/token`, `/associated-token-account` and `/memo` repos were fetched (HTTP 200) but contain
no `declare_id!` in `program/src/lib.rs` (moved elsewhere); not further investigated.

`isOnCurve` uses noble `fromBytes(bytes, zip215 = true)`, whose acceptance set (y taken mod p, `x = 0`
with sign bit accepted) is believed equal to dalek's `decompress`. **Unverified against dalek itself**;
only indirectly via the 4 PDA vectors (which include off-curve outcomes) and the fact that SHA-256 outputs
with `y >= p` occur with probability about 2^-250.

## 5. RFC 8032 vectors: provenance

`src/rfc8032.testutil.ts` is a transcription from
`https://raw.githubusercontent.com/paulmillr/acvp-vectors/main/rfc/8032-eddsa/ed25519.json.gz`
(SHA-256 of the file: `641f7b44d07ab6e47e42a300a3ea8175d6b957ce8150523ec57cb88138a12fc3`). `rfc-editor.org`
and `ietf.org` were blocked from the sandbox, so the RFC text itself was not read. The transcription is
cross-checked by two independent implementations in the test (noble `getPublicKey`/`sign` and OpenSSL via
`node:crypto` verify) and by the BigInt reference (TEST 1 public key).

## 6. Self-generated vectors

`test-vectors/self-generated-v1.json` is produced by this package (status field says so). There is no
external vector set for this scheme. Mitigation: the independent reference implementation recomputes
every field, and signatures are verified with OpenSSL. A shared spec misreading would still pass both;
external review of the formulas is required before relying on them.

## 7. Deviations from `chain-adapters` (`ChainAdapter`)

Same approach as `packages/btc-silent-payments`: `src/adapter-types.ts` copies the contract, keeps member
**names** of `ChainAdapter`, `RecipientAddress`, `ViewCapability`, `FeeCapability`, `ScanRange`,
`RequestOptions`, `ChainFamily`, `FeeStatus` identical (pinned by `adapter-types.test.ts`, which parses the
real source). Solana-specific: `SolanaInvoice` (no invoice-schema support for Solana yet),
`SolanaPaymentRequest.build()` returns addresses + announcement bytes (no transaction, no blockhash),
`DetectedSolanaPayment`, `AnnouncementSource`. `ScanRange.fromBlock/toBlock` are slots. Point and secret
types are this package's own ed25519 brands. `buildPaymentRequest` accepts amounts in `[1, 2^64-1]`.

## 8. Unverified / not done

- Any interaction with a Solana cluster: a transaction signed by `signWithScalar` being accepted, rent
  minimums, transaction size of a transfer + memo, whether the cluster's verifier is strict or ZIP-215
  (both are satisfied by construction and by test, but not observed on chain).
- Program ids against on-chain accounts; the current location of `declare_id!` in the new repos.
- An external ATA vector (only self-consistency tested).
- dalek `decompress` equivalence of `isOnCurve` (see section 4).
- Announcer program, router/fee-split program, invoice-schema support, relayer sweep path.
- Constant-time behaviour of bigint arithmetic; memory wiping beyond best effort.
- Hardware-wallet or standard-wallet support for raw-scalar keys (not possible as far as known).
