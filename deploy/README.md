# deploy/: GhostPay self-host recipe

Static web bundle + reverse proxy (nginx, non-root, read-only fs) + API (relayer image built from `apps/relayer/Dockerfile`), with an optional Tor onion service. Nothing deploys unless you run it. No secrets, keys or `.onion` private keys are in the repo. The helper needs Bash, Python 3 (for safe archive inspection), and Docker Compose v2.

```
cp deploy/.env.example deploy/.env           # edit; no secrets in it
cp deploy/config/relayer.config.example.json deploy/config/relayer.config.json   # edit (see config/README.md)
# create deploy/secrets/{relayer_key,quote_secret} per secrets/README.md
# put the verified web bundle in deploy/web-dist (BUILD-WEB.md), or pass --tarball
deploy/selfhost.sh --dry-run [--onion]       # validates prerequisites, prints the plan, changes nothing
deploy/selfhost.sh [--onion]                 # asks for "yes", then builds and `docker compose up -d`
```

Hardening in `docker-compose.yml`: `read_only`, `cap_drop: ALL`, `no-new-privileges`, non-root users (api 65532, nginx 101, tor debian-tor), tmpfs `noexec` for `/tmp`, memory/pid limits, API not published (internal network only), web bound to `127.0.0.1` only, file-based secrets, log rotation, no access log in nginx.

State: the `api-state` named volume holds the relayer's durable state (`/var/lib/ghostpay-relayer/state.json`, config key `state.file`); it is the api container's only writable path besides `/tmp`. Run one api container per volume, back it up and roll back per the [relayer runbook](../docs/operators/relayer-runbook.md). nginx limits request bodies to 16 KiB and exposes only `/api/{healthz,v1/info,v1/quote,v1/sweep}`; `/metrics` is never routed.

You still must: terminate TLS in front of `127.0.0.1:${GHOSTPAY_HTTP_PORT}` (Caddy, Cloudflare Tunnel, host nginx) and send HSTS there (see below); fund and limit the relayer hot key conservatively; set `allowedOrigins` to your origin; consider egress filtering for the api container (allow only your RPC hosts).

Behind the onion service the proxy sees only the Tor container's IP, so per-IP rate limits in the relayer collapse into one bucket; that is a known trade-off, not a bug.

## Pin images
Every third-party image is pinned by tag and multi-arch index digest, in `docker-compose.yml` (defaults), `.env.example` and `tor/Dockerfile`; `bash deploy/selftest.sh` fails if a default loses its digest or the three disagree. The relayer image is already pinned in `apps/relayer/Dockerfile`; `ghostpay-relayer:local` and `ghostpay-tor:local` are built locally.

| Image | Pin | Resolved |
| --- | --- | --- |
| web (nginx) | `nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0` | 2026-11-19 |
| tor base | `debian:bookworm-20261104-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc` | 2026-11-19 |

The digests were independently rechecked on 2026-11-19 against `registry-1.docker.io`: fetching each image by tag and by digest returned the same OCI image index, whose SHA-256 matched the `docker-content-digest` header and the pin. The [recovery receipt](../docs/consolidation/tooling-recovery-20261119/README.md) preserves the raw indexes and response metadata. Re-resolve with `docker buildx imagetools inspect <name>:<tag>` (its top-level `Digest:`) before changing a pin, and review the new tag's release notes. Image updates remain manual; this recovery does not add a Dependabot schedule. The nginx tag remains `1.27-alpine`; changing its version is a separate dependency review.

## HSTS at the TLS terminator
The nginx container listens on plain HTTP on loopback and deliberately sends no `Strict-Transport-Security` (browsers ignore it over HTTP, and the onion service is HTTP by design). HSTS belongs on the public HTTPS edge that terminates TLS in front of `127.0.0.1:${GHOSTPAY_HTTP_PORT}`:

- Caddy: `header Strict-Transport-Security "max-age=31536000; includeSubDomains"` in the site block.
- Host nginx: `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` in the `listen 443 ssl` server block (and redirect port 80 to HTTPS).
- Cloudflare Tunnel: SSL/TLS > Edge Certificates > HTTP Strict Transport Security (HSTS), same values.

Start with a short `max-age` (for example 300) and raise it once HTTPS is stable; add `preload` only after an explicit decision, because leaving the preload list takes months. Check the live origin: `curl -sI https://<your-origin>/ | grep -i '^strict-transport-security'` must print the header (`docs/operators/monitoring.md` alerts when it is absent).

## Validation status
`bash deploy/selftest.sh` (also run in CI) covers archive validation (valid bundle, symlink and traversal archives) and the release gate: `--tarball` is refused without `--manifest` or an authenticity check, with a wrong `--expect-sha256`, a commit the manifest does not record or that is not a full lower-case SHA, or a failing `gh attestation verify` (called with exactly `--signer-workflow` release.yml, `--source-ref` the tag, `--source-digest` the commit and `--deny-self-hosted-runners`), and nothing is extracted or started; a verified bundle is installed and nothing starts until `start` is typed or the script is re-run (the printed re-run command keeps `--onion` and a non-default `--env-file`). It also checks that every third-party image default is pinned by digest. `bash -n` passes. The 2026-11-19 recovery verified registry manifests and the offline guards; no image pull, Compose rendering, image build, container startup or live mount-permission check was performed in that recovery. `shellcheck` is unavailable; shell syntax was checked with `bash -n`.

Spec: `docs/remote/usability/specs/self-host-one-command.md`. Tor notes: `TOR.md`. Bundle notes: `BUILD-WEB.md`.

## Tight connect-src

Hosted builds should set `GHOSTPAY_CONNECT_ORIGINS` and `GHOSTPAY_REQUIRE_TIGHT_CSP=1` so `connect-src` lists only approved RPC/relayer origins. Both the normal web build and Pages builder validate their actual artifacts. Generate matching standard/embed nginx header files with `node deploy/nginx/render-security-headers.mjs <separate-output-directory>` using the same allowlist; see [BUILD-WEB.md](BUILD-WEB.md). Origins users add in Settings are blocked until the site is rebuilt with them. GitHub Pages uses the HTML meta CSP and does not enforce `_headers`; generated nginx configuration requires installation and live verification separately.
