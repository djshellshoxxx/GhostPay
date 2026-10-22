# Spec: sw-cache-policy (planner, offline fallback, update logic)

Pure decisions; a future SW shell (not in this package) calls these and performs I/O.

## Requirements
- `classifyRequest` default-deny. Cacheable only if: GET, https (or localhost), same origin, no URL credentials, no `%2f`/`%5c` in path, not under API prefixes (segment-boundary, case-insensitive, after URL normalisation), no fragment, no secret-looking query, no Authorization/cookies, and either exact allowlisted path (no query) or allowlisted prefix + extension + content hash in filename.
- Navigations are never cached; always `offlineFallback: true`, even when denied for sensitive reasons.
- `shouldStoreResponse`: status 200, type basic, no Set-Cookie, no `no-store|private`, Vary not `*`, content-type allowlist.
- `planFallback`: cache-first uses cache then network; navigation/network-only show offline page only if the decision allows and page is precached.
- `auditPrecache` returns precache paths that the policy would not cache. `obsoleteCaches` only returns `app-static-*` buckets other than current.
- `decideUpdate` (strict semver core): none / invalid / apply-on-idle / prompt (major change or >1 tab) / apply-now (running < min supported, not in flow) / defer (any sensitive flow wins, even if unsupported). Waiting below min supported or not newer handled. `isSkewed` = differing major or unparsable.

## Acceptance tests (cache-policy.test.ts): 29 cases incl. fast-check properties (fragments/secrets/API never cacheable; compare antisymmetry; sensitive flow never interrupted).
