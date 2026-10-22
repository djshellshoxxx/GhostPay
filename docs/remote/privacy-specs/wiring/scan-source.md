# Wiring: `@ghostpay/scan-source`

Status: package built, not wired. Testnet only. Default `scanMode = range`.

## Install / build
- `packages/scan-source/package.json` now lists `"@ghostpay/pir-two-server": "0.1.0"`. Rerun `npm install` (lockfile) and add `pir-two-server` before `scan-source` in root `build:libs` (the package imports its `dist`).

## `apps/web`
- `src/lib/settings.ts`: add `network.scanMode: 'range' | 'indexer-tor' | 'pir2' | 'light-client'` (default `'range'`, validate, migrate `ghostpay.settings.v1` additively) plus `network.indexerUrl`, `network.pir2Servers: [url, url]`.
- `src/lib/scanClient.ts`, `scanner.worker.ts`, `workerFactory.ts`: take a `PublicLogSource` factory (`createScanSource`) instead of building an RPC client. The worker receives the mode id and non-secret params only; fail closed on any `ScanSourceError` (no fallback to another mode).
- Settings UI: for each mode render `describeScanMode(mode)` (label, hides, doesNotHide, trust). `pir2` must show the non-collusion text; `light-client` must show "verifies answers, does not hide queries". Never say anonymous/untraceable/mix.
- Adapter for `range`: implement `RangeBackend` over `chain-adapters`: `getHead` from the RPC client, `getAnnouncements` = `fetchAnnouncements` for `{fromBlock,toBlock}` with `cursor.nextBlock = fromBlock`, mapped to plain objects (`schemeId, stealthAddress, caller, ephemeralPublicKey, metadata, blockNumber, blockHash, logIndex`). Results come back lowercase-hex: re-checksum addresses (`getAddress`) and run `validateAnnouncementLog` as the second validation layer.
- Reuse the same adapter for `HeadSource` (`head`, `blockHash` = `eth_getBlockByNumber`), used as the second/third source for indexer and PIR.
- Scheduler (NP-S-4): in `indexer-tor`/`pir2`, call `fetch` on a timer with `apps/web/src/lib/jitter.ts` jitter, independent of invoice activity.
- Transport: supply `HttpTransport` (bytes in/out, GET and POST) from `net-transport`; `RpcTransport.send` is text-only so `net-transport` needs a bytes variant. Use distinct isolation labels for the two PIR servers and for scan-bulk vs read-address.

## Optional
- Compose `createQuorumSource([range, indexer], 2)` for integrity; `createLightSource` once a Helios adapter implements `LightClient`.
