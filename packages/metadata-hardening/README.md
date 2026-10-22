# @ghostpay/metadata-hardening

Pure-logic helpers for the `MH-*` metadata hardening menu. Spec: [`docs/remote/privacy-specs/metadata-hardening.md`](../../docs/remote/privacy-specs/metadata-hardening.md). Testnet PoC only: every entry point that takes a chain refuses anything but 31337, 11155111, 84532 (Bitcoin: testnet, signet, regtest). No network calls, no I/O, no secrets in tests. Not wired into `apps/web` or `apps/relayer`: see [`wiring/metadata-hardening.md`](../../docs/remote/privacy-specs/wiring/metadata-hardening.md). Self-review: [`audit-metadata-hardening.md`](../../docs/remote/privacy-specs/audit-metadata-hardening.md) (AI self-review, not an independent audit).

Each option reduces one named leak. None makes payments anonymous: payer, amount, token, time and router use stay public. The `doesNotProtect` text in `MH_CATALOGUE` is the normative UI copy.

## Status per MH id

| Status | MH ids |
|---|---|
| **Built here** (pure logic, tested) | ID-1, ID-2 (`derive`), TAG-2 (mode helpers), ANN-1 (config check), ANN-2 (scheme policy), ANN-3 (`buildMinimalMetadata`, `classifyMetadata`), AMT-1, AMT-2, WAL-1/WAL-2 (bucket + field allowlist), REL-2 (`planRelease`), REL-3 (`padBody`/`stripPad`), REL-4 (`RelayerPinning`), NET-1 (role routing, config check), SCAN-1 (filter assertion), SCAN-2 (`alignedScanRange`), INV-1 (`padPrivatePart`), INV-3 (coarse time), FEE-1 (`buildDirectPayment` calldata), WEB-1 (anchor lint), WEB-2 (`buildCsp`), WEB-3 (SRI), BTC-1..6 (plain-data helpers), catalogue/defaults/conflict rules |
| **Built here but needs edits in existing code to take effect** | TAG-2 `ignore`/`mask` (core-crypto `checkAnnouncement`/`deriveStealthSecret` hard-fail on tag mismatch), ANN-3 (scanner calls `parseMetadata`, which rejects length != 57), ID-1/ID-2 (keystore seed, session, scanner over N keys, invoice signer), AMT-1/2, INV-1/3 (invoice-schema `validatePrivatePart` strict keys), REL-2/3, WAL-1/2, SCAN-2, NET-1, BTC-* (call from `btc-silent-payments/src/spend.ts`), FEE-1 (UI + scanner `viaRouter=false` handling), WEB-1/2/3 (scripts, `_headers`, `index.html`) |
| **Needs existing-code edits only** (nothing pure to build) | ANN-1 R2/R3 tests, INV-2 (default `encrypt=true` in `CreateInvoice.tsx`), REL-1 (private submit RPC), REL-5 (zero-log mode), MH-WEB-1 R1/R2 Playwright tests, `hardening` settings object in `apps/web` |
| **Out of scope** | FEE-2 (new router contract, `packages/contracts`), NET-2 (docs), NET-3 (light client, WASM dep), SCAN-3 (PIR, separate package), real-wallet/RPC/relayer verification |

## Options and defaults (copied from the spec table)

Default ON: ANN-1, TAG-1, AMT-1 (only for `fiat_quote`), SCAN-1, WEB-1, WEB-2 (2a), BTC-1, BTC-4, BTC-5. Everything else OFF. `hardenedSettings()` is the spec's "hardened" preset. `validateHardening` encodes spec section 6: AMT-1 vs AMT-2, FEE-1 vs FEE-2, TAG-1 vs TAG-2 are blocking conflicts; INV-1 without INV-2, ANN-3 without FEE-1, BTC-3 with PayJoin and similar are warnings.

## API sketch

- `deriveInvoiceKeys(seed, index, {chainId?, signerMode?})`: HKDF-SHA256 stream (domain `ghostpay/mh/id/v1`, or `ghostpay/mh/chain/v1` + u32be chain id) fed to core-crypto's `generateKeySet` through its `RandomSource` hook, so there is no duplicated curve code and only the public core-crypto API plus `@noble/hashes` is used. Signer modes `per-invoice | per-chain | long-lived`; `linkability` strings must be shown in the UI. Spend/view key regression vector for `SEED = 0x01..0x20`, index 0 was recomputed independently with raw `@noble` (not just snapshotted).
- `roundGross`, `addAmountNoise`, `isPaid`, `bucketGasLimit`, `assertOnlyAllowedTxFields`.
- `encodeViewTagByte`, `viewTagAccepts`, `parseTagMode`, `classifyMetadata`, `resolveSchemePolicy`, `validateAnnouncerConfig`.
- `planRelease`, `padBody`, `stripPad`, `RelayerPinning`.
- `assertNoUserAddressFilter`, `alignedScanRange`, `dedupeLogs`, `roleForRequest`, `validateRpcRoles`.
- `padPrivatePart`, `stripPrivatePad`, `coarsenExpiry`, `coarsenQuoteTimestamp`.
- `buildDirectPayment` (calldata only; never signs or sends), `buildCsp`, `findUnsafeAnchors`, `sriDigest`, `verifySri`.
- `planChange`, `normalizeFeeRate`, `chooseLocktime`, `chooseSequence`, `orderInputs`, `orderOutputs`, `stripPsbtFingerprints`.

## Does NOT protect (summary; full text in `MH_CATALOGUE`)

No option hides the payer, amount, token, time or router use. Reduced view tags break detection in other ERC-5564 wallets. Amount noise/rounding costs the payer money and leaves the amount public. Per-invoice keys do not stop linking through the same payer, shared sweep destination or a channel that carries two invoices; a shared signer keeps invoices linkable. Padding only hides length, and only matters with encryption (the key is in the same link). Light client and PIR are not built.

## UNVERIFIED

- Effectiveness against real wallets, RPC providers, relayers or chain-analysis tools: nothing was run against any.
- BIP-69 ordering was checked against the vectors in the BIP text fetched 2026-10-21 (inputs sort, two output pairs). Silent-payment output ordering with shuffled outputs (`k` indexing by recipient group) is NOT verified: callers must derive SP outputs first, then order, and map by `order`.
- PSBT record numbers (BIP-174/370/371) in `stripPsbtFingerprints` are from memory and not checked against the BIP text; no PSBT parser round trip was run.
- SRI semantics (strongest-algorithm rule) are from memory of the W3C spec (host unreachable in the spec session); SHA-256/384 empty-input vectors match.
- Locktime/fee-sniping practice (BIP-326) not read.
- Chi-square and distribution tests use a seeded test RNG, which proves the algorithms are unbiased, not the platform CSPRNG.

## Scripts

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```

Dependencies: `@ghostpay/core-crypto`, `@noble/hashes 2.4.0`, `viem 2.57.7` (all already in the lockfile). No new dependency requested.
