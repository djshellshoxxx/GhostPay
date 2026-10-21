# Solana payments

> **Proof of concept, library only, unaudited.** Solana is not in the web app. You cannot pay or sweep on Solana from the GhostPay UI. Mainnet is refused unless a developer passes an explicit flag. Do not use real SOL or tokens.

Solana support lives in `packages/solana-stealth` (design in [ADR-0017](../adr/ADR-0017-solana-stealth.md)). It implements dual-key ed25519 stealth payments for SOL and SPL tokens, with a `ChainAdapter` shape. Developers can call it from code. The web app does not import it.

## Clusters

| Cluster | Chain id used by the package | Status in code |
|---|---|---|
| localnet | `sol-localnet` | enabled |
| devnet | `sol-devnet` | enabled |
| testnet | `sol-testnet` | enabled |
| mainnet-beta | `sol-mainnet` | refused unless `allowMainnet: true` |

Mainnet is also gated by `docs/chains/CHECKLIST.md`.

## How it works

- **Meta-address.** The seller has a spend key and a view key (ed25519). The meta-address is encoded as an `st:sol:` string with a checksum and a cluster byte.
- **Payment.** The payer derives a one-time address from the meta-address and a fresh ephemeral key. The payer sends SOL (System Transfer) or a token (SPL Token, or Token-2022 for plain transfers) to that address.
- **Announcement.** A memo of the form `gpst1:` plus base58 of the ephemeral public key and a view tag is attached to the transaction.
- **Detection.** The seller pages through announcements with a view key and checks whether the one-time address was credited.
- **Sweep.** The seller derives the one-time spend key and signs a transfer. The package can attach a sponsored fee payer, so the seller does not need SOL for fees.

## Program ids (checked against official packages)

| Program | Id |
|---|---|
| System | `11111111111111111111111111111111` |
| SPL Token | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Token-2022 | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (plain transfers only) |
| Associated Token Account | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` |
| Memo (used to send) | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` |

Source: `docs/chains/solana.md`, read from `@solana-program/*` packages on 2026-10-21. Token-2022 extensions are not supported. A memo program id not verified on a given cluster is never used to send.

## Limits

- No UI, no invoice flow and no router. Fees from [Fees](fees.md) are not applied on Solana.
- Token-2022 mints with extensions (transfer fees, hooks and similar) are unsupported and may lose funds if used.
- The announcement memo is public. Anyone can see that a one-time address received a payment from a given sender.
- The sponsored fee payer is a new trust point. The sponsor sees the transaction it pays for.
- Stablecoins on Solana are not allowlisted. Treat any mint address as unverified until checked against the issuer's documentation.

## Testing

Use `localnet` or `devnet`. Run the package tests from the repository root with `npm test -w @ghostpay/solana-stealth`. Do not point the package at mainnet-beta.
