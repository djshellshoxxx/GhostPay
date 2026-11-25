# `/v1/logs` public announcement API: wire contract, version 1

Status: **draft contract, testnet only.** The reference service is `packages/light-indexer`: unaudited, not deployed, no GhostPay-operated instance exists. The reference client is `packages/scan-source/src/indexer.ts:createIndexerSource` (unchanged by this contract). Decision record: [ADR-0030](../adr/ADR-LOG.md). Threat-model delta: [light-indexer-delta.md](../threat-model/light-indexer-delta.md).

This contract describes **public** chain data only: ERC-5564 `Announcement` events of one Announcer contract on one chain, plus the block headers of the requested window. Nothing in it is private, complete or trustless. A client must keep cross-checking block hashes against an independent source (its own RPC); the reference client does (NP-S-7).

## 1. Versioning

- The path prefix `/v1/` and the `version` field (integer `1`) in every response body identify this contract.
- A later version adds a new prefix (`/v2/`). Within v1, fields are never removed or retyped; an unknown response field must be ignored by clients; an unknown request parameter is rejected by servers (section 2.2).

## 2. Request

`GET /v1/logs?chainId=<dec>&from=<dec>&to=<dec>[&pageSize=<dec>][&cursor=<dec>]`

### 2.1 Parameters

| Name | Required | Meaning |
|---|---|---|
| `chainId` | yes | EVM chain id the server serves. Testnet ids only: 31337, 11155111, 84532. |
| `from` | yes | First block of the window, inclusive. |
| `to` | yes | Last block of the window, inclusive. |
| `pageSize` | no | Record cap for this page, `1..maxPageSize`. Default: the server's `defaultPageSize`. |
| `cursor` | no | Continuation: first block of this page, `from < cursor <= to`. Taken from a previous response's `next`. |

Values are canonical unsigned decimals: `0` or `[1-9][0-9]*`, at most 20 digits; block numbers at most 2^53 - 1. No signs, leading zeros, hex, exponents, percent-encoding or `+`.

### 2.2 Rules (server MUST)

1. **Closed grammar.** Any parameter other than the five above is `UNKNOWN_PARAMETER`, including empty keys and case variants. There is, and will be in v1, no parameter for a key, view tag, stealth address, meta-address, caller, scheme id or any other recipient-specific value. Servers must reject rather than ignore unknown parameters so a client can never attach one silently.
2. Duplicate, empty or non-canonical values are `BAD_REQUEST`; so is `to < from` and a `cursor` outside `(from, to]`.
3. **Fixed grid.** `from` and `to + 1` must be multiples of `alignBlocks` (`WINDOW_NOT_ALIGNED`). Every client that scans the same blocks therefore sends the same request. Reference default `alignBlocks = 1000`, matching the client's default window (`getLogsMaxRange`).
4. **Bounded window.** `to - from + 1 <= maxWindowBlocks`, else `WINDOW_TOO_LARGE`. The server never truncates an oversized window into a smaller answer. Reference default `2000` (a 1000-block client request can straddle one grid boundary).
5. The request target (path plus query) is at most 512 bytes (`URI_TOO_LONG`).
6. Only `GET` (and `OPTIONS` for CORS preflight). Request bodies are not read.

The reference client sends exactly `chainId`, `from`, `to`, `pageSize`, with `from`/`to` padded to its grid. It never sends `cursor`.

## 3. Response (200)

`Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, no `Date` header.

```json
{
  "version": 1,
  "chainId": 31337,
  "announcer": "0x55649e01b5df198d18d95b5cc5051630cfd45564",
  "coverage": { "fromBlock": "1000", "toBlock": "1999" },
  "next": null,
  "head": { "number": "2999", "hash": "0x…" },
  "headers": [{ "number": "1000", "hash": "0x…", "parentHash": "0x…" }],
  "announcements": [{
    "schemeId": "1", "stealthAddress": "0x…", "caller": "0x…",
    "ephemeralPublicKey": "0x02…", "metadata": "0xab…",
    "blockNumber": "1047", "blockHash": "0x…", "logIndex": 0, "transactionHash": "0x…"
  }],
  "omitted": 0
}
```

| Field | Type | Meaning |
|---|---|---|
| `version` | integer | `1`. |
| `chainId` | integer | Served chain. |
| `announcer` | hex20, lowercase | The single Announcer contract indexed. |
| `coverage` | `{fromBlock, toBlock}` decimal strings | Inclusive span covered by `headers`: `fromBlock = cursor ?? from`; `toBlock <= min(to, head.number)`. |
| `next` | decimal string or `null` | Set only when a cap (section 4) cut the page short: the next page's `cursor`, always `coverage.toBlock + 1`. `null` means the page ends at `min(to, head.number)`. |
| `head` | `{number, hash}` | The server's indexed head when the page was built. |
| `headers` | array | One entry per block of `coverage`, ascending, contiguous. |
| `announcements` | array | Records of the covered blocks, ordered by `(blockNumber, logIndex)`. |
| `omitted` | integer | Announcer logs in the covered blocks that are **not** in `announcements` (outside the record limits of section 3.2, or undecodable). Never more than that. |

All hex is lowercase and 0x-prefixed. Block numbers are decimal strings; `logIndex` is a JSON integer.

### 3.1 Header continuity fields

For every `i > 0`: `headers[i].number = headers[i-1].number + 1` and `headers[i].parentHash = headers[i-1].hash`. For every announcement, `blockHash` equals the hash of the header with its `blockNumber`. On a continuation page, `headers[0].parentHash` equals the last header hash of the previous page. A server whose stored chain violates any of this answers `STORE_INCONSISTENT`, never a shorter page.

The reference client checks: first header number equals the padded `from`; last header number equals `min(padded to, second-source head)`; the header count matches; parent links; and the window ends and every announcement block hash against its second source. A header gap is a `CONTINUITY` error in the client.

### 3.2 Record limits

These equal the reference client's structural validation (`scan-source/src/validate.ts`). A log outside them is counted in `omitted`, not served:

- `ephemeralPublicKey`: exactly 33 bytes. `metadata`: 1 to 4096 bytes (byte 0 is the view tag; the server does not interpret it).
- `schemeId`: at most 2^64 - 1 (served as a decimal string; the server does not filter by scheme).
- `stealthAddress`, `caller`: the indexed topics, which must be left-padded 20-byte addresses.

The server filters logs only by Announcer address and topic 0 (`keccak256("Announcement(uint256,address,address,bytes,bytes)")` = `0x5f0eab8057630ba7676c49b4f21a0231414e79474595be8e4c432fbf6bf0f4e7`).

## 4. Limits and pagination

| Limit | Reference default | Bounds |
|---|---|---|
| `alignBlocks` | 1000 | 1..1 000 000 |
| `maxWindowBlocks` | 2000 | `alignBlocks`..1 000 000 |
| `maxPageSize` (record cap) | 1000 | 1..100 000 |
| `defaultPageSize` | min(1000, `maxPageSize`) | 1..`maxPageSize` |
| `maxResponseBytes` (body cap) | 8 MiB | 64 KiB..64 MiB |

The response body never exceeds `maxResponseBytes`. Clients should set their read cap at or above it (the reference client's default is 16 MiB).

A page holds **whole blocks only**: each covered block with all of its served announcements. The server adds blocks in order and stops before the first block that would push the page over `pageSize` records or over `maxResponseBytes`; `next` is that block. If the very first block of a page alone exceeds a cap, the answer is `BLOCK_EXCEEDS_PAGE_LIMIT`, never a partial block.

Consequence for the reference client: it does not follow `next`. A cut page's headers stop before the end of its window, so the client raises `CONTINUITY` and the scan fails closed. **A result limit can never make an oversized window look complete.** A cursor-aware client must fetch every page of a window before using any of it, check `headers[0].parentHash` against the previous page, and treat the window as covered only when the last page has `next = null`. Because page boundaries depend only on public data and the published limits, every client scanning a window sends the same continuation requests.

## 5. Errors

Body: `{"version":1,"error":{"code":"<CODE>","message":"<fixed text>"}}`. Messages are fixed per code and never echo request values.

| HTTP | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Missing, duplicate, empty or non-canonical value; `to < from`; cursor outside `(from, to]`. |
| 400 | `UNKNOWN_PARAMETER` | Any parameter outside the grammar (also on `/v1/status`). |
| 400 | `WINDOW_TOO_LARGE` | `to - from + 1 > maxWindowBlocks`. |
| 400 | `WINDOW_NOT_ALIGNED` | `from` or `to + 1` off the `alignBlocks` grid. |
| 400 | `PAGE_SIZE_OUT_OF_RANGE` | `pageSize` outside `1..maxPageSize`. |
| 404 | `NOT_FOUND` | Other path. |
| 404 | `CHAIN_NOT_SERVED` | `chainId` differs from the served chain. |
| 405 | `METHOD_NOT_ALLOWED` | Not `GET`/`OPTIONS` (`Allow: GET, OPTIONS`). |
| 414 | `URI_TOO_LONG` | Request target over 512 bytes. |
| 416 | `BEFORE_INDEXED_RANGE` | `from` below the first indexed block. |
| 416 | `NOT_YET_INDEXED` | `cursor ?? from` above the indexed head. |
| 422 | `BLOCK_EXCEEDS_PAGE_LIMIT` | The first block of the page alone exceeds a cap. |
| 500 | `STORE_INCONSISTENT` | Stored header chain is not contiguous or parent-linked, or an announcement does not carry its block's hash. |
| 500 | `INTERNAL` | Anything else. |
| 503 | `NOT_READY` | Nothing indexed yet. |
| 503 | `HALTED` | A reorg deeper than the server's limit; the operator must rebuild the index. |

The reference client turns every non-200 into `TRANSPORT` and fails the scan closed.

## 6. `GET /v1/status`

No parameters. Returns `{version, chainId, announcer, indexedFrom, head: {number, hash} | null, halted, limits: {alignBlocks, maxWindowBlocks, maxPageSize, defaultPageSize, maxResponseBytes}}`. All of it is public. Request counters are not published.

## 7. Reorg and persistence semantics (reference service)

- The index stores every block header (number, hash, parent hash) from the first indexed block (the configured start aligned down to the grid) to its head, and each block's announcements together with that block in one transaction.
- Before advancing, the server compares its stored head with the chain's block at that height. On a mismatch, or when the chain is now shorter, it walks back to the highest stored block whose hash equals the chain's hash at that height (the common ancestor), deletes everything above it in one transaction, and re-indexes from there. If no common ancestor exists within `maxReorgDepth` (default 128 blocks), it marks itself halted and answers `HALTED`.
- New blocks are written only after their parent links and every log's block hash match the headers read for that batch; otherwise the batch is discarded and read again.
- The server's own "head" is a storage position, not a finality claim. A window served before a reorg can differ from the same window served after it; clients detect this through the second-source hash cross-check (`HEAD_MISMATCH`). Default `confirmations = 0`: a lag would make the reference client's newest window fail `CONTINUITY` whenever the client's own RPC is ahead.

## 8. CORS

`Access-Control-Allow-Origin` is sent only for an exact origin on the operator's allow-list (default: none), with `Vary: Origin`. Preflight answers `GET` only. No credentials.

## 9. Not in v1

No authentication, API keys or per-client tokens (they would identify clients). No server-side matching, view-tag filtering, PIR, MPC or "blinded" queries. No inclusion or completeness proofs. No mainnet.
