# Self security review: @ghostpay/net-transport

AI self-review by the author of the code, not an independent audit. Date 2026-10-21. Scope: `packages/net-transport/src` (profiles, SOCKS5h and HTTP CONNECT clients, onion validation, OHTTP framing, settings schema, claims). No real Tor, I2P, Nym or OHTTP network was reachable; everything ran against loopback fakes (`@ghostpay/net-harness`).

## Threat model

Adversaries from the spec: AD-NET (local network/ISP), AD-RPC and AD-RLY (destination operators), AD-EXIT (exit/outproxy). Assets: the hostname the user talks to (must not leak via local DNS), the isolation class of each request, URLs that may carry API keys, honest user-facing claims. Trusted: the local proxy on loopback and the OS. Not trusted: remote proxy replies, destination responses, stored settings JSON, relay and gateway.

## Findings

| # | Sev | Finding | Status |
|---|---|---|---|
| T1 | High | `http.request` ignores `createConnection` when an agent is set (or `agent: false`) and silently falls back to `dns.lookup` + direct TCP: a DNS leak and a proxy bypass | Found by a failing test (`ENOTFOUND` from `getaddrinfo`). Fixed: no agent is passed; covered by poisoned-resolver tests for SOCKS and CONNECT |
| T2 | High | Silent downgrade to `direct` on proxy failure | Fixed by design: transports throw `NetTransportError`; failed `selfTest()` blocks the profile; tests assert the destination records zero requests |
| T3 | High | A proxy ignoring RFC 1929 could drop isolation silently | Fixed: with credentials only method 0x02 is offered; mismatch -> `PROXY_AUTH` |
| T4 | Medium | URLs, hostnames, `.onion` addresses, credentials in error text | Fixed: all errors fixed strings; redaction tests over many failure modes and URL fuzz. Residual: Node's own socket errors are swallowed and never forwarded |
| T5 | Medium | `new URL()` lower-cases hosts, hiding non-canonical onion input | Fixed: `validateOnionUrl` checks the raw authority first |
| T6 | Medium | `socks5://` resolves locally in many clients | Fixed: rejected with `PROXY_LOCAL_DNS`; proxy host must be an IP literal or `localhost` (mapped to `127.0.0.1`) so even reaching the proxy does no lookup |
| T7 | Medium | Oversized or never-ending responses, slow loris | Fixed: streamed `maxBytes`, declared content-length check, overall deadline covering connect, handshake, request and body. Relay POST now streams with a cap (found during review: the first version used `arrayBuffer()`) |
| T8 | Medium | OHTTP gateway error oracle | Mitigated: one generic `OHTTP_DECAP` message for every gateway-side failure, tested |
| T9 | Medium | OHTTP key config trust | Key config is caller-supplied, never fetched from the relay; relay and gateway same origin refused; same-domain only warns (naive last-two-labels, no PSL) |
| T10 | Low | Onion checksum is 16 bits | Documented: catches typos only. Test shows ~0-1 accidental passes in 1736 mutations per address |
| T11 | Low | Reader buffers unbounded proxy bytes until the deadline | Accepted: proxy is a loopback process the user runs; deadline bounds duration, not bytes |
| T12 | Low | Credentials sent in clear to the local proxy | Accepted: loopback only by default; non-loopback needs `allowNonLoopbackProxy` |
| T13 | Low | `tlsCa`, `allowPlainHttp` are test hooks in public config | Accepted and documented TEST ONLY; defaults off; a production wiring must not expose them |
| T14 | Info | Public barrel mixes Node-only and browser-safe code | Open: wiring doc asks for a browser subpath before web use (NP-B-2) |
| T15 | Info | `socks5Connect` buffers leftovers with `unshift` and leaves the socket paused | Tested (banner after reply); callers must `resume()` |

## Honesty of claims

`claims` arrays: empty for `direct` and `tor-browser`; `stream-isolation` only for Tor-style SOCKS with isolation on; never for Nym, I2P, OHTTP. UI text is centralised in `claims.ts`; a test forbids "anonymous/untraceable/unlinkable" and "mix" (except the verbatim Nym quotation from the spec).

## Verification status

Ran: `tsc --noEmit`, eslint, vitest (147 tests; 3 files; fast-check used for URL redaction and bhttp decode fuzz), v8 coverage above thresholds. Verified only against loopback fakes. UNVERIFIED: real Tor (isolation, `SafeSocks`, circuit counts), I2P outproxy, Nym; RFC 1928, 1929, 9292, 9458, 9180 text (wire formats from memory; the key config example `01002031e1...` recalled from RFC 9458 parses and re-encodes consistently, which is weak evidence only); RFC 9458 test vectors NOT run; the HPKE implementation (none bundled, tests use an insecure fake); v3 onion checksum construction (two real addresses pass, rend-spec text not re-read); behaviour under viem retry (wiring Q7); browser bundle (no browser build exists yet).
