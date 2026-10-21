# TRON payments (TRX and TRC-20)

> **Proof of concept, library only, unaudited.** TRON is not in the web app. You cannot pay or sweep on TRON from the GhostPay UI. Mainnet is disabled in code and refuses every call. Do not use real TRX or TRC-20 tokens.

TRON support lives in `packages/tron-adapter` (`@ghostpay/tron-adapter`). It reuses the ERC-5564 scheme-1 secp256k1 derivation from `core-crypto` with a TRON-specific meta-address prefix (`st:trx:0x...`). It covers native TRX and TRC-20 transfers, scanning, and a `ChainAdapter`-style interface.

## Networks

| Network | Id in code | Enabled in code | Endpoint hint |
|---|---|---|---|
| Nile | `tron-nile` | yes | `https://nile.trongrid.io` |
| Shasta | `tron-shasta` | yes | `https://api.shasta.trongrid.io` |
| local | `tron-local` | yes | `http://127.0.0.1:9090` |
| mainnet | `tron-mainnet` | **no** (always refused, `CHAIN_DISABLED`) | none |

Source: `packages/tron-adapter/src/adapter.ts`. The endpoint hints are documentation only, not defaults. You must supply your own RPC endpoint.

## How it works

- **Meta-address.** The seller publishes a meta-address for the TRON prefix. The seller keeps the view and spend keys.
- **Payment.** The payer builds a TRX transfer or a TRC-20 `transfer` to a one-time TRON address derived from a fresh ephemeral key.
- **Announcement.** A memo tagged with a GhostPay magic value carries the ephemeral key and view tag.
- **Scanning.** `scanTron` reads the chain through your RPC and matches announcements to your view key. Only tokens listed in `trustedTokens` count as real value when scanning. Unlisted TRC-20 contracts are not trusted.
- **Sweep.** The seller signs a transfer from the one-time key. Energy and bandwidth for the transfer must be covered by the one-time address or by the seller.

## Fees

The code marks all TRON fee capabilities as `not_deployed`: no checkout fee is enforced, no gas sponsorship is provided and no flat security fee applies. The energy numbers in `fees.ts` are estimates and are labelled UNVERIFIED in the source. Do not budget against them.

## Limits

- A TRC-20 transfer costs energy. A fresh recipient costs more than an existing holder. Estimates are not guarantees.
- Only tokens you put in `trustedTokens` are scanned as payments. Choose them from the issuer's documentation, not from a list you found online.
- The announcement and the transfer are public. The payer, amount, token and one-time address are visible on-chain.
- RPC providers see your IP and the addresses you query. Use your own node where you can.
- The package has no UI, no router and no relayer. Nothing enforces the GhostPay fee schedule on TRON.

## Testing

Use Nile or Shasta with test TRX from a faucet you verify. Run the package tests with `npm test -w @ghostpay/tron-adapter`. Do not configure a mainnet endpoint.
