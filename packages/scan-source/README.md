# @ghostpay/scan-source

Scan source abstraction: where the wallet's scanner gets public ERC-5564 announcements from. Testnet-only PoC.
Spec: `docs/remote/privacy-specs/network-privacy.md` (Selector C `scanMode`, sections 4.7/4.8, NP-S-*, NP-P-*, NP-L-*),
`metadata-hardening.md` MH-SCAN-1..3. Interfaces (`PublicLogSource`, `RangeBackend`, `HttpTransport`, `HeadSource`, `LightClient`)
are defined locally; no other method package's internals are imported. `pir2` uses `@ghostpay/pir-two-server` (workspace dependency).

## Modes (user-selectable; default `range`)

| `scanMode` | Factory | Integrity | What it does |
|---|---|---|---|
| `range` (default) | `createRangeSource` | unverified | Grid-aligned full ranges (`windowBlocks`/`align`/`minSpan` default 1000), local matching, budgets (50 calls, 10 000 logs) |
| `indexer-tor` | `createIndexerSource` | unverified | `GET /v1/logs`; checks complete contiguous parent-hash chain; cross-checks window ends and every announcement block against a second source |
| `pir2` | `createPir2Source` | unverified | Two-server XOR PIR via pir-two-server; dummy-padded fixed W pages per epoch; manifest must match on both servers and third source |
| `light-client` | `createLightSource` | unverified, `proof` only if the client proves logs | Wraps another source; every returned block hash must be confirmed by the light client |
| (composition) | `createQuorumSource(sources, k)` | quorum | Fails closed on any disagreement (`SOURCE_DISAGREE`) |

`createScanSource({ mode, ... })` builds one; it never falls back to another mode. `describeScanMode(mode)` returns the honest UI text
(`SCAN_MODE_CLAIMS`); render it verbatim. All entry points refuse any chain outside 31337, 11155111, 84532.
`padWindow(from, to, align, minSpan)` is the pure window padding (a fresh install and a one-block catch-up send same-size requests).

## What each mode does NOT protect

- `range`: not your IP, the (coarse) scan range and timing, nor that you scan GhostPay announcements; a lying RPC can hide payments.
- `indexer-tor`: this package cannot check your transport; the IP is hidden only if you pass a non-direct profile, and then only from the server, not what you send. The indexer sees the padded range and can still omit records.
- `pir2`: see `@ghostpay/pir-two-server` README: needs two non-colluding operators; not IP, not "you use PIR", not timing.
- `light-client`: verifies answers, does NOT hide queries; log completeness is not proven.
- None of them hides anything on-chain. No source sends a view tag, key, address or meta-address (backend/URL shapes cannot carry them; tested).

## Unverified

- No real RPC, indexer, PIR operator, Tor or Helios was used: everything runs against in-memory fakes. Helios (WASM/browser, whether it verifies `eth_getLogs`) is UNVERIFIED; only the interface exists.
- The indexer wire format (`announcements`, `headers`) is this package's reading of the spec's "raw announcements plus block hash and indices"; the reference server is not built here.
- Header trio consistency is not hash-recomputed (only ends and announcement blocks are cross-checked).
- Scan scheduler/timer (NP-S-4) and `read-address` decoys are not implemented here (app owns them with `jitter.ts`; decoys are hygiene's).
