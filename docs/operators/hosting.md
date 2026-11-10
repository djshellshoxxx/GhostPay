# Hosting (operators)

> **Nothing here is deployed.** Hosting is intentionally not enabled ([ADR-0015](../adr/ADR-LOG.md)). This page is the operational companion to [mirror hosting](mirror-hosting.md) (requirements) and the files in [`infra/`](../../infra/README.md). Items marked **OWNER** need a human decision. Items marked **UNVERIFIED** were written but not run (no caddy, nginx, docker daemon or kubo in the authoring sandbox).

## 1. Choose a host class

| Class | Headers | Use |
|---|---|---|
| Own VPS + `infra/proxy` (Caddy or nginx) | Full set: CSP incl. `frame-ancestors`, HSTS, COOP, COEP, Permissions-Policy, per-path cache | Primary candidate |
| Cloudflare Pages / Netlify | `apps/web/public/_headers` is applied | Acceptable; account compromise = frontend compromise |
| GitHub Pages (`.github/workflows/pages.yml`) | **Meta CSP only** | Degraded mirror, label it as such |
| IPFS / onion | Whatever the gateway or your server sets | Extra mirrors; integrity via CID / hashes |

## 2. GitHub Pages workflow (`.github/workflows/pages.yml`)

- Runs on push to `main` and `workflow_dispatch`; every job has `if: github.ref == 'refs/heads/main'`, so a dispatch from another ref does nothing.
- Steps: pinned-actions check, `npm run build -w apps/web` (typecheck, vite build, `scan-bundle.mjs` postbuild), explicit re-scan, assertion that `dist/index.html` carries the CSP meta and `dist` has no source maps, SHA-256 list of every served file in the job summary, upload, deploy.
- All action references are full commit SHAs with version comments (`scripts/check-actions-pinned.sh` passes). SHAs were resolved with `git ls-remote` against the official `actions/*` repositories on 2026-10-21; re-resolve at each bump.
- Base path `/GhostPay/`: the bundle uses `base: './'` (relative), so it should load from that sub-path. **UNVERIFIED on a real Pages site.** Check the worker script and `deployments/` fetches after the first deploy.
- **OWNER, one-time:** Settings > Pages > Source = GitHub Actions; restrict the `github-pages` environment to `main`; require reviewers if wanted. Until set, `deploy` fails closed.
- **Header limits.** GitHub Pages cannot send response headers. Only the meta CSP applies, which cannot carry `frame-ancestors`; so the page can be framed (clickjacking), `X-Content-Type-Options`, COOP/COEP/CORP and `Permissions-Policy` are absent, and caching is GitHub's. The embed iframe mode must stay off there. The page also trusts GitHub, its CDN and the repository's write access (see [incident response](incident-response.md) section 2).
- The workflow publishes a build made on GitHub's runner. The canonical artefact is the tagged release tarball; compare file hashes from a separate machine.

## 3. Own host with `infra/proxy`

1. Build the bundle (`scripts/release-build.sh`) or take the release tarball; verify `SHA256SUMS` ([release and verify](release-and-verify.md)). Unpack to `/srv/ghostpay`, read-only to the proxy user.
2. Pick Caddy (`infra/proxy/Caddyfile`) or nginx (`infra/proxy/nginx.conf` + `ghostpay-headers.conf` in `/etc/nginx/`). Replace the `*.example.invalid` names, ACME email and certificate paths (**OWNER**).
3. Validate: `caddy validate --config infra/proxy/Caddyfile --adapter caddyfile` or `nginx -t`. **UNVERIFIED**: these were never run.
4. After deploy: `curl -sI https://<host>/` and compare with `apps/web/public/_headers`; try framing the page (must be refused); run `infra/proxy/check-headers.sh` in the repo (CI runs it too) to keep the header sources identical.
5. COEP `require-corp` is set on documents. Same-origin assets and CORS RPC fetches are fine; if a future feature loads a cross-origin no-CORS resource it will break. That is intended.
6. Logging is off (`log { output discard }` / `access_log off`). Enable only error logs; never full URLs with query strings.

### Relayer behind the proxy
- Relayer: `listen.host` = `127.0.0.1` (default), `trustedProxies` = `["127.0.0.1","::1"]`. Run it with `apps/relayer/deploy/ghostpay-relayer.service` or `apps/relayer/Dockerfile`; secrets stay in 600 files ([relayer runbook](relayer-runbook.md)).
- The proxy overwrites `X-Forwarded-For` with the socket peer and drops `X-Real-IP` / `Forwarded`. The relayer walks the header right to left and trusts only listed hops, so a client cannot choose its rate-limit bucket.
- Routed: `/healthz`, `/v1/info`, `/v1/quote`, `/v1/sweep`. Not routed: `/metrics` (404 at the edge; scrape on loopback with the bearer token).
- If a CDN sits in front of the proxy, the proxy then sees the CDN's address: add the CDN's published ranges to the proxy's trusted list and to the relayer's `trustedProxies` only after verifying them from the CDN's own documentation, and re-test bucketing.
- Keep the web host and the relayer on different credentials and, ideally, different machines: a compromised static host should not hold the hot key.

## 4. Docker image (`infra/web/Dockerfile`) UNVERIFIED
Build from the repo root; serves on `:8080` as uid 65532 with the same headers, no TLS (put `infra/proxy` in front). Not built here. **OWNER:** pin `node` and `caddy` base images by digest before relying on it. `devnet/Dockerfile.web` is a dev tool, not for hosting.

## 5. IPFS and Tor
- `infra/publish/ipfs-publish.sh <dist|tarball>` prints per-file hashes and the CID from `ipfs add --only-hash` (CIDv1, raw leaves, fixed 256 KiB chunker). Pinning needs `--publish` and `GP_IPFS_PUBLISH=yes`. Record the CID in the release manifest's `publication.ipfsCid` and publish it through the same independent channels as `SHA256SUMS`. A CID is checked only by a client that verifies it (local node or verifying gateway). Gateways are hosts and can lie. **UNVERIFIED** (kubo not installed here).
- ENS content hash: not built; needs key custody and a compromise-recovery plan first.
- Onion: serve `:8080` from the Docker image or `infra/proxy` on loopback and map it with `infra/publish/torrc.example`. The onion secret key is the identity: back it up offline; a leak is impersonation (treat as in [incident response](incident-response.md) section 2). Publish the `.onion` address with the release hash from two other channels. Do not log. Not tested.

## 6. Reproducibility
Canonical: `scripts/release-build.sh` (sorted tar, fixed mtime from `SOURCE_DATE_EPOCH`, `gzip -n`, lockfile `npm ci --ignore-scripts`) and `scripts/repro-check.sh`; nightly CI diffs two builds. Pages and Docker builds use the same lockfile and sources but are not the canonical artefact; compare their per-file SHA-256 to `SHA256SUMS`. Differences are an incident until explained.

## 7. Pre-launch checklist
- [ ] ADR-0015 gates met (authenticated manifests, signed releases, legal review). **OWNER**
- [ ] Signing-key fingerprint published out of band. **OWNER**
- [ ] 2FA with hardware keys on GitHub, DNS, registrar, host and CDN accounts; a separate deploy identity.
- [ ] CAA records for the hostname; DNSSEC if the registrar supports it. **OWNER**
- [ ] Header check, framing test and hash comparison from a second machine done on the live host.
- [ ] Incident contacts and comms channels filled in ([incident response](incident-response.md)).
