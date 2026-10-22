# Building and verifying the static web bundle

The web app is a static SPA (`apps/web/dist`). Serve exactly the released bytes.

**Option A (recommended): use a release tarball.** Download `ghostpay-web-<ver>.tar.gz`, `SHA256SUMS`, `release-manifest.json` on a different machine than the server. Verify the signed tag, get the commit it points at, then:
```
scripts/verify-release.sh ghostpay-web-<ver>.tar.gz SHA256SUMS <40-hex-commit> release-manifest.json
deploy/selfhost.sh --tarball ghostpay-web-<ver>.tar.gz --sums SHA256SUMS --commit <40-hex-commit>
```
(CI: `.github/actions/release-verify`.) Hash checks alone do not prove authenticity; follow `docs/operators/release-and-verify.md` (signed tag, attestation).

**Option B: build yourself, reproducibly.**
```
git checkout <signed-tag> && git verify-tag <tag>
bash scripts/release-build.sh          # needs network for npm ci; output in release-out/
tar -xzf release-out/ghostpay-web-*.tar.gz -C /tmp/x && cp -a /tmp/x/ghostpay-web/. deploy/web-dist/
```
Compare the tarball hash with the published one (`scripts/repro-check.sh`). A bundle built from an untagged tree is for testing only.

Checks the script runs: `index.html` present, no `*.map`. nginx serves the headers from `apps/web/public/_headers` (mirrored in `nginx/security-headers.conf`; keep both in sync when that file changes).
