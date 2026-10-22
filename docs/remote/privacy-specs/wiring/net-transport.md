# Wiring: @ghostpay/net-transport

Library only; nothing below has been done. Derived from `network-privacy.md` section 5.1. Imports are from `@ghostpay/net-transport` public API only.

## 0. Package and build

- `packages/net-transport/package.json` now declares `@ghostpay/chain-adapters` (dependency, `RpcTransport`, `RpcHttpError`, `ChainAdapterError`, `validateRpcUrl` are imported at runtime) and devDependency `@ghostpay/net-harness`. The root `package-lock.json` was NOT updated: run `npm install` once at the root (owner).
- Root `package.json` `build:libs`: build `net-harness` before running `net-transport` tests (tests import the harness `dist`), and `chain-adapters` before `net-transport`.
- `viem` stays declared but unused here; drop it if the owner prefers.

## 1. `packages/chain-adapters/src/rpc.ts`

Spec asks for `UrlOptions.allowOnionHttp`. Not needed by this package (it validates onion URLs itself with `validateOnionUrl`), but needed where the existing `validateRpcUrl` is the gate for user-entered URLs: add `allowOnionHttp?: boolean` (default false) accepting `http(s)://<valid v3>.onion` and call `validateOnionUrl` from net-transport at the web/relayer layer instead of copying the checksum code (chain-adapters must not import net-transport; apps do the composition).

## 2. `apps/web/src/lib/settings.ts`

- Add `network: { rpcProfile, relayerProfile, rpcMode, scanMode, experimental }` to `ghostpay.settings.v1`, additive migration, default `DEFAULT_NETWORK_SETTINGS`.
- Parse stored JSON with `validateNetworkSettings(raw, { env: 'web', network: { kind: 'evm', chainId }, builds: { onion: import.meta.env.VITE_NET_PROFILE === 'onion', nym: import.meta.env.VITE_NET_PROFILE === 'nym' }, ohttpGatewayConfigured })`; on `NetTransportError` fall back to defaults and show a non-secret warning.
- `checkRelayerUrl`: under profile `onion` call `validateOnionUrl(url, { allowHttp: true })`; otherwise unchanged.
- RPC URL list: `validateRpcMode(mode, urls, { network })` on save.

## 3. `apps/web/src/views/NetworkPrivacy.tsx` (new view, register in the existing router)

- Two profile selects (rpc, relayer) and scan and rpc mode selects, all defaulting to `direct` / `range` / `single`. Offer only ids allowed by `PROFILE_AVAILABILITY` for `env: 'web'`: `direct`, `tor-browser`, `onion` (onion build), `nym-mixfetch` (nym build + experimental toggle), `ohttp` (experimental toggle; RPC only with a configured gateway).
- Render `PROFILE_LABELS[id]`: `title`, `hides`, every `doesNotHide` line, `trust`, an "experimental" / "secondary, best-effort" badge. Do not paraphrase. Render `SCAN_MODE_LABELS`, `RPC_MODE_LABELS` next to the selects.
- Show `FIRST_USE_NOTICE` once per session when a non-direct profile is selected (NP-C-3). For `tor-browser` also `TOR_BROWSER_NOTICE`. Show a red state and block network calls when `selfTest()` returns `ok: false` (NP-T-5); never fall back to direct.
- Show `profile.warnings` (`relay-gateway-same-domain`, `secondary-best-effort`, `outproxy-sees-destination`) as text.
- `tor-browser` self-check: pass `env: { isSecureContext: window.isSecureContext, hasSubtleCrypto: typeof crypto?.subtle !== 'undefined', storageAvailable }` (computed locally, wrapped in try/catch). No third-party request.
- String lint (AT-NP-9): add a check over `apps/web/src` for "anonymous", "untraceable", "verified" next to onion, and "mix" outside the quoted Nym sentence.

## 4. Browser limits

`socks5h`, `tor-socks`, `i2p-outproxy`, `nym-socks5` use `node:net`/`node:tls`: they must not enter the web bundle (NP-B-2). Import them only from a Node entry (relayer, CLI, tests). In the web app import only `createProfile` for `direct`, `tor-browser`, `ohttp`, `nym-mixfetch` through a browser-safe subpath: the owner should add `exports["./browser"]` (a barrel without `socks5.ts`, `httpConnect.ts`, `request.ts`, `proxyUrl.ts`, `profiles.ts` socks branches) before wiring the web app; currently `index.ts` is a single Node-flavoured barrel. `scan-bundle.mjs` should fail the default build if `node:net` or `onion` literals appear (AT-NP-8).

## 5. `apps/web/src/lib/scanClient.ts`, `scanner.worker.ts`, `workerFactory.ts`, `relayerClient.ts`, `services.ts`

- Construct `createProfile(...)` per role and pass `profile.transport('scan-bulk' | 'read-address' | 'quote' | 'sweep' | 'submit' | 'health')` into chain-adapters `createClient(chain, url, { transport })` (`ClientOptions.transport`). Use a separate transport per purpose; do not share one between `scan-bulk` and `read-address`.
- Worker receives only the profile id and non-secret params (NP-B-3).
- Every request path must go through a profile (NP-T-1): remove direct `fetch` uses for RPC and relayer calls.

## 6. `apps/relayer/src/config.ts`, `runtime.ts`, `chain.ts`

- Config: `upstream.transport` = `{ type: 'direct' }` (default) or `{ type: 'socks5h', url, isolate }`; reject `socks5://` (the error is `PROXY_LOCAL_DNS`, surface as a startup failure); parse with `parseProxyUrl`.
- Runtime: build `createProfile({ id: 'tor-socks', network: { kind: 'evm', chainId }, proxyUrl, isolate })` and run `await profile.selfTest({ probe: { url: rpcUrl, expectedChainId: chainId } })` at boot; refuse to start on `ok: false`.
- viem: use `http(url, { fetchFn: transportToFetch(profile.transport('submit')) })` (or `custom({ request })`). Whether the pinned viem version accepts `fetchFn` with this adapter, and what happens to its retry layer, is UNVERIFIED (spec Q7); check `apps/relayer/package.json` and run one sweep on a devnet through the harness SOCKS server.
- Use `purpose: 'health'` for health polling and `'submit'` for sends (NP-I-3).
- `submit.privateEndpoint`, `listen.unix`, `bucketBy`: not in this package.

## 7. Docs

`docs/user/privacy-limits.md` and the Settings help text: copy `PROFILE_LABELS` NOT-protected lines (NP-C-1). `docs/operators/local-scanner-and-rpc.md`: state that SOCKS5h is the only supported proxy mode, `socks5://` leaks DNS, Tor needs `SafeSocks 1`, and that real Tor behaviour (isolation, exit acceptance by RPC providers) is unverified.

## 8. Tests to add in apps

AT-NP-1 (egress through harness), AT-NP-2/7 with the relayer config, AT-NP-20 (relayer boot with `socks5://` fails), AT-NP-21 (no resolver / no non-proxy TCP, needs a network namespace; not provided).
