# @ghostpay/net-harness

Test-only, loopback-only fakes for network-privacy tests. Spec: [`docs/remote/privacy-specs/network-privacy.md`](../../docs/remote/privacy-specs/network-privacy.md) (sections 5, 8). Private, never bundled, never imported by production code.

## What it provides

- `startSocks5Server`: fake SOCKS5 proxy. Names (ATYP 0x03) are resolved BY THE PROXY from a `hosts` table (that is the SOCKS5h contract). Records greeting methods, RFC 1929 credentials, ATYP, host, port, reply. Options: `auth` (`none`|`userpass`), `checkCredentials`, `forceReply` (0x01..0x08), `misbehave` (bad versions, truncated or garbage replies, hangs, odd bound-address types).
- `startConnectProxy`: fake HTTP/1.1 CONNECT proxy (I2P outproxy stand-in); records targets and headers; 502/403/malformed/huge-header modes.
- `startHttpEcho`: HTTP or TLS echo server recording method, URL, headers, body, peer address. Modes: fixed status/headers, big body, delay, hang. TLS uses a public test-only certificate for `rpc.example.test`, `relay.example.test`, `gateway.example.test` (`tlsFixture.ts`; the key is not a secret and must never be trusted outside tests).
- `startOhttpGateway` / `startOhttpRelay`: OHTTP gateway and relay STUBS. They check media types (`message/ohttp-req`, `message/ohttp-res`, `application/ohttp-keys`) and move opaque bytes. They contain no cryptography and no key material; the gateway delegates to an injected `handle`. They are not RFC 9458 conformant endpoints.
- `installPoisonedResolver`: replaces `dns.lookup`, `dns.resolve*` and `dns.promises` equivalents with recorders that fail, to prove a client never resolves names locally.
- `assertLoopback`: every server refuses non-loopback bind hosts, and dials only loopback targets.

## Not provided (spec section 5 mentions, not built)

Process-level or network-namespace egress denial (AT-NP-21) is not implemented: the poisoned resolver catches `dns` calls only, not raw socket connects to literal IPs. Real Tor, I2P, Nym and OHTTP relays are not exercised. All of that is UNVERIFIED here.

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```
