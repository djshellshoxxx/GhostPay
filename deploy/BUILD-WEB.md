# Building and verifying the static web bundle

The web app is a static SPA (`apps/web/dist`). Serve exactly the released bytes.

**Option A (recommended): use a release tarball.** Download `ghostpay-web-<ver>.tar.gz`, `SHA256SUMS`, `release-manifest.json` on a different machine than the server. Verify the signed tag, get the commit it points at, run the checks there and note the tarball's SHA-256:
```
scripts/verify-release.sh ghostpay-web-<ver>.tar.gz SHA256SUMS <40-hex-commit> release-manifest.json   # separate machine
gh attestation verify ghostpay-web-<ver>.tar.gz --repo <owner>/<repo> \
  --signer-workflow <owner>/<repo>/.github/workflows/release.yml --source-ref refs/tags/<tag> \
  --source-digest <40-hex-commit> --deny-self-hosted-runners                                         # separate machine
deploy/selfhost.sh --tarball ghostpay-web-<ver>.tar.gz --sums SHA256SUMS --commit <40-hex-commit> \
  --manifest release-manifest.json --expect-sha256 <tarball sha256 from the separate machine>
```
(CI: `.github/actions/release-verify`; with `verify-attestation: 'true'` it also needs `tag: <release tag>` and runs the same pinned `gh attestation verify` as `selfhost.sh`.) Hash checks alone do not prove authenticity; follow `docs/operators/release-and-verify.md` (signed tag, attestation). `selfhost.sh` refuses `--tarball` without `--manifest` and an authenticity check: `--expect-sha256` as above, or `--attest-repo <owner>/<repo> --tag <tag>` to run `gh attestation verify` on the server (needs `gh` and a token). It verifies a private copy, installs it, and then stops: type `start`, or re-run without `--tarball` (`--yes` never starts a bundle it installed in the same run).

**Option B: build yourself, reproducibly.**
```
git checkout <signed-tag> && git verify-tag <tag>
bash scripts/release-build.sh          # needs network for npm ci; output in release-out/
tar -xzf release-out/ghostpay-web-*.tar.gz -C /tmp/x && cp -a /tmp/x/ghostpay-web/. deploy/web-dist/
```
Compare the tarball hash with the published one (`scripts/repro-check.sh`). A bundle built from an untagged tree is for testing only.

Checks include an active CSP in `index.html`, the expected `connect-src`, and no source maps. Header-capable hosts use their own header configuration: nginx does not interpret a Netlify/Cloudflare `_headers` file.

## Tight `connect-src` (recommended default for hosted builds)

By default the CSP says `connect-src 'self' https: wss:`, so the page may talk to any https/wss host, because RPC and relayer URLs are user data. A hosted build should instead set the exact origins it needs:
```
GHOSTPAY_CONNECT_ORIGINS="https://rpc.example.org,https://relay.example.org" \
GHOSTPAY_REQUIRE_TIGHT_CSP=1 npm run build --workspace apps/web
```
Use bare `https://` or `wss://` origins only, comma separated, without path, query, fragment, userinfo, wildcard or policy syntax. Names and default ports are normalized and duplicates removed. Invalid-input errors never echo a potentially credential-bearing URL. `npm run build` runs `apps/web/scripts/apply-csp.mjs` as its first postbuild step. It rewrites `dist/_headers` and the meta CSP in `dist/index.html` to `connect-src 'self' <origins>`, then checks the actual enforced policy locations, including duplicate directives, missing files, report-only substitutions and malformed/inert meta tags. The meta must precede resource loading in the generated head. `GHOSTPAY_REQUIRE_TIGHT_CSP=1` refuses an empty list; values other than `0` or `1` fail. `scan-bundle` retains its existing checks.

Tradeoff: an RPC or relayer origin a user adds in Settings is blocked by the browser until it is added to the list and the site is rebuilt and redeployed. Users cannot widen the policy themselves. Without the list the policy stays broad and a compromised page could send data to any https host.

### GitHub Pages

The Pages builder now forwards both CSP variables into its clean build environment and runs the same validator against its actual intermediate output, before the existing bundle/site guards:

```sh
GHOSTPAY_CONNECT_ORIGINS="https://rpc.example.org,https://relay.example.org" \
GHOSTPAY_REQUIRE_TIGHT_CSP=1 bash scripts/pages/build-pages.sh /absolute/new/output
```

GitHub Pages ignores `_headers`; the builder removes that file. The published `index.html` meta CSP is the enforcement point. Its `connect-src` constrains browser connections, but meta policy cannot enforce `frame-ancestors`, `sandbox` or report-only CSP, and cannot retroactively block resources preceding it. HTTP security headers such as `X-Frame-Options` and `Permissions-Policy` are separate. See [CSP Level 3, meta delivery](https://www.w3.org/TR/CSP3/#meta-element). Existing Pages framing guards remain separate controls.

The ordinary development profile keeps the existing broad `https: wss:` policy when the allowlist is unset. The recommended hosted profile sets both variables above. No default RPC provider or invented production origin is supplied. The allowlist is build configuration; UI endpoint edits cannot broaden it.

### Nginx

Generate matching header artifacts from the shipped templates using the same list:

```sh
GHOSTPAY_CONNECT_ORIGINS="https://rpc.example.org,https://relay.example.org" \
node deploy/nginx/render-security-headers.mjs /absolute/new/nginx-headers
```

This renders `security-headers.conf` and `security-headers-embed.conf` in a separate directory, without editing source templates, starting nginx or deploying. The standard profile retains `frame-ancestors 'none'` and `X-Frame-Options: DENY`; the explicitly selected embed profile retains the reviewed `$gp_frame_ancestors` map requirement. Install the appropriate generated file at the existing include path and validate the server configuration in the intended environment. Both HTTP-header and meta policies apply together; one cannot relax the other. A generated file is not evidence that a live server sends it.

Loopback HTTP remains unsupported by this CSP allowlist; use an explicitly configured HTTPS loopback endpoint where the browser accepts its certificate. URL validation alone does not prove browser, certificate, mixed-content, private-network or Tor reachability. Real hosting and Tor network qualification remain unverified until exercised and recorded.
