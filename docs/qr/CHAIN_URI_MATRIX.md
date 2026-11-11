# Payment request QR: chain compatibility matrix

Source: `packages/payment-uri` (builders and parsers), `apps/web/src/components/PaymentRequestQr.tsx` (display),
`apps/web/src/lib/qrClassify.ts` (classification). All parsing is local. Parsers reject and never repair. That
includes whitespace, `+`, fragments, duplicate or empty parameters, bad percent-encoding, invalid UTF-8, and
bidi or zero-width characters in labels. Amounts are exact `bigint` decimals (no floats, exponents, signs, leading
zeros, zero, excess precision or overflow). Errors carry a stable code and never echo input.

## What GhostPay shows and what it accepts

| Chain | GhostPay displays | Format / standard | GhostPay imports by QR | Notes |
|---|---|---|---|---|
| EVM (stealth, the GhostPay product path) | Signed **invoice link** `https://<app>/#gpi=v1.<base64url>` (Create invoice) | GhostPay invoice envelope v1 (signed; optional key-in-link or passphrase encryption) | Pay → "Scan an invoice QR" (single or multi-part) | A plain EIP-681 request cannot express a stealth payment. The payer must derive a one-time address from the signed invoice. |
| EVM (plain) | Not offered in the product UI. The builders `buildEip681Native` / `buildEip681Erc20` exist and `PaymentRequestQr` renders them. | EIP-681 (native transfer, ERC-20 `transfer` only), ERC-3770 chain-prefixed address | Not accepted as a payment by any screen. Pay names it as a "plain wallet payment request" and opens nothing. | Other EIP-681 functions, ENS names, `value` on token transfers and bad EIP-55 checksums are rejected. |
| Bitcoin (Silent Payments, test networks) | `bitcoin:?sp=<sp-address>[&amount=<btc>]` (BTC view) | BIP-21 / BIP-321 with BIP-352 `sp=` | BTC sweep destination import (address only) | Mainnet use is disabled in the UI. A conventional BIP-21 address URI cannot carry every Silent Payments / PayJoin requirement. |
| Solana | Stealth meta-address (CAUTION frame); optional **plain** Solana Pay transfer request (`PlainPaymentRequest`) | Solana Pay transfer request (`solana:<recipient>?amount=&spl-token=&reference=&label=&message=&memo=`). Transaction requests are not supported. | Solana sweep destination import (address only) | The stealth meta-address cannot go in a wallet payment URI, so the plain request asks for an ordinary receive address. |
| TRON | Stealth meta-address (CAUTION frame); optional **plain** request | **NONSTANDARD** GhostPay form `tron:<T-address>?amount=&token=&network=&label=&message=` | TRON sweep destination import (address only) | TRON has no widely adopted payment URI. Other wallets will not understand this form, and GhostPay does not describe it as a standard. No URI is offered on the local test chain. |

## Validation per chain (parser behaviour)

| Check | EVM (EIP-681) | Bitcoin (BIP-21) | Solana Pay | TRON (GhostPay form) |
|---|---|---|---|---|
| Chain / network identity | `@chainId` required by the builders; `expectedChainId` option → `CHAIN_MISMATCH` | Network from the address HRP; `sp=` network checked | No chain field in the standard; the caller supplies the cluster | `network=` must be `mainnet`, `nile` or `shasta` (defaults to `mainnet` only when absent); the expected network is enforced when given |
| Recipient | EIP-55 checksum (mixed case must verify) | bech32/bech32m/base58 with checksum; `sp=` bech32m | base58, 32 bytes | base58check, `T` prefix (0x41) |
| Token | ERC-20 contract via `/transfer?address=` | n/a | `spl-token` mint (base58) | `token` contract (base58check) |
| Amount precision | uint256 atomic, EIP-681 number grammar | ≤ 8 decimals, ≤ 21 M BTC (in sats) | per-mint decimals via `solanaAtomic` | ≤ 18 decimals, bounded |
| Unknown / duplicate params | rejected (`UNKNOWN_REQUIRED_PARAM`, `DUPLICATE_PARAM`) | unknown `req-*` rejected; unknown optional keys dropped and reported by key only; duplicates rejected | unknown rejected; `reference` may repeat (≤ 8, distinct), others may not | unknown rejected; duplicates rejected |
| Length bound | 2048 chars (invoice links 22 200) | 2048 | 2048 | 2048 |

Test evidence: `packages/payment-uri/src/{vectors,negative,fuzz}.test.ts` (199 tests at the base of this work:
spec examples, BIP-173/350 vectors, EIP-55, mutation fuzzing) and `apps/web/src/lib/qrClassify.test.ts`
(classification per family, wrong-network and dangerous-scheme cases). Interoperability with third-party wallets
has **not** been exercised; see `PHYSICAL_DEVICE_ACCEPTANCE.md`.
