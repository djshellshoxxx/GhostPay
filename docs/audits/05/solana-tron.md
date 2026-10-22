# Audit 05: solana-tron

AI-assisted review. This is not an independent professional audit.
Snapshot: commit `88de0018b86884d49d70d269c430bdcbb39a0b4f`. All paths below are relative to the snapshot root.

## Summary

The ed25519 DKSAP core in `packages/solana-stealth` is sound for the properties checked:
- strict canonical and torsion-free point validation on S, V and R
- SHA-512 to scalar mod L with length-prefixed domain tags
- the view tag binds R and Z
- h binds R, Z and S
- the raw-scalar signer self-verifies under strict RFC 8032.

No cofactor, small-subgroup or scalar-reduction defect was found. The TRON base58check, protobuf field numbers, TRC-20 calldata layout and secp256k1 recovered-signature byte order are correct. I checked the byte order against the installed `@noble/curves@2.4.0`.

The real problems are in the scanner and review layers:
- **SOLANA-TRON-01 (high):** a Solana transaction with N copies of the same announcement memo produces N detections of one payment, which inflates the credit N times.
- **SOLANA-TRON-02 (medium):** the TRON `trustedToken` flag is fail-open. It reads `true` for any contract when `trustedTokens` is not configured.
- **SOLANA-TRON-03 (medium):** TRON `decodeRawTx`, the documented tx-review helper, uses first-occurrence semantics and ignores unknown fields. A crafted transaction can therefore show one recipient or amount in review and execute another on java-tron, which uses last-wins semantics and honours `call_value`.
- **SOLANA-TRON-04 (medium):** sweeping a TRC-20 receipt requires on-chain TRX or resource funding of the stealth address. On TRON there is no fee payer separate from the owner, so this funding is a deanonymizing link. ADR-0019, which should document it, is missing from the snapshot.
- The remaining findings are low or info.

## Method

- I read every source file in `packages/solana-stealth/src` and `packages/tron-adapter/src`, plus `docs/adr/ADR-0017-solana-stealth.md`.
- I checked the relevant parts of `packages/core-crypto/src/stealth.ts` (`checkAnnouncement`, `deriveStealthSecret`) and the noble-curves `recovered` signature format in `/home/user/GhostPay/node_modules/@noble/curves/abstract/weierstrass.js:900,954`.
- I grepped the prior audits (`docs/audits/01..04`, `docs/remote/security-specs/review-multichain.md`). None of them covers these packages: Solana was "Planned" in audit 01 (M-03) and TRON is not mentioned. All findings below are therefore new, and there are no regressions to report.
- The review was static only. I ran no JS, no tests and no forge, because there is no contract surface in this area.

## Findings

### SOLANA-TRON-01: duplicate memos in one transaction multiply a payment (high, high confidence)

**Location:** `packages/solana-stealth/src/scan.ts:41-54` (`memosOf` returns every top-level memo), `:93-102` (one `AnnouncementRecord` yielded per memo), `:160-185` (`scanAnnouncements`, which does not deduplicate).

**What goes wrong:** each record recomputes the same `P` and calls `creditsFor(rec.tx, P)`, which returns the whole-transaction credit. Nothing deduplicates by `(signature, P)`.

**Exploit:** the payer builds one transaction containing `System.Transfer(payer→P, 1 SOL)` followed by k copies of `Memo("gpst1:<R‖tag>")`. Each memo instruction is about 56 bytes, so roughly 18 fit in 1232 bytes. The scanner then yields k `DetectedSolanaPayment` objects, all with the same `signature` and `lamportsReceived = 1 SOL`. A merchant or wallet that sums detections credits k SOL. SPL works the same way through `tokenReceipts`.

**Severity:** high under the documented API semantics ("A payment that matches the view key"). The adapter is not wired into the apps yet (ADR-0017 section 9), which limits current exposure.

**Fix:**
- Deduplicate in `scanAnnouncements` by `(signature, stealthAddress)`, or parse at most one announcement per transaction (the first valid one).
- Add a test with duplicate memos.

### SOLANA-TRON-02: TRON `trustedToken` defaults to true for any contract (medium, high confidence)

**Location:** `packages/tron-adapter/src/scan.ts:144` sets `trustedToken: c.asset === 'native' || trusted === undefined || trusted.has(c.asset)`. `packages/tron-adapter/src/adapter.ts:200` passes `trustedTokens` only when configured, and `TronAdapterDeps.trustedTokens` is optional (`adapter.ts:125`).

**Exploit:**
1. The meta-address is public. The attacker deploys a TRC-20 contract whose `transfer` emits `Transfer(attacker, P, X)`.
2. The attacker derives `P` and `R` for the victim with `deriveTronStealth` and sends a `TriggerSmartContract` to the fake token with the `GPT1` memo.
3. `confirmTrc20` (`scan.ts:102-116`) checks the log against the same attacker contract, so it passes.
4. The detection is emitted with `trustedToken: true`.

A consumer that relies on the documented "never credit untrusted tokens" flag credits worthless tokens.

**Fix:**
- Fail closed: `trustedToken = native || (trusted?.has(asset) ?? false)`.
- Alternatively, make `trustedTokens` required for `scan`.

### SOLANA-TRON-03: `decodeRawTx` parser differential with java-tron (medium, medium-high confidence)

**Location:** `packages/tron-adapter/src/tx.ts:140-182`. `one()` at `:142` and `vb()` at `:156` take the first occurrence of a field, as does `amount` at `:171`. Unknown fields inside the contract value are ignored, and only field 11 is checked for multiplicity (`:145`).

**What goes wrong:** protobuf-java, which java-tron uses, keeps the last value of a singular field. The helper is documented as "Decoded view ... for review/verification (never trust a node-built tx)".

**Exploit 1 (duplicated recipient):** a TransferContract value encoded as `0a15<owner> 1215<victimShown> 1215<attackerAddr> 18<amt>`. `decodeRawTx` shows `to = victimShown`, but the node executes a payment to `attackerAddr`.

**Exploit 2 (hidden TRX):** a TriggerSmartContract value with `call_value` (field 3) set to N sun. `decodeRawTx` ignores it and shows a pure token transfer, while N TRX also moves to the contract.

The same issue applies to duplicated `data` (field 10, the memo), `expiration` and `fee_limit` at the raw level.

**Fix:** in every message level, reject:
- any duplicated field number
- any field outside the expected set (TransferContract {1,2,3}; TriggerSmartContract {1,2,4}; Contract {1,2}; Any {1,2})
- any wire type that does not match the expected one.

Also re-encode the decoded struct and require byte equality with the input.

### SOLANA-TRON-04: TRC-20 sweep requires a linking TRX or resource funding of the stealth address (medium, design, high confidence)

**Location:** `packages/tron-adapter/src/fees.ts:1-10` (comment only), `tx.ts:107-113` (owner is the payer of fees; there is no sponsor field). There is no sweep builder or fee-sponsor path.

**Exploit:** each TRC-20 stealth receipt leaves `P` with tokens but no TRX, energy or bandwidth. TRON has no fee-payer field. To move the tokens, someone must either send TRX to `P` (which also activates the account) or `DelegateResource` to `P`. Both are public, attributable transactions. If the recipient funds `P` from their own wallet, or several stealth addresses are funded from one wallet, the stealth addresses are linked to each other and to the funder. That defeats recipient unlinkability for the main TRON use case (USDT).

ADR-0019, which the code cites (`protobuf.ts:5`, `scan.ts:119`), and `docs/chains/tron.md`, which `fees.ts:4` and `tx.ts:224` cite, are **not present in the snapshot**. So this limit is not recorded in any ADR or threat-model text.

**Fix:**
- Commit ADR-0019 with this limitation in the threat table.
- Design a sponsor that delegates resources with batching and delay, or route sweeps through a privacy-preserving relayer.
- Surface a warning in the adapter.

### SOLANA-TRON-05: Solana scanner reports arbitrary SPL mints without a trust signal (low, high confidence)

**Location:** `packages/solana-stealth/src/scan.ts:133-152`. `creditsFor` includes any mint whose token account is owned by `P`. `DetectedSolanaPayment` has no trusted or mint allow-list field, unlike the TRON adapter.

**Exploit:** the attacker creates mint M and sends 1e9 units of M to `ATA(P)` together with a valid announcement for the victim. The detection contains a non-zero `tokenReceipts` entry. A consumer that matches on amount only credits it.

**Severity:** low, because the `mint` is present and must be compared. **Fix:** add an allow-list option and a `trusted` flag, failing closed.

### SOLANA-TRON-06: Token-2022 extension mints are not rejected in code (low, high confidence)

**Location:**
- `packages/solana-stealth/src/tx.ts:71-82` (`parseAsset` accepts any mint under `TOKEN_2022_PROGRAM`)
- `adapter.ts:78`
- ADR-0017 section 5: "Callers must only offer mints without extensions" (not enforced).

**Impact:** extensions change what the recipient actually gets.
- **TransferFee mint:** the recipient receives `amount - fee`, while the request reports `netAmount = amount` (`adapter.ts` `buildPaymentRequest`).
- **PermanentDelegate:** the mint authority can seize funds from `ATA(P)`.
- **DefaultAccountState=Frozen:** funds are stuck.

**Fix:** fetch the mint account in `build()` and reject any Token-2022 mint whose extension TLV is non-empty, or allow-list specific extensions.

### SOLANA-TRON-07: TRON scan reads semantic fields from unbound JSON, not from `raw_data_hex` (low, high confidence)

**Location:** `packages/tron-adapter/src/scan.ts:60` checks `sha256(raw_data_hex) == txID`. Then `:63-93` reads `memo`, `to`, `amount` and `contract` from the JSON `raw_data` object, which is never compared with the hex.

**Impact:** the comment ("Never trust a node-supplied id") suggests integrity binding that does not exist. A malicious RPC can pair a real `raw_data_hex` with altered JSON fields. The RPC is already trusted for block contents, since there is no light-client verification, so the practical delta is small. The check is misleading, though, and could be relied on later.

**Fix:** decode `raw_data_hex` with a strict decoder (after fixing SOLANA-TRON-03) and derive all fields from it.

### SOLANA-TRON-08: TRON block ranges with gaps are silently accepted (low, medium confidence)

**Location:** `packages/tron-adapter/src/rpc.ts:99` (a missing `block` array gives `[]`) and `:101-104` (filtering checks order only, not contiguity or completeness).

**Exploit:** if `toBlock` is above the node head, or a lagging or hostile node returns a partial page, `scanTron` finishes without error. A wallet that checkpoints at `toBlock` then never rescans the skipped blocks, so payments are missed. The funds are not lost, but they are undiscovered. By contrast, the Solana scanner fails closed on truncation (`scan.ts:107`).

**Fix:** require `blocks.length == end - start + 1` with contiguous numbers, or fail.

### SOLANA-TRON-09: `memoProgram` override is unvalidated, and the scanner indexes only the default memo program (low, high confidence)

**Location:** `packages/solana-stealth/src/tx.ts:175,210` accept any address as the memo program. `scan.ts:70` pages only `MEMO_PROGRAM`, but `memosOf` would accept v1 or new memo programs (`programs.ts:30-34`).

**Impact:** a payment built with `memoProgram = MEMO_PROGRAM_V1` or `MEMO_PROGRAM_NEW` is never found by a default scan. With an arbitrary program id, the transaction either fails or invokes an unexpected program with attacker-chosen data.

**Fix:** restrict `memoProgram` to `MEMO_PROGRAM`, or index all scanned memo programs.

### SOLANA-TRON-10: scanner liveness DoS by memo spam (low/info, high confidence)

**Location:** `packages/solana-stealth/src/scan.ts:65-108`.

**What goes wrong:** the scanner calls `getTransaction` for every signature on the global memo program. Hitting the cap (`maxPages` of 10,000 at 1000 signatures per page) throws `UNSUPPORTED` after partial results.

**Exploit:** an attacker who floods memos makes scanning cost grow linearly. Valid `gpst1:` memos with random valid R each force one scalar multiplication. A range with more than 10M memo transactions cannot be scanned at all.

ADR-0017 section 6 acknowledges the cost. The hard failure mode is not recorded.

**Fix:** use the dedicated announcer program, or make the scan resumable from a cursor.

### SOLANA-TRON-11: TRON meta-address has no network binding and reuses the EVM keys (info, high confidence)

**Location:** `packages/tron-adapter/src/meta.ts:30-42`. `st:trx:` is the `st:eth:` payload under a different prefix, with no network byte. The shared hash in `h` has no chain domain separation.

**Impact:**
- The same meta-address is valid on Nile, Shasta and mainnet. Contrast the Solana meta-address, which binds the cluster in its checksum.
- A user who publishes both `st:eth` and `st:trx` publishes identical keys, so the two are publicly linkable.
- An announcement's `(R, tag)` can be replayed across EVM and TRON. A replay yields only a spoof detection, because the scanner requires a real transfer.

**Fix:** document this in ADR-0019. Consider a network byte and a chain-specific domain tag for v2.

### SOLANA-TRON-12: missing referenced design docs (info, high confidence)

`ADR-0019` and `docs/chains/tron.md` are referenced in:
- `packages/tron-adapter/src/{protobuf.ts:5,scan.ts:119,fees.ts:4,tx.ts:224}`
- `package.json` (description).

Neither exists in the snapshot (`docs/adr` has 0016, 0017, 0018 and LOG; `docs/chains` has no `tron.md`). The constants marked UNVERIFIED therefore have no recorded source:
- energy estimates, `fees.ts:56`
- chain-parameter keys, `fees.ts:17`
- `getblockbylimitnext` end-exclusivity, `rpc.ts:93`
- `broadcasthex`.

## Checked, no issue found

- **ed25519 points:** `decodePoint` (`ed25519.ts:45-58`) does a canonical round-trip, rejects identity, small-order and non-torsion-free points, and is applied to S, V and R before any secret math. It uses `zip215: false`.
- **Hashing and scalars:**
  - `hashToScalar` is a 512-bit hash reduced mod L.
  - The `dst` tags are length-prefixed and distinct per label.
  - `randomScalar` draws 64 bytes and rejects zero.
  - `secretScalarFromBytes` rejects 0 and values ≥ L.
- **Signing:** `signWithScalar` uses a domain-separated nonce key, hedged aux, `c` over `R‖A‖M` and self-verification. I found no nonce reuse across different messages: k depends on M.
- **Solana meta-address:** the checksum binds version and cluster, and decoding is strict.
- **Solana transaction building:** u64 bounds, decimals in TransferChecked, and the 1232-byte cap. `addSignature` verifies signatures strictly.
- **Solana RPC:** `id` echo, https-only, `redirect: 'error'`, lossless big ints, and consistency checks on `getTransaction` signature and slot.
- **TRON address:** base58check uses double SHA-256 via `createBase58check(sha256)`. The 0x41 prefix and 21-byte length are enforced.
- **TRON transaction encoding:**
  - Field numbers are correct: Transaction.raw 1/4/8/10/11/14/18; Contract 1/2; Any 1/2; Transfer 1/2/3; Trigger 1/2/4.
  - `ref_block_bytes` = bytes [6..8) of the block number, and `ref_block_hash` = blockId[8..16).
  - TRC-20 calldata is selector `a9059cbb`, then a 12-byte zero pad, a 20-byte address and a 32-byte big-endian amount.
- **TRON signing:** `signTronTx` recomputes txID, uses low-s (noble default), the noble v2 `recovered` layout is `recid‖r‖s` (rearranged correctly to `r‖s‖v`), and the signer is checked by recovery.
- **TRON key derivation:** `deriveTronStealthKey` checks that the derived key controls the announced address.

## Not reviewed

- Test files (`*.test.ts`), `scripts/gen-vectors.mjs` and `scripts/crosscheck_vectors.py`. Test vectors were not re-run.
- `@solana/kit@8.4.0` internals (message compilation, signer ordering) and `@scure/base` base58 internals. Supply-chain provenance and lockfile integrity of the pinned dependencies were not checked.
- `packages/core-crypto` beyond the two functions used by TRON. It is covered by the crypto-core area.
- Live-chain behaviour:
  - the actual java-tron rules for duplicated fields and `call_value` (reasoned from protobuf-java semantics, not executed)
  - real energy costs
  - `getblockbylimitnext` semantics
  - Solana runtime acceptance of the built transactions.
- Timing and side channels of JS bigint scalar arithmetic (acknowledged in ADR-0017 section 7).
- Integration into apps, which is not wired at this commit.
