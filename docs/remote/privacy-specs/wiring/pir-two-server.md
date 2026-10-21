# Wiring: `@ghostpay/pir-two-server`

Status: package built, not wired. Owner of wiring: apps/web + relayer/ops owners. Testnet only; default OFF.

## Dependencies
- `packages/scan-source/package.json`: add `"@ghostpay/pir-two-server": "0.1.0"` (done by the scan-source builder; rerun `npm install`).
- Root `package.json` `build:libs`: build `pir-two-server` before `scan-source`.
- `docs/remote/third-party-additions.md`: no new third-party dependency (`@noble/hashes` 2.4.0, `fast-check` 4.10.2 already pinned).

## Operator side (deploy templates, `deploy/network-privacy/`, spec lane L)
1. A script that fetches announcements for a shard (via `chain-adapters` `fetchAnnouncements`), calls `packPages`,
   builds `new PirServer(pages, manifest)` and `createPirHttpServer(server, { host, port })`.
2. Two replicas run by two DIFFERENT operators/domains. One operator running both = no privacy. Disable access logs and
   never log request bodies at the reverse proxy.
3. Include `headHash` (hash of block `toBlock`) in the shard so clients can cross-check with their RPC.
4. Pages are immutable once the shard is final (`finalityDepth`); rebuild per epoch.

## Client side
- `apps/web/src/lib/settings.ts`: `network.scanMode` includes `'pir2'` with `pir2.servers: [urlA, urlB]` (validated by `validateServerPair`).
- UI (`apps/web/src/components/*` settings panel): render `PIR2_CLAIMS` (label, hides, doesNotHide, trustAssumption) next to the option; show `SAME_OPERATOR_NOTICE` when the testing override is on. Never label it anonymous/untraceable/mix.
- Transport: `createHttpLink(base, chainId, transport)` needs a `PirHttpTransport` that can POST binary and GET bytes through the chosen
  profile (`net-transport`). `RpcTransport.send` is text-only: add a bytes variant in `net-transport`.
- Normally used through `@ghostpay/scan-source` `createPir2Source`, not directly.
