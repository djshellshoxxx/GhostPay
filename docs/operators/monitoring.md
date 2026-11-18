# Monitoring a GhostPay web host

Scope: integrity and availability of the static host and, if you run one, a relayer. **No analytics and no payment metadata.** Do not add page-view counters, client-side beacons, third-party monitors that load in the app, or access logs with URLs or IPs. The app is a static client; everything below is probed from outside with plain HTTP by the operator, never by users' browsers. Status: the probes are **UNTESTED against a live host** (nothing is deployed); header and cache behaviour was verified locally with `curl -I` against nginx 1.24.

## 1. Build version and manifest match
- Every build emits `/build-info.json` (`{"app","version","commit","manifestsSha256"}`) and `<meta name="ghostpay-build" content="<commit>">`. `commit` comes from the `GP_COMMIT` environment variable at build time (a release build must set it; a plain local build reports `unknown`). The output is deterministic: no timestamps.
- Check: `curl -s https://<host>/build-info.json` and compare `commit` with the intended release. Compare across every mirror (primary, Pages, onion, IPFS gateway); a differing commit or `manifestsSha256` means a stale or tampered mirror. The reference `manifestsSha256` is the one in `build-info.json` inside the verified release tarball; the release manifest does not record it. The GitHub Pages mirror sets `GP_COMMIT` from the workflow commit; a container build reports `unknown` unless built with `--build-arg GP_COMMIT=<40hex>`.
- Limit: `build-info.json` is served by the host under test, so it detects honest drift (stale CDN, partial deploy) and not a malicious host. Authority is the SHA-256 comparison of served files against the files of the verified release tarball ([rollback](rollback.md) section 5); `SHA256SUMS` itself only covers the tarball, SBOM and manifest.
- Manifests are compiled into the hashed JS bundle, and no manifest JSON ships in `dist`. A stale `index.html` therefore pairs only with its own hashed assets. `manifestsSha256` is the digest of the bundled manifest set, so two hosts with the same commit but different digests were built from different manifest inputs.

## 2. Header and cache regression check (cron or CI, from outside)
```
curl -sI https://<host>/ | grep -iE 'content-security-policy|permissions-policy|referrer-policy|x-content-type|x-frame|cross-origin|strict-transport|cache-control'
curl -sI https://<host>/assets/<hashed>.js | grep -i cache-control   # public, max-age=31536000, immutable
curl -sI https://<host>/build-info.json | grep -i cache-control      # no-cache
curl -sI https://<host>/nonexistent-route | grep -i cache-control    # no-cache (SPA fallback)
```
Alert if: the CSP differs from `apps/web/public/_headers`; `unsafe-inline` or `unsafe-eval` appears; `frame-ancestors` is missing; `Permissions-Policy` is not `camera=(self)`; HSTS is absent on the TLS edge; `index.html` is cacheable; a `.map` file or dotfile returns 200. In the repo, `infra/proxy/check-headers.sh` keeps the config files in sync (static; run it in CI).

## 3. Availability and RPC health
- Uptime: probe `GET /index.html` (200); for self-host, use the compose healthcheck on `web`. Relayer: `/healthz`; `/metrics` only on loopback with its bearer token ([relayer runbook](relayer-runbook.md)).
- RPC outages are mostly user-side because users choose their RPCs. Operators watch their own relayer's RPC error and `eth_chainId` mismatch counters and keep the chain-disable switch ready. Do not add RPC telemetry to the web app.
- Manifest verification failures surface in the browser to the user. The operator signal is user reports plus the version/digest check in section 1. Bundled-manifest validation and the bundle scan also run at build time (`npm run build -w @ghostpay/web`); a failing release build must block deploy.

## 4. Integrity watch
Daily, from a separate machine: fetch the served files, hash them, and diff against the hashes of the verified release tarball's files (verify the tarball against `SHA256SUMS`, extract, `sha256sum` each file). Any difference is an incident ([incident response](incident-response.md) section 2a). Also watch DNS (`A`/`AAAA`/`CAA`), certificate transparency for your hostname, and registrar, CDN and GitHub audit logs.

## 5. Not monitored, by design
User addresses, payments, amounts, browser-side errors, IPs, referrers, and anything else that links activity to a person. If a tool needs those, do not use it.
