# @ghostpay/chain-tron

Testnet proof of concept (unaudited, private): Tron address codec, secp256k1 stealth addresses
(thin wrappers over `@ghostpay/core-crypto` ERC-5564 scheme-1), TRC-20 request builders, and a
structural `ChainAdapter`-shaped skeleton. No network calls, no signing, no contracts.

## Modules
- `address.ts`: `0x41 || keccak256(X||Y)[12:]`, base58check (sha256d, Bitcoin alphabet), `41…` hex, EVM 20-byte conversion, strict validation (`INVALID_CHECKSUM`, `INVALID_PREFIX`, `INVALID_LENGTH`, `INVALID_ADDRESS`).
- `stealth.ts`: `deriveTronStealthPayment`, `checkTronAnnouncement`, `deriveTronStealthSecret`, `tronAddressOfSecret`. Same maths and view tag as core-crypto; only presentation differs.
- `trc20.ts`: `transfer(address,uint256)` (a9059cbb) and `balanceOf(address)` (70a08231) encoders, `triggersmartcontract` / `triggerconstantcontract` body builders, `fee_limit` bounded to 1..15,000,000,000 sun.
- `adapter.ts`: `createTronAdapter`, `TronFamily = 'tron'`, fees all `not_enforceable`.

## Verification (run in this package)
- `tsc --noEmit`: clean. `eslint`: clean.
- `vitest run --coverage`: 4 files, 42 tests passing; coverage statements 100% (132/132), branches 100% (77/77), functions 100% (31/31), lines 100% (112/112). Thresholds 95/90/95/95 unchanged.
- Property tests (fast-check): encode/decode round trip, EVM round trip, single-character mutation always rejected (500 runs), non-0x41 prefix rejected, stealth round trip against core-crypto (25 seeds), amount ABI round trip.

## Unverified
See `DEVIATIONS.md`. Notably: known-address vectors were recalled, not fetched; TronGrid field names and the 15,000 TRX fee_limit cap are unconfirmed.
