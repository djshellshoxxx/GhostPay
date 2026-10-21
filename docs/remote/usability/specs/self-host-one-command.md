# Spec: self-host in one command

Status: recipe in `deploy/` (compose, nginx, tor profile, `selfhost.sh`). Image builds and live runs not performed.

## Requirements
- R1 `deploy/docker-compose.yml`: api (relayer image), web (nginx serving the bundle + `/api/` proxy), optional tor (profile `onion`). All containers non-root, `read_only`, `cap_drop: ALL`, `no-new-privileges`, tmpfs `/tmp` noexec, resource limits.
- R2 No secrets in the repo: secrets via compose file-secrets from gitignored `deploy/secrets/`; `.env.example` holds only non-secret settings; Tor keys only in a runtime volume.
- R3 Only `127.0.0.1:<port>` is published; the api is reachable only from web.
- R4 `deploy/selfhost.sh` validates: docker + compose v2, env file, https origin, numeric ports/uids, web bundle (`index.html`, no `.map`), relayer config (lists the origin), secret files exist with mode 600/400 (contents never read), nothing secret tracked by git, `docker compose config` valid. Prints a numbered plan. `--dry-run` never changes anything. Without `--yes` it requires typing `yes`. Optional `--tarball/--sums/--commit` verifies via `scripts/verify-release.sh` before extracting.
- R5 nginx mirrors `apps/web/public/_headers`; no access log; dotfiles and `.map` denied.

## Acceptance tests
1. `docker compose config -q` passes with and without `--profile onion`.
2. `selfhost.sh --dry-run` with empty deploy dir exits 1 and lists each missing prerequisite; with fixtures exits 0 and prints the plan.
3. A secret file with mode 644 makes the script fail.
4. Answering anything but `yes` aborts with exit 0 and no changes.
5. `git ls-files deploy` contains no `.env`, secret, key or relayer config.
