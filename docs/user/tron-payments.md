# TRON payments (TRX and TRC-20)

> **Proof of concept, test networks only, unaudited.** The web app has a "TRON (test)" view for Nile, Shasta and a local node. It can create a stealth meta-address, scan for payments and sweep **TRX only**. TRC-20 payments are detected and counted, but not swept: the view shows how many were not listed and the tokens stay at the one-time address. The view cannot send payments. Mainnet is disabled in the app and in code and refuses every call. Do not use real TRX or TRC-20 tokens.

TRON support lives in `packages/tron-adapter` (`@ghostpay/tron-adapter`); the web test view is `apps/web/src/features/tron`. It reuses the ERC-5564 scheme-1 secp256k1 derivation from `core-crypto` with a TRON-specific meta-address prefix (`st:trx:0x...`). It covers native TRX and TRC-20 transfers, scanning, and a `ChainAdapter`-style interface.

## Networks

| Network | Id in code | Enabled in code | Endpoint hint |
|---|---|---|---|
| Nile | `tron-nile` | yes | `https://nile.trongrid.io` |
| Shasta | `tron-shasta` | yes | `https://api.shasta.trongrid.io` |
| local | `tron-local` | yes | `http://127.0.0.1:9090` |
| mainnet | `tron-mainnet` | **no** (always refused, `CHAIN_DISABLED`) | none |

Source: `packages/tron-adapter/src/adapter.ts`. In the web view the node URL is entered by hand and the view refuses a node whose first block is the TRON mainnet genesis block (ids and sources: [chain data sources](../chains/SOURCES-2026-10-25.md)). The selected test network is not yet positively matched to its own genesis id. The endpoint hints are documentation only, not defaults. You must supply your own RPC endpoint.

## Using the test view

1. Open **TRON (test)**, pick Nile, Shasta or local node and enter a node URL you trust. Public TronGrid hosts may refuse some networks; use your own node if so.
2. Create or import keys. Keys live in memory only. A created wallet's backup keys stay hidden until you press **Show backup keys** and hide again after 60 seconds or as soon as the tab is hidden; save them. **Copy keys** asks first (other apps and web pages can read the clipboard), and **Hide keys**, **Lock**, the app lock and leaving the view empty the clipboard again (best effort; when the browser does not allow that at the time, at your next click or key press in the page).
3. Give the payer your `st:trx:` meta-address. The payer needs separate tooling that sends TRX with the `GPT1` announcement memo.
4. Scan from a little before the payment block, pick a found TRX payment, review the sweep, sign, then broadcast. TRC-20 payments appear only as a count.

## How it works

- **Meta-address.** The seller publishes a meta-address for the TRON prefix. The seller keeps the view and spend keys.
- **Payment.** The payer builds a TRX transfer or a TRC-20 `transfer` to a one-time TRON address derived from a fresh ephemeral key.
- **Announcement.** A memo tagged with a GhostPay magic value carries the ephemeral key and view tag.
- **Scanning.** `scanTron` reads the chain through your RPC and matches announcements to your view key. Only tokens listed in `trustedTokens` count as real value when scanning. Unlisted TRC-20 contracts are not trusted.
- **Sweep.** The seller signs a transfer from the one-time key. Transaction resources (energy, bandwidth) are not covered by GhostPay; plan for them yourself.

## Fees

The code marks all TRON fee capabilities as `not_deployed`: no checkout fee is enforced, no gas sponsorship is provided and no flat security fee applies. The energy numbers in `fees.ts` are estimates and are labelled UNVERIFIED in the source. Do not budget against them.

## Limits

- A TRC-20 transfer costs energy. A fresh recipient costs more than an existing holder. Estimates are not guarantees.
- Only tokens you put in `trustedTokens` are scanned as payments. Choose them from the issuer's documentation, not from a list you found online.
- The announcement and the transfer are public. The payer, amount, token and one-time address are visible on-chain.
- RPC providers see your IP and the addresses you query. Use your own node where you can.
- The web view sweeps TRX only (no TRC-20 sweep). The package has no router and no relayer. Nothing enforces the GhostPay fee schedule on TRON.

## Testing

Use Nile or Shasta with test TRX from a faucet you verify. Run the package tests with `npm test -w @ghostpay/tron-adapter`. Do not configure a mainnet endpoint.
