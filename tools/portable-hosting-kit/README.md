# GhostPay portable hosting kit

Package a static website (the GhostPay web app, or any static-site directory) into a verifiable portable archive,
check it, preview it locally, and generate hosting profiles for a plain static host, nginx, a container, a Tor v3
onion service or an I2P server tunnel. Zero runtime dependencies: Node.js >= 22 only.

**The kit never installs, starts, publishes or reconfigures anything.** Profiles are files for an operator to
review and activate by hand. It never creates signing keys, onion identities or I2P destinations.

Status: see [HANDOFF.md](HANDOFF.md). Hosting GhostPay publicly is still gated by ADR-0015 (signed releases,
authenticated manifests, legal review); this kit makes hosting reproducible and checkable, it does not lift those gates.

## Quick start (no files needed)

```sh
cd tools/portable-hosting-kit
node bin/ghostpay-host.mjs demo --out /tmp/hk-demo        # demo site -> validate -> package -> verify -> profiles
node bin/ghostpay-host.mjs preview /tmp/hk-demo/demo-site.zip   # http://127.0.0.1:4173/ (Ctrl-C to stop)
```

For the GhostPay web app (from the repository root, after `npm ci --ignore-scripts`):

```sh
npm run build:libs && npm run build --workspace @ghostpay/web
cd tools/portable-hosting-kit
node bin/ghostpay-host.mjs validate ../../apps/web/dist
node bin/ghostpay-host.mjs package ../../apps/web/dist --out /tmp/ghostpay-web.zip \
  --label v0.1.0 --git-dir ../.. --license-file ../../THIRD_PARTY.md
node bin/ghostpay-host.mjs verify /tmp/ghostpay-web.zip --expect-digest sha256:<digest from an independent channel>
node bin/ghostpay-host.mjs wizard --out host.json
node bin/ghostpay-host.mjs profile /tmp/ghostpay-web.zip --config host.json --out /tmp/ghostpay-profiles
```

## Commands

| Command | What it does |
|---|---|
| `validate <site-dir>` | Inventory with bounds, inclusion policy, secret/state detection, entrypoint, path safety and collisions, required response headers, external-reference (privacy) scan. Changes nothing. |
| `package <site-dir> --out f.zip` | Validates, then writes a deterministic ZIP and `f.zip.sha256` atomically. The input directory is never modified; a failed run leaves any previous archive intact. |
| `verify <f.zip \| unpacked-dir>` | Reports changed, missing and unexpected files and malformed archives. `--expect-digest` / `--expect-sha256` compare with values you obtained independently. |
| `preview <f.zip \| unpacked-dir>` | Verifies, extracts (archive) or copies (directory) to a private temp dir and serves only that copy on 127.0.0.1 (or ::1), with the same routing and headers as the nginx profile. `--expect-digest` / `--expect-sha256` refuse a mismatch. |
| `profile <f.zip \| unpacked-dir> --config host.json --out dir` | Generates hosting profiles (inert) from the same private verified copy. `--with static,nginx,container,tor,i2p`; `--expect-digest` / `--expect-sha256` refuse a mismatch. `--out` must not be inside or contain an unpacked-dir input. |
| `wizard [--out host.json]` | Interactive (or `--non-interactive`) public host configuration; every answer is validated. `--dry-run` writes nothing. |
| `demo [--out dir]` | Runs the full workflow on a generated demo site. `--preview` serves it afterwards. |

Exit codes: 0 ok, 1 validation/verification failed, 2 usage error, 3 I/O or internal error. `--json` gives
machine-readable output for `validate`, `package`, `verify`, `profile`. An option the command does not use is a usage
error (it is never silently ignored). `package --git-dir` refuses a repository that configures a filter driver
(`filter.<name>.clean/smudge/process`) and never enters submodules (with fsmonitor already disabled), so `git status` cannot
run a repository-defined filter or fsmonitor command while recording provenance.

## What goes into an archive

```
<appId>-<label>/site/...                  the site, byte for byte
<appId>-<label>/HOSTING-MANIFEST.json     every file's size + SHA-256, entrypoint, content digest, provenance, policy
<appId>-<label>/EXTERNAL-REFERENCES.json  static privacy inventory (scripts, fonts, telemetry, RPC, relays, wallets)
<appId>-<label>/OPERATOR.md, LICENSES/    operator instructions and notices
<appId>-<label>/SHA256SUMS                sha256sum -c list of every other file (not itself)
f.zip.sha256                              next to the archive, never inside (no self-hashing)
```

**Inclusion is an allowlist**: known static file types only (HTML, CSS, JS, JSON, images, fonts, WASM, text,
Markdown, `_headers`, `LICENSE`...), no hidden files except `.well-known/`, no symlinks or special files, bounded
counts/sizes/path lengths, no case or Unicode-normalisation collisions. Keys, wallets, seeds, `.env`, tokens,
databases, backups, sessions, logs, onion `hs_ed25519_*` keys, I2P `.dat` keys, VCS data and server-side code get a
specific error. A content scan for private keys and tokens runs too; it is heuristic and is not the safety mechanism.

**Response headers are checked, never weakened.** Every profile derives its headers from the site's `_headers`
(or the kit's strict default when there is none). Validation refuses a header policy that would serve any file
without `X-Content-Type-Options: nosniff` (it must come from a `/*` rule), any HTML/SVG/XML file or `/` without a CSP
whose `object-src` is `'none'`, whose `base-uri`/`frame-ancestors` are `'none'`/`'self'`, and whose effective script
sources are only `'self'`, `'none'`, hashes or explicit hosts (no `*`, scheme sources, nonces, `'strict-dynamic'`,
`'unsafe-*'`), a Referrer-Policy outside `no-referrer`/`same-origin`/`strict-origin`/`strict-origin-when-cross-origin`,
or a rule that detaches CSP or nosniff. Details: [docs/SERVER-PROFILES.md](docs/SERVER-PROFILES.md).

**Trust configuration is never rewritten.** Chain IDs, contract addresses, RPC URLs and deployment manifests are
part of the application build. The kit packages them byte for byte, lists JSON that looks like trust config under
`trustSensitive`, and refuses such fields in host configuration.

**Reproducibility.** The content digest (`sha256:` over RFC 8785 canonical JSON of entrypoint + sorted file list) is
reproducible from the same files on any platform and is the value to publish. Archive bytes are reproducible for
the same input, options and kit version (tested); with `--compression store` independent of the zlib build, with
the default `deflate` for the same Node.js/zlib build. No timestamps are recorded (`--source-date-epoch` /
`SOURCE_DATE_EPOCH` is stored as provenance only).

**Authenticity.** A checksum read from the same place as the files proves only internal consistency. `verify`
reports `authenticity: not-established` unless you pass an expected digest or archive hash obtained through an
independent channel (signed release notes, a second mirror reached over another network). The content digest covers
site files only; the archive SHA-256 also covers provenance and metadata. The kit creates no keys and is no trust
authority. See [docs/ARTIFACT-METADATA.md](docs/ARTIFACT-METADATA.md).

## Hosting profiles

| Profile | Status | Notes |
|---|---|---|
| `static` | document root for `nginx` / `container` | Byte-identical copy under the base path + `_mirror/mirror.json` overlay. It omits `_headers` (on purpose, [SERVER-PROFILES](docs/SERVER-PROFILES.md) section 4) and sends no headers by itself; `profile` warns. Do not upload `static/www` to a `_headers` host such as Cloudflare Pages or Netlify: it would be served without CSP, X-Frame-Options, nosniff, COOP or Permissions-Policy. For such a host deploy the site directory with its `_headers` (GhostPay: the release `dist/`, see `docs/operators/mirror-hosting.md`). A host that cannot send response headers (plain file hosting) is **unsupported**. |
| `nginx` | supported, tested against nginx 1.24 | Generated from the site's `_headers`; differential-tested against the preview server. Loopback or unix-socket listener only; terminate TLS in front for clearnet. |
| `container` | supported, tested with Docker | `nginxinc/nginx-unprivileged` pinned by digest; read-only, `cap_drop: ALL`, no-new-privileges, non-root, published on 127.0.0.1 only, network `site_internal`. |
| `tor` | generated + `tor --verify-config` | v3 onion service: system-tor fragment, dedicated instance or sibling container. PoW and intro-DoS defences on. See [docs/TOR.md](docs/TOR.md). |
| `i2p` | generated; i2pd parse-checked, Java I2P format only | Separate formats for i2pd and Java I2P. See [docs/I2P.md](docs/I2P.md). Java I2P's default inbound limits are written explicitly; raise them if page loads are refused. |
| GitHub Pages, IPFS gateways, other header-less hosts | unsupported | Cannot send the required headers. |

Base path: `/` by default. A subpath (`/mirror/`) shares its origin's cookies, storage and permissions with
everything else on that host; GhostPay needs a dedicated origin (audit WEB-APP-03), so `profile` refuses a subpath
unless you pass `--allow-shared-origin`. Deep links without a file extension fall back to the entrypoint; with
relative asset URLs only one path segment deep is safe (GhostPay routes by `#` fragment, so this does not affect it).

### Networking rules
- Every generated listener is loopback (`127.0.0.1`, `::1`) or a unix socket. Anything else is refused.
- `127.0.0.1` inside a container is that container. A Tor or I2P router on the host reaches a containerised web
  server only through its host-published loopback port; a router in a sibling container reaches it by service name
  (`web:8080`) on `site_internal`.
- Router consoles (i2pd 7070, Java I2P 7657), I2PControl, SAM, Tor ControlPort/SocksPort, databases and debug ports
  are never website ports; the adapters refuse them as targets.

## Privacy and mirror boundaries
- `EXTERNAL-REFERENCES.json` lists every external URL in the site; `validate` warns about third-party
  subresources and telemetry. Bundle assets locally where their licence allows. Runtime-chosen endpoints (a user's
  RPC or relayer URL) are not visible to a static scan; the site's CSP `connect-src` bounds them.
- Onion or I2P delivery hides the page download, not what the app does next: wallet behaviour, RPC requests and
  on-chain transactions are unchanged. GhostPay does not claim anonymous or untraceable payments.
- `http://*.onion` and `*.i2p` pages may not be secure contexts in every browser (WebCrypto, clipboard); the demo
  page shows `isSecureContext` so you can check. Never fall back to clearnet silently when a privacy transport fails.
- Each mirror origin has separate browser storage, sessions and wallet permissions. Nothing is shared or migrated.

## Relation to existing repository hosting files
| Existing | Relation |
|---|---|
| `scripts/release-build.sh`, `verify-release.sh` | Canonical signed-release tarball pipeline. The kit packages its output (`apps/web/dist`) for hosting; it does not replace release signing or SBOMs (pass them with `--license-file`). |
| `apps/web/public/_headers` | Single source of truth for headers; every kit profile and the preview derive from the packaged copy. |
| `deploy/` (compose: relayer + nginx + optional Tor) | Full self-host stack including the relayer. The kit covers the static frontend only and reuses its hardening conventions. |
| `infra/proxy`, `infra/web`, `infra/publish` | Hand-written examples; the kit generates validated equivalents from a verified archive. |

## Development
```sh
npm ci --ignore-scripts            # once, at the repository root (eslint, typescript, @types/node)
cd tools/portable-hosting-kit
npm run lint && npm run typecheck && npm test
```
Tests use `node:test`, generate all fixtures in temp directories, and exercise real `nginx`, `tor`, `i2pd`,
`python3` and Docker where installed (they skip with a stated reason otherwise). CI:
`.github/workflows/hosting-kit.yml`. Contracts between modules: [docs/INTERFACES.md](docs/INTERFACES.md).
Reuse and licences: [docs/REUSE-AND-LICENSES.md](docs/REUSE-AND-LICENSES.md).
