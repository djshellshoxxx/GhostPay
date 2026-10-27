# Hosting kit handoff (living file; update at every checkpoint)

Branch: `claude/portable-hosting-kit` (integration). Worker branches: `claude/hk-core`, `claude/hk-serve`,
`claude/hk-transports` (local worktrees `/workspace/hk-*`, not pushed; merged here after review).
Exact pushed SHA: see `git log -1 origin/claude/portable-hosting-kit`; status below is per checkpoint.

## Status (checkpoint 2: integrated; second review pass pending)
| Area | State |
|---|---|
| Shared contracts, host config, privacy scan, demo, overlay, wizard, CLI | done, tested |
| Core (validate/inventory/manifest/zip/atomic/package/verify) | merged from `claude/hk-core` incl. review fixes |
| Serving (headers/routing/preview/static/nginx/container) | merged from `claude/hk-serve`; preview-vs-nginx differential test |
| Tor + I2P (i2pd, Java I2P) adapters | merged from `claude/hk-transports` incl. review fixes |
| Integrated checks (local) | lint clean; typecheck clean; `HK_DOCKER_TESTS=1 HK_BROWSER_TESTS=1 npm test`: 264 tests, 263 pass, 0 fail, 1 skip (Java I2P runtime absent) |
| Real GhostPay build (`apps/web/dist` from `main` edb0051) | validate/package/verify/preview/profile pass; real nginx 1.24 serves the profile with `_headers` CSP/cache/CORP exactly; renders in headless Chromium with no CSP violations or console errors |
| Independent review | pass 1: 10 findings, all fixed with regression tests; pass 2 (serving + fixes): running |
| CI workflow `.github/workflows/hosting-kit.yml` | written; not yet observed running on GitHub |

## Decisions and findings (reuse; do not re-investigate)
- Zero runtime deps, Node >= 22, `.mjs` + JSDoc + `tsc --checkJs` strict; tests `node:test`. Kit-local eslint config
  (root config ignores `*.mjs`). Outside npm workspaces on purpose: no lockfile/root-config edits.
- Header source of truth: the site's `_headers` (GhostPay: `apps/web/public/_headers`); kit default only if absent.
- Archive: ZIP, single top dir, `site/` immutable bytes, manifest + SHA256SUMS + sidecar `.sha256` outside.
- Replikrazy: no licence grant -> no code copied; manifest file records match its draft `ArtifactFile` shape.
- `packages/net-transport/src/onion.ts` has the same v3 onion checksum; kit keeps a dependency-free copy, cross-check
  test `test/config/onion-crosscheck.test.mjs` (203 addresses agree).
- Audit WEB-APP-03 / plan "origin isolation": subpath profiles refused unless `--allow-shared-origin`.
- Plan "digest-pin Docker images": container profile must pin by digest (serving worker requirement).
- Real build ships `deployments/README.md` -> `md` added to the allowlist.
- GhostPay routes by hash (`#gpi=`), relative assets (`base: './'`): subpath works; deep-link fallback only 1 level.
- Sandbox: Docker daemon started manually (test only); nginx 1.24, tor 0.4.9.11, i2pd 2.49 installed, not running.
- No prompt-caching controls exposed by this runner; no Caveman skill installed (`/mnt/skills` empty).
  Only one model is available for agents (no cheaper model selectable).

## Findings about existing repo files (not changed; outside this task)
- `deploy/tor/torrc`: no PoW / intro-DoS / stream limits; `web:8080` resolved once at tor start.
- `deploy/tor/Dockerfile`: base image tag not digest-pinned; `ca-certificates` unneeded.
- `infra/publish/torrc.example`: `Log notice file /dev/null` discards errors.
- Debian tracker lists CVE-2026-87724 (remote crash, fixed in tor 0.4.9.12) open for trixie; tested binary 0.4.9.11.
- `apps/web/index.html` `<noscript>` links `help.html`/`privacy.html`, which are not in `apps/web/dist` (404).

## Remaining
1. Review pass 2 findings (serving + fixes) and pass 3 on the core fixes; fix and re-run.
2. Observe the GitHub workflow run; fix CI-only issues.
3. Qualify GhostPay's newest unpublished build when it exists (only `main` edb0051 was qualified).

## Operator-only (never automated)
Activating nginx/containers/Tor/I2P, creating onion/I2P identities, TLS certificates, DNS, firewall, publishing.
