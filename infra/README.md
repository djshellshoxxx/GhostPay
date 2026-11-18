# infra/

Hosting material for operators. Nothing here is deployed; hosting is not enabled ([ADR-0015](../docs/adr/ADR-LOG.md)).
`infra/devnet` is separate (local anvil e2e) and not covered here.

| Path | Purpose | Status |
|---|---|---|
| `proxy/Caddyfile`, `proxy/nginx.conf`, `proxy/ghostpay-headers.conf` | TLS reverse proxy: strict CSP/HSTS/COOP/COEP, static bundle, relayer on loopback behind a trusted proxy, `/metrics` never exposed | Written; **unvalidated** (no caddy/nginx in the authoring sandbox) |
| `proxy/check-headers.sh` | Static check that the CSP and Permissions-Policy of the proxy configs, `web/Caddyfile.static` and the `index.html` meta equal `apps/web/public/_headers`, that the embed SDK routes (v1, v2) send `Access-Control-Allow-Origin: *` and CORP `cross-origin`, and that no config serves dotfiles | Passing; runs in CI (`secrets-and-egress`) |
| `web/Dockerfile`, `web/Caddyfile.static` | Multi-stage reproducible-ish build of `apps/web`, served by Caddy on :8080 as non-root | **Unbuilt** (no docker daemon in sandbox); base images not digest-pinned |
| `publish/ipfs-publish.sh` | Dry-run CID + per-file hashes; pinning needs `--publish` and `GP_IPFS_PUBLISH=yes` | Unrun (kubo not installed); `bash -n` only |
| `publish/torrc.example` | Onion service example | Example only |

Details and the hosting checklist: [hosting](../docs/operators/hosting.md).

## Relayer behind the proxy
Relayer listens on `127.0.0.1:8787` (config `listen.host` default) with `"trustedProxies": ["127.0.0.1", "::1"]`. The proxy
**overwrites** `X-Forwarded-For` with the socket peer and strips `X-Real-IP`/`Forwarded`; the relayer walks the header
right to left and only believes hops in `trustedProxies`. Any other topology (CDN in front of the proxy) means adding
that CDN's ranges to `trustedProxies` and re-testing rate-limit bucketing. Only `/healthz /v1/info /v1/quote /v1/sweep`
are routed; scrape `/metrics` (bearer token) on loopback.

## Reproducibility
Canonical artefact: `scripts/release-build.sh` tarball + `SHA256SUMS` (CI release job); verify with `scripts/repro-check.sh`.
The Docker image and the Pages workflow rebuild from the same lockfile but are not the canonical artefact: compare their
file hashes (`find dist -type f | LC_ALL=C sort | xargs sha256sum`) with `SHA256SUMS` from a separate machine.
