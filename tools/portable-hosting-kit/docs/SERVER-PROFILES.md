# Server profiles: header policy, routing, preview, static export, nginx, container

This document covers the serving slice of the portable hosting kit:
`src/serve/{headers,routing,preview}.mjs` and `src/profiles/{static-export,nginx,container}.mjs`.
The central guarantee is that **the loopback preview returns the same status codes and the same kit-controlled
headers as the generated nginx profile** for the same request. `test/profiles/differential.test.mjs` checks this
against a real nginx on every test run (skipped only if no nginx binary exists), and the opt-in container test
checks it against nginx inside the pinned container image.

## 1. `_headers`: supported subset and combination semantics

Source of truth for semantics: Cloudflare Pages documentation, "Headers",
<https://developers.cloudflare.com/pages/configuration/headers/> (page states "Last updated Aug 25, 2026"; read
2026-10-27). What it says, and what the kit implements:

| Topic | Cloudflare documentation | Kit |
|---|---|---|
| Format | Rules are "multi-line blocks": a URL or URL pattern line, then an indented list of `name: value` lines; `#` comments. | Same. Header lines must be indented (the documented form); path lines start with `/`. |
| Multiple matching rules | "An incoming request which matches multiple rules' URL patterns will inherit all rules' headers." | Same: every matching rule contributes. |
| Same header more than once | "If a header is applied twice in the `_headers` file, the values are joined with a comma separator." (The doc's table shows `X-Robots-Tag: nosnippet, noindex`.) | Same: values joined with `", "`, in file order, both across rules and within one rule. |
| Detach | Remove "a default header or a header which has been added by a more pervasive rule" by prefixing the name with `! `. | Same: `! Name` removes everything accumulated for that name by earlier matching rules. |
| Splat | `*` "will greedily match all characters"; only one splat per URL. | Same: `*` matches any characters including `/`; patterns are anchored; one `*` at most. |
| Placeholders `:name`, `:splat` in values | Supported. | **Unsupported** → `KitError(E_HEADERS)`. |
| Absolute URL patterns (`https://host/...`) | Supported (protocol and port ignored when matching). | **Unsupported** → `KitError(E_HEADERS)`. |
| Limits | "up to 100 header rules", 2,000 characters per line. | Enforced (`E_HEADERS`), so a file accepted by the kit is also within Cloudflare's limits. |

Order of operations (not spelled out in prose on that page) was confirmed in Cloudflare's open-source asset
server, `cloudflare/workers-sdk` at commit `ec6edddadd8395b4991b23c5300ea68b701ce720`:
`packages/workers-shared/asset-worker/src/utils/headers.ts` (`attachCustomHeaders`: "Apply every matched rule in
order"; for each matching rule, first `unset` → `headers.delete`, then `set` → `append` if the name was already set
from `_headers`, else `set`) and `packages/workers-shared/utils/configuration/parseHeaders.ts` (repeated names inside
one rule are joined with `", "`; detach lines are `! Name`). The kit therefore applies, per matching rule in file
order: detaches first, then that rule's values. A rule that both detaches and sets a name keeps only its own value.

### Where the kit is stricter (fails closed)

Cloudflare skips invalid lines with a warning; the kit refuses the whole file with `E_HEADERS`, because a silently
skipped line can drop a security header. Additionally rejected:

- duplicate patterns (merge them; the outcome on Cloudflare is not documented);
- headers the server controls (`Content-Type`, `Content-Length`, `Location`, `Allow`, `ETag`, `Last-Modified`,
  `Date`, `Server`, hop-by-hop and framing headers), set or detached;
- pattern characters outside `[A-Za-z0-9-._~!&'()+,;=@/*]`, and non-normalized patterns (`//`, `.`, `..`);
- header values that are not printable ASCII; header lines that are not indented; rules without headers.

### Where the kit differs from Cloudflare (by contract, docs/INTERFACES.md rule 8)

- **Which path the rules see.** For 200 responses the kit applies the rules of the **file served**: the
  entrypoint for SPA deep links, `dir/index.html` for `/dir/`. Cloudflare matches the request URL. Consequence: a
  rule `/about/` does not apply to `GET /about/` (served file `/about/index.html`); write `/about/index.html` or
  `/about/*`. This keeps e.g. `/assets/*` immutable caching off an HTML deep link under `/assets/`.
- **301, 404, 405, 400, 412** carry the rules matching the decoded request path below the base path, or those of
  `/` for invalid or out-of-base requests. Note that a 404 under `/assets/*` therefore gets that rule's
  `Cache-Control` (with GhostPay's file: `public, max-age=31536000, immutable`), exactly as the existing
  `deploy/nginx/nginx.conf` does.
- **Subpaths.** Patterns are site-relative: at base path `/mirror/app/`, `/assets/*` matches
  `/mirror/app/assets/...`. Cloudflare would need the base path inside the patterns.
- Patterns match the percent-*decoded* path (Cloudflare: the encoded URL pathname). With the restricted pattern
  character set this only differs for requests that encode `/` or unreserved characters.

### Required headers

`checkRequiredHeaders` requires `REQUIRED_HEADERS` and the `REQUIRED_CSP_DIRECTIVES` (any of several comma-joined
CSP policies counts, since browsers enforce all of them) and `X-Content-Type-Options: nosniff`. Every profile
(preview, export, nginx) refuses to run with `E_HEADERS` unless all served HTML files **and the site path `/`**
pass (the latter covers error pages for invalid and out-of-base requests). GhostPay's
`apps/web/public/_headers` parses and passes (`test/serve/headers.test.mjs` reads the real file).

### Kit defaults and transport headers

- `Cache-Control: no-cache` when no rule sets it.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` only for `transport: clearnet` with an
  `https://` `publicOrigin`.
- `Onion-Location: <onionLocation origin><$request_uri>` only for clearnet with `onionLocation` set (validated
  as `http(s)://<56 base32>.onion`, else `E_CONFIG`). Nothing extra for onion or I2P.
- A transport header is only added when the site's rules leave that name unset, so a stricter site value (for
  example HSTS with `preload`) is never replaced by the kit's.

## 2. Routing (normative, `src/serve/routing.mjs`)

Implements docs/INTERFACES.md "Routing semantics" with these precisions, all mirrored in nginx:

- The request-target is cut at `?` or `#`; an absolute-form target (`http://host/path`) uses its path.
- After decoding once, a path is invalid (404) if decoding fails **including invalid UTF-8**, or it contains a NUL,
  any other C0 control or DEL, a backslash, an **empty segment** (`//`, also via `%2F`), or a `.`/`..` segment.
  (Empty segments and controls are additions to the contract; nginx would otherwise merge or normalize them.)
- Rule 7 uses the last *non-empty* segment: `/x.y/` → 404, `/users/42/` → entrypoint.
- `forbidden` (rule 4) is answered with status 404.

Behaviour that nginx decides **before** any configuration applies, and that the preview therefore mirrors:

| Request | Status |
|---|---|
| Malformed `%` escape (`%zz`, trailing `%`), encoded NUL `%00`, `..` climbing above `/` | 400 (contract says 404 for invalid encoding; nginx's request-line parser answers 400 and no configuration can change that) |
| Request-target neither `/...` nor `scheme://...` (e.g. `OPTIONS *`) | 400 |
| Raw non-ASCII or DEL bytes in the request-target | 400 (Node's parser rejects them; the nginx profile returns 400 for them) |
| HTTP/1.1 without Host, repeated Host, invalid Host | 400 (nginx 1.30 rules; the profile enforces the same regex on 1.24) |
| Lower-case or otherwise invalid method token | 400 |
| `TRACE` and unknown upper-case methods | 405 with `Allow: GET, HEAD` |
| `If-None-Match` / `If-Modified-Since` (exact) / `If-Match` / `If-Unmodified-Since` | 304 / 412 per nginx's not-modified filter |
| `Range` | ignored (`max_ranges 0`): full 200 |
| `Expect: 100-continue` (HTTP/1.1) | interim `100 Continue` before 200/301/304/412, none before 400/404/405 |

**Known exception: `CONNECT`.** nginx answers CONNECT itself before configuration, and versions differ: 1.24
rejects authority-form (`CONNECT host:443`) with 400 and origin-form with 405; 1.30 does the opposite. The preview
answers 405 (contract). The tests assert, for CONNECT only, that both refuse (nginx 400 or 405) and send the security
headers.

## 3. Preview server (`startPreview`)

- Binds only `127.0.0.1` or `::1` (anything else, including `localhost`, → `E_NETWORK_SCOPE`); port 0 = ephemeral.
- Serves only listed, servable files; every path component is `lstat`ed and the file opened with `O_NOFOLLOW`, so
  symlinks (file or directory) are never followed (404). No directory listings exist (directories route to the
  index file or the SPA entrypoint). No request logging. GET and HEAD only.
- Optional `hostConfig` (additive to the contract) adds the transport headers nginx would send; `basePath` must
  equal `hostConfig.basePath`.
- `ETag` (`"<mtime hex>-<size hex>"`) and `Last-Modified` are computed like nginx from the site files; the static
  export copies mtimes, so both servers send identical validators.
- Minor: Node's HTTP server drops a connection whose client half-closes (shuts down its sending side) before an
  asynchronous response is ready; nginx answers. Browsers do not do this.

## 4. Static export (`exportStatic`)

Writes byte-identical copies of the servable files to `<outDir>/www/<basePath>/` (so nginx `root` works without
`alias`), preserving each file's mtime. `_headers` and hidden paths (except `.well-known/` as first segment) are not
exported at all. Refuses an existing `<outDir>/www` (stale files would be served by nginx but not by the preview),
nested site/output directories, symlinks (`E_SYMLINK`) and weak header policies; builds in a temporary sibling and
renames into place. `overlayFiles: [{ path, data }]` adds servable files that do not collide with site files.
Pass the returned `files` to `generateNginx`. Directories must be readable by the server's user (mkdtemp creates
0700 directories).

## 5. nginx profile (`generateNginx`)

Files: `nginx.conf` (host main file), `hk-http.conf` (http level), `hk-server.conf` (server level).

**Header inheritance trap.** In nginx, a location with any `add_header` drops all server-level `add_header`s. The
profile never uses `add_header` in a location. Each kit-controlled header is added **once at server level with
`always`**, from a variable computed by `map` chains keyed on the final `$uri` (after `try_files` or the SPA
fallback, i.e. the served file) → site path → one match flag per rule → per header, a chain applying the rules in
order (detach, set, join with `", "`) → default (`no-cache`, transport header) when empty. nginx omits headers whose
value is empty. All maps are `volatile`. The tests check structurally that no `add_header` appears inside any block,
and the differential test catches a reintroduced trap (verified by mutation).

**Routing.** `$request_uri` checks (PCRE with possessive absolute-form prefix) mirror `decodeRequestPath`
including a well-formed-UTF-8 matcher that is tested exhaustively against `decodeURIComponent`; `$uri` checks for
hidden paths and rule 7; exact `location =` blocks for directory redirects (map string keys are case-insensitive
in nginx, so they are not used for paths); `try_files` for files and indexes; a named location for the fallback.
`absolute_redirect off`, so `Location` is the path.

**MIME.** Own `types {}` from `MIME_TYPES`, `charset utf-8`, `charset_types` = `UTF8_MIME_TYPES` (text/html is
implicit), `default_type text/plain` (only `LICENSE`/`NOTICE`/`COPYING` reach it; nosniff is always sent).

**Unprivileged, private, bounded.** No `user` directive; `pid` and temp paths relative to `-p`;
`error_log stderr error`; `access_log off`, `log_not_found off`, `server_tokens off`, `autoindex off`,
`disable_symlinks on`; limits as `deploy/nginx/nginx.conf` (`client_max_body_size 64k`, 10 s/15 s timeouts,
`large_client_header_buffers 4 8k`). Run:

```sh
nginx -t -p /path/to/runtime/ -e stderr -c /path/to/conf/nginx.conf
nginx    -p /path/to/runtime/ -e stderr -c /path/to/conf/nginx.conf -g 'daemon off;'
```

Listeners: `127.0.0.1:<port>`, `[::1]:<port>` or `unix:/abs/path`; anything else → `E_NETWORK_SCOPE`.
Header values or embedded paths containing `$` (nginx would interpolate) → `E_UNSUPPORTED`.

## 6. Container profile (`generateContainer`)

Project layout (one directory): `compose.yaml`, `nginx/` (container `nginx.conf` + `hk-http.conf` +
`hk-server.conf`), `www/` (the static export). `docker compose up -d` / `docker compose down`.

**Frozen names** (exported constants; the Tor adapter relies on them): service **`web`**, container port
**`8080`**, internal network **`site_internal`** (compose network key; with the default project naming Docker
names it `<project>_site_internal`; a Tor service added via an extra compose file joins it as
`networks: [site_internal]` and targets `web:8080`), site mounted read-only at `/srv/www`, config at
`/etc/nginx/hk`.

**Image.** `nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03`.
Resolved 2026-10-27: Docker Hub tag list (`hub.docker.com/v2/repositories/nginxinc/nginx-unprivileged/tags`)
showed `stable-alpine` = `1.30-alpine` = `1.30.6-alpine` (nginx stable branch; mainline was 1.31.7) with that
digest; cross-checked with a registry `HEAD /v2/nginxinc/nginx-unprivileged/manifests/1.30.6-alpine`
(`docker-content-digest`, OCI image index, i.e. multi-arch). To update: resolve a new digest the same way, then
run the opt-in container test (it runs the full differential matrix against the image).

**Hardening.** `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, `user: "101:101"`, tmpfs `/tmp`
(16 MiB, noexec, nosuid, nodev), `mem_limit`/`memswap_limit 128m`, `cpus 0.5`, `pids_limit 64`, local logging
with size limits, bind mounts read-only with `create_host_path: false`, no environment, env files or secrets,
entrypoint `nginx -e stderr -c /etc/nginx/hk/nginx.conf` (the image's entrypoint scripts, which try to edit
`/etc/nginx`, are not run). Published only as `127.0.0.1:<port>:8080` (or `[::1]:<port>:8080`); a unix-socket
listener is `E_UNSUPPORTED` for this profile.

**Networks.** `site_internal` is `internal: true` (no gateway). Docker does not publish ports of containers that
are only on internal networks, so `web` is also on `site_publish`, a bridge with
`com.docker.network.bridge.enable_ip_masquerade: "false"`: it carries the loopback port mapping but gives no
outbound NAT. Verified: an outbound `wget` from the container times out.

## 7. Verification record (2026-10-27)

Observed:

- `npm test`: differential test (223–224 raw requests per base path, root with clearnet HTTPS +
  Onion-Location and subpath `/mirror/app/` with onion) against nginx **1.24.0** (Ubuntu): no differences in status,
  interim 1xx, kit headers, `ETag`, `Last-Modified`, 200 bodies; every response carries CSP, nosniff,
  Referrer-Policy and Cache-Control. `nginx -t` passes for root, subpath, IPv6, unix socket and GhostPay's
  `_headers`. nginx runs as `nobody` from a writable runtime dir and serves; and serves over a unix socket.
- `HK_DOCKER_TESTS=1 npm test`: compose project up (healthy) on a random loopback port; same matrix against
  nginx **1.30.6** in the container: no differences (CONNECT exception above); runtime checks: user 101:101,
  read-only root, `CapDrop [ALL]`, `no-new-privileges`, pids/memory limits, only `127.0.0.1:<port>` published,
  `site_internal` internal, no egress; teardown leaves no containers, networks or volumes (the image stays cached).

Not verified here: behaviour behind a real TLS terminator or Tor/I2P (headers are added by nginx; a proxy in
front must pass them through), Cloudflare's runtime behaviour (only its documentation and source were read), IPv6
listeners (no IPv6 in the test sandbox; `nginx -t` passed the syntax stage), case-insensitive filesystems (macOS
would serve `/INDEX.HTML`), HTTP/2, and other nginx versions than 1.24.0 and 1.30.6.
