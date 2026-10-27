# Hosting kit handoff (living file; update at every checkpoint)

Branch: `claude/portable-hosting-kit` (integration). Worker branches: `claude/hk-core`, `claude/hk-serve`,
`claude/hk-transports` (local worktrees `/workspace/hk-*`, not pushed; merged here after review).
Exact pushed SHA: see `git log -1 origin/claude/portable-hosting-kit`; status below is per checkpoint.

## Status (checkpoint 3: complete for review; draft PR #36, not merged)
| Area | State |
|---|---|
| All modules (core, serving, Tor/I2P, CLI, wizard, demo, privacy scan, overlay) | merged on this branch from `claude/hk-core`, `claude/hk-serve`, `claude/hk-transports` (worker branches were local only; their commits are in this branch's history) |
| Local checks | lint clean; typecheck clean; `HK_DOCKER_TESTS=1 HK_BROWSER_TESTS=1 npm test`: 280 tests, 279 pass, 0 fail, 1 skip (Java I2P runtime absent); `scripts/scan-secrets.sh` OK; `scripts/check-actions-pinned.sh` OK; local CodeQL `javascript-code-scanning` suite on the kit: 0 results |
| GitHub CI | Run at an earlier commit: `kit` and `qualify-ghostpay-web` passed; `secrets-and-egress` and `CodeQL` failed. Both causes are fixed (the policy regex tripped `scan-secrets.sh`; CodeQL flagged 2 test-file patterns). Re-run on the latest commit was still queued at handoff. |
| Real GhostPay build | `apps/web/dist` from `main` edb0051: validate/package/verify/preview/profile pass; content digest `sha256:26a0a84c8c9ea671c01fe6436eb89a780d95ef9735c3f75ee00241983ea68ef7` (stable across kit revisions); real nginx 1.24 serves it with `_headers` CSP/cache/CORP exactly; headless Chromium renders it with no CSP violations or console errors |
| Independent review | 3 passes. Pass 1: 10 findings; pass 2: 5 + a `--git-dir` bypass; pass 3: 1 (CSP script sources). All fixed with regression tests. Accepted partials: a replaced OPERATOR.md is not detectable without the archive SHA-256 (documented); renamed Tor control sockets cannot be caught by name; I2P `eepPriv.dat` reuse is only documented |

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
1. Confirm the GitHub CI re-run on the latest commit (secrets-and-egress, CodeQL, kit, qualify-ghostpay-web).
2. Qualify GhostPay's newest build when it exists (only `main` edb0051 was qualified; unpublished work was not available).
3. Owner decisions before any public mirror: ADR-0015 gates, dedicated origin, TLS terminator, signing/publishing of digests.

## Not verified (by design or by environment)
Real Tor/I2P reachability; Tor Browser / I2P browser secure-context behaviour; wallet compatibility; Java I2P runtime;
a real TLS terminator; Cloudflare/Netlify runtime `_headers` behaviour; IPv6 listeners; HTTP/2; nginx versions
other than 1.24.0 (host) and 1.30.6 (container image); case-insensitive filesystems.

## Operator-only (never automated)
Activating nginx/containers/Tor/I2P, creating onion/I2P identities, TLS certificates, DNS, firewall, publishing.
