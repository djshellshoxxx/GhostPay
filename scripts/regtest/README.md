# Bitcoin regtest harness

Local Bitcoin Core in regtest mode plus a tiny Esplora-compatible shim, so the GhostPay Bitcoin feature (`apps/web/src/features/btc`) can be exercised with worthless coins. Regtest only: the shim refuses any other chain.

## Status
- `esplora-shim.test.mjs`: **passes** (no bitcoind needed): `node --test scripts/regtest/esplora-shim.test.mjs`.
- `e2e.mjs` and the web feature's live test executed successfully against Bitcoin Core 31.1 on November 9, 2026: scan, header verification, review, signing, broadcast, spentness rescan, mined confirmation and exact destination amount. This is local regtest evidence; the Docker compose stack and public networks were not exercised by that run.
- Feature tests in `apps/web` use a mock Esplora (`fixtures.testutil.ts`) and always run.

## Run

Without Docker, install and verify Bitcoin Core separately, then run:

```sh
npm ci --ignore-scripts
npm run build:libs
BITCOIND_BIN=/path/to/bitcoin/bin/bitcoind node scripts/regtest/run-local.mjs
```

`bitcoin-cli` is expected beside `bitcoind`; override it with `BITCOIN_CLI_BIN` if needed.
The runner creates a private temporary datadir, random RPC credentials and loopback-only ports,
disables peer connections, starts the existing Esplora shim, executes the real feature journey,
and removes its datadir/credentials after stopping its children. It also fails closed for a missing
binary or an unsuccessful journey. It neither downloads binaries nor changes production configuration.

The local qualification used the official
[`bitcoin-31.1-x86_64-linux-gnu.tar.gz`](https://bitcoincore.org/bin/bitcoin-core-31.1/bitcoin-31.1-x86_64-linux-gnu.tar.gz),
SHA-256 `b80d9c3e04da78fb6f0569685673418cf686fadba9042d926d13fb87ff503f9e`.
Its hash matched the official `SHA256SUMS`; eleven signatures on that file verified against the builder
keys in `bitcoin-core/guix.sigs` at `f432c43b5fbd6b8355daf36127acb7a73d0308b7`.
This records the downloaded-key verification basis, not independent personal authentication of the signers.
Binaries, keys, chain data and generated credentials are not committed.

With Docker:

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
`GET /blocks/tip/height`, `/block-height/:h`, `/block/:hash` (`id`, `height` and `tx_count` from `getblock` verbosity 1; the app requests exactly the pages `tx_count` calls for), `/block/:hash/header` (from `getblockheader` hex), `/block/:hash/txs/:start` (25 per page, from `getblock` verbosity 3; a start at or past the end is an HTTP 400, an error as in electrs, not an empty page), `/tx/:txid/outspend/:vout` (from `gettxout`, mempool included, spender details omitted), `/fee-estimates` (constant 1 sat/vB), `POST /tx`. CORS is open (`*`); it listens on 127.0.0.1 unless `SHIM_HOST` is set (compose publishes it on 127.0.0.1 only). Never expose it.
