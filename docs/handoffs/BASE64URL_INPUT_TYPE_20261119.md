# Strict base64url runtime input validation — 2026-11-19 UTC

## Cycle, ownership and source identity

- Cycle: `20261119T2243Z`; one ChatGPT assistant, sequential engineering, read-only audit, documentation and integration review. **No subordinate or independent verifier was available.**
- Target: static GitHub Pages browser beta. Default/main base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`. Working branch: `automation/20261119T2243Z/bug/base64url-runtime-input`.
- Claim commit: `013a75eb7960deec68b4b92f8a9be7cb7a8238f9` in `docs/ai/ACTIVE_WORK.md` (this branch only).
- Source test commit: `bb61507ce98c8a2fd38b5eadf5ed66b3f8c4a050` committed before runtime change.
- Runtime correction: `401b2e77f24170d84fa4f2edf129f9bde4bdf1a8`.
- Owned code: `packages/invoice-schema/src/base64url.test.ts` and `base64url.ts`. No other worker's branch/source modified.
- Initial source blob `eb7b8723f4a3b80a6ce457012636a5b29e1f8ccb`, fixed blob `5466ee0b99925dedd23e753636ae7ab3f6f48234`; both locally reconstructed TypeScript source files were checked using `git hash-object` and matched these exact GitHub blobs.
- No cryptographic wire-format, algorithm, key, invoice-schema or release-policy change.

## Reproduced finding and test-first fix

Finding `GP-B64-INPUT-20261119-01` (low-severity API-boundary correctness, **not** an established exploit): the public strict decoder's TypeScript `string` parameter is not a runtime validation guard. Existing code read `text.length` and accepted zero, false, arrays, and array-like objects as valid input. Null/undefined threw native `TypeError` rather than the documented fixed `Base64UrlError`; a crafted array-like object can decode into a byte despite not being a string. The exact original blob executed under Node 22.16.0 with an isolated `Base64UrlError` shim reproduced these results.

Tests committed first cover eight invalid runtime values: undefined, null, 0, false, [], a length-zero object, a Uint8Array and a crafted length/charCodeAt object. The fix adds a single `typeof text !== 'string'` guard before reading its length. This keeps canonical strings and encoded bytes unchanged and avoids exposing input in error text.

## Actually executed checks

With Node.js v22.16.0 and `--experimental-strip-types`, ran **exact Git-blob-matched base64url.ts source** and a minimal local `./errors.js` shim (not the complete GhostPay dependency tree):
- **7 of 8 newly added contract assertions failed on original code** (six accepted nonstrings and two wrong error classes; one already produced the correct error). **8/8 passed after repair.**
- **301/301** deterministic byte-array round trips, each compared against Node's base64url encoder, passed on the fixed source.
- **12/12** invalid textual vectors rejected with the expected error; **2/2** canonical example decodes passed.
- `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowJs --skipLibCheck base64url.ts` passed with installed TypeScript **5.8.3** against the isolated file/shim. The project locks TypeScript 5.9.3; this is **not** project typecheck.
- Local `git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed due DNS resolution; **repository Vitest, project ESLint, project typecheck, Pages browser acceptance and full CI were not run locally**. The committed Vitest regression suite is unexecuted in this environment. Hosted exact-head jobs and genuine independent verification remain mandatory.

## Scope, audit and consolidation reconciliation

- The source was inspected with surrounding `expiry.ts`, `sign.ts`, `json.ts` and their tests. Expiry clock validation already rejects unsafe inputs; no separate reproducible finding was established in the other reviewed modules. This is a distinct **sequential self-audit**, not an independent security assessment.
- Sampled direct file ownership across open PRs #238, #262, #264, #265, #268, #269, #270, #278 and #285: none lists either base64url source/test file. Large integration PRs still contain overlapping tracking files; preserve their owners. Not a full historical branch census. Docs/automation baseline from draft #261 remains authoritative for its dated snapshot and was not rewritten.
- Latest observed integration metadata ref `6408563f55081ee941c2036086c025ebf63d2c96`, state `released`, generation 3. **Not acquired**; no protected target or shared ledgers were changed.
- At inspection #285 exact-head CI `44613145140`, Pages, Hosting, Beta, and CLI all reported workflow success. #282 five workflows reported success; #261 core CI reported success. This does not establish independent review, complete required-job coverage or integration eligibility.
- `.github/workflows/pages.yml` (blob `5ef7f8f55035f852da2e1398ae39fc6455a91ebb`) validates pull requests without deployment; publication is explicit main workflow dispatch with deploy=true. Live wiki was not published; version-controlled Home and Sidebar retain User Guide and Developer Guide links.
- No main merge, release, tag, deployment, protection change, real-funds operation, Codex, paid agent or paid API operation.

## Next cycle

1. Read fresh PR and branch heads and verify this patch's exact-head Actions jobs and security statuses; run committed Vitest, lint, project TS and static Pages build if execution becomes available.
2. Seek a **genuinely independent reviewer** of the exact final head, confirming the baseline regression and avoiding misclassification as a proven security exploit.
3. Recheck full active ownership, source/target SHAs, integration lock, protected-branch rules, and downstream workflow triggers before any coordinator merge. Leave the draft unmerged if any gate is absent.
