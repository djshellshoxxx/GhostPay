# Rollback (static hosting)

Rolling back the web app means serving an earlier, previously verified release again. Contracts are immutable and cannot be rolled back (see [testnet runbook](testnet-runbook.md) section 4 and [incident response](incident-response.md) section 6). Status key: **TESTED** = exercised in the 2026-11 hosting review; **UNTESTED** = written, never run.

## 1. Before you need it
- Keep the last two verified release tarballs and their `SHA256SUMS` offline (not only on the host). A tarball you cannot re-verify is not a rollback target.
- Know the target release's commit (40-hex) and, for releases built with `GP_COMMIT`, its `build-info.json` commit.
- `deploy/selfhost.sh` keeps one generation, `deploy/web-dist.prev`, copied before each tarball deploy. Only the script syntax and the archive-safety selftest were run; the backup copy path itself is **UNTESTED** end to end.

## 2. Self-host (`deploy/`)
1. Prefer re-deploying a verified tarball: `deploy/selfhost.sh --tarball <old>.tar.gz --sums SHA256SUMS --commit <40hex>`. It runs `scripts/verify-release.sh` and rejects unsafe archives (archive checks **TESTED** by `deploy/selftest.sh`). Complete the signed-tag and attestation checks in [release and verify](release-and-verify.md).
2. Quick path when the previous deploy is still on disk (**UNTESTED**): `rm -rf deploy/web-dist/* && cp -a deploy/web-dist.prev/. deploy/web-dist/`. `web-dist.prev` is a local copy, not a verified artefact, until you hash it (section 5).
3. nginx reads the bundle through a read-only bind mount and re-reads files per request, so no restart is needed. Do not `docker compose down` if only the bundle changes.

## 3. Own host (`infra/proxy`), Pages, other hosts
- Own host: unpack the verified tarball to a new directory, then switch atomically (`ln -sfn /srv/ghostpay-<ver> /srv/ghostpay` if `/srv/ghostpay` is a symlink) so a half-copied tree is never served. **UNTESTED.**
- GitHub Pages: `pages.yml` runs only on `main`, so revert on `main` or disable Pages (see [hosting](hosting.md) section 2). **UNTESTED.**
- Cloudflare Pages / Netlify: redeploy the old tarball contents as a new deployment, or promote the old deployment in the dashboard. **UNTESTED.**

## 4. IPFS, caches and mirrors
- IPFS: a CID is immutable. Rolling back means moving whatever points at it (DNSLink TXT, gateway config, pin set) back to the old CID and re-pinning it (`ipfs pin add <cid>`, or `infra/publish/ipfs-publish.sh --publish` with `GP_IPFS_PUBLISH=yes`). Unpin the bad CID from your nodes but treat it as still retrievable elsewhere and say so in the notice. The release manifest does NOT record the CID (`publication.ipfsCid` is always `null` because the manifest is hashed before any publication), so the operator must keep each published CID in an out-of-band log or the release notes. **UNTESTED** (no kubo here).
- Cache purge: `index.html`, the SPA fallback and `build-info.json` are served `no-cache`, so browsers and compliant CDNs revalidate on every load. Hashed `/assets/*` are immutable and never need purging, since an old `index.html` references its own hashes. Still purge the CDN's HTML and `/build-info.json` entries after a rollback (CDN-specific, **UNTESTED**), because some CDNs ignore `no-cache` on edge copies.
- Onion mirror: it serves the same directory; verify it separately (section 5).
- Third-party mirrors keep a bad build until their TTL ends; contact them if this was a security rollback.

## 5. Verify the rolled-back version
From a second machine, not the host itself:
1. `curl -s https://<host>/build-info.json` shows the expected `commit`, and its `manifestsSha256` equals the one in the `ghostpay-web/build-info.json` inside the verified tarball (the release manifest does not carry it; see [monitoring](monitoring.md)). `unknown` means the build did not embed `GP_COMMIT`: fall back to hashes.
2. Download the served files and compare every SHA-256 with the per-file hashes of the verified tarball's contents (`SHA256SUMS` lists only the tarball, SBOM and manifest, so verify the tarball first, then extract it and hash its files: `tar -xzf ghostpay-web-<ver>.tar.gz && (cd ghostpay-web && find . -type f | LC_ALL=C sort | xargs sha256sum) > expected.sha256`). For example `curl -s https://<host>/index.html | sha256sum` against the `./index.html` line, then each `/assets/*` file. **Hashes of the verified tarball's files are the authority**; `build-info.json` is only a convenience and is served by the host being checked.
3. `curl -sI https://<host>/` and compare headers with `apps/web/public/_headers` (`no-cache` on `index.html`, no `Set-Cookie`).
4. Open the app in a clean browser profile and confirm no manifest error banner appears.
5. Record time, who, which version to which, and why. If this was an incident, continue with [incident response](incident-response.md) section 2.

## 6. What rollback cannot do
It does not recall copies users already loaded, revoke anything signed, or fix an on-chain problem. A security rollback should ship with a version bump and a notice rather than silently restoring an old file set.
