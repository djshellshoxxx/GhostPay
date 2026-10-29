# Apps: `@ghostpay/relayer` and `@ghostpay/web`

Neither is a library: both are `private` applications. This page documents the relayer's HTTP contract, configuration
and internals, and gives a module map of the web app. Operator procedures live in `docs/operators/relayer-runbook.md`.

Note on freshness: this page reflects commit `7aee906`. Metrics and alert hooks are listed as "in progress" in
`.env.example` and are not described here. The contract below is taken from `apps/relayer/README.md`,
`apps/relayer/DEVIATIONS.md` (items 17-20 cover the round-3 admission-control changes) and the validators in
`src/validate.ts`, `src/service.ts`, `src/server.ts`; check the source before relying on a detail.

## `@ghostpay/relayer`

Gas-sponsorship relay for `GhostPaySweepRelayer`. Node >= 22, ESM, `node:http`, `viem`, `@ghostpay/chain-adapters`
(fee maths, sweep typed data, RPC URL and manifest validation). It never holds user keys. It cannot redirect funds:
destination, amount, fee and `feeTo` are inside the owner's EIP-712 signature and enforced by the contract.

### HTTP API

All bodies are `application/json`, at most 16 KiB (`MAX_BODY_BYTES`). Unknown keys are rejected. Errors are
`{"error":{"code":"<class>"}}` with nothing else.

| Route | Purpose |
|---|---|
| `GET /healthz` | `{ status: 'ok' \| 'degraded' \| 'shutting_down', chains: [{ chainId, breaker: 'closed' \| 'open' \| 'half_open' }] }`; 503 when every breaker is open or during shutdown |
| `GET /v1/info` | version, fee policy (`F-SPONSOR`, gas multiplier 110 %, min 50 bps, cap 300 bps, quote TTL, deadline window) and per chain `{ chainId, name, sweepRelayer, feeTo, tokens: [{ address, symbol, decimals, permit }] }` |
| `POST /v1/quote` | request `{ chainId: number, token, owner, destination, amount }` (addresses 0x-hex, `amount` decimal string >= 1) -> `{ fee: string, feeTo, expiresAt: number, quoteToken: string }` |
| `POST /v1/sweep` | request below -> `{ txHash }` |

`POST /v1/sweep` body (types from `src/validate.ts`):

```jsonc
{
  "chainId": 84532,                       // JSON number
  "sweep": {                              // exactly the contract's Sweep struct; uints are decimal strings
    "token": "0x...", "owner": "0x...", "destination": "0x...", "feeTo": "0x...",
    "amount": "1000000", "fee": "5500", "deadline": "1760000000", "nonce": "1"
  },
  "sweepSig": "0x<65 bytes r||s||v>",    // EIP-712 over domain GhostPaySweepRelayer/1/chainId/contract; exactly 65 bytes
  "permit": { "value": "1000000", "deadline": "1760000000", "v": 27, "r": "0x<32>", "s": "0x<32>" },   // optional
  "quoteToken": "v1.<expiresAt>.<fee>.<hmac-sha256 hex>"
}
```

`permit` present -> `sweepWithPermit` (token must have `permit: true`, `permit.value >= amount`); absent -> `sweep`
(allowance already granted). The quote token is stateless: the HMAC (secret `QUOTE_SECRET`) covers the string
`ghostpay-quote-v1\n<chainId>\n<token>\n<owner>\n<destination>\n<amount>\n<fee>\n<feeTo>\n<expiresAt>` (addresses
lower-cased), compared in constant time. Single use is enforced by the contract nonce, not the server.

Sweep checks, in order (`README`): chain and token allowlist (`chain_not_supported`, `token_not_supported`, 422) ->
permit flag and value -> `feeTo` equals the relayer's -> quote authentic (`invalid_quote` 400), unexpired
(`quote_expired` 410), `fee >= quote.fee` (`fee_below_quote`), `fee <= 300 bps` (`fee_above_cap`) -> deadline in
`(now + min, now + max]`, max 1800 s -> contract static rules (`invalid_order`) -> signature recovers to `owner` ->
per-owner rate limit -> `PolicyGate` -> breaker -> **admission control** (a stateless `eth_call` pre-simulation outside
the lane, at most 8 concurrent, `503 busy` beyond that; a client IP may hold at most `ceil(0.75 * queue.maxPending)` lane
slots, else `429 rate_limited_ip`) -> serial per-chain lane: gas-price cap, balance floor, **fee floor** (the signed fee
must still cover `gasUnits * current gas price` in token units, else `422 fee_below_cost`), the deadline again after the
queue wait (`deadline_too_soon` 422 unless more than `min` remains), `simulateContract`, gas limit, the deadline once
more right after that simulation (same class), daily budget -> send. Other classes: `invalid_*` 400, `unsupported_media_type` 415,
`body_too_large` 413, `invalid_url` 400, `rate_limited_ip`/`rate_limited_owner` 429, `origin_not_allowed` 403,
`queue_full`/`busy`/`shutting_down`/`rpc_unavailable`/`send_failed`/`budget_exhausted` 503, `not_found` 404,
`method_not_allowed` 405, `internal_error` 500.

Client side: `apps/web/src/lib/relayerClient.ts` (`requestQuote`, `submitSweep`; reads the error class from
`{"error":{"code"}}` and caps the response at 16 KiB while streaming) and, for the signing, `packages/chain-adapters`
(`assertSponsorFeeAcceptable`, `buildSweepTypedData`, `signSweep`, `buildPermitTypedData`, `signPermit`). A client must
refuse a quote above 300 bps before signing anything; `relayedSweep` also re-checks quote expiry (30 s margin) and the cap
immediately before signing.

### Configuration

JSON file (`RELAYER_CONFIG`, default `./relayer.config.json`; example `relayer.config.example.json`) plus environment.
Strict validation: unknown keys, wildcard or non-https origins, plain-http or credentialed RPC URLs and non-stable tokens
stop startup, with an error naming the unknown key. Top-level keys in the example: `listen`, `allowedOrigins`, `trustedProxies`, `quoteTtlSeconds`,
`deadline { minSeconds, maxSeconds }`, `rateLimit`, `breaker`, `queue`, `shutdownGraceSeconds`, `chains[]` with
`chainId`, `rpcUrl` or `rpcUrlEnv`, `feeTo`, `tokens[] { address, usdStable: true }`, `nativeUsdPrice`, `gasUnits
{ sweep, sweepWithPermit }`, `maxGasLimit`, `maxGasPriceWei`, `dailyBudgetWei`, `minBalanceWei`. Operator numbers have no
defaults on purpose; the example values are placeholders, not measurements.

| Environment variable | Meaning |
|---|---|
| `RELAYER_KEY_FILE` or `RELAYER_KEY` | 32-byte hot key (hex). A file must be a regular file with no group/world bits (`chmod 600`) |
| `QUOTE_SECRET_FILE` or `QUOTE_SECRET` | 32-128 byte HMAC secret (hex), same file rules |
| `RELAYER_CONFIG`, `DEPLOYMENTS_DIR` | config path; directory of `<chainId>.json` manifests (default `../../deployments`) |
| `ALLOW_MAINNET=1` | required, with a valid manifest, for any non-testnet chain |
| `<rpcUrlEnv name>` | RPC URL kept out of the file, e.g. `RPC_URL_84532` |

Chain id 31337 is accepted only with `allowDevChain: true` (and loopback http only with `allowInsecureLocalhostRpc`).
`trustedProxies` lists the reverse proxy's addresses or CIDR blocks: `X-Forwarded-For` is believed only from a listed TCP
peer and walked from the right past listed hops; otherwise the socket address is the client. Use loopback for a proxy on
the same host and, for the compose recipe, the backend subnet pinned in `deploy/docker-compose.yml` (`172.30.10.0/24`, as
in `deploy/config/relayer.config.example.json`, with `listen.host` `0.0.0.0`). The former hop count `trustProxyHops` is
refused at startup with an error naming it and pointing to `trustedProxies`. At startup each
chain's `sweepRelayer` must have contract code on the configured RPC (`eth_getCode`); when a manifest exists for the chain the
relayer also runs `verifyManifest` + `assertManifestVerified` once and refuses to start with `MANIFEST_READBACK_FAILED` (single
RPC, no periodic re-check, signature not verified; `apps/relayer/DEVIATIONS.md` item 21).

### Internals (`apps/relayer/src`)

| File | Role |
|---|---|
| `main.ts` | process entry (`node dist/main.js`), signal handling; excluded from coverage |
| `runtime.ts` | `buildRelayer(deps): Promise<Relayer>` wires clients, service and server; `buildChainClients` verifies each endpoint's chain id |
| `config.ts` / `secrets.ts` | `parseConfig`, `loadConfigFile`, `loadSecret` (`*_FILE` preferred), `ConfigError` |
| `server.ts` | `RelayerHttpServer`: routing, CORS allowlist, security headers, size/time limits, graceful shutdown |
| `service.ts` | `RelayerService`: business rules (admission pre-simulation, fee floor), response types `QuoteResponse`, `SweepResponse`, `InfoResponse`, `HealthResponse` |
| `validate.ts` / `codec.ts` | strict request parsing (`parseQuoteRequest`, `parseSweepRequest`, `QUOTE_TOKEN_PATTERN`) |
| `quoteToken.ts` | `signQuote`, `verifyQuote` |
| `chain.ts` | `ChainClient` interface and `createViemChainClient` (simulation, send, receipt; legacy `gasPrice` transactions) |
| `lane.ts`, `breaker.ts`, `budget.ts`, `limiter.ts` | `ChainLane`/`NonceManager`, `CircuitBreaker`, `DailyBudget`, `RateLimiter`/`KeyHasher`/`LruMap` |
| `pricing.ts` | `GasPriceSource`, `TokenPriceSource`, `RpcGasPriceSource`, `FixedStablePriceSource` (token fixed at 1.0 USD) |
| `policy.ts` | `PolicyGate` compliance hook; default `allowAllPolicy` (ADR-0006) |
| `log.ts`, `errors.ts` | `createLogger` (logs only `requestId, route, status, chainId, txHash, errorClass`), `RelayerError`, `SimulationRevert` |

Extension point: a sanctions or abuse screen implements `PolicyGate.check(ctx: PolicyContext): Promise<PolicyDecision>`
and is passed as `RuntimeDeps.policy`. `allow: false` returns `policy_denied` (403); a thrown/failed check returns
`policy_unavailable` (503). Replacing pricing (`GasPriceSource`/`TokenPriceSource`) is how a real oracle would be added;
today the native price is an operator constant, which is acceptable on testnets only (ADR-0012).

Run: `npm run build -w @ghostpay/relayer` then `RELAYER_KEY_FILE=... QUOTE_SECRET_FILE=... RELAYER_CONFIG=...
node apps/relayer/dist/main.js` (**not executed here**). Tests: `npm test -w @ghostpay/relayer`; the anvil e2e is described in
[testing.md](../testing.md#6-anvil-end-to-end-tests).

## `@ghostpay/web`

React 19 + Vite 8 static bundle. Everything runs locally; there is no backend. Build: `npm run build -w @ghostpay/web`
(`tsc --noEmit && vite build`, then `postbuild` runs `scripts/scan-bundle.mjs`). Dev: `npm run dev -w @ghostpay/web`
(the dev server strips the meta CSP because React Refresh injects inline scripts).

Entry: `index.html` -> `src/main.tsx` -> `App.tsx` with `state.tsx` (React state) and a `ServicesContext`
(`src/lib/services.ts`: everything with side effects, injectable for tests; defaults in `defaultServices.ts`).

| Area | Files (`apps/web/src`) |
|---|---|
| Views | `views/Home`, `SellerKeys` (with the optional ERC-6538 panel `Registry`), `CreateInvoice`, `Pay`, `Scan` (confirmations, `final`, reorg drop, `verified` vs `claimed` amounts), `Sweep`, `Settings`, `About` (+ `*.test.tsx`) |
| Keys | `lib/session.ts` (in-memory `SecretScalar` closure; `generateSession`, `importSession`, `exportKeystore`, `importKeystore`, `clearSession`), `lib/keystore.ts` (versioned encrypted backup, scrypt N=2^17 r=8 p=1, `encryptKeystore`/`decryptKeystore`) |
| Invoices | `lib/invoiceCreate.ts` (`computeTotals`, `buildInvoiceLink`), `lib/fragment.ts` (`readInvoiceFragment`, `clearFragment`, `extractFragment`), `lib/pay.ts` (`reviewInvoice`, `trustView`, `createPayContext`, `quoteBuffer`, `SWEEP_GAS_ESTIMATE = 100_000n`, `MAX_BUFFER_WEI = 10^16`, `BUFFER_QUOTE_TTL_SECONDS = 120`) |
| Payment | `lib/payExec.ts` (`preparePayment`, `sendPayment`, `ensureAllowance`, `buildReceipt`), `lib/wallet.ts` (EIP-6963 discovery, EIP-1193 fallback, `connectWallet`, `sendViaWallet`, `signTypedDataViaWallet`, `SubmissionMismatchError`) |
| Manifest | `lib/manifest.ts` (`loadManifest` -> `absent` / `invalid` / `unverified` / `loaded`; `verifyManifestOnChain` runs `verifyManifest` + `assertManifestVerified` against the user's RPC and turns a failure or a missing RPC into `unverified`; payments stay disabled unless `loaded`, so paying needs a configured RPC), `public/deployments/` (README only) |
| Scan | `lib/scanClient.ts` (`runScan`, `localCheckpointStore`), `lib/scannerCore.ts` (`ScanSession`, `ScanProtocol`, `WireLog`), `lib/scanner.worker.ts` (thin worker entry), `lib/workerFactory.ts` |
| Sweep | `lib/sweep.ts` (`deriveVerifiedSweepKey`, `checkDestination`, `getSweepQuote`, `relayedSweep`, `directSweep`), `lib/relayerClient.ts` |
| Misc | `lib/settings.ts` (`localStorage`, plain text, RPC URLs may hold provider keys), `lib/tags.ts` (encrypted local tags in IndexedDB via `idbStore.ts`), `lib/jitter.ts`, `lib/release.ts` (informational release-hash widget), `lib/qr.ts`, `lib/format.ts`, `lib/errors.ts` (`UserFacingError`) |
| Static policy | `public/_headers` (real CSP and friends), `public/ghostpay-embed-v1.js` (popup-only embed SDK, takes a full invoice link) |

Test helpers live in `src/test/` (`mockChain.ts`, `mockRpc.ts`, `mockWallet.ts`, `keys.ts`, `invoiceFixtures.ts`,
`fakeManifest.ts`, `announcements.ts`, `inlineWorker.ts`, `render.tsx`). Deviations (21+ items, e.g. no registry
publishing, fiat invoices unpayable, manifest signature unverified, direct-sweep path, delay feature, coverage
exclusions): `apps/web/DEVIATIONS.md`.

Rules specific to this app: no network access in the worker, no `innerHTML`/`dangerouslySetInnerHTML`, no third-party
origins (the bundle scan has an explicit allowlist of inert URL strings), no key material in web storage (an e2e test
inspects `localStorage`, `sessionStorage`, IndexedDB and cookies), the invoice link is removed from the address bar by
`history.replaceState` right after reading (setting, default on).
