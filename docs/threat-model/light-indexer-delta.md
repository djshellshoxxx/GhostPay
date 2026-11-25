# Threat-model delta: optional `/v1/logs` reference indexer (`packages/light-indexer`)

Status: **design-level delta, pre-audit, nothing deployed.** It adds one optional party to [THREAT_MODEL.md](THREAT_MODEL.md) section 2 and [PRIVACY_THREAT_MODEL.md](PRIVACY_THREAT_MODEL.md). Contract: [indexer-logs-api-v1.md](../specs/indexer-logs-api-v1.md). Decision: [ADR-0030](../adr/ADR-LOG.md). The service is a reference implementation for self-run or third-party testnet operators; no GhostPay-operated instance exists and the app does not use one by default.

The service is **not** private, complete or trustless. It moves the window-range observation from an RPC provider to an indexer operator; it does not remove it.

## 1. What the server receives

Only: method, request target (`/v1/logs?chainId&from&to&pageSize[&cursor]`), and the `Origin` header (CORS allow-list). It never receives a viewing key, spending key, view tag, stealth or meta-address, derived address or any match capability: the grammar has no such parameter and rejects unknown ones (`UNKNOWN_PARAMETER`). Matching stays in the client.

## 2. Who learns what

| Observer | Learns | Does not learn |
|---|---|---|
| Indexer operator, and anyone in front of it (host, TLS terminator, reverse proxy, CDN, network path) | Client IP (unless the client uses Tor or a proxy), TLS and HTTP fingerprint, user agent and other headers the browser sends, `Origin`; **which grid windows** are requested, so roughly how far a client has scanned and when; request **cadence and timing**; connection reuse linking several windows to one client; non-default `pageSize`/`cursor` values (a fingerprint); that the client scans this Announcer on this chain | Keys, view tags, which announcements are the client's, invoice contents, payment amounts beyond public chain data |
| The reference service process itself | Public chain data; aggregate counters (`requests`, per-status counts, pages, announcements served). It does not read the socket address or forwarding headers and writes no request log (source guard: `src/privacy.test.ts`) | Anything per request after the response is sent |
| Operator's upstream RPC | Which blocks the indexer reads (public, independent of any client) | Anything about clients: no client request is forwarded |
| Client's own RPC (second source) | Head reads and block-hash reads at the window ends and at every announcement block of the window (the same set for every client scanning that window), so it also learns scan position and timing | Keys, view tags |

Operator obligations the code cannot enforce: do not log IPs or per-request lines in a reverse proxy or host; publish the limits; serve the canonical Announcer only. A client cannot verify any of this.

## 3. What a malicious or faulty operator can do

| Action | Detected by the reference client? | Residual |
|---|---|---|
| Serve a fork or stale data after a reorg | Yes, when the window ends or an announcement block disagree with the second source (`HEAD_MISMATCH`) | Headers are not hash-recomputed: blocks between the checked ones can be fabricated consistently |
| Drop a header or truncate the window | Yes (`CONTINUITY`) | — |
| Withhold announcements inside blocks it reports | **No** | Missed payments; only a full RPC scan or receipt evidence finds them. This is why integrity is `unverified` |
| Inject structurally valid but fake announcements in real blocks | Partly: the block hash must match; content is not proven | Extra scan work; the app shows a router payment as verified only after the user's RPC receipt binds it to the announcer log |
| Cut pages (record or byte cap) | The reference client fails closed (`CONTINUITY`) | Availability |
| Refuse, rate-limit, halt, answer errors | Fails closed (`TRANSPORT`) | Availability |
| Correlate windows and timing per IP | No | Tor or a proxy hides the IP, not the cadence; fixed windows reduce, not remove, range information |

## 4. Service-side risks

- Announcer spam: bounded by the record limits (oversized logs are counted in `omitted`, not stored), the page record and byte caps, the window cap, and request-target and header-size caps. Storage still grows with spam inside the limits.
- Deep reorg beyond `maxReorgDepth`: the store halts (`HALTED`) instead of serving data it cannot reconcile; an operator rebuilds it.
- Crash mid-write: blocks and their announcements commit in one SQLite transaction (WAL, synchronous FULL), so the index stays at a block boundary.
- `node:sqlite` is an experimental Node API (ExperimentalWarning on start); a Node upgrade can change it.
- Not reviewed: rate limiting and connection exhaustion beyond Node's request and header timeouts; that belongs to the operator's proxy.

## 5. Unchanged

No PIR, MPC or blinded-token scheme (stage 3 stays research-only). No change to contracts, keys, signing, the relayer, `apps/web` defaults or the lean build. Mainnet chain ids are refused by config, store and service.
