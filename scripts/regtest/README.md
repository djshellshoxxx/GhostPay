# Bitcoin regtest harness

Local Bitcoin Core in regtest mode plus a tiny Esplora-compatible shim, so the GhostPay Bitcoin feature (`apps/web/src/features/btc`) can be exercised with worthless coins. Regtest only: the shim refuses any other chain.

## Status
- `esplora-shim.test.mjs`: **passes** (no bitcoind needed): `node --test scripts/regtest/esplora-shim.test.mjs`.
- `e2e.mjs` and the compose stack: **not run** in the build environment (no bitcoind: bitcoincore.org is blocked there and Core binaries are not published on GitHub; no Docker daemon). The sender-transaction construction was checked offline against the package scanner. Run it yourself as below.
- Feature tests in `apps/web` use a mock Esplora (`fixtures.testutil.ts`) and always run.

## Run
```sh
# 1. pick a Bitcoin Core release, take the tarball sha256 from the signed SHA256SUMS (verify signatures yourself)
export BITCOIN_VERSION=<x.y> BITCOIN_SHA256=<hash of bitcoin-<x.y>-x86_64-linux-gnu.tar.gz>
export BITCOIND_RPC_USER=ghostpay BITCOIND_RPC_PASSWORD=$(openssl rand -hex 16)
docker compose -f scripts/regtest/docker-compose.yml up -d --build

# 2. build libs, then run the scripted flow
npm run build:libs
node scripts/regtest/e2e.mjs
```
`e2e.mjs`: funds a throwaway sender from the node wallet, sends a BIP-352 payment to a fresh `tsp1` address, runs `apps/web/src/features/btc/regtest.e2e.test.ts` (scan -> review -> sign -> broadcast -> rescan, using the real feature code) through the shim, mines a block and checks the destination balance with bitcoind.

To use the UI against the stack: `npm run dev -w @ghostpay/web`, choose "Bitcoin regtest (local)", server `http://127.0.0.1:3002`.

## Shim routes
`GET /blocks/tip/height`, `/block-height/:h`, `/block/:hash/txs/:start` (25 per page, from `getblock` verbosity 3), `/tx/:txid/outspend/:vout` (from `gettxout`, mempool included, spender details omitted), `/fee-estimates` (constant 1 sat/vB), `POST /tx`. CORS is open (`*`); it listens on 127.0.0.1 unless `SHIM_HOST` is set (compose publishes it on 127.0.0.1 only). Never expose it.
