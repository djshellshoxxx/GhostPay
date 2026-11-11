# Solana payments

> **Proof of concept, test networks only, unaudited.** The web app has a "Solana (test)" view for devnet, testnet and a local validator. It can create a stealth meta-address, scan for payments and sweep **SOL only**. It cannot send payments. SPL tokens are not swept: if the funding transaction also credited tokens, the view warns and the tokens stay at the one-time address. Mainnet is disabled in the app and refused by the package unless a developer passes an explicit flag. Do not use real SOL or tokens.

Solana support lives in `packages/solana-stealth` (design in [ADR-0017](../adr/ADR-0017-solana-stealth.md)). It implements dual-key ed25519 stealth payments for SOL and SPL tokens, with a `ChainAdapter` shape. The web test view (`apps/web/src/features/solana`) covers receive, scan and SOL sweep. Paying, SPL sweeping and fiat pricing are not in the app.

## Using the test view

1. Open **Solana (test)** and pick devnet, testnet or local validator. Enter an RPC server you trust; the app has no default. It refuses a server whose genesis hash does not match the selected cluster.
2. Create or import keys. Keys live in memory only; write down the backup seed shown once.
3. Give the payer your `st:sol:` meta-address. The payer needs separate tooling that sends SOL with the `gpst1:` announcement memo.
4. Scan from a little before the payment slot, choose the found payment, review the sweep, sign, then broadcast.

## Clusters

| Cluster | Chain id used by the package | Status in code |
|---|---|---|
| localnet | `sol-localnet` | enabled (package and web test view) |
| devnet | `sol-devnet` | enabled (package and web test view) |
| testnet | `sol-testnet` | enabled (package and web test view) |
| mainnet-beta | `sol-mainnet` | refused unless `allowMainnet: true`; disabled in the web view |

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

- The web view only receives, scans and sweeps SOL. There is no payer flow, no invoice flow, no SPL sweep and no router. Fees from [Fees](fees.md) are not applied on Solana.
- Token-2022 mints with extensions (transfer fees, hooks and similar) are unsupported. Do not use them with this package.
- The announcement memo is public. Anyone can see that a one-time address received a payment from a given sender.
- The sponsored fee payer is a new trust point. The sponsor sees the transaction it pays for.
- Stablecoins on Solana are not allowlisted. Treat any mint address as unverified until checked against the issuer's documentation.

## Testing

Use `localnet` or `devnet`. Run the package tests from the repository root with `npm test -w @ghostpay/solana-stealth`. Do not point the package at mainnet-beta.
