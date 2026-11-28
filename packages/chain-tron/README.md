# @ghostpay/chain-tron

Testnet proof of concept (unaudited, private): Tron address codec, secp256k1 stealth addresses
(thin wrappers over `@ghostpay/core-crypto` ERC-5564 scheme-1), TRC-20 request builders, and a
structural `ChainAdapter`-shaped skeleton. No network calls, no signing, no contracts.

**Same meta-address and memo as `@ghostpay/tron-adapter` (TB-08, 2026-11-18).** The CLI imports this package and the
web app imports `@ghostpay/tron-adapter`. Both now use the ADR-0019 section 2 format `st:trx:0x<spend33><view33>`
(`docs/adr/ADR-0019-tron.md`; the web wallet shows it, `apps/web/src/features/tron/wallet.ts`), and a payment derived
here carries the `"GPT1" || R || viewTag` memo the web scanner reads. `src/interop.test.ts` pins this package and the
web package's source to `test-vectors/meta-address-sol-tron-v1.json` and to the web package's
`test-vectors/tron.json`, encode-in-one / decode-in-the-other. The `st:eth:0x` form this package used to take is
refused with `LEGACY_META_ADDRESS`: it is the EVM meta-address, which need not belong to the recipient's TRON wallet.

## Modules
- `address.ts`: `0x41 || keccak256(X||Y)[12:]`, base58check (sha256d, Bitcoin alphabet), `41…` hex, EVM 20-byte conversion, strict validation (`INVALID_CHECKSUM`, `INVALID_PREFIX`, `INVALID_LENGTH`, `INVALID_ADDRESS`).
- `meta.ts`: `encodeTronMetaAddress` / `decodeTronMetaAddress` (`st:trx:0x`, strict, same accept set as tron-adapter), `buildTronAnnouncementMemo` / `parseTronAnnouncementMemo` (`GPT1 || R || viewTag`).
- `stealth.ts`: `deriveTronStealthPayment` (takes `st:trx:0x`, returns the memo too), `checkTronAnnouncement`, `deriveTronStealthSecret`, `tronAddressOfSecret`. Same maths and view tag as core-crypto; only presentation differs.
- `trc20.ts`: `transfer(address,uint256)` (a9059cbb) and `balanceOf(address)` (70a08231) encoders, `triggersmartcontract` / `triggerconstantcontract` body builders, `fee_limit` bounded to 1..15,000,000,000 sun.
- `adapter.ts`: `createTronAdapter`, `TronFamily = 'tron'`, fees all `not_enforceable`. Payment requests validate and quote, but `build()` fails closed with `TronAdapterError` `MEMO_NOT_BOUND`: this package cannot bind the `GPT1` memo into the transaction's `raw_data.data` (ADR-0019 section 2), and a transfer without it pays an address the receiver can never detect.

## Verification (run in this package)
- `tsc --noEmit`: clean. `eslint`: clean.
- `vitest run --coverage` (FC-03 local re-run, 2026-11-25, after the mainnet chain-id guard): 6 files, 55 tests passing; coverage statements 100% (168/168), branches 100% (107/107), functions 100% (38/38), lines 100% (140/140). Thresholds 95/90/95/95 unchanged. (Donor 2026-11-18 figures were 54 tests, 166/105/38/139.)
- Property tests (fast-check): encode/decode round trip, EVM round trip, single-character mutation always rejected (500 runs), non-0x41 prefix rejected, stealth round trip against core-crypto (25 seeds), amount ABI round trip.

## Unverified
See `DEVIATIONS.md`. Notably: known-address vectors were recalled, not fetched; TronGrid field names and the 15,000 TRX fee_limit cap are unconfirmed.
