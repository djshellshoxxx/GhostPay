# Self security review: @ghostpay/net-harness

AI self-review by the author of the code, not an independent audit. Date 2026-10-21. Scope: `packages/net-harness/src`.

## Threat model

Test-only fakes. Risks: (a) a harness server reachable from the network, (b) harness used as an open relay/proxy to non-loopback hosts (SSRF from CI), (c) test key/cert mistaken for a secret or trusted in production, (d) global state (`dns`) left poisoned across tests, (e) harness behaviour giving false assurance (a fake that is more lenient than a real proxy).

## Findings

| # | Sev | Finding | Status |
|---|---|---|---|
| H1 | Medium | Servers could be bound to a routable interface | Fixed: `assertLoopback` on every bind; tested for all 5 servers |
| H2 | Medium | SOCKS/CONNECT proxies could dial arbitrary hosts (open proxy) | Fixed: dial target must be loopback; others get reply 0x02 / 502; tested |
| H3 | Low | Bundled TLS private key triggers secret scanners / misuse | Accepted: clearly labelled test-only, fake hostnames, `@security` tag; the package is private and must never be imported by production code (it is exported from `index.ts`, so this is a convention, not enforced) |
| H4 | Low | Poisoned resolver is process-global | Mitigated: `restore()` idempotent, tested; tests using it must not run concurrently (pool `forks`, one file) |
| H5 | Info | OHTTP stubs do no crypto and are not RFC 9458 gateways | Documented; crypto UNVERIFIED |
| H6 | Info | Fake SOCKS server is simpler than Tor (no `SafeSocks`, no isolation semantics, no IPv6 name handling) | Documented; real Tor run (M1) required |

## Verification status

Ran: typecheck, lint, vitest (27 tests) with coverage. Not run: any real Tor/I2P/Nym/OHTTP network, network-namespace egress denial. UNVERIFIED: that the fakes match real proxy behaviour in edge cases.
