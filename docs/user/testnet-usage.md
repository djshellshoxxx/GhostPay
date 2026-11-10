# Testnet usage

> **Testnet only.** GhostPay is pre-audit and this repository ships no deployment manifest. Ordinary EVM payment requires accepted deployment signatures and on-chain verification; listed networks and test views do not establish a qualified public deployment. Use test coins that have no value. Never paste a real private key or seed phrase into the app, a script, a chat or an issue.

This page explains what you can exercise today, what you cannot, and how to set up a local test run.

## What works today

| Area | Status |
|---|---|
| Creating seller keys and a meta-address (web app) | Works locally |
| Creating and reading invoice links (web app) | Works locally |
| Scanning, sweeping and tagging in the web app | Implemented; provider access and applicable deployment gates remain. See the handoff for executed validation |
| Paying an invoice on a live testnet | **Blocked in the default build**: no deployment manifest ships; an accepted signed manifest and RPC verification are required |
| Relayer sweep on a live testnet | Requires accepted deployment information and a configured relayer; no manifest ships, and live relayer qualification is not established |
| Bitcoin silent payments (full web build) | Receive, scan and sweep implemented for testnet4, signet and a local regtest node |
| Solana (full web build) | Receive, scan and SOL sweep implemented for localnet, devnet and testnet; no payer flow or SPL sweep |
| TRON (full web build) | Receive, scan and TRX sweep implemented for local, Nile and Shasta; no payer flow or TRC-20 sweep |

The full shell mounts these separate network views; the lean shell exposes a narrower workflow. Automated suites include mocks and optional local-node cases. The [current completion handoff](../handoffs/PRODUCT_COMPLETION_HANDOFF.md) records which checks ran and which were skipped; those results do not by themselves prove behaviour against a live wallet or public RPC.

## Testnets enabled in code

Ethereum Sepolia (11155111), Base Sepolia (84532), OP Sepolia (11155420), Arbitrum Sepolia (421614), Polygon Amoy (80002), BNB Smart Chain Testnet (97), Avalanche Fuji (43113), plus Solana localnet, devnet and testnet, TRON Nile, Shasta and local, and Bitcoin testnet4, signet and regtest. Mainnets are disabled in code. See [Ethereum payments](ethereum-payments.md), [Stablecoin payments](stablecoin-payments.md), [Bitcoin silent payments](bitcoin-silent-payments.md), [Solana payments](solana-payments.md) and [TRON payments](tron-payments.md).

## Getting test coins

Use a faucet you have checked yourself (its domain, its network and the amount it gives). The repository does not list faucet URLs because none were verified for this guide. Use a wallet that holds nothing else.

## Local test setup

From the repository root:

```bash
npm ci --ignore-scripts        # install exactly what package-lock.json says
npm run build:libs             # required before typecheck, tests or the web build
npm run dev -w @ghostpay/web   # starts the Vite dev server
```

For contract tests you need Foundry 1.8.5 (`forge`, `anvil`, `cast`). Local anvil default dev keys are fine on a local anvil node and nowhere else. They are public; any funds sent to them can be taken by anyone.

## Rules for test runs

1. **Local only for default keys.** The well-known anvil keys may be used only against `127.0.0.1`.
2. **No broadcast to a public chain without a key from the owner.** Scripts that touch testnets should default to a dry run or simulation. Broadcast needs a key that you provide yourself.
3. **Do not copy the fake manifest.** The web test fixture `apps/web/src/test/fakeManifest.ts` is test-only. Do not put its addresses in a real deployment.
4. **Check every address.** Compare the router, fee recipient and token addresses with the issuer or the project's published source before you trust them.
5. **Expect reverts.** Issuer blacklists, wrong networks and token quirks all cause failures. A failed test is useful information.

## What to report

If a test reveals a fault, record the chain id, the app version (commit), the steps and the exact error text. Do not include keys, seed phrases or invoice links with personal data. Follow [SECURITY.md](../../SECURITY.md) for anything that could affect funds.
