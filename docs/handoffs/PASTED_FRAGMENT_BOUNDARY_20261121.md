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
