# Reuse and licence record

The kit has **no runtime dependencies** and contains **no copied third-party code**. Development-only tools come
from the repository root `package-lock.json` (not changed by this work): `typescript` 5.9.3 (`tsc --checkJs`),
`eslint` + `@eslint/js` (lint), `@types/node` 22.20.5.

| Source | What was reused | How | Licence handling |
|---|---|---|---|
| GhostPay `apps/web/public/_headers` | Header policy (CSP, Referrer-Policy, nosniff, frame-ancestors, cache rules) | Read at runtime from the packaged site; the kit default mirrors its strict baseline | Same repository |
| GhostPay `deploy/docker-compose.yml`, `deploy/nginx/nginx.conf` | Container hardening conventions, nginx request limits, no access log | Pattern followed in generated profiles | Same repository |
| GhostPay `deploy/tor/*`, `infra/publish/torrc.example`, `docs/remote/onion-i2p-research.md` | Tor/I2P starting points; re-checked against official docs (see TOR.md, I2P.md) | Pattern + corrections | Same repository |
| GhostPay `deploy/selfhost.sh` archive checks | Rule set for safe archive members (no links, no traversal, single top dir, bounded) | Re-implemented for ZIP in `src/core/zip.mjs` | Same repository |
| GhostPay `packages/net-transport/src/onion.ts` | v3 onion checksum algorithm | Independent dependency-free copy using Node `sha3-256`; agreement test `test/config/onion-crosscheck.test.mjs` | Same repository |
| GhostPay `scripts/check-actions-pinned.sh`, `.github/workflows/ci.yml` | Pinned action SHAs for the new workflow | Same SHAs | Same repository |
| Replikrazy draft `ArtifactManifest` | Field shape only (`path,size,sha256`, UTF-8 sort, `entrypoint`) | No code copied | Repository README: "No software license or rights grant"; therefore not copied |
| RFC 8785 (JSON Canonicalization Scheme) | Canonical JSON for the content digest | Own implementation of the subset used | Specification, not code |
| Netlify/Cloudflare `_headers` format | File syntax | Own parser of the documented subset (see SERVER-PROFILES.md for the doc URL) | Format, not code |
| `nginxinc/nginx-unprivileged` container image | Runtime image in the generated container profile (not bundled) | Pinned by digest in generated compose file; operator pulls it | Upstream image licence applies when the operator runs it |

Everything else was written for this kit. GhostPay has no chosen licence yet; the kit is marked `UNLICENSED` like
every package and changes nothing about that.
