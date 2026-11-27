# Deep-link redirect validation order — 2026-11-27

## Scope and evidence
- Base main: `1894b4bbd31f4765e56bd5fb05d51342fc5bd8b7`.
- Spec: `docs/remote/usability/specs/deep-link-share.md`, R5 (every unsafe redirect-like parameter must reject the entire HTTPS deep link).
- Original source blob: `30cd209628805ea78436beb2fca1d5e49297bcc8`.
- Claim commit: `a6532849293bf12faad609dcdf99f4513f4cfa51`.
- Regression-first commit: `c597735b6a2f2d38ffba48800e64051cfb5b5d04`.
- Production fix: `0e6a7fee02cf5528ab8691c57854839c815a1939`; repaired blob `459deb75e618804f9ce72daca6dabdacff014a23`.

Root cause: after host/route validation, invoice-fragment classification and share-target dispatch returned before the existing redirect query loop. Move only that loop ahead of both returns. Safe return paths remain exposed only for plain navigation. Valid invoice/share classifications and their warnings are unchanged. No claim of an actual external navigation or demonstrated exploitable open redirect.

## Actual local verification
Git checkout failed: `Could not resolve host: github.com`. Copied the exact GitHub source into an isolated temp directory, and used `git hash-object` to confirm both original and repaired source blobs above. Transpiled the full deep-link module with installed TypeScript 5.8.3; executed on Node 22.16.0 using native URL/URLSearchParams and synthetic mocked imports for payload classification/hygiene and result helpers. No network, contracts, wallet or fund operations. Original 12/18 passed; six cases failed (invalid, mixed-case and repeated safe/unsafe redirect params for both invoice and share paths). Repaired 18/18 passed; also checked safe returnTo and no returnTo property on invoice/share outputs. Controls included valid, unrelated-parameter and plain invoice/share links, safe and unsafe navigation, wrong host/route, and malformed fragment. This is isolated source-hash-matched execution, NOT native package Vitest, lint, typecheck, build or browser qualification. The committed Vitest regression uses real package imports and existing synthetic fixtures; it has not yet been executed locally.

## Ownership and integration
All 146 open PR changed-file inventories in partitioned snapshot through #755 checked; no matching deep-link source or new regression test path. Main and recent open PR inventory refreshed before branch creation. No other branch touched. Generation 72 integration lock observed released; no acquisition. PR #390 remains merged (exact-head five historical workflows successful; no submitted independent GitHub review found; no changes to donor). All ten stop-work exclusions preserved. No dependencies, feature activation, deployment or release.

Keep draft pending exact-head hosted CI, applicable browser checks, independent review, fresh ownership/base verification and legitimate integration lease ownership. Do not promote or merge based solely on the local isolated test. Recheck current main and lock before integration.
