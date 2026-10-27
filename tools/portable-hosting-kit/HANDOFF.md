# Hosting kit handoff (living file; update at every checkpoint)

Branch: `claude/portable-hosting-kit` (integration). Worker branches: `claude/hk-core`, `claude/hk-serve`,
`claude/hk-transports` (local worktrees `/workspace/hk-*`, not pushed; merged here after review).
Exact pushed SHA: see `git log -1 origin/claude/portable-hosting-kit`; status below is per checkpoint.

## Status (checkpoint 1: UNFINISHED)
| Area | State |
|---|---|
| Shared contracts (`src/{errors,types,policy,version}.mjs`, `docs/INTERFACES.md`) | done, frozen |
| Host config, privacy scan, demo site, mirror overlay, wizard, CLI, package docs | written + unit-tested (CLI untested until core/serve/adapters merge) |
| Core: validate/inventory/manifest/zip/atomic/package/verify | in progress (`claude/hk-core`) |
| Serving: headers/routing/preview/static export/nginx/container | in progress (`claude/hk-serve`) |
| Tor + I2P adapters | in progress (`claude/hk-transports`) |
| CI workflow `.github/workflows/hosting-kit.yml` | written; not yet run on GitHub |
| Integrated lint/typecheck/test | NOT RUN (typecheck fails until worker modules land: missing imports) |
| Real GhostPay build qualification | `apps/web` from `main` builds locally; kit validation pending core |

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

## Remaining
1. Merge reviewed worker branches; integrated lint/typecheck/tests; CLI integration tests.
2. Qualify `apps/web/dist` (validate/package/verify/preview/profile).
3. Independent review agent; fix findings.
4. README operator guide, ARTIFACT-METADATA.md, reuse/licence record.

## Operator-only (never automated)
Activating nginx/containers/Tor/I2P, creating onion/I2P identities, TLS certificates, DNS, firewall, publishing.
