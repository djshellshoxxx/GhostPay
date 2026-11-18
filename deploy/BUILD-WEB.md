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

Checks the script runs: `index.html` present, no `*.map`. nginx serves the headers from `apps/web/public/_headers` (mirrored in `nginx/security-headers.conf`; keep both in sync when that file changes).

## Tight `connect-src` (recommended default for hosted builds)

By default the CSP says `connect-src 'self' https: wss:`, so the page may talk to any https/wss host, because RPC and relayer URLs are user data. A hosted build should instead set the exact origins it needs:
```
GHOSTPAY_CONNECT_ORIGINS="https://rpc.example.org,https://relay.example.org" \
GHOSTPAY_REQUIRE_TIGHT_CSP=1 npm run build --workspace apps/web
```
Bare `https://` or `wss://` origins only, comma separated, no path. `npm run build` runs `apps/web/scripts/apply-csp.mjs` as its first postbuild step. It rewrites `dist/_headers` and the meta CSP in `dist/index.html` to `connect-src 'self' <origins>`, then fails if any `connect-src` still differs from that list. `GHOSTPAY_REQUIRE_TIGHT_CSP=1` also fails the build when the list is empty. `scan-bundle` then runs as before.

Tradeoff: an RPC or relayer origin a user adds in Settings is blocked by the browser until it is added to the list and the site is rebuilt and redeployed. Users cannot widen the policy themselves. Without the list the policy stays broad and a compromised page could send data to any https host.

The nginx files in `deploy/nginx/` carry their own copy of the CSP and are not rewritten by this step: edit the `connect-src` there to the same origin list when you serve through nginx.
