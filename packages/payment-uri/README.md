# @ghostpay/payment-uri

Pure, DOM-free, strict builders and parsers for payloads exchanged between a computer and a phone wallet (QR or paste). Not audited. See [`DEVIATIONS.md`](./DEVIATIONS.md) and [ADR-0022](../../docs/adr/ADR-0022-payment-uri.md).

| Format                                 | Builder                                 | Parser                           | Standard                                                          |
| -------------------------------------- | --------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| EVM native / ERC-20 `transfer`         | `buildEip681Native`, `buildEip681Erc20` | `parseEip681`                    | EIP-681 (Final)                                                   |
| Chain-prefixed address                 | `buildChainAddress`                     | `parseChainAddress`              | ERC-3770                                                          |
| Bitcoin (address, `sp=`, `lightning=`) | `buildBitcoinUri`                       | `parseBitcoinUri`                | BIP-21, BIP-321, BIP-352                                          |
| Solana Pay transfer request            | `buildSolanaPay`                        | `parseSolanaPay`, `solanaAtomic` | Solana Pay spec (transfer request only)                           |
| TRON                                   | `buildTronUri`                          | `parseTronUri`                   | NONSTANDARD GhostPay form; TRON has no widely adopted payment URI |
| GhostPay invoice link                  | `buildInvoiceLink`                      | `parseInvoiceLink`               | `https://host/pay#gpi=v1.<base64url>`                             |
| Any of the above                       |                                         | `parsePaymentUri`                | dispatch by scheme                                                |

Rules common to all parsers: reject, never repair. Input is length-bounded (2048 chars; invoice links 22200), raw non-ASCII, whitespace, `+`, fragments, empty or duplicate parameters, bad percent-encoding and invalid UTF-8 are rejected. `label`, `message` and `memo` reject control, bidi, zero-width/default-ignorable, private-use, tag and non-NFC text and are returned as PLAIN TEXT: render with `textContent`, never as HTML. Amounts use exact `bigint` decimal parsing (no floats, exponents, signs, leading zeros, zero, excess precision or overflow). Errors are `PaymentUriError` with a stable `code` and a fixed message that never contains input.

Every recipient comes back as `RecipientInfo { kind, canonical, display, digest }`: show `display` in full and `digest` beside it, and pass `canonical` to a lookalike detector (`@ghostpay/address-safety`). `mixedScriptText` flags Latin+Cyrillic/Greek words in label/message.

```ts
import { parsePaymentUri, buildBitcoinUri } from '@ghostpay/payment-uri';
const p = parsePaymentUri(scannedText, { eip681: { expectedChainId: 1 } });
if (p.kind === 'bitcoin') render(p.value.amountSats, p.value.silentPayment?.display);
```

Dependencies (already used in this repo, exact pins): `@noble/hashes` 2.4.0 (keccak, sha256), `@scure/base` 1.2.6 (base58, bech32). `bitcoinjs/bip21` and `@solana/pay` were reviewed and not used (see ADR).

Status: not wired into `apps/web`; the web app still uses `@ghostpay/btc-silent-payments` `buildBitcoinUri` (compatible output for the sp-only form). Test vectors: EIP-55, BIP-173/350 valid and invalid addresses, EIP-681 and BIP-21 spec examples, Solana Pay example, fuzz round-trips and mutation fuzzing.

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```
