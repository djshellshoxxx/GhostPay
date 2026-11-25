# @ghostpay/light-indexer

Optional reference service for the public `GET /v1/logs` ERC-5564 announcement API consumed by
`@ghostpay/scan-source` `createIndexerSource`.

**Status: testnet only, unaudited, not deployed.** No GhostPay-operated instance exists; the app does not use one by
default and never depends on one. This is code an operator can self-run against their own RPC. It is not private,
complete or trustless: clients must keep cross-checking block hashes against an independent source (the reference
client does).

- Wire contract: [`docs/specs/indexer-logs-api-v1.md`](../../docs/specs/indexer-logs-api-v1.md)
- Who learns what: [`docs/threat-model/light-indexer-delta.md`](../../docs/threat-model/light-indexer-delta.md)
- Decision: ADR-0030 in [`docs/adr/ADR-LOG.md`](../../docs/adr/ADR-LOG.md); departures from the spec: [DEVIATIONS.md](DEVIATIONS.md)

## What it does

1. Follows one chain's ERC-5564 Announcer `Announcement` logs over JSON-RPC (`Indexer`, `JsonRpcChainReader`).
2. Stores every block header and the block's announcements in one SQLite transaction (`LogStore`, `node:sqlite`, WAL).
   On a reorg it rolls back to the common ancestor; a reorg deeper than `maxReorgDepth` halts the index.
3. Serves bounded, grid-aligned windows (`createLogsServer`): window, record and byte caps, block-boundary pagination,
   strict parameter grammar, fixed error codes. No runtime dependencies.

The server never receives keys, view tags or addresses, has no per-user parameter, does not read client addresses or
forwarding headers and writes no request log. It keeps aggregate counters only.

## Run (testnet)

```bash
npm run build -w @ghostpay/light-indexer
GHOSTPAY_INDEXER_RPC_URL=http://127.0.0.1:8545 \
GHOSTPAY_INDEXER_CHAIN_ID=31337 \
GHOSTPAY_INDEXER_ANNOUNCER=0x... \
GHOSTPAY_INDEXER_START_BLOCK=0 \
node packages/light-indexer/dist/cli.js
```

| Variable | Default | Meaning |
|---|---|---|
| `GHOSTPAY_INDEXER_RPC_URL` | required | Upstream JSON-RPC (http/https). Never printed. |
| `GHOSTPAY_INDEXER_CHAIN_ID` | required | 31337, 11155111 or 84532 only. Checked against `eth_chainId`. |
| `GHOSTPAY_INDEXER_ANNOUNCER` | required | Announcer contract address. |
| `GHOSTPAY_INDEXER_START_BLOCK` | required | First block (aligned down to the grid). |
| `GHOSTPAY_INDEXER_DB` | `./light-indexer.sqlite` | Store path. A store refuses a different chain, announcer or start. |
| `GHOSTPAY_INDEXER_HOST` / `_PORT` | `127.0.0.1` / `8787` | Listen address. Put TLS and any rate limit in a reverse proxy; configure it not to log IPs. |
| `GHOSTPAY_INDEXER_CORS_ORIGINS` | none | Comma-separated exact origins allowed to read from a browser. |
| `GHOSTPAY_INDEXER_CONFIRMATIONS` | `0` | Blocks kept behind the RPC head. |
| `GHOSTPAY_INDEXER_POLL_MS` | `4000` | Idle poll interval. |
| `GHOSTPAY_INDEXER_MAX_REORG_DEPTH` | `128` | Deepest automatic rollback. |
| `GHOSTPAY_INDEXER_ALIGN_BLOCKS` | `1000` | Window grid (match the client's window). |
| `GHOSTPAY_INDEXER_MAX_WINDOW_BLOCKS` | `2 x align` | Largest window. |
| `GHOSTPAY_INDEXER_MAX_PAGE_SIZE` | `1000` | Record cap per page. |
| `GHOSTPAY_INDEXER_MAX_RESPONSE_BYTES` | `8388608` | Body cap (keep at or below the client's 16 MiB read cap). |

## Tests

```bash
npm test -w @ghostpay/light-indexer
```

`src/contract.anvil.test.ts` needs `ANVIL_BIN` (Foundry v1.8.5) and `packages/contracts/out` (`forge build`); it skips
otherwise, and `REQUIRE_ANVIL=1` (CI) turns a skip into a failure. A skip is not a pass.
