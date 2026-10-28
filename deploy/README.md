# deploy/: GhostPay self-host recipe

Static web bundle + reverse proxy (nginx, non-root, read-only fs) + API (relayer image built from `apps/relayer/Dockerfile`), with an optional Tor onion service. Nothing deploys unless you run it. No secrets, keys or `.onion` private keys are in the repo. The helper needs Bash, Python 3 (for safe archive inspection), and Docker Compose v2.

```
cp deploy/.env.example deploy/.env           # edit; no secrets in it
cp apps/relayer/relayer.config.example.json deploy/config/relayer.config.json   # edit (see config/README.md)
# create deploy/secrets/{relayer_key,quote_secret} per secrets/README.md
# put the verified web bundle in deploy/web-dist (BUILD-WEB.md), or pass --tarball
deploy/selfhost.sh --dry-run [--onion]       # validates prerequisites, prints the plan, changes nothing
deploy/selfhost.sh [--onion]                 # asks for "yes", then builds and `docker compose up -d`
```

Hardening in `docker-compose.yml`: `read_only`, `cap_drop: ALL`, `no-new-privileges`, non-root users (api 65532, nginx 101, tor debian-tor), tmpfs `noexec` for `/tmp`, memory/pid limits, API not published (internal network only), web bound to `127.0.0.1` only, file-based secrets, log rotation, no access log in nginx.

You still must: terminate TLS in front of `127.0.0.1:${GHOSTPAY_HTTP_PORT}` (Caddy, Cloudflare Tunnel, host nginx); fund and limit the relayer hot key conservatively; set `allowedOrigins` to your origin; consider egress filtering for the api container (allow only your RPC hosts).

Behind the onion service the proxy sees only the Tor container's IP, so per-IP rate limits in the relayer collapse into one bucket; that is a known trade-off, not a bug.

## Pin images
`.env.example` uses tags. Before production, resolve them to digests (`docker buildx imagetools inspect`) and pin `name@sha256:...`. Not done here (no network).

## Validation status
`bash deploy/selftest.sh` (also run in CI) covers archive validation (valid bundle, symlink and traversal archives) and the release gate: `--tarball` is refused without `--manifest` or an authenticity check, with a wrong `--expect-sha256`, a commit the manifest does not record, or a failing `gh attestation verify`, and nothing is extracted or started; a verified bundle is installed and nothing starts until `start` is typed or the script is re-run. `bash -n` passes. Docker Compose is unavailable in this environment, so compose config, image builds, container startup, and live mount permissions were not tested. `shellcheck` is unavailable; shell syntax was checked with `bash -n`.

Spec: `docs/remote/usability/specs/self-host-one-command.md`. Tor notes: `TOR.md`. Bundle notes: `BUILD-WEB.md`.
