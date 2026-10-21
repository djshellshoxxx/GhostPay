# @ghostpay/net-transport

Transport profiles for client and relayer egress, an own minimal SOCKS5h agent for Node, OHTTP message framing, and validation of the network-privacy settings. Testnet PoC only. Spec: [`docs/remote/privacy-specs/network-privacy.md`](../../docs/remote/privacy-specs/network-privacy.md) (sections 3, 4.1-4.6, 6, 7, 9). Wiring: [`docs/remote/privacy-specs/wiring/net-transport.md`](../../docs/remote/privacy-specs/wiring/net-transport.md). Self review: [`docs/remote/privacy-specs/audit-net-transport.md`](../../docs/remote/privacy-specs/audit-net-transport.md).

Creating a profile makes no network call. Nothing here contacts a third party; `selfTest()` talks only to the local proxy and, if you pass `probe`, to the URL you give it.

## Profiles (user-selectable, default `direct`; never chosen automatically)

| id | env | what it is | status |
|---|---|---|---|
| `direct` (default) | web, node | plain fetch; no claims | tested against loopback |
| `tor-browser` | web | ambient egress. Only local checks (secure context, `crypto.subtle`, storage). No claims. "You are responsible for using Tor Browser; this page cannot verify it." | local checks only |
| `tor-socks` | node | SOCKS5h to a local Tor, per-purpose credentials | tested against fake proxy; **real Tor UNVERIFIED** |
| `onion` | web build, node | v3 onion URL validation, then SOCKS5h; `http:` allowed only here | checksum tested on 2 real addresses; **real onion UNVERIFIED** |
| `i2p-outproxy` | node | HTTP CONNECT to a local I2P HTTP proxy. Secondary, best-effort, no isolation claimed | fake proxy only; **real i2pd UNVERIFIED** |
| `nym-socks5` | node | SOCKS5h to local nym-socks5-client. Experimental, no isolation claimed | **real Nym UNVERIFIED** |
| `nym-mixfetch` | web | wraps an injected `mixFetch`. Experimental | **UNVERIFIED** (no Nym package installed) |
| `ohttp` | web, node | RFC 9458 framing + validation; HPKE injected. Experimental | **crypto UNVERIFIED, no RFC vectors run** |

API: `createProfile(cfg)` (discriminated by `id`), `profile.transport(purpose)` returns a chain-adapters `RpcTransport` (`send(url, body, {timeoutMs, maxBytes})`), `profile.selfTest({probe?})`, `transportToFetch(transport)` gives a `fetch`-shaped function (for viem `http(url, {fetchFn})`). Every entry point checks the testnet guard (EVM `31337`, `11155111`, `84532`; BTC `testnet|signet|regtest`) and throws `NETWORK_NOT_ALLOWED`.

Purposes: `scan-bulk`, `read-address`, `quote`, `sweep`, `submit`, `health`. Isolation (`per-purpose` default for Tor, `per-request`, `none`): SOCKS username `gp1-<purpose>-<sessionId>`, password 16 random bytes hex, from the injected/CSPRNG source only. With credentials only method 0x02 is offered so a proxy that ignores auth cannot silently remove isolation.

SOCKS5h: hostnames are sent as ATYP 0x03 and never resolved locally (no `dns.*` is called; tested with a poisoned resolver). `socks5://`, `socks4://`, `socks4a://` are rejected with `PROXY_LOCAL_DNS`. Proxy host must be an IP literal or `localhost`, loopback unless `allowNonLoopbackProxy`.

`RpcTransport` contract: timeout and size cap enforced, non-2xx -> `RpcHttpError`, a 3xx is a failure and never followed, TLS verified against the host name. A failed non-direct profile never falls back to `direct`; a failed `selfTest()` blocks the profile until a later one passes.

Settings: `validateNetworkSettings(raw, {env, network, builds, ohttpGatewayConfigured})` and `validateRpcMode(mode, urls, opts)`. Defaults: `rpcProfile=direct`, `relayerProfile=direct`, `rpcMode=single`, `scanMode=range`, `experimental=false`. `rpcMode`: `single|quorum|own-node|light-client`. `scanMode`: `range|indexer-tor|pir2|light-client`. Onion and Nym need their build flag, Nym/OHTTP need the experimental toggle, `indexer-tor` refuses a `direct` profile, onion RPC needs `own-node`.

## What each profile does NOT protect (single source: `src/claims.ts`, `PROFILE_LABELS`)

- On-chain data is unchanged by any overlay: payer, amount, token, timing, router use, ERC-5564 announcement.
- The relayer still sees owner, destination, amount, token, timing in the body; quote and sweep share the tuple. Hiding the IP does not hide content.
- Tor/Nym/I2P hide the network origin from the destination; they do not hide the request from the destination. A malicious RPC still sees addresses it is asked about.
- Tor exit sees destination host and SNI, not TLS content. I2P outproxy operators see the destination and, for plain HTTP, the content.
- Nym: mixing "does not protect against the server you are talking to"; per-request exit rotation is not available in the SDKs, so a destination can group requests. Stream isolation is not claimed.
- A browser that is not Tor Browser cannot be forced onto Tor by the page.
- OHTTP: relay and gateway collusion defeats the split; the gateway sees the request.
- Timing correlation (announcement at block N, sweep at N+k) is not hidden by any transport. Wallet extension traffic is outside the app's control.
- An onion address checksum is 16 bits: it catches typos, it does not prove the service is the intended one. No mirror is called "verified".

First use of any non-direct profile must show `FIRST_USE_NOTICE`: "This hides your IP from the server, not what you send or what is on-chain."

## OHTTP and HPKE: UNVERIFIED

No HPKE library is added. `OhttpHpke` is an injected interface (KEM/KDF/AEAD, key schedule, export, AEAD for responses). This package implements only RFC 9458 framing (key config parsing, `hdr || enc || ct`, response nonce handling) and RFC 9292 known-length binary HTTP, all from memory of the RFCs (rfc-editor.org not reachable). The RFC 9458 test vectors were NOT run; tests use an INSECURE fake HPKE (`src/fakeHpke.testutil.ts`) that only proves the framing round-trips. Do not enable `ohttp` outside tests until a real HPKE passes the vectors. Key config comes from the caller (never fetched from the relay); relay and gateway origins must differ (same registrable-domain check is a naive last-two-labels heuristic and only warns).

## Unverified / not done

- Real Tor, I2P (i2pd), Nym (SOCKS5 client and mix-fetch), real OHTTP relays/gateways: not reachable; only loopback fakes from `@ghostpay/net-harness`.
- RFC 1928/1929/9458/9292/9180 text not re-read this run; wire formats are from memory and checked only against the harness and self-made vectors.
- v3 onion checksum algorithm: confirmed only by two real addresses passing (chance 2^-32), not against the rend-spec text.
- `AT-NP-1` (browser egress e2e), `AT-NP-8` (bundle scan), `AT-NP-21` (network-namespace egress denial), `NP-B-3` worker plumbing, light-client/PIR/indexer (other packages): not in this package.
- `tor-browser` self-check facts are supplied by the caller; nothing here touches `window`.
- Cross-process isolation proof with a real `tor` control port (M1) not done.
- Not wired into `apps/*`. Not independently audited.

```bash
npm run typecheck && npm run lint && npm test   # from this directory (needs @ghostpay/net-harness built: npm run build in packages/net-harness)
```
