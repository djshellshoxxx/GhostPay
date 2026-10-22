# Tron implementation notes (packages/chain-tron)

Status: testnet proof of concept, unaudited. Companion to `tron.md` (design). Code: `packages/chain-tron`.

## What exists
- Address codec (`0x41 || keccak256(X||Y)[12:]`, base58check sha256d, hex `41…`, EVM 20-byte conversion), strict validation with distinct error codes.
- Stealth wrappers over core-crypto scheme 1: derive, scan, spend-key derivation. The 20-byte account payload is identical to the EVM stealth address, so the wrappers only change presentation and never reimplement crypto.
- TRC-20 `transfer` / `balanceOf` ABI encoders and plain-data `triggersmartcontract` / `triggerconstantcontract` bodies (no network). `fee_limit` is bounded in sun.
- `ChainAdapter`-shaped skeleton with all fees `not_enforceable`.

## Proposed `ChainFamily` extension
In `packages/chain-adapters/src/adapter.ts` change
`type ChainFamily = 'evm' | 'bitcoin' | 'solana'` to `'evm' | 'bitcoin' | 'solana' | 'tron'`.
`RecipientAddress.family` and `PaymentRequest.family` then admit `'tron'`. `PaymentRequest.router`/`feeRecipient` are typed as EVM `Address` and need to widen to `string` (or a per-family type) for Tron base58 values. The chain-tron package exports `TronFamily = 'tron'` and local copies of the interfaces until that change lands.

## Open items
See `packages/chain-tron/DEVIATIONS.md` (unverified vectors, TronGrid schema, fee_limit cap). Signing, node client, event source, and the Tron router contract are out of scope here.
