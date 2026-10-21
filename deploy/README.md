# deploy/: GhostPay self-host recipe

Static web bundle + reverse proxy (nginx, non-root, read-only fs) + API (relayer image built from `apps/relayer/Dockerfile`), with an optional Tor onion service. Nothing deploys unless you run it. No secrets, keys or `.onion` private keys are in the repo.

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
`docker compose config` (default and `--profile onion`): run and passes. `selfhost.sh --dry-run`: run against fixture files, passes/fails as expected. Images were NOT built, containers NOT started, relayer startup with these mounts NOT tested (uid/ownership of secrets is the likeliest first-run failure). shellcheck: not installed here, not run (`bash -n` only).

Spec: `docs/remote/usability/specs/self-host-one-command.md`. Tor notes: `TOR.md`. Bundle notes: `BUILD-WEB.md`.
