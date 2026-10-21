# Privacy spec: Network-layer privacy (`@ghostpay/net-transport`, `@ghostpay/scan-source`, `@ghostpay/pir-two-server`, `@ghostpay/net-harness`)

Status: spec only, 2026-10-21. Branch `claude/remote-extensions-1`. Testnet PoC only (Ethereum Sepolia 11155111, Base Sepolia 84532; `packages/chain-adapters/src/config/chains.ts:34-35`). Effort: L overall (S/M/L per component in section 12).

Legal: deferred by the owner (ADR-0006, `anonymization-research.md` section 11). Noted once. Not a blocker. Operating an onion/I2P/Nym-reachable relayer or public PIR/indexer servers carries the same exposure as any relayer; anonymity of an operator does not change that.

Builds on: `docs/remote/onion-i2p-research.md` (cited as OI), `docs/remote/anonymization-research.md` section 9.3-9.7 (cited as AR), `docs/remote/security-specs/privacy-ops.md` (PO-*), `docs/remote/privacy-specs/hygiene.md` (HY-*), `docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md` Feature 5.

Evidence tags: [R] read in this repo this run; [P] primary source fetched this run (retrieval date 2026-10-21); [D] taken from OI, which fetched upstream repos on 2026-10-21 (mirror caveats in OI 0.1); [U] unverified or recalled from memory, must be checked before relying on it. No standards are invented. The sandbox could not reach `rfc-editor.org`, `datatracker.ietf.org`, `docs.flashbots.net`; every RFC statement below is [U] until re-read.

## 1. Goal

Let the user pick, per role, how their IP and read patterns are exposed to infrastructure, offering every technically valid option as a selectable profile in the testnet PoC:

1. Transport profiles for client and relayer egress: direct, Tor (ambient Tor Browser; SOCKS5h with stream isolation; onion-service RPC/relayer), I2P (hosting mirror; HTTP outproxy egress, secondary), Nym mix-fetch / Nym SOCKS5 (experimental), Oblivious HTTP (RFC 9458).
2. Private-RPC options: own node, user-chosen provider, multi-provider quorum, private-mempool submission endpoint for the relayer, onion RPC.
3. Scanning privacy: full-range download (default), view-tag prefilter, Tor-routed indexer (Feature 5 stage 1), two-server PIR (stage 2), light-client verification (Helios) as an integrity add-on.
4. A measurable leak test harness so each profile's claim is proved or refuted on testnet, per PO-NET-1.

## 2. Threat addressed, and what it does NOT protect

Adversaries (OI 2.6, PO section 3): AD-RPC (RPC provider), AD-RLY (relayer operator), AD-NET (local network/ISP), AD-HOST (static host / onion host), AD-EXIT (Tor exit or outproxy operator), AD-GPA (global passive observer).

| ID | Leak | Observer | Addressed by |
|---|---|---|---|
| N1 | Client IP visible to RPC provider on every read | AD-RPC | `tor-socks`, `tor-browser`, `onion-rpc`, `nym`, `ohttp` |
| N2 | Client IP visible to relayer on quote/sweep | AD-RLY | same, plus onion relayer |
| N3 | Relayer IP visible to its RPC provider | AD-RPC | relayer `tor-socks`/`ohttp` egress |
| N4 | RPC hostname leaks via local DNS when a SOCKS proxy is used | AD-NET | SOCKS5h only, fail-closed (NP-T-3) |
| N5 | Bulk scans and per-address reads share one circuit/IP, so one provider learns "this IP cares about address X" | AD-RPC | separate isolation labels (NP-I-1), HY-VER address-free reads |
| N6 | Scan range reveals when the user was online / which block range they care about | AD-RPC | fixed padded windows, schedule independent of invoice activity (NP-S-3) |
| N7 | Which log page the user fetches | indexer | two-server PIR (NP-P-*) |
| N8 | RPC lies (hide payments, fake balance) | AD-RPC | light-client / quorum verification (integrity, not privacy) |
| N9 | Sweep tx visible in public mempool before inclusion | everyone | private-submission endpoint option for relayer (NP-R-4) |
| N10 | Onion/eepsite hosts and clearnet `Onion-Location` trust | AD-HOST | out of scope here; OI section 1, 4.2 owns it. This spec only requires that transport profiles never claim "verified" (PO-NET-2) |

NOT protected (must be in the UI per profile and in `docs/user/privacy-limits.md`):

- On-chain data is unchanged by any overlay: payer, amount, token, timing, router use, ERC-5564 announcement (OI 2.6(1)).
- The relayer still sees owner, destination, amount, token, timing in the body; quote and sweep share the tuple (PO-COR-3). Hiding the IP does not hide content.
- Tor/Nym/I2P hide the network origin from the destination; they do not hide the request from the destination. A malicious RPC still sees addresses it is asked about (use HY-VER). Helios does not give query privacy (AR 9.5).
- Tor exit sees destination host and SNI, not TLS content (OI 2.5). Outproxy operators (I2P) see destination and, for plain HTTP, content (OI 3.3).
- Nym: mixing "does not protect against the server you are talking to"; per-request exit rotation not available in SDKs, so a destination can group requests (OI section 5, Nym row) [D].
- Wallet extension traffic goes to the wallet's own RPC outside GhostPay's control (OI 2.2, PO playbook line 323). The app cannot fix this; the UI says so.
- Timing correlation: announcement at block N followed by sweep request at N+k is not hidden by any transport (OI 2.6(4)). Jitter is a separate feature.
- Two-server PIR privacy requires non-collusion of the two servers (roadmap stage 2). Both run by one operator means no privacy.
- A browser that is not Tor Browser cannot be forced onto Tor by the page. `tor-browser` profile is a user assertion plus a best-effort self-check, never a proof (NP-B-4).

## 3. User-visible options

Settings -> "Network privacy" (non-secret, stored in `ghostpay.settings.v1`). Two independent selectors and one scan selector. Each option shows a one-line "hides / does not hide" label drawn from section 2.

Selector A, transport profile, set separately for `rpc` and `relayer` roles:

| Profile id | Environment | What it does | Default |
|---|---|---|---|
| `direct` | web, relayer | plain fetch, label "your RPC/relayer sees your IP" | yes |
| `tor-browser` | web | user runs the app inside Tor Browser; app relaxes nothing, only checks `check.torproject.org`-style signals is NOT used (leaks); instead warns if `window.isSecureContext` false and shows the checklist. Egress is ambient | no |
| `tor-socks` | relayer, desktop/Node CLI, tests | SOCKS5h to local tor, per-purpose stream isolation | no |
| `onion` | web (onion-hosted build), relayer | RPC/relayer URL is a v3 `.onion` (http allowed only in this profile) | no |
| `i2p-outproxy` | relayer, Node | HTTP proxy to i2pd/Java I2P outproxy; hosting mirror use per OI 3.5. Secondary | no |
| `nym-mixfetch` | web | `@nymproject/mix-fetch` v2 as fetch replacement [D]. Experimental flag | no |
| `nym-socks5` | relayer, Node | local `nym-socks5-client` SOCKS5 proxy [P: github.com/nymtech/nym README, 2026-10-21]. Experimental | no |
| `ohttp` | web, relayer | RFC 9458 encapsulated request via an OHTTP relay to a gateway the operator hosts [U] | no |

Selector B, RPC source (`rpcMode`): `single` (default, one user URL), `quorum` (>= 2 URLs, compare via existing `requestWithFallbackCheck`, PO-RPC-5), `own-node` (loopback or onion URL), `light-client` (Helios in worker, see section 4.7).

Selector C, scan source (`scanMode`): `range` (default; full `eth_getLogs` announcement ranges, view-tag filter local), `indexer-tor` (public-log indexer via Selector A profile), `pir2` (two-server PIR), `light-client` (range via Helios-verified logs).

Relayer operator config (not UI): `upstream.transport` (profile id and options), `submit.privateEndpoint`, `listen.unix`, `bucketBy`.

Rules: choosing a profile never changes what is sent, only the path. Profiles are never auto-selected. A profile that fails its self-test (section 9) shows a red state and blocks network calls rather than falling back to `direct` (NP-T-5).

## 4. Architecture

```
web client                                         relayer (Node)
 scanClient/pay/sweep                               chain.ts / service.ts
   | RpcClient (chain-adapters, ClientOptions.transport)     | viem transport
   v                                                         v
 net-transport  TransportProfile -> RpcTransport  <---- same package, node entry
   |- direct        (fetchTransport)
   |- socks5h       (node only; node:net + tls)  --> tor SocksPort / nym-socks5 / i2pd outproxy
   |- onion         (http .onion; needs onion-hosted origin)
   |- mixfetch      (browser only; wraps mixFetch)
   |- ohttp         (browser+node; HPKE encapsulation) --> OHTTP relay --> gateway --> RPC/relayer
 scan-source  PublicLogSource: range | indexer | pir2 | light  (all return validated announcements)
 pir-two-server: page DB + XOR-PIR client + 2 server processes
 net-harness: fake SOCKS5, leak recorder, fake OHTTP relay, DNS-denied runner
```

### 4.1 Purpose labels and isolation (OI 2.4, PO-NET-4)

Every request carries a `purpose` label: `scan-bulk`, `read-address`, `quote`, `sweep`, `submit`, `health`. The SOCKS profile maps purpose to SOCKS5 USERNAME/PASSWORD credentials (RFC 1928 + RFC 1929 [U]); Tor treats distinct credentials as distinct isolation classes (`IsolateSOCKSAuth` default on [D, tor.1 0.4.9.11]). Username = `gp1-<purpose>-<sessionId>`, password = 16 random bytes hex. `sessionId`: random per app session for `scan-bulk`/`health`; random per request for `read-address`, `quote`, `sweep`, `submit` (never reuse a circuit across a quote and its sweep... but note quote and sweep remain linkable by content, PO-COR-3). The label never leaves the process except as SOCKS credentials to a local proxy; it is never logged.

### 4.2 SOCKS5h client (node)

Own minimal client on `node:net`; no new dependency (alternative `socks-proxy-agent` 10.1.0 [D, OI N1] is an `http.Agent` and maps `socks5://` to local DNS; wrapping it is allowed but adds a dependency tree; decision Q3).

Handshake (RFC 1928 [U]): `05 01 02`; expect `05 02`; RFC 1929 auth `01 ulen user plen pass`; request `05 01 00 03 len host port`; ATYP `03` (domain) always, never `01/04` for hostnames. Reply `05 00 ...` success. Then `tls.connect({socket, servername: host})` for https; hostname resolution never performed locally (`dns.lookup` MUST NOT be called; asserted by test with a poisoned resolver). Config URL schemes accepted: `socks5h://`, `socks://`; rejected: `socks5://`, `socks4://`, `socks4a://` (N1 semantics: `socks5://` resolves locally [D]). Tor-side guard in operator template: `SafeSocks 1`, `TestSocks 1` for the staging run [D, tor.1].

Transport implements `RpcTransport` from `packages/chain-adapters/src/rpc.ts` unchanged: `send(url, body, {timeoutMs, maxBytes})`, throws `RpcHttpError(status)`, honours size cap and `redirect: error` semantics (a 3xx is a failure). Built on `https.request({createConnection})`, so Node's global `fetch` (undici) is not used.

### 4.3 Onion profile

`validateOnionUrl(raw)`: `http://` or `https://`, host matches `^[a-z2-7]{56}\.onion$`, optional port, no credentials, no fragment. Accepted only when profile is `onion` and (browser) `location.hostname` ends with `.onion`, or (Node) a SOCKS5h profile is also active. Rationale: `validateRpcUrl` rejects `http:` (`rpc.ts:79`), and an HTTP onion fetched from an HTTPS clearnet page is mixed content (OI 2.5). v3 address checksum verified locally per rend-spec: `base32(PUBKEY | CHECKSUM | VERSION)` with `CHECKSUM = H(".onion checksum" | PUBKEY | VERSION)[:2]`, H = SHA3-256, VERSION = 0x03 [D, T3 gives the base32 layout; checksum construction is [U], verify against spec.torproject.org]. Secure-context caveats for HTTP onion pages are OI 1.8; this spec does not resolve them (open question Q1).

### 4.4 I2P

Hosting (eepsite, b33, encrypted LS2) is OI section 3 and is not repeated. Client egress profile `i2p-outproxy` = HTTP CONNECT to the router's HTTP proxy (i2pd default `127.0.0.1:4444` [D, I2 configuration.md]) with an outproxy configured router-side. CONNECT with hostname (no local DNS). Marked secondary and best-effort: no isolation primitive equivalent to Tor's is documented for i2pd's HTTP proxy [U]; outproxy availability and policy unverified [D]. UI label: "outproxy operator sees the destination". Relayer-as-eepsite uses i2pd server tunnel template in `deploy/network-privacy/i2pd/tunnels.conf.example` with `accesslist`/`i2p.streaming.maxConnsPerMinute` [D].

### 4.5 Nym

Browser: `nym-mixfetch` profile wraps `mixFetch` (`@nymproject/mix-fetch` v2, smolmix WASM in Web Worker, WebSocket to entry gateway, IPR exit) [D]. Needs CSP review: `wss:` already allowed by `connect-src https: wss:`; WASM instantiation under `script-src 'self'` may need `'wasm-unsafe-eval'` [U]; the PoC build profile `VITE_NET_PROFILE=nym` may add it, default build must not (NP-N-2). Node: `nym-socks5` is the same SOCKS5h client pointed at the local `nym-socks5-client` [P README]; stream isolation semantics unknown, so purpose labels are accepted but isolation is NOT claimed (NP-N-3). Nym docs state per-request exit rotation is not in the SDKs [D], so the destination can group requests: UI says so. Dependency footprint is large; the package is an optional peer (`optionalDependencies`) and the profile is feature-flagged off in the default bundle (bundle-size and scan-bundle rules, PO-TEL-1).

### 4.6 Oblivious HTTP

RFC 9458 [U]: client encapsulates a binary HTTP request (RFC 9292 [U]) with HPKE (RFC 9180 [U]) to the gateway's key config; the relay (proxy) sees client IP and ciphertext; the gateway sees the request, not the IP. Non-collusion between relay and gateway is required. Components:

- `ohttp/client.ts`: key config parse (`application/ohttp-keys`), encapsulate/decapsulate, `RpcTransport` adapter (POST `message/ohttp-req`, expect `message/ohttp-res`) [U media types].
- `ohttp/gateway.ts`: decapsulate and forward to local target (the relayer routes, or a configured RPC). Hosted by the relayer operator behind `/ohttp-gateway`, plus a separate `apps/` free reference relay in `packages/net-harness` for tests (not for production).
- HPKE source: Node 22 WebCrypto has no HPKE [U]; choose between `hpke-js` (`@hpke/core`) and noble-based [U]. Dependency policy: must not add a second `@noble/*` major (S3-24, hygiene spec). Decision Q4. Interop vector: RFC 9458 test vectors [U] must pass before use.
- Public RPC providers rarely host OHTTP gateways [U per AR 9.4]; so `ohttp` is practical for the GhostPay relayer (which hosts a gateway) and for a user's own node, not for arbitrary providers. UI greys out `ohttp` for RPC unless the URL has a configured gateway.

### 4.7 Scanning privacy (`@ghostpay/scan-source`)

Interface:

```ts
interface PublicLogSource {
  readonly kind: 'range' | 'indexer' | 'pir2' | 'light';
  readonly integrity: 'unverified' | 'quorum' | 'proof';
  fetch(req: { chainId: number; fromBlock: bigint; toBlock: bigint }, signal?: AbortSignal): Promise<{
    announcements: readonly ScannedAnnouncement[];   // chain-adapters/logs.ts, already validated by validateAnnouncementLog
    head: { number: bigint; hash: Hex };
    coverage: { fromBlock: bigint; toBlock: bigint };  // padded window actually fetched
  }>;
}
```

Implementations:

1. `RangeRpcSource` (default). Wraps existing `fetchAnnouncements`. Fetches fixed windows (NP-S-3). The view tag is checked locally per announcement (ERC-5564 view tag = first byte of metadata [P: eips.ethereum.org/EIPS/eip-5564 per hygiene spec]); this skips ~255/256 of full ECDH at a 124-bit margin (AR 9.6). The view tag is never sent to any server.
2. `IndexerSource` (Feature 5 stage 1). HTTP API `GET /v1/logs?chainId&from&to&pageSize` returning raw public announcements plus block hash and indices; client revalidates every record with `validateAnnouncementLog`, checks continuity (`parentHash` chain) against a second head source, and sends no key, tag or address. Server reference implementation: a thin cache over RPC in `packages/pir-two-server/src/indexer` (same page database as PIR).
3. `Pir2Source`. See section 4.8.
4. `LightSource` (Helios). Runs `a16z/helios` compiled to WASM [P: README says WASM-compilable, multichain light client, Sepolia and Base supported, execution RPC must support `eth_getProof`, unaudited, checkpoint < 2 weeks, 2026-10-21]. Role: integrity only. It verifies account/storage/state responses (balance, nonce, code, `balanceOf` slot), not log queries in general [U: whether Helios verifies `eth_getLogs` receipts-root inclusion is unverified]. `LightSource` therefore verifies logs by fetching block header + receipts proof only if Helios exposes it; otherwise it is used for `read-address` verification and as `head` oracle. It does NOT hide queried addresses from its execution RPC (AR 9.5); pair it with a transport profile. Integration is a PoC adapter behind an interface `LightClient { getBalance, getTransactionCount, getCode, getStorageAt, head }`, with the Helios WASM bundle loaded from `/vendor/helios/` same-origin (CSP `script-src 'self'`, `wasm-unsafe-eval` [U]). If WASM packaging for the SPA proves impractical in PoC budget, ship the interface plus a Node `helios` subprocess implementation and mark browser support as follow-up.
5. `QuorumSource`: compose k sources, require agreement on `(blockHash, announcement set hash)` over the window; disagreement is a hard error, not a silent pick (audit S3-14).

Address-free verification (HY-VER) is consumed from `@ghostpay/hygiene`, not reimplemented. This spec adds only the transport rule that `read-address` requests use their own isolation label and, when only `direct` is available, are sent with the HY-VER-4 decoys.

### 4.8 Two-server PIR (`@ghostpay/pir-two-server`)

Honest scope: PoC of the classic information-theoretic two-server scheme (Chor, Goldreich, Kushilevitz, Sudan; "Private Information Retrieval", FOCS 1995 / J. ACM 1998 [U, not retrieved]). Database = N fixed-size pages (page = fixed `PAGE_BYTES`, e.g. 4096, containing packed announcement records of a deterministic block shard, padded). Client wants page i:

- Sample random subset S of [N] (bitvector of N bits), send `S` to server A and `S xor {i}` to server B.
- Each server returns XOR of the pages in its set. Client XORs both answers = page i.
- Each server's view is a uniformly random subset, independent of i, if the servers do not collude. Query size N bits; server work O(N * PAGE_BYTES). For a PoC chain slice (e.g. 2^14 pages * 4 KiB = 64 MiB) this is acceptable on testnet; it does not scale to mainnet history, where Distributed Point Function PIR (the roadmap names two-server DPF, GPU-DPF reference [P: github.com/facebookresearch/GPU-DPF cited in roadmap, not re-fetched]) is the path. DPF is listed as follow-up, not PoC (NP-P-7).
- Integrity: each server also publishes `manifest` = Merkle root over page hashes plus the covered block-range header hash set. Client fetches the root from both servers and from a third source (the RPC head via `Range` source) and refuses if roots differ. A single page is verified only after XOR reconstruction by checking the Merkle path (the path itself is public per page index? NO: requesting a path for i leaks i). Therefore the client verifies by fetching the whole manifest leaf hashes (N * 32 bytes) once per epoch and hashing the reconstructed page against `leaf[i]`. Cost stated in section 10. Pages are immutable once the shard is finalized (depth `finalityDepth`).
- Pages hold public data only; scanning (ECDH + view tag) remains local. PIR hides which pages, not that the client uses PIR.
- Padding/schedule: the client always requests W pages per epoch (real + dummy random indices) on a timer independent of invoice activity (NP-P-4).

This is a valid but weak-by-design PoC: no robustness against a malicious server (answers verified by the leaf hash; a wrong answer is detected, not corrected), no collusion resistance, no timing resistance beyond the dummy schedule. These are in the UI warning for `pir2`.

### 4.9 Private-RPC and submission options

Read side: `single`, `quorum`, `own-node`, `light-client`, onion RPC (section 4.3). Write side (relayer): `submit.privateEndpoint` optional URL; if set, the signed raw tx is sent via `eth_sendRawTransaction` to that endpoint, else to the normal RPC. Documented candidates: Flashbots Protect-style private mempool RPC. Whether such an endpoint exists for Sepolia/Base Sepolia: [U] (docs.flashbots.net unreachable; PO-RPC-8 notes the same). The code treats it as an opaque URL; the PoC acceptance does not depend on one existing. On L2s the sequencer is the mempool; private submission semantics there are [U].

Own node over Tor: `onion` profile with `rpcMode=own-node`; operator guide `docs/remote/privacy-specs/network-privacy-runbook.md` is NOT written by this spec (listed in section 6).

## 5. Package and directory ownership

New packages (all private, UNLICENSED, type module, same scripts/devDeps pins as `packages/relayer-guard/package.json`, tsconfig as relayer-guard):

| Package | Dir | Owns | Runtime deps |
|---|---|---|---|
| `@ghostpay/net-transport` | `packages/net-transport/` | profiles, purpose labels, SOCKS5h client, onion URL validation, HTTP-proxy CONNECT client, OHTTP client/gateway, mixfetch/Nym adapters (optional peers), leak guard, profile self-tests | `@ghostpay/chain-adapters` (types only, `RpcTransport`, `RpcHttpError`), `@noble/hashes` 2.4.0 (same pin; SHA3 for onion checksum), HPKE lib per Q4 |
| `@ghostpay/scan-source` | `packages/scan-source/` | `PublicLogSource`, range/indexer/pir2/light/quorum sources, window padding, scan scheduler | `@ghostpay/chain-adapters`, `@ghostpay/pir-two-server` (client part) |
| `@ghostpay/pir-two-server` | `packages/pir-two-server/` | page packing, XOR-PIR client + server, manifest, reference indexer HTTP server (`bin/ghostpay-pir-server`) | `@noble/hashes` 2.4.0; Node built-ins for server |
| `@ghostpay/net-harness` | `packages/net-harness/` | test-only: fake SOCKS5 server, fake HTTP CONNECT proxy, request recorder, poisoned resolver, fake OHTTP relay, process-level egress denial helper | none beyond Node built-ins (private, never bundled) |

Templates (new files, no code): `deploy/network-privacy/tor/torrc.client.example`, `torrc.relayer-egress.example`, `torrc.relayer-onion.example`, `deploy/network-privacy/i2pd/tunnels.conf.example`, `deploy/network-privacy/nym/README.md`, `deploy/network-privacy/compose.example.yml`. Contents derived from OI 1.1-1.6, 4.3 (`SafeSocks 1`, separate SocksPort for egress, `HiddenServicePoWDefensesEnabled 1`, `HiddenServiceMaxStreams`, client auth for staging).

Directory layout per package: `src/`, `src/index.ts`, `src/*.test.ts`, `DEVIATIONS.md`, `README.md`, `vitest.config.ts`, `tsconfig*.json` copied from `relayer-guard`.

### 5.1 Edits to existing code (listed separately; require coordination, done last, one owner)

| File | Edit |
|---|---|
| `package.json` (root) | add new packages to `build:libs` ordering only if needed (workspaces glob already includes them) |
| `packages/chain-adapters/src/rpc.ts` | export `RpcTransport` etc. already public; add `UrlOptions.allowOnionHttp?: boolean` so `validateRpcUrl` accepts `http(s)://<56>.onion`; default false; test in `rpc.test.ts` |
| `packages/chain-adapters/src/logs.ts` | none required; `PublicLogSource.range` wraps `fetchAnnouncements` |
| `apps/web/src/lib/settings.ts` | add `network: { rpcProfile, relayerProfile, rpcMode, scanMode }` with zod-style validation; migrate `ghostpay.settings.v1` additively; `checkRelayerUrl` accepts onion under `onion` profile |
| `apps/web/src/lib/scanClient.ts`, `scanner.worker.ts`, `workerFactory.ts` | take a `PublicLogSource` factory instead of constructing an RPC client; worker must receive profile id, not credentials; fail closed if profile self-test fails |
| `apps/web/src/lib/relayerClient.ts` | route `quote`/`sweep` through profile transport with purpose label |
| `apps/web/src/lib/services.ts` / `defaultServices.ts` | construct transport per role |
| `apps/web/src/views/Settings*` (new view file under `apps/web/src/views/NetworkPrivacy.tsx`, route registration in existing router) | UI |
| `apps/web/public/_headers`, `apps/web/index.html` CSP | none for default build. Onion/Nym build profiles generate separate headers (new files `_headers.onion`, `_headers.nym`) per OI 4.3 |
| `apps/web/scripts/scan-bundle.mjs` | allow onion literals only in onion profile; denylist for forbidden telemetry already PO-TEL-3 |
| `apps/relayer/src/config.ts` | add `upstream.transport` (`direct` default; `socks5h` with `url`, `isolate`), reject `socks5://`; `submit.privateEndpoint`; `listen.unix`; `allowOnionOrigins`; `rateLimit.bucketBy: 'ip' | 'owner+global'` (OI 4.3, PO-NET-5) |
| `apps/relayer/src/runtime.ts`, `chain.ts` | construct viem `custom` transport over `RpcTransport` instead of `http(url)` when `upstream.transport` != direct. viem `http()` accepting a custom fetch: [U], so `custom({ request })` is the planned path |
| `apps/relayer/src/server.ts`, `service.ts` | `bucketBy` handling; unix-socket listen; route `/ohttp-gateway` (optional) |
| `docs/user/privacy-limits.md`, `docs/operators/local-scanner-and-rpc.md`, `docs/operators/mirror-hosting.md` (rewrite garbled sentence noted in OI 0.2) | wording per section 2, PO-NET-1 |

No contract changes. No ABI changes.

## 6. Interfaces

```ts
// @ghostpay/net-transport
export type Purpose = 'scan-bulk' | 'read-address' | 'quote' | 'sweep' | 'submit' | 'health';
export type ProfileId = 'direct' | 'tor-browser' | 'tor-socks' | 'onion' | 'i2p-outproxy' | 'nym-mixfetch' | 'nym-socks5' | 'ohttp';

export interface TransportProfile {
  readonly id: ProfileId;
  readonly experimental: boolean;
  readonly claims: readonly ('hides-ip-from-destination' | 'dns-remote' | 'stream-isolation' | 'timing-mix' | 'splits-who-what')[];
  transport(purpose: Purpose): RpcTransport;       // chain-adapters RpcTransport; one instance per call is fine
  selfTest(opts?: { signal?: AbortSignal }): Promise<SelfTestResult>;  // runs the leak checks it can; never contacts a third-party "what is my IP" service
}
export interface SelfTestResult { ok: boolean; checks: readonly { id: string; ok: boolean; detail: string }[] }  // detail never contains URLs/hosts

export interface Socks5hOptions { url: string /* socks5h:// | socks:// */; isolate: 'per-purpose' | 'per-request' | 'none'; connectTimeoutMs?: number; rand?: (n: number) => Uint8Array }
export function createSocks5hProfile(o: Socks5hOptions): TransportProfile;
export function parseProxyUrl(raw: string): { host: string; port: number; remoteDns: true };  // throws NetTransportError('PROXY_LOCAL_DNS') for socks5:// socks4://
export function validateOnionUrl(raw: string, o?: { allowHttp?: boolean }): string;
export function createOhttpProfile(o: { relayUrl: string; keyConfig: Uint8Array; targetBase: string }): TransportProfile;
export function createHttpConnectProfile(o: { proxyUrl: string }): TransportProfile;   // i2p-outproxy
export function createProfile(cfg: ProfileConfig): TransportProfile;                  // discriminated union by id; throws on unknown
export class NetTransportError extends Error { readonly code: 'PROXY_LOCAL_DNS' | 'PROXY_CONNECT' | 'PROXY_AUTH' | 'SOCKS_REPLY' | 'ONION_URL' | 'OHTTP_KEYCONFIG' | 'OHTTP_DECAP' | 'PROFILE_SELFTEST' | 'UNSUPPORTED_ENV' }  // fixed messages, never echo URLs

// @ghostpay/scan-source
export function createRangeSource(o: { client: RpcClient; windowBlocks: number; align: number }): PublicLogSource;
export function createIndexerSource(o: { baseUrl: string; transport: RpcTransport; secondHead: () => Promise<{ number: bigint; hash: Hex }> }): PublicLogSource;
export function createPir2Source(o: { servers: readonly [string, string]; transport: [RpcTransport, RpcTransport]; pageBytes: number; epoch: EpochPolicy }): PublicLogSource;
export function createLightSource(o: { lc: LightClient; inner: PublicLogSource }): PublicLogSource;
export function createQuorumSource(sources: readonly PublicLogSource[], k: number): PublicLogSource;
export function padWindow(from: bigint, to: bigint, align: number, minSpan: number): { from: bigint; to: bigint };  // pure

// @ghostpay/pir-two-server
export function packPages(anns: readonly ScannedAnnouncement[], shard: { chainId: number; fromBlock: bigint; toBlock: bigint }, pageBytes: number): { pages: Uint8Array[]; manifest: Manifest };
export function pirQuery(n: number, index: number, rand: (n: number) => Uint8Array): { qA: Uint8Array; qB: Uint8Array };   // bitvectors of ceil(n/8) bytes
export function pirAnswer(pages: readonly Uint8Array[], q: Uint8Array): Uint8Array;                                      // XOR of selected pages
export function pirReconstruct(aA: Uint8Array, aB: Uint8Array): Uint8Array;
export function verifyPage(page: Uint8Array, index: number, leafHashes: readonly Uint8Array[]): boolean;
```

HTTP wire (indexer/PIR server, reference): `GET /v1/manifest?chainId&shard` -> JSON `{ pageBytes, nPages, root, leafHashes: hex[], headHash, fromBlock, toBlock }`; `POST /v1/pir` body `application/octet-stream` = query bitvector, response = `pageBytes` octets; `GET /v1/logs` as in 4.7. All responses have fixed-size bodies per route (NP-P-5).

Relayer config shape (JSON; see section 5.1):

```json
{ "upstream": { "transport": { "type": "socks5h", "url": "socks5h://127.0.0.1:9150", "isolate": "per-purpose" } },
  "submit": { "privateEndpoint": "https://..." },
  "listen": { "unix": "/run/ghostpay/relayer.sock" },
  "rateLimit": { "bucketBy": "owner+global" } }
```

## 7. Requirements

Transport (T), isolation (I), SOCKS/onion/I2P/Nym/OHTTP specifics, scanning (S), PIR (P), relayer (R), browser (B), UI/claims (C). MUST/SHOULD per RFC 2119 [U].

- NP-T-1 (MUST): every network request from client and relayer goes through a `TransportProfile.transport(purpose)`. No other `fetch`/`http` use for RPC or relayer calls. Test AT-NP-1 (egress).
- NP-T-2 (MUST): profile `direct` is the only default; no automatic switching between profiles. Test AT-NP-11.
- NP-T-3 (MUST): SOCKS profiles use remote DNS: CONNECT carries ATYP 0x03 with the hostname for non-IP hosts; `dns.lookup`/`dns.resolve*` are never called; `socks5://`, `socks4://`, `socks4a://` URLs are rejected at config parse (`PROXY_LOCAL_DNS`). AT-NP-2. (PO-NET-3)
- NP-T-4 (MUST): `RpcTransport` contract preserved: `timeoutMs` and `maxBytes` enforced, non-2xx -> `RpcHttpError`, redirects fail. AT-NP-3.
- NP-T-5 (MUST): if a selected non-direct profile fails connect or self-test, requests fail with `NetTransportError`; there is no fallback to `direct`. AT-NP-4.
- NP-T-6 (MUST): error messages, logs and thrown values never contain the RPC/relayer URL, proxy credentials, `.onion` host, or purpose-session ids. AT-NP-5 (extends PO-RPC-6).
- NP-T-7 (MUST): `validateOnionUrl` accepts only 56-char base32 hosts with valid v3 checksum and version byte 3; rejects uppercase variants that fail canonicalisation, `.onion` v2 (16 chars), userinfo, fragment. AT-NP-6 with spec test vectors [U source: generate vectors from the Tor rend-spec algorithm and cross-check against a known address].
- NP-I-1 (MUST): distinct SOCKS credentials (username, password) per isolation class: `scan-bulk` and `read-address` never share credentials; `read-address`, `quote`, `sweep`, `submit` use fresh credentials per request when `isolate = per-purpose`/`per-request`. AT-NP-7 via harness.
- NP-I-2 (MUST): credentials are random, >= 16 bytes entropy, never derived from user keys, addresses, invoice ids or request content (PO-COR-8).
- NP-I-3 (SHOULD): the relayer's `health` polling and its `submit` use different credentials.
- NP-O-1 (MUST): the `onion` profile and `allowOnionHttp` are off in the default (clearnet) build; enabling requires the onion build profile. AT-NP-8 (scan-bundle).
- NP-O-2 (MUST): UI never labels an onion mirror "verified" or "anonymous payments" (PO-NET-1/2). AT-NP-9 (string lint over `apps/web/src`).
- NP-I2P-1 (MUST): `i2p-outproxy` is labelled secondary/best-effort and states that the outproxy sees the destination; isolation is not claimed. AT-NP-9.
- NP-N-1 (MUST): Nym profiles are behind an explicit "experimental" toggle, hidden otherwise.
- NP-N-2 (MUST): default web bundle contains no Nym/WASM code and CSP unchanged; Nym build profile uses its own headers. AT-NP-8.
- NP-N-3 (MUST NOT): do not claim stream isolation for Nym profiles.
- NP-H-1 (MUST): OHTTP client verifies the gateway key config source is user-supplied or pinned in config, never fetched from the relay; relay and gateway origins must differ (same-origin means no split, refuse). AT-NP-10.
- NP-H-2 (MUST): OHTTP encapsulation passes RFC 9458 test vectors [U]; otherwise the profile is disabled (`experimental` and compile-time guarded). AT-NP-10.
- NP-H-3 (MUST): UI states relay+gateway collusion defeats the split; if the same operator runs both, show a red warning when detected (same registrable domain heuristic only; not a proof).
- NP-S-1 (MUST): scan sources return only records that pass `validateAnnouncementLog`; malformed/duplicate records are dropped; a source never throws data into UI state (hygiene HY-VER-7 pattern). AT-NP-12.
- NP-S-2 (MUST): no scan source transmits the view tag, viewing key, spending key, meta-address, or a derived address. AT-NP-13 (recorder asserts absence of secrets and of 1-byte-tag-bearing parameters).
- NP-S-3 (MUST): scan requests use windows aligned to `align` blocks and at least `minSpan` blocks, regardless of the true need; a fresh install and a one-block catch-up are indistinguishable by range size. Defaults: `align = getLogsMaxRange`, `minSpan = getLogsMaxRange` (1000, `chains.ts`). AT-NP-14.
- NP-S-4 (SHOULD): in `indexer-tor` and `pir2` modes, scan requests are issued on a timer independent of invoice activity, with jitter from `apps/web/src/lib/jitter.ts`, while the app is open.
- NP-S-5 (MUST): `read-address` requests use a profile transport instance distinct from `scan-bulk` (NP-I-1) and, in `direct`, carry HY-VER-4 decoys; this spec does not implement decoys.
- NP-S-6 (MUST): `QuorumSource` fails closed on any disagreement over `(blockHash, setHash)` and surfaces `SOURCE_DISAGREE`.
- NP-S-7 (MUST): `IndexerSource` verifies parent-hash continuity within the window and head against a second source; any gap or mismatch is an error. AT-NP-15.
- NP-L-1 (MUST): `LightClient` results are used only for integrity checks (balance/nonce/code/storage, head), and the UI labels `light-client` "verifies answers, does not hide queries". AT-NP-9.
- NP-L-2 (MUST): Helios is vendored by hash (lockfile or `vendor/helios/SHA256SUMS`), unaudited status is displayed in docs (README warns it is unaudited [P]); testnet only.
- NP-L-3 (SHOULD): checkpoint older than 14 days is rejected by default (README: "under two weeks old", strict mode [P]).
- NP-P-1 (MUST): `pirQuery(n, i)` output for server A is independent of `i`: statistical test over >= 10^4 samples shows qA bit frequencies indistinguishable from fair coin and qA independent of i (chi-square p > 0.001); and `qA xor qB == e_i` exactly. AT-NP-16.
- NP-P-2 (MUST): `pirReconstruct(pirAnswer(P,qA), pirAnswer(P,qB)) == P[i]` for all i, n in property tests (n in 1..4096).
- NP-P-3 (MUST): pages are fixed size; short pages zero-padded with a length-prefixed packing; response size is identical for every query. AT-NP-17.
- NP-P-4 (MUST): the client issues exactly W page fetches per epoch (real + uniformly random dummy indices), order shuffled, W >= 4 configurable; real count < W. AT-NP-18.
- NP-P-5 (MUST): the two servers are separate URLs and different registrable domains; the client refuses identical hosts. UI states non-collusion assumption (NP-C-2).
- NP-P-6 (MUST): reconstructed pages are accepted only if `sha256(page) == leafHashes[i]` and the manifest root matches across both servers and the third-source head; mismatch = discard + `PIR_INTEGRITY`. AT-NP-19.
- NP-P-7 (SHOULD NOT): do not ship DPF in the PoC; record as follow-up. Do not call XOR-PIR "private" without the non-collusion caveat.
- NP-R-1 (MUST): relayer `upstream.transport` of type `socks5h` is the only non-direct type in the PoC config; `socks5://` rejected at startup. AT-NP-20.
- NP-R-2 (MUST): with a non-direct upstream, the relayer makes no DNS query or TCP connection except to the local proxy; asserted in a network namespace with no resolver (OI 4.4(5), PO-TEL-6). AT-NP-21 (isolated runner, opt-in).
- NP-R-3 (MUST): `bucketBy: 'owner+global'` disables per-IP buckets; N distinct owners from one peer address are not throttled as one client (PO-NET-5, AT-PO-9).
- NP-R-4 (SHOULD): `submit.privateEndpoint`, if set, receives only `eth_sendRawTransaction`; reads never go there; on failure the relayer does NOT fall back to the public RPC unless `submit.fallbackPublic: true` (default false, documented as a privacy downgrade). AT-NP-22.
- NP-R-5 (MUST): `listen.unix` socket mode creates the socket with mode 0600 and removes it on shutdown; mutually exclusive with `listen.host/port`.
- NP-R-6 (SHOULD): operator templates enable Tor PoW, intro DoS defence and `HiddenServiceMaxStreams` for the relayer onion (OI 1.4), with a check that `tor --list-modules` reports `pow: yes` [D].
- NP-B-1 (MUST): in the browser the page never claims to route through Tor; `tor-browser` profile only reports `isSecureContext`, `crypto.subtle` presence, and storage availability (OI 1.8), all local checks. No third-party request is made to test Tor status.
- NP-B-2 (MUST): the browser build does not import `node:net`/`node:tls`; `socks5h` in browser throws `UNSUPPORTED_ENV`.
- NP-B-3 (MUST): worker receives only a profile id and non-secret params; any credentials are generated inside the worker.
- NP-B-4 (MUST): UI text for `tor-browser`: "You are responsible for using Tor Browser; this page cannot verify it".
- NP-C-1 (MUST): each profile's "hides / does not hide" text equals the corresponding rows of section 2 (single source in `packages/net-transport/src/claims.ts`, tested to contain the NOT-protected phrases).
- NP-C-2 (MUST): `pir2`, `ohttp`, `nym-*` show their trust assumption (non-collusion; relay/gateway collusion; Nym entry/exit) in the option help.
- NP-C-3 (MUST): selecting any non-direct profile shows once, per session, "This hides your IP from the server, not what you send or what is on-chain".
- NP-C-4 (MUST): testnet gate. All profiles refuse to operate for chains with `testnet !== true` in `chains.ts` while this PoC flag (`NET_PRIVACY_TESTNET_ONLY = true`) is set. AT-NP-23.

## 8. Test plan

Unit (vitest, in each package; fast-check for properties):

- `net-transport`: SOCKS5h state machine against `net-harness` fake server (valid, bad auth, reply codes 0x01..0x08, truncated replies, oversize domain >255, IPv6 literal, timeout), credential isolation matrix, `parseProxyUrl` table, `validateOnionUrl` vectors + fuzz, `claims.ts` phrase test, error-message redaction fuzz (AT-NP-5), OHTTP encapsulate/decapsulate round-trip and RFC vectors, HTTP CONNECT client against fake proxy.
- `scan-source`: `padWindow` property tests (aligned, covers request, span >= min), source composition with mocked `RpcClient`, malformed log fuzz, quorum disagreement, continuity gap, secret-absence recorder (AT-NP-13).
- `pir-two-server`: AT-NP-16..19, plus `packPages` round trip with fast-check over random announcement sets and `leafHashes` determinism.

Integration (local, no external network):

- AT-NP-1: Playwright egress test over `net-harness` recorder: for each in-process-testable profile, all requests go to the proxy/relay/same-origin only. Extends `apps/web/e2e/app.spec.ts:49` per PO AT-PO-1.
- AT-NP-2/7: fake SOCKS5 server asserts ATYP 0x03, distinct creds, poisoned resolver never invoked.
- AT-NP-20/21: relayer boot with `socks5://` config fails; with `socks5h://` fake proxy, a sweep on a local anvil/hardhat-style devnet [U which devnet the repo's relayer tests use; relayer tests use mocks, check `apps/relayer/src/*.test.ts`] goes only via the proxy.
- AT-NP-22: private-endpoint recorder sees only `eth_sendRawTransaction`.

Manual/real network (isolated runner, never PR-triggered; owner-run on testnet):

- M1: real `tor` with `SafeSocks 1` + `TestSocks 1`; run the SOCKS profile against a Sepolia RPC; log shows only safe socks variants; `tor` circuit count shows distinct circuits for scan vs read-address (via control port `GETINFO circuit-status` or `stem`-style script) [U exact commands].
- M2: Tor Browser: load the web build from an onion mirror (OI P1), record secure-context, storage and `crypto.subtle` status, wallet traffic path. Resolves OI unverified claim list.
- M3: one Nym `nym-socks5-client` and one `mix-fetch` run, record latency and failure rate.
- M4: OHTTP via a public relay if one exists for testing [U], else the harness relay (functional only).
- M5: Helios on Sepolia: sync time, `eth_getProof` support of the chosen RPC provider [P README says required; provider support is [U]].
- M6: two-server PIR over a Sepolia slice: bandwidth and latency measured and recorded in `docs/remote/privacy-specs/network-privacy-results.md` (to be written after the run; not written now).

CI: new packages get `lint`, `typecheck`, `test` through the root workspace scripts (they already iterate `--workspaces --if-present`). Manual items are not in CI.

## 9. Profile self-test (shipped with each profile)

`selfTest()` runs only local or declared-endpoint checks: SOCKS handshake works and reply is well-formed; hostname-based CONNECT to the configured RPC succeeds; `eth_chainId` matches (chain-adapters already fails closed); for OHTTP, key config parses and a no-op request round-trips; for Tor, an optional control-port `GETINFO status/circuit-established` when `controlPort` is configured (never required). No call to any "what is my IP" service (that service would be a third-party egress, PO-TEL-1). Result details contain no hostnames.

## 10. PoC acceptance criteria

All on Sepolia and Base Sepolia only.

1. `direct`, `tor-socks`, `onion` (own-node), `ohttp` (harness relay + relayer gateway), `i2p-outproxy` (functional if a local i2pd + outproxy is available; otherwise documented as not exercised), `nym-socks5` and `nym-mixfetch` (documented as exercised or not) are selectable via Settings; the UI states which were run.
2. A fresh client with `tor-socks` + `scanMode=range` scans a Sepolia range and receives a test payment end-to-end, with M1 showing no local DNS and no non-proxy egress.
3. A relayer with `upstream.transport = socks5h` completes one sponsored sweep on Sepolia with AT-NP-21 passing.
4. `scanMode=indexer-tor` and `scanMode=pir2` each find the same announcement set as `range` for a 2,000-block window on a seeded testnet (hash equality of the announcement set); PIR run shows the measured bandwidth.
5. A deliberately wrong PIR server answer, and a deliberately forked indexer, are each rejected (AT-NP-15, 19).
6. The harness proves (AT-NP-13) that no secret or tag leaves the client in any scan mode.
7. `quorum` mode rejects a lying second RPC in a test.
8. Light-client adapter: either Helios runs and verifies `eth_getBalance` for a known address on Sepolia, or the interface plus fake-LC tests are delivered and browser/WASM is recorded as blocked with the reason.
9. `docs/user/privacy-limits.md` and the UI strings contain the NOT-protected statements (AT-NP-9, NP-C-1).
10. No default-build CSP change (AT-NP-8); default build hash differs only by new code paths that are inert under `direct`.

## 11. Effort estimate

| Component | Size | Notes |
|---|---|---|
| `net-transport` SOCKS5h + purposes + onion URL + CONNECT | M | ~5-7 days with harness |
| `net-harness` | S | ~2 days |
| OHTTP client + gateway | M | HPKE dependency decision (Q4); vector conformance |
| Nym adapters | S-M | thin wrappers; real runs are manual and flaky |
| `scan-source` range/indexer/quorum/padding | M | ~4-5 days |
| `pir-two-server` XOR PIR + manifest + server | M | ~4-5 days; DPF excluded |
| Helios adapter | M-L | WASM packaging in the SPA is the risk |
| Web UI + settings + worker plumbing | M | touches existing files |
| Relayer config/transport/unix-socket/bucketBy | M | touches existing files; overlaps relayer-guard wiring |
| Templates + manual runs M1-M6 | M | owner-run |
| Total | L | roughly 5-7 engineer-weeks |

## 12. Build order (swarm split)

Parallel, no shared files: (A) `net-harness` + `net-transport` core; (B) `pir-two-server`; (C) `scan-source` (depends on interfaces from B and chain-adapters types only); (D) deploy templates; (E) docs strings (`claims.ts` owner is A). Serial after A-C: the section 5.1 edits to `apps/web` and `apps/relayer`, by one agent each, relayer first (smaller). Do not edit existing packages in parallel with other contributors' work on `chain-adapters`/`apps/*` without coordination.

## 13. Risks

- False sense of anonymity: mitigated by NP-C-1..4, but user misreading is the main product risk.
- Tor Browser secure-context and wallet-extension behaviour are unverified (OI section 6); `onion`/`tor-browser` profiles may not fully work without code changes in keystore/envelope.
- Exit acceptance by RPC providers unverified; Sepolia public RPCs may block exits.
- XOR-PIR is a teaching-grade PoC: O(N) bandwidth, non-collusion assumption, no robustness. Risk of being mistaken for production privacy.
- OHTTP gateways at RPC providers mostly do not exist [U]; value is limited to the relayer/own node.
- Nym: SDK maturity, WASM/CSP, no per-request exit rotation [D]; I2P: no exits, outproxy trust [D].
- Helios unaudited; execution RPC must support `eth_getProof` [P]; integrity only.
- Per-IP limiter collapse behind an onion/unix socket (OI 1.7): requires `bucketBy` change and overlaps `@ghostpay/relayer-guard`.
- Dependency growth (HPKE, Nym, Helios WASM) vs the supply-chain policy (S3-24, two noble majors).
- Implementing SOCKS5 by hand: parser bugs; mitigated by fuzz and harness; alternative is a vetted library (Q3).
- Private-mempool endpoint availability on Sepolia/Base Sepolia unverified.

## 14. Open questions

- Q1. HTTPS onion vs HTTP onion plus `crypto.subtle` fallback (OI Q2): determines whether the `onion` web profile ships in the PoC or is relayer/Node only.
- Q2. Is a Nym profile in scope for the PoC or only documented (OI Q4)? Spec defaults to experimental, off.
- Q3. Own SOCKS5 client (zero deps) vs `socks-proxy-agent` 10.1.0 wrapper.
- Q4. HPKE library choice and whether it breaks the one-noble-major rule; fallback is to ship OHTTP as spec-only.
- Q5. Does Helios expose enough to verify `eth_getLogs` in the browser? If not, light-client stays at read-address integrity.
- Q6. Who operates the second PIR server and the OHTTP relay for the PoC (non-collusion needs two independent operators; the owner may run both for testing and mark it "no privacy").
- Q7. Does the viem version used by the relayer allow a `custom` transport wrapping `RpcTransport` without losing retry semantics? Check `apps/relayer/package.json` pin.
- Q8. Legal: deferred by the owner.

## 15. Sources

Repo [R]: `README.md`, `docs/CONTRACTS_SPEC.md` (no network-layer content; contracts unchanged), `docs/remote/onion-i2p-research.md`, `docs/remote/anonymization-research.md` (sections 9.3-9.7), `docs/remote/modules-needed.md`, `docs/remote/security-specs/privacy-ops.md`, `docs/remote/privacy-specs/hygiene.md`, `docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md` (Feature 5), `packages/chain-adapters/src/{rpc,logs}.ts`, `packages/chain-adapters/src/config/chains.ts`, `packages/relayer-guard/package.json`, `apps/relayer/src/{config,runtime}.ts`.

Primary fetched this run (2026-10-21): https://raw.githubusercontent.com/a16z/helios/master/README.md (Helios facts above); https://raw.githubusercontent.com/nymtech/nym/develop/README.md (Nym SOCKS5 client, SDK).

Via OI (fetched 2026-10-21 by that document, mirror caveats there): tor.1 0.4.9.11, torspec socks-extensions and rend-spec-v3, Tor Community onion-services pages, i2pd docs, Nym docs, `socks-proxy-agent` 10.1.0.

Not retrieved (all [U]): RFC 1928, RFC 1929 (SOCKS5), RFC 9458 (OHTTP), RFC 9292 (BHTTP), RFC 9180 (HPKE), eips.ethereum.org/EIPS/eip-5564 (cited via hygiene.md), Chor et al. 1995 (PIR), Flashbots Protect docs, spec.torproject.org rend-spec checksum text.
