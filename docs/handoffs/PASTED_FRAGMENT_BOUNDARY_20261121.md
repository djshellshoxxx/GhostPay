# Pasted invoice fragment boundary — bug-only handoff (2026-11-21)

- Base main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated branch: `fix/ghostpay-pasted-invoice-fragment-boundary-20261121`.
- Test-first RED commit: `6f3fbff2c8ccb2d46d39dc5a102fa4c9dea7b38b`.
- Production correction commit: `ca75a4fa9f4e9eb308c99ab19cdafc13eb0f692a`.
- Changed implementation: `apps/web/src/lib/fragment.ts`; changed regression: `apps/web/src/lib/fragment.test.ts`.

## Reproduction and root cause
The old `extractFragment` used `indexOf(FRAGMENT_PREFIX)` anywhere in a pasted string and rejected only whitespace in the extracted suffix. Consequently, `#gpi=v1.abc#other`, `#gpi=v1.abc?tracking=1`, and `garbage#gpi=v1.abc` were accepted as invoice fragments or arbitrary text. This diverged from the stricter QR path and deferred malformed-input rejection to later decoding.

## Repair
Only accept (1) a bare fragment with the exact `#gpi=v1.[A-Za-z0-9_-]+` syntax, or (2) an HTTPS URL whose actual URL hash exactly matches that syntax. Preserve surrounding trim, links containing normal query parameters before the fragment, and existing valid bare-fragment decoding. No policy, contract, API, secret, signing or funding behavior changed.

## Verification
- On Node 22, isolated source-equivalent parser reproduction: 10 cases, baseline failed 5 expectations, patched algorithm passed 10/10. This is NOT repository Vitest and not a browser acceptance result.
- GitHub source inspection: exact resulting files fetched and main comparison found three changed paths (production, regression, and append-only ownership registry), 3 commits ahead, zero behind at inspection.
- NOT run: actual repository Vitest, full typecheck, ESLint, build, native browser acceptance and hosted exact-head CI. Local shell cannot resolve github.com, preventing a checked-out repository and dependencies.
- Separate independent review is required. The current worker's source reinspection is not independent approval.

## Integration
Do not merge this draft directly into main pending hosted exact-head CI, review, branch-dependency/ownership reconciliation, and maintained shared integration lock. No release, deployment or funds operation. Recheck current main before promotion. Other open payment/parser bug fixes including #384 and #385 are independently owned.

## Follow-up: URL parser control-character normalization (2026-11-21)

The implementing worker re-audited this branch and found a **regression introduced by its initial URL-based fix**: WHATWG `new URL` silently discards embedded CR, LF and tab characters, including within a `#gpi=` fragment. The former `/\\s/` suffix check rejected these; the initial replacement could transform `#gpi=v1.ab\\ncd` into `#gpi=v1.abcd` and accept the changed payload. This was not an existing mainline bug; it was caught during review of this draft PR.

- Separate RED regression test commit: `49138bd906127ef32fa6e2bd94d9ebe465a16fc7`. Four controls inserted into `apps/web/src/lib/fragment.test.ts`, plus an existing surrounding-whitespace acceptance check.
- Minimal fix commit: `5fc493fa958de65cfd47b9c7d1ed134768f013e8`. Reject any remaining whitespace within trimmed input before calling `new URL`, preserving trimming of harmless surrounding paste whitespace.
- Isolated Node 22 source-equivalent check: 4/4 normalization regressions reproduced on initial PR source, 4/4 rejected after fix; 2 valid inputs preserved. This is not repository Vitest.
- Prior hosted Pages/CLI successes apply only to their prior commit and **are not** qualification of the later PR head. New exact-head CI, review and other gates remain pending. No merge/release/deployment.
